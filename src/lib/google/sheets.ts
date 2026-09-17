import { cache } from "react";
import { google, sheets_v4 } from "googleapis";
import { LEAD_HEADERS } from "@/lib/leads";
import type { LeadRow } from "@/lib/leads";
import { DEAL_HEARING_HEADERS } from "@/lib/dealHearing";
import type { DealHearingRow } from "@/lib/dealHearing";
import type { DealHearingContent } from "@/lib/hubspot";
import { CALL_SHIFT_HEADERS } from "@/lib/callShifts";
import type { CallShiftRow } from "@/lib/callShifts";
import { STAFF_WAGE_HEADERS } from "@/lib/staffWages";
import type { StaffWageRow } from "@/lib/staffWages";
import { MONTHLY_APO_HEADERS } from "@/lib/monthlyApo";
import type { MonthlyApoRow } from "@/lib/monthlyApo";
import { PUBLISHED_SHIFT_HEADERS } from "@/lib/publishedShifts";
import type { PublishedShiftRow } from "@/lib/publishedShifts";
import type { SharedAccountKey } from "@/lib/actingAs";

export { DEAL_HEARING_HEADERS } from "@/lib/dealHearing";
export type { DealHearingField, DealHearingRow } from "@/lib/dealHearing";

export { CALL_SHIFT_HEADERS } from "@/lib/callShifts";
export type { CallShiftField, CallShiftRow } from "@/lib/callShifts";

export { STAFF_WAGE_HEADERS } from "@/lib/staffWages";
export type { StaffWageField, StaffWageRow } from "@/lib/staffWages";

export { MONTHLY_APO_HEADERS } from "@/lib/monthlyApo";
export type { MonthlyApoField, MonthlyApoRow } from "@/lib/monthlyApo";

export { PUBLISHED_SHIFT_HEADERS } from "@/lib/publishedShifts";
export type { PublishedShiftField, PublishedShiftRow } from "@/lib/publishedShifts";

export { LEAD_HEADERS, LEAD_STATUSES } from "@/lib/leads";
export type { LeadField, LeadRow } from "@/lib/leads";

const SPREADSHEET_NAME = "営業先分析_リード";
// Known ID of the single company-wide spreadsheet. Looked up directly by ID first —
// Drive's name-search API only covers files the caller owns or was individually
// shared with (its default "user" corpus excludes domain-wide-shared-but-not-
// individually-shared files), so a teammate who only has domain-wide access would
// never find the file by search and would silently get a brand new empty one.
// Fetching by ID sidesteps that entirely: it only needs read/write access, not discoverability.
const KNOWN_SPREADSHEET_ID =
  process.env.SPREADSHEET_ID ?? "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const SHEET_NAME = "leads";
const ID_INDEX = LEAD_HEADERS.indexOf("id");
const NAME_INDEX = LEAD_HEADERS.indexOf("医療機関名");
const LEAD_LAST_COL = String.fromCharCode("A".charCodeAt(0) + LEAD_HEADERS.length - 1);

const LISTS_SHEET_NAME = "lists";
const LIST_HEADERS = ["id", "name", "region", "status", "assignee", "keyword", "call", "createdAt"] as const;
type ListField = (typeof LIST_HEADERS)[number];
export type SavedList = Record<ListField, string>;

const ACTING_AS_ROSTER_SHEET_NAME = "actingAsRoster";
// "account" は末尾に追加した列。既存行は空欄のままになるが、読み出し側でそれを
// "sales"（最初から存在する共有アカウント）として扱うことで後方互換を保っている。
const ACTING_AS_ROSTER_HEADERS = ["id", "name", "createdAt", "account"] as const;
type ActingAsRosterField = (typeof ACTING_AS_ROSTER_HEADERS)[number];
export type ActingAsRosterEntry = Record<ActingAsRosterField, string>;

const TARGETS_SHEET_NAME = "targets";
const TARGET_HEADERS = [
  "id",
  "fiscalYear",
  "periodLabel",
  "startDate",
  "endDate",
  "region",
  "targetAmount",
  "createdAt",
] as const;
type TargetField = (typeof TARGET_HEADERS)[number];
export type SalesTarget = Record<TargetField, string>;

/**
 * These columns stay in the data model (the app reads/writes them), but are
 * hidden by default so the sheet reads as a clean calling/emailing list rather
 * than a full data dump. Unhide any of them in Sheets any time — nothing breaks.
 */
const HIDDEN_FIELDS = [
  "適合度スコア",
  "規模スコア",
  "地域スコア",
  "情報ソースURL",
  "件名",
  "本文",
  "下書きID",
  "id",
] as const;

