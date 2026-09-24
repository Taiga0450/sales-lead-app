import { readFileSync } from "node:fs";
import { join } from "node:path";
import { google, sheets_v4 } from "googleapis";
import { CALL_SHIFT_HEADERS } from "@/lib/callShifts";
import type { CallShiftRow } from "@/lib/callShifts";

/**
 * Slackのスラッシュコマンド/モーダル送信はブラウザセッション（NextAuthのGoogleアクセストークン）
 * を持たないサーバー間通信のため、lib/google/sheets.tsの「ログイン中ユーザーのaccessToken」前提の
 * 関数は使えない。代わりに、バッチ用スクリプト（scripts/配下）と同じサービスアカウントで
 * スプレッドシートに直接書き込む。対象はcallShiftsタブのみ（Slack経由の用途を最小限に絞るため）。
 *
 * 認証情報はGOOGLE_SERVICE_ACCOUNT_JSON環境変数（サービスアカウントJSONの中身をそのまま1行で）
 * を優先し、無ければローカル開発用にcredentials/service-account.json（gitignore対象）を読む。
 */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID ?? "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const CALL_SHIFTS_SHEET_NAME = "callShifts";
const CALL_SHIFT_LAST_COL = String.fromCharCode("A".charCodeAt(0) + CALL_SHIFT_HEADERS.length - 1);

function loadServiceAccountCredentials(): Record<string, unknown> {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  const path = join(process.cwd(), "credentials", "service-account.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

let cachedSheets: sheets_v4.Sheets | null = null;

function getServiceSheets(): sheets_v4.Sheets {
  if (cachedSheets) return cachedSheets;
  const auth = new google.auth.GoogleAuth({
    credentials: loadServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
}

async function ensureCallShiftsSheetExists(sheets: sheets_v4.Sheets): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === CALL_SHIFTS_SHEET_NAME);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: CALL_SHIFTS_SHEET_NAME } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CALL_SHIFTS_SHEET_NAME}!A1:${CALL_SHIFT_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...CALL_SHIFT_HEADERS]] },
  });
}

