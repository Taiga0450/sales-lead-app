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