interface SpreadsheetInfo {
  spreadsheetId: string;
  sheetTitle: string;
}

function getAuthClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

function getSheets(accessToken: string) {
  return google.sheets({ version: "v4", auth: getAuthClient(accessToken) });
}

function getDrive(accessToken: string) {
  return google.drive({ version: "v3", auth: getAuthClient(accessToken) });
}

function rowToLead(row: string[]): LeadRow {
  const lead = {} as LeadRow;
  LEAD_HEADERS.forEach((header, i) => {
    lead[header] = row[i] ?? "";
  });
  return lead;
}

function leadToRow(lead: LeadRow): string[] {
  return LEAD_HEADERS.map((h) => lead[h] ?? "");
}

/**
 * Rewrites the header row and applies light formatting (frozen/bold header,
 * readable column widths) every time the sheet is opened. Cheap and idempotent —
 * this is what keeps a manually-created sheet in sync after the column schema changes,
 * without needing a database to track "already formatted".
 */
async function syncHeaderAndFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const target = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME) ??
    meta.data.sheets?.[0];
  const sheetId = target?.properties?.sheetId;
  const sheetTitle = target?.properties?.title ?? SHEET_NAME;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1:${LEAD_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...LEAD_HEADERS]] },
  });

  if (sheetId === undefined || sheetId === null) return sheetTitle;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.93, green: 0.94, blue: 0.99 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: LEAD_HEADERS.length },
            properties: { pixelSize: 130 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: NAME_INDEX, endIndex: NAME_INDEX + 1 },
            properties: { pixelSize: 220 },
            fields: "pixelSize",
          },
        },
        ...HIDDEN_FIELDS.map((field) => {
          const index = LEAD_HEADERS.indexOf(field);
          return {
            updateDimensionProperties: {
              range: { sheetId, dimension: "COLUMNS" as const, startIndex: index, endIndex: index + 1 },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          };
        }),
      ],
    },
  });

  return sheetTitle;
}

/**
 * The spreadsheet is found by name via Drive rather than stored elsewhere,
 * so the app needs no database of its own — the sheet itself is the source of truth.
 *
 * Wrapped in React's cache() so multiple sheet reads/writes within the same request
 * (e.g. the home page reading both targets and callShifts) share one lookup instead of
 * each re-verifying the spreadsheet exists and re-syncing its header/formatting.
 */
const ensureSpreadsheet = cache(async (accessToken: string): Promise<SpreadsheetInfo> => {
  const drive = getDrive(accessToken);
  const sheets = getSheets(accessToken);

  // Try the known shared spreadsheet by ID first — works for anyone with access
  // to the file (owner, individually shared, or domain-wide shared), regardless
  // of whether Drive search would surface it for them (see KNOWN_SPREADSHEET_ID).
  if (KNOWN_SPREADSHEET_ID) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: KNOWN_SPREADSHEET_ID, fields: "spreadsheetId" });
      const sheetTitle = await syncHeaderAndFormatting(sheets, KNOWN_SPREADSHEET_ID);
      return { spreadsheetId: KNOWN_SPREADSHEET_ID, sheetTitle };
    } catch {
      // Not accessible with this token (revoked, wrong env, etc.) — fall through
      // to name-based discovery/creation below.
    }
  }

  // orderBy makes the choice deterministic (oldest wins) if duplicates ever exist —
  // e.g. from two requests racing the "not found -> create" branch below.
  const existing = await drive.files.list({
    q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    orderBy: "createdTime",
  });

  const found = existing.data.files?.[0];
  if (found?.id) {
    const sheetTitle = await syncHeaderAndFormatting(sheets, found.id);
    return { spreadsheetId: found.id, sheetTitle };
  }

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_NAME },
      sheets: [{ properties: { title: SHEET_NAME } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("スプレッドシートの作成に失敗しました");

  const sheetTitle = await syncHeaderAndFormatting(sheets, spreadsheetId);
  return { spreadsheetId, sheetTitle };
});

/**
 * Saved lists live in their own tab in the same spreadsheet (not a separate file) —
 * keeps everything in the one Google Sheet the app already treats as its source of truth.
 */
async function ensureListsSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === LISTS_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: LISTS_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!A1:H1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...LIST_HEADERS]] },
  });
}

function rowToList(row: string[]): SavedList {
  const list = {} as SavedList;
  LIST_HEADERS.forEach((header, i) => {
    list[header] = row[i] ?? "";
  });
  return list;
}

function listToRow(list: SavedList): string[] {
  return LIST_HEADERS.map((h) => list[h] ?? "");
}