function columnLetterAt(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Slackから送信された「氏名（フルネーム）＋日付＋開始/終了時刻」を登録する。
 * 同一氏名・同一日付の行が既にあれば（アプリ側で架電実績を先に入力済みの場合を含め）
 * 開始/終了時刻だけを上書きする——ユーザー指示により、Slack経由の入力とアプリ経由の
 * 架電実績入力とで二重に行が増えて稼働時間・人件費が二重集計されるのを防ぐため。
 */
export async function upsertShiftFromSlack(params: {
  callerIdentity: string;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<{ created: boolean }> {
  const sheets = getServiceSheets();
  await ensureCallShiftsSheetExists(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CALL_SHIFTS_SHEET_NAME}!A2:${CALL_SHIFT_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const nameIdx = CALL_SHIFT_HEADERS.indexOf("callerName");
  const dateIdx = CALL_SHIFT_HEADERS.indexOf("date");
  const rowIndex = rows.findIndex((r) => (r[nameIdx] ?? "") === params.callerIdentity && (r[dateIdx] ?? "") === params.date);

  if (rowIndex === -1) {
    const newShift: CallShiftRow = {
      id: crypto.randomUUID(),
      // 共有アカウント（contact-sales@）経由のためメールアドレスでは本人を区別できない。
      // callShifts全体の識別（callerIdentityOf）は名前優先のため、ここにも氏名を入れておけば実害はない。
      callerEmail: params.callerIdentity,
      callerName: params.callerIdentity,
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
      calls: "",
      apo: "",
      receptionNg: "",
      keymanConnected: "",
      notes: "Slackから登録",
      createdAt: new Date().toISOString(),
    };
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CALL_SHIFTS_SHEET_NAME}!A:${CALL_SHIFT_LAST_COL}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [CALL_SHIFT_HEADERS.map((h) => newShift[h] ?? "")] },
    });
    return { created: true };
  }

  const sheetRow = rowIndex + 2;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${CALL_SHIFTS_SHEET_NAME}!${columnLetterAt(CALL_SHIFT_HEADERS.indexOf("startTime"))}${sheetRow}`,
          values: [[params.startTime]],
        },
        {
          range: `${CALL_SHIFTS_SHEET_NAME}!${columnLetterAt(CALL_SHIFT_HEADERS.indexOf("endTime"))}${sheetRow}`,
          values: [[params.endTime]],
        },
      ],
    },
  });
  return { created: false };
}

/**
 * 指定タブの中身を丸ごと差し替える（タブが無ければ作る）。HubSpotの内容をそのまま映す
 * 「アップセル」タブのように、ログイン中ユーザーがいない定期同期から書き込む用途向け。
 * 先に新しい値で上書きしてから、はみ出た古い行だけを消す——一度全消去してから書き込むと、
 * 同期中にシートを開いた人に空のタブが見えてしまうため。1行目は見出しとして固定する。
 */
export async function replaceSheetValues(sheetName: string, values: string[][]): Promise<void> {
  const sheets = getServiceSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName, gridProperties: { frozenRowCount: 1 } } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    // 日付・日数をシート上で並べ替え/フィルタできるよう、数値・日付として解釈させる
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  // 前回より行・列が減った分の古いセルを消す。範囲がシートのグリッド外にはみ出すとAPIエラーになるため、
  // 書き込み後の実際の行数・列数の内側だけを対象にする。
  const after = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
  const grid = after.data.sheets?.find((s) => s.properties?.title === sheetName)?.properties?.gridProperties;
  const rowCount = grid?.rowCount ?? values.length;
  const columnCount = grid?.columnCount ?? 0;
  const width = Math.max(...values.map((row) => row.length));
  const lastCol = columnLetterAt(columnCount - 1);
  const ranges: string[] = [];
  if (rowCount > values.length) ranges.push(`'${sheetName}'!A${values.length + 1}:${lastCol}${rowCount}`);
  if (columnCount > width) ranges.push(`'${sheetName}'!${columnLetterAt(width)}1:${lastCol}${values.length}`);
  if (ranges.length > 0) {
    await sheets.spreadsheets.values.batchClear({ spreadsheetId: SPREADSHEET_ID, requestBody: { ranges } });
  }
}

const UPSELL_CALLS_SHEET_NAME = "upsellCalls";
const UPSELL_CALLS_HEADERS = ["dealId", "calledAt", "calledBy", "hubspotCallId"] as const;

export interface UpsellCallRecord {
  dealId: string;
  /** ISO 8601（UTC） */
  calledAt: string;
  calledBy: string;
  /** HubSpotに記録したコールのID（HubSpot側の記録に失敗した場合は空） */
  hubspotCallId: string;
}

/**
 * アップセル画面の「架電済み」チェックの記録。「アップセル」タブは同期のたびにHubSpotの内容で
 * 丸ごと差し替わるため、チェック状態はこの別タブに取引IDをキーとして持ち、同期時に合流させる。
 * 一度付けたチェックは手動で外すまで残す（自動リセットしない）。
 */
export async function listUpsellCalls(): Promise<Record<string, UpsellCallRecord>> {
  const sheets = getServiceSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${UPSELL_CALLS_SHEET_NAME}'!A2:D`,
    });
    const records: Record<string, UpsellCallRecord> = {};
    for (const [dealId, calledAt, calledBy, hubspotCallId] of res.data.values ?? []) {
      if (dealId) records[dealId] = { dealId, calledAt: calledAt ?? "", calledBy: calledBy ?? "", hubspotCallId: hubspotCallId ?? "" };
    }
    return records;
  } catch (error) {
    // タブがまだ無い（一度もチェックされていない）場合は空扱い
    if (error instanceof Error && /Unable to parse range/.test(error.message)) return {};
    throw error;
  }
}

/** 1件分の架電済み記録を追加・更新（recordがnullなら削除）して、タブ全体を書き直す。 */
export async function saveUpsellCall(dealId: string, record: UpsellCallRecord | null): Promise<void> {
  const records = await listUpsellCalls();
  if (record) records[dealId] = record;
  else delete records[dealId];
  await replaceSheetValues(UPSELL_CALLS_SHEET_NAME, [
    [...UPSELL_CALLS_HEADERS],
    ...Object.values(records).map((r) => [r.dealId, r.calledAt, r.calledBy, r.hubspotCallId]),
  ]);
}