export async function listSavedLists(accessToken: string): Promise<SavedList[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureListsSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!A2:H`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToList(row as string[]));
}

export async function createSavedList(
  accessToken: string,
  list: Omit<SavedList, "id" | "createdAt">,
): Promise<SavedList> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureListsSheet(sheets, spreadsheetId);

  const newList: SavedList = { ...list, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [listToRow(newList)] },
  });
  return newList;
}

export async function renameSavedList(accessToken: string, id: string, name: string): Promise<void> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureListsSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!A2:A`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) throw new Error("リストが見つかりません");

  const nameColLetter = String.fromCharCode("A".charCodeAt(0) + LIST_HEADERS.indexOf("name"));
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!${nameColLetter}${rowIndex + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[name]] },
  });
}

export async function deleteSavedList(accessToken: string, id: string): Promise<void> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureListsSheet(sheets, spreadsheetId);

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === LISTS_SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${LISTS_SHEET_NAME}!A2:A`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 },
          },
        },
      ],
    },
  });
}

/**
 * 売上目標は年度・期（上半期/下半期）・地域ごとに行を積み重ねて管理する。
 * 新しい期の目標が来ても過去の行は残るので、年度をまたいだファイリングが自然にできる。
 */
async function ensureTargetsSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TARGETS_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TARGETS_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TARGETS_SHEET_NAME}!A1:H1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...TARGET_HEADERS]] },
  });
}

function rowToTarget(row: string[]): SalesTarget {
  const target = {} as SalesTarget;
  TARGET_HEADERS.forEach((header, i) => {
    target[header] = row[i] ?? "";
  });
  return target;
}

export async function listSalesTargets(accessToken: string): Promise<SalesTarget[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureTargetsSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TARGETS_SHEET_NAME}!A2:H`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToTarget(row as string[]));
}

export async function createSalesTarget(
  accessToken: string,
  target: Omit<SalesTarget, "id" | "createdAt">,
): Promise<SalesTarget> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureTargetsSheet(sheets, spreadsheetId);

  const newTarget: SalesTarget = { ...target, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TARGETS_SHEET_NAME}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [TARGET_HEADERS.map((h) => newTarget[h] ?? "")] },
  });
  return newTarget;
}

const DEAL_HEARING_SHEET_NAME = "dealHearing";

/**
 * 商談報告×Hubspotのヒアリング内容のうち、まだ実際のHubSpot Dealに紐付いていない
 * （もしくは紐付けを見送った）行を保持するタブ。hubspotDealIdが空の行はシート上だけの
 * データとして扱い、値が入っている行は一覧表示時にHubSpot側の最新情報とマージされる。
 */
async function ensureDealHearingSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === DEAL_HEARING_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: DEAL_HEARING_SHEET_NAME } } }] },
    });
  }
  const lastCol = String.fromCharCode("A".charCodeAt(0) + DEAL_HEARING_HEADERS.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DEAL_HEARING_SHEET_NAME}!A1:${lastCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...DEAL_HEARING_HEADERS]] },
  });
}

function rowToDealHearing(row: string[]): DealHearingRow {
  const hearing = {} as DealHearingRow;
  DEAL_HEARING_HEADERS.forEach((header, i) => {
    hearing[header] = row[i] ?? "";
  });
  return hearing;
}

function dealHearingToRow(hearing: DealHearingRow): string[] {
  return DEAL_HEARING_HEADERS.map((h) => hearing[h] ?? "");
}

const DEAL_HEARING_LAST_COL = String.fromCharCode("A".charCodeAt(0) + DEAL_HEARING_HEADERS.length - 1);

export async function listDealHearings(accessToken: string): Promise<DealHearingRow[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureDealHearingSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DEAL_HEARING_SHEET_NAME}!A2:${DEAL_HEARING_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToDealHearing(row as string[]));
}

export async function createDealHearing(
  accessToken: string,
  hearing: Omit<DealHearingRow, "id" | "createdAt">,
): Promise<DealHearingRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureDealHearingSheet(sheets, spreadsheetId);

  const newHearing: DealHearingRow = { ...hearing, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${DEAL_HEARING_SHEET_NAME}!A:${DEAL_HEARING_LAST_COL}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [dealHearingToRow(newHearing)] },
  });
  return newHearing;
}

export async function updateDealHearing(
  accessToken: string,
  id: string,
  patch: Partial<DealHearingRow>,
): Promise<DealHearingRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureDealHearingSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DEAL_HEARING_SHEET_NAME}!A2:${DEAL_HEARING_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idIndex = DEAL_HEARING_HEADERS.indexOf("id");
  const rowIndex = rows.findIndex((row) => row[idIndex] === id);
  if (rowIndex === -1) throw new Error("商談ヒアリング行が見つかりません");

  const current = rowToDealHearing(rows[rowIndex]);
  const updated: DealHearingRow = { ...current, ...patch };
  const sheetRow = rowIndex + 2;

  // 変更されたフィールドの列だけを書き込む（updateLeadと同じ考え方。行全体を書き戻すと、
  // 同じ商談を他の担当者がほぼ同時に別フィールドで更新していた場合にその変更を消してしまう）。
  const changedFields = Object.keys(patch) as (keyof DealHearingRow)[];
  const data = changedFields.map((field) => ({
    range: `${DEAL_HEARING_SHEET_NAME}!${columnLetterAt(DEAL_HEARING_HEADERS.indexOf(field))}${sheetRow}`,
    values: [[updated[field]]],
  }));
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return updated;
}

export async function deleteDealHearing(accessToken: string, id: string): Promise<void> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureDealHearingSheet(sheets, spreadsheetId);

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === DEAL_HEARING_SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DEAL_HEARING_SHEET_NAME}!A2:${DEAL_HEARING_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idIndex = DEAL_HEARING_HEADERS.indexOf("id");
  const rowIndex = rows.findIndex((row) => row[idIndex] === id);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } },
      ],
    },
  });
}

/** hubspotDealIdで対応する行を探して削除する（HubSpot側のDeal削除に合わせて、シート側の紐づく行も消すため）。 */
export async function deleteDealHearingByHubspotId(accessToken: string, hubspotDealId: string): Promise<void> {
  const rows = await listDealHearings(accessToken);
  const match = rows.find((r) => r.hubspotDealId === hubspotDealId);
  if (match) await deleteDealHearing(accessToken, match.id);
}

/**
 * HubSpot Dealの内容をdealHearingシートへ反映する。hubspotDealIdが一致する行が既にあれば更新、
 * なければ新規作成する（新規商談作成時のupsertと、HubSpot全体検索から取り込む場合の両方から使う）。
 */
export async function upsertDealHearingRowForDeal(
  accessToken: string,
  deal: DealHearingContent,
  ownerName: string,
): Promise<DealHearingRow> {
  const sheetRow: Omit<DealHearingRow, "id" | "createdAt"> = {
    dealname: deal.dealname,
    hubspotDealId: deal.id,
    ownerName,
    category: deal.category,
    probability: deal.probability,
    plan: deal.plan,
    product: deal.product,
    chart: deal.chart,
    chartTranscribed: deal.chartTranscribed === null ? "" : String(deal.chartTranscribed),
    expectedRevenue: deal.expectedRevenue === null ? "" : String(deal.expectedRevenue),
    area: deal.area,
    firstMeetingDate: deal.firstMeetingDate,
    patientsPerMonth: deal.patientsPerMonth === null ? "" : String(deal.patientsPerMonth),
    callsPerMonth: deal.callsPerMonth === null ? "" : String(deal.callsPerMonth),
    visitsPerMonth: deal.visitsPerMonth === null ? "" : String(deal.visitsPerMonth),
    hearingNotes: deal.hearingNotes,
    status: "",
    dealStage: deal.dealStage,
    contractDate: deal.contractDate,
  };

  const existingRows = await listDealHearings(accessToken);
  const existingRow = existingRows.find((r) => r.hubspotDealId === deal.id);
  if (existingRow) return updateDealHearing(accessToken, existingRow.id, sheetRow);
  return createDealHearing(accessToken, sheetRow);
}

const CALL_SHIFTS_SHEET_NAME = "callShifts";

/**
 * 架電スタッフ（バイトを含む）が自分の稼働時間（日付＋開始・終了時刻）を記録するタブ。
 * 旧・外部IS勤務報告スプレッドシートを置き換える。
 */
async function ensureCallShiftsSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === CALL_SHIFTS_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CALL_SHIFTS_SHEET_NAME } } }] },
    });
  }
  const lastCol = String.fromCharCode("A".charCodeAt(0) + CALL_SHIFT_HEADERS.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CALL_SHIFTS_SHEET_NAME}!A1:${lastCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...CALL_SHIFT_HEADERS]] },
  });
}

function rowToCallShift(row: string[]): CallShiftRow {
  const shift = {} as CallShiftRow;
  CALL_SHIFT_HEADERS.forEach((header, i) => {
    shift[header] = row[i] ?? "";
  });
  return shift;
}

const CALL_SHIFT_LAST_COL = String.fromCharCode("A".charCodeAt(0) + CALL_SHIFT_HEADERS.length - 1);

export async function listCallShifts(accessToken: string): Promise<CallShiftRow[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureCallShiftsSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${CALL_SHIFTS_SHEET_NAME}!A2:${CALL_SHIFT_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToCallShift(row as string[]));
}

export async function createCallShift(
  accessToken: string,
  shift: Omit<CallShiftRow, "id" | "createdAt">,
): Promise<CallShiftRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureCallShiftsSheet(sheets, spreadsheetId);

  const newShift: CallShiftRow = { ...shift, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${CALL_SHIFTS_SHEET_NAME}!A:${CALL_SHIFT_LAST_COL}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [CALL_SHIFT_HEADERS.map((h) => newShift[h] ?? "")] },
  });
  return newShift;
}

export async function updateCallShift(
  accessToken: string,
  id: string,
  patch: Partial<CallShiftRow>,
): Promise<CallShiftRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureCallShiftsSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${CALL_SHIFTS_SHEET_NAME}!A2:${CALL_SHIFT_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idIndex = CALL_SHIFT_HEADERS.indexOf("id");
  const rowIndex = rows.findIndex((row) => row[idIndex] === id);
  if (rowIndex === -1) throw new Error("稼働報告が見つかりません");

  const current = rowToCallShift(rows[rowIndex]);
  const updated: CallShiftRow = { ...current, ...patch };
  const sheetRow = rowIndex + 2;

  // 変更されたフィールドの列だけを書き込む（updateLeadと同じ考え方）。
  const changedFields = Object.keys(patch) as (keyof CallShiftRow)[];
  const data = changedFields.map((field) => ({
    range: `${CALL_SHIFTS_SHEET_NAME}!${columnLetterAt(CALL_SHIFT_HEADERS.indexOf(field))}${sheetRow}`,
    values: [[updated[field] ?? ""]],
  }));
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return updated;
}

export async function deleteCallShift(accessToken: string, id: string): Promise<void> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureCallShiftsSheet(sheets, spreadsheetId);

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === CALL_SHIFTS_SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${CALL_SHIFTS_SHEET_NAME}!A2:${CALL_SHIFT_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idIndex = CALL_SHIFT_HEADERS.indexOf("id");
  const rowIndex = rows.findIndex((row) => row[idIndex] === id);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } },
      ],
    },
  });
}

const STAFF_WAGES_SHEET_NAME = "staffWages";
const STAFF_WAGE_LAST_COL = String.fromCharCode("A".charCodeAt(0) + STAFF_WAGE_HEADERS.length - 1);

async function ensureStaffWagesSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === STAFF_WAGES_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: STAFF_WAGES_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${STAFF_WAGES_SHEET_NAME}!A1:${STAFF_WAGE_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...STAFF_WAGE_HEADERS]] },
  });
}

function rowToStaffWage(row: string[]): StaffWageRow {
  const wage = {} as StaffWageRow;
  STAFF_WAGE_HEADERS.forEach((header, i) => {
    wage[header] = row[i] ?? "";
  });
  return wage;
}

export async function listStaffWages(accessToken: string): Promise<StaffWageRow[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureStaffWagesSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${STAFF_WAGES_SHEET_NAME}!A2:${STAFF_WAGE_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToStaffWage(row as string[]));
}

/** callerIdentity（稼働者の識別キー）ごとに1行だけ持つ。既存行があれば時給を上書き、無ければ新規追加する。 */
export async function upsertStaffWage(
  accessToken: string,
  callerIdentity: string,
  hourlyWage: string,
): Promise<StaffWageRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureStaffWagesSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${STAFF_WAGES_SHEET_NAME}!A2:${STAFF_WAGE_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const identityIndex = STAFF_WAGE_HEADERS.indexOf("callerIdentity");
  const rowIndex = rows.findIndex((row) => row[identityIndex] === callerIdentity);
  const updatedAt = new Date().toISOString();

  if (rowIndex === -1) {
    const newWage: StaffWageRow = { id: crypto.randomUUID(), callerIdentity, hourlyWage, updatedAt };
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${STAFF_WAGES_SHEET_NAME}!A:${STAFF_WAGE_LAST_COL}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [STAFF_WAGE_HEADERS.map((h) => newWage[h] ?? "")] },
    });
    return newWage;
  }

  const current = rowToStaffWage(rows[rowIndex]);
  const updated: StaffWageRow = { ...current, hourlyWage, updatedAt };
  const sheetRow = rowIndex + 2;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${STAFF_WAGES_SHEET_NAME}!${columnLetterAt(STAFF_WAGE_HEADERS.indexOf("hourlyWage"))}${sheetRow}`, values: [[hourlyWage]] },
        { range: `${STAFF_WAGES_SHEET_NAME}!${columnLetterAt(STAFF_WAGE_HEADERS.indexOf("updatedAt"))}${sheetRow}`, values: [[updatedAt]] },
      ],
    },
  });
  return updated;
}

const MONTHLY_APO_SHEET_NAME = "monthlyApo";
const MONTHLY_APO_LAST_COL = String.fromCharCode("A".charCodeAt(0) + MONTHLY_APO_HEADERS.length - 1);

async function ensureMonthlyApoSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === MONTHLY_APO_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: MONTHLY_APO_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${MONTHLY_APO_SHEET_NAME}!A1:${MONTHLY_APO_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...MONTHLY_APO_HEADERS]] },
  });
}

function rowToMonthlyApo(row: string[]): MonthlyApoRow {
  const r = {} as MonthlyApoRow;
  MONTHLY_APO_HEADERS.forEach((header, i) => {
    r[header] = row[i] ?? "";
  });
  return r;
}

export async function listMonthlyApo(accessToken: string): Promise<MonthlyApoRow[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureMonthlyApoSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MONTHLY_APO_SHEET_NAME}!A2:${MONTHLY_APO_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToMonthlyApo(row as string[]));
}

/** callerIdentity×month（"YYYY-MM"）ごとに1行だけ持つ。既存行があればアポ数を上書き、無ければ新規追加する。 */
export async function upsertMonthlyApo(
  accessToken: string,
  callerIdentity: string,
  month: string,
  apoCount: string,
): Promise<MonthlyApoRow> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureMonthlyApoSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${MONTHLY_APO_SHEET_NAME}!A2:${MONTHLY_APO_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const identityIndex = MONTHLY_APO_HEADERS.indexOf("callerIdentity");
  const monthIndex = MONTHLY_APO_HEADERS.indexOf("month");
  const rowIndex = rows.findIndex((row) => row[identityIndex] === callerIdentity && row[monthIndex] === month);
  const updatedAt = new Date().toISOString();

  if (rowIndex === -1) {
    const newRow: MonthlyApoRow = { id: crypto.randomUUID(), callerIdentity, month, apoCount, updatedAt };
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${MONTHLY_APO_SHEET_NAME}!A:${MONTHLY_APO_LAST_COL}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [MONTHLY_APO_HEADERS.map((h) => newRow[h] ?? "")] },
    });
    return newRow;
  }

  const current = rowToMonthlyApo(rows[rowIndex]);
  const updated: MonthlyApoRow = { ...current, apoCount, updatedAt };
  const sheetRow = rowIndex + 2;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${MONTHLY_APO_SHEET_NAME}!${columnLetterAt(MONTHLY_APO_HEADERS.indexOf("apoCount"))}${sheetRow}`, values: [[apoCount]] },
        { range: `${MONTHLY_APO_SHEET_NAME}!${columnLetterAt(MONTHLY_APO_HEADERS.indexOf("updatedAt"))}${sheetRow}`, values: [[updatedAt]] },
      ],
    },
  });
  return updated;
}

const PUBLISHED_SHIFTS_SHEET_NAME = "publishedShifts";
const PUBLISHED_SHIFT_LAST_COL = String.fromCharCode("A".charCodeAt(0) + PUBLISHED_SHIFT_HEADERS.length - 1);

async function ensurePublishedShiftsSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === PUBLISHED_SHIFTS_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: PUBLISHED_SHIFTS_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${PUBLISHED_SHIFTS_SHEET_NAME}!A1:${PUBLISHED_SHIFT_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...PUBLISHED_SHIFT_HEADERS]] },
  });
}

function rowToPublishedShift(row: string[]): PublishedShiftRow {
  const r = {} as PublishedShiftRow;
  PUBLISHED_SHIFT_HEADERS.forEach((header, i) => {
    r[header] = row[i] ?? "";
  });
  return r;
}

export async function listPublishedShifts(accessToken: string): Promise<PublishedShiftRow[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensurePublishedShiftsSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PUBLISHED_SHIFTS_SHEET_NAME}!A2:${PUBLISHED_SHIFT_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToPublishedShift(row as string[]));
}

/** 指定したカレンダーイベントIDを「公開済み」として記録する。既に記録済みなら何もしない（二重通知防止）。 */
export async function markShiftPublished(accessToken: string, eventId: string): Promise<{ alreadyPublished: boolean }> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensurePublishedShiftsSheet(sheets, spreadsheetId);

  const existing = await listPublishedShifts(accessToken);
  if (existing.some((r) => r.eventId === eventId)) {
    return { alreadyPublished: true };
  }

  const newRow: PublishedShiftRow = { id: crypto.randomUUID(), eventId, publishedAt: new Date().toISOString() };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${PUBLISHED_SHIFTS_SHEET_NAME}!A:${PUBLISHED_SHIFT_LAST_COL}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [PUBLISHED_SHIFT_HEADERS.map((h) => newRow[h] ?? "")] },
  });
  return { alreadyPublished: false };
}

const ACTING_AS_ROSTER_LAST_COL = String.fromCharCode("A".charCodeAt(0) + ACTING_AS_ROSTER_HEADERS.length - 1);

/**
 * 共有アカウント（contact-sales@oncall-japan.com）でログインする人が限られているため、
 * 過去のリード・稼働報告から推測するのではなく、この専用タブで「実際の操作者名」の一覧を
 * 明示的に管理する（間違えて登録した名前を削除できるようにするため）。
 */
async function ensureActingAsRosterSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === ACTING_AS_ROSTER_SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: ACTING_AS_ROSTER_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${ACTING_AS_ROSTER_SHEET_NAME}!A1:${ACTING_AS_ROSTER_LAST_COL}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...ACTING_AS_ROSTER_HEADERS]] },
  });
}

function rowToActingAsRosterEntry(row: string[]): ActingAsRosterEntry {
  const entry = {} as ActingAsRosterEntry;
  ACTING_AS_ROSTER_HEADERS.forEach((header, i) => {
    entry[header] = row[i] ?? "";
  });
  return entry;
}

export async function listActingAsRoster(
  accessToken: string,
  account: SharedAccountKey,
): Promise<ActingAsRosterEntry[]> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureActingAsRosterSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ACTING_AS_ROSTER_SHEET_NAME}!A2:${ACTING_AS_ROSTER_LAST_COL}`,
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row.some((cell) => cell))
    .map((row) => rowToActingAsRosterEntry(row as string[]))
    .filter((entry) => (entry.account || "sales") === account);
}

/** 同じ名前が同じアカウント内に既にあれば新規作成せず、その既存の行を返す（重複登録防止）。 */
export async function createActingAsRosterEntry(
  accessToken: string,
  name: string,
  account: SharedAccountKey,
): Promise<ActingAsRosterEntry> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureActingAsRosterSheet(sheets, spreadsheetId);

  const existing = await listActingAsRoster(accessToken, account);
  const found = existing.find((e) => e.name === name);
  if (found) return found;

  const newEntry: ActingAsRosterEntry = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    account,
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${ACTING_AS_ROSTER_SHEET_NAME}!A:${ACTING_AS_ROSTER_LAST_COL}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [ACTING_AS_ROSTER_HEADERS.map((h) => newEntry[h] ?? "")] },
  });
  return newEntry;
}

export async function deleteActingAsRosterEntry(accessToken: string, id: string): Promise<void> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await ensureActingAsRosterSheet(sheets, spreadsheetId);

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === ACTING_AS_ROSTER_SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${ACTING_AS_ROSTER_SHEET_NAME}!A2:${ACTING_AS_ROSTER_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idIndex = ACTING_AS_ROSTER_HEADERS.indexOf("id");
  const rowIndex = rows.findIndex((row) => row[idIndex] === id);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } },
      ],
    },
  });
}

export async function ensureSpreadsheetId(accessToken: string): Promise<string> {
  return (await ensureSpreadsheet(accessToken)).spreadsheetId;
}

export async function getSpreadsheetUrl(accessToken: string): Promise<string> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export async function listLeads(accessToken: string): Promise<LeadRow[]> {
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  return listLeadsFor(accessToken, spreadsheetId, sheetTitle);
}

async function listLeadsFor(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<LeadRow[]> {
  const sheets = getSheets(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:${LEAD_LAST_COL}`,
  });

  const rows = res.data.values ?? [];
  return rows.filter((row) => row.some((cell) => cell)).map((row) => rowToLead(row as string[]));
}

/**
 * Combines what the dashboard needs into a single ensureSpreadsheet() call.
 * Calling listLeads() and getSpreadsheetUrl() separately via Promise.all — as the
 * dashboard page used to — ran ensureSpreadsheet() twice concurrently, and since
 * "check Drive, then create if missing" isn't atomic, both calls could see "not found"
 * and each create their own spreadsheet, leaving two files with the same name.
 */
export async function getDashboardData(
  accessToken: string,
): Promise<{ leads: LeadRow[]; spreadsheetUrl: string }> {
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  const leads = await listLeadsFor(accessToken, spreadsheetId, sheetTitle);
  return {
    leads,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * このアプリが管理するリードシート以外の、任意のGoogleスプレッドシートから値を読み取る。
 * 他社利用リストの取り込みなど、一時的な社内データ移行作業のためのもの。
 * シート名を指定しない範囲（例: "A2:E1000"）を渡すと、そのスプレッドシートの先頭のシートが対象になる。
 */
export async function readExternalSheetRows(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheets(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}

/**
 * 複数のリードを1回のAPI呼び出しでまとめて更新する。updateLead()をリード件数分呼ぶと
 * 都度シート全体を読み直すため件数が多いと遅く、Vercelの実行時間制限にも掛かりかねない。
 * 現在のシート内容を1回だけ読み、更新後の行をbatchUpdateで一括反映する。
 */
export async function bulkUpdateLeads(
  accessToken: string,
  patches: Array<{ id: string; patch: Partial<LeadRow> }>,
): Promise<void> {
  if (patches.length === 0) return;
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:${LEAD_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIndexById = new Map<string, number>();
  rows.forEach((row, i) => rowIndexById.set(row[ID_INDEX], i));

  const data = patches
    .map(({ id, patch }) => {
      const rowIndex = rowIndexById.get(id);
      if (rowIndex === undefined) return null;
      const current = rowToLead(rows[rowIndex]);
      const updated: LeadRow = { ...current, ...patch };
      const sheetRow = rowIndex + 2;
      return {
        range: `${sheetTitle}!A${sheetRow}:${LEAD_LAST_COL}${sheetRow}`,
        values: [leadToRow(updated)],
      };
    })
    .filter((d): d is { range: string; values: string[][] } => d !== null);

  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function appendLeads(accessToken: string, leads: LeadRow[]): Promise<void> {
  if (leads.length === 0) return;
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:${LEAD_LAST_COL}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: leads.map(leadToRow) },
  });
}

export async function getLeadById(accessToken: string, id: string): Promise<LeadRow | null> {
  const leads = await listLeads(accessToken);
  return leads.find((lead) => lead.id === id) ?? null;
}

function columnLetterAt(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

export async function updateLead(
  accessToken: string,
  id: string,
  patch: Partial<LeadRow>,
): Promise<LeadRow> {
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:${LEAD_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIndex = rows.findIndex((row) => row[ID_INDEX] === id);
  if (rowIndex === -1) throw new Error("リードが見つかりません");

  const current = rowToLead(rows[rowIndex]);
  const updated: LeadRow = { ...current, ...patch };
  const sheetRow = rowIndex + 2; // +1 for header row, +1 for 1-indexing

  // 変更されたフィールドの列だけを書き込む。行全体を書き戻すと、他の担当者がほぼ同時に
  // 同じ行の別フィールドを更新していた場合にその変更を消してしまうため。
  const changedFields = Object.keys(patch) as (keyof LeadRow)[];
  const data = changedFields.map((field) => ({
    range: `${sheetTitle}!${columnLetterAt(LEAD_HEADERS.indexOf(field))}${sheetRow}`,
    values: [[updated[field]]],
  }));
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return updated;
}

export async function deleteLead(accessToken: string, id: string): Promise<void> {
  const { spreadsheetId, sheetTitle } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetTitle);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:${LEAD_LAST_COL}`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIndex = rows.findIndex((row) => row[ID_INDEX] === id);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } },
      ],
    },
  });
}

const LEAD_EXPORT_HEADERS = [
  "架電日",
  "フェーズ",
  "医療機関名",
  "電話番号",
  "住所",
  "医療機関の特色",
  "状況",
  "架電メモ",
] as const;

/**
 * リード一覧の絞り込み結果（担当者への配布・共有用）を、指定した名前の新しいタブへスナップショット
 * として書き出す。同名タブが既にある場合は上書きせず、「(2)」「(3)」のように連番を付けて
 * 必ず新しいタブを作る——呼ぶたびに過去の出力が別タブとして残っていく。
 * タブ名にGoogle Sheetsで使えない文字（: \ / ? * [ ]）が含まれる場合は_に置き換える。
 */
export async function exportLeadsToNewTab(
  accessToken: string,
  tabName: string,
  rows: string[][],
): Promise<string> {
  const { spreadsheetId } = await ensureSpreadsheet(accessToken);
  const sheets = getSheets(accessToken);
  const baseName = tabName.replace(/[:\\/?*[\]]/g, "_").slice(0, 100) || "出力リスト";

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const existingTitles = new Set(meta.data.sheets?.map((s) => s.properties?.title).filter((t): t is string => Boolean(t)));

  let safeName = baseName;
  let suffix = 2;
  while (existingTitles.has(safeName)) {
    const suffixLabel = ` (${suffix})`;
    safeName = `${baseName.slice(0, 100 - suffixLabel.length)}${suffixLabel}`;
    suffix++;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: safeName } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${safeName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[...LEAD_EXPORT_HEADERS], ...rows] },
  });

  return safeName;
}
