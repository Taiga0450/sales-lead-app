// 商談報告×Hubspot: 営業KPIスプレッドシート（案件台帳）の内容を、アプリのGoogle Sheets
// 「dealHearing」タブに取り込む一度限りのスクリプト。
//
// HubSpotへの書き込みはHUBSPOT_ACCESS_TOKENの権限不足で失敗するため、当面はHubSpotには
// 書き込まず、アプリ側（Sheets）にだけ反映する（ユーザー指示）。既にHubSpot上に同名の商談が
// 存在する行は、参照用にhubspotDealIdだけ埋めておく（一覧表示時にHubSpot側の実データを優先し、
// 重複表示を避けるため）。
//
// データソース: scripts/data/deal_kpi_ledger_snapshot.md
//   (https://docs.google.com/spreadsheets/d/14_GuEVsR3oElO5eSMKxui5jK7UYfMkx-sYVvpqxw3ac の
//    案件台帳シートを2026-08-20に取得したスナップショット)
//
// 実行: node scripts/import_deal_hearing_to_sheet.mjs         (ドライラン。書き込みなし)
//       node scripts/import_deal_hearing_to_sheet.mjs --apply  (実際にSheetへ書き込む)
//       node scripts/import_deal_hearing_to_sheet.mjs --rep=森 (対象担当者を絞る。省略時は森・富田両方)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const repArg = process.argv.find((a) => a.startsWith("--rep="));
const TARGET_REPS = repArg ? [repArg.split("=")[1]] : ["森", "富田"];

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s"; // src/lib/google/sheets.ts の KNOWN_SPREADSHEET_ID と同じ
const SHEET_NAME = "dealHearing";
const HEADERS = [
  "id",
  "dealname",
  "hubspotDealId",
  "ownerName",
  "category",
  "probability",
  "plan",
  "product",
  "chart",
  "chartTranscribed",
  "expectedRevenue",
  "area",
  "firstMeetingDate",
  "patientsPerMonth",
  "callsPerMonth",
  "visitsPerMonth",
  "hearingNotes",
  "status",
  "createdAt",
];

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HS_HEADERS = HUBSPOT_TOKEN
  ? { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" }
  : null;
const HUBSPOT_BASE = "https://api.hubapi.com";

const LEGAL_ENTITY_PREFIXES =
  /医療法人社団|医療法人財団|社会医療法人|公益社団法人|一般社団法人|医療法人/g;
const DEALNAME_DECORATION = /[|｜]\s*新規\s*$/;
function normalizeName(name) {
  return (name || "").replace(DEALNAME_DECORATION, "").replace(/[\s　]+/g, "").replace(LEGAL_ENTITY_PREFIXES, "");
}

const CATEGORY_CONSOLIDATE = {
  医師ネック案件: "自院完結",
  受電ネック案件: "自院完結",
  "その他（他社利用中）": "自院完結",
};
function consolidateCategory(raw) {
  if (raw === "TC案件" || raw === "FD案件") return raw;
  return CATEGORY_CONSOLIDATE[raw] ?? "自院完結";
}
const PLAN_VALUE_MAP = {
  "1stcall": "1stcall",
  "2ndcallﾁｹｯﾄ": "2ndcallチケット",
  "2ndcallｽﾎﾟｯﾄ": "2ndcallスポット",
  callｺﾈｸﾄ: "callコネクト",
};
function normalizePlanValue(raw) {
  return PLAN_VALUE_MAP[raw] ?? raw;
}
function parseYen(raw) {
  if (!raw) return "";
  const n = Number(raw.replace(/[¥,]/g, "").trim());
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}
function parseProbability(raw) {
  const m = (raw || "").match(/^[ABCD]/);
  return m ? m[0] : "";
}
function parseSheetDate(raw) {
  const m = (raw || "").trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function parseMarkdownTable(text) {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  const header = lines[0].split("|").map((c) => c.trim()).slice(1, -1);
  return lines.slice(1).map((line) => {
    const cells = line.split("|").map((c) => c.trim()).slice(1, -1);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const snapshotPath = join(__dirname, "data", "deal_kpi_ledger_snapshot.md");
const rawRows = parseMarkdownTable(readFileSync(snapshotPath, "utf-8"));

const sourceRows = rawRows
  .filter((r) => TARGET_REPS.includes(r[""]))
  .filter((r) => r["機関名"])
  .map((r) => ({
    rep: r[""],
    dealname: r["機関名"].trim(),
    firstMeetingDate: parseSheetDate(r["初回商談日"]),
    category: r["カテゴリ"] ? consolidateCategory(r["カテゴリ"]) : "",
    plan: r["検討プラン"] ? normalizePlanValue(r["検討プラン"]) : "",
    expectedRevenue: parseYen(r["見込み売上高"]),
    probability: parseProbability(r["見込み確度"]),
    status: r["ステータス"] || "",
  }));

console.log(`スナップショットから対象行を抽出: ${sourceRows.length}件（${TARGET_REPS.join("・")}）`);

// HubSpot側に既に同名の商談があるかを参照用に調べる（書き込みはしない）
async function searchDeals(body) {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: HS_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.results ?? [];
}
async function findDealId(name) {
  if (!HS_HEADERS) return "";
  const exact = await searchDeals({
    filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: name }] }],
    properties: ["dealname"],
    limit: 1,
  });
  if (exact[0]) return exact[0].id;
  const candidates = await searchDeals({ query: name, properties: ["dealname"], limit: 10 });
  const target = normalizeName(name);
  const matches = candidates.filter((c) => {
    const n = normalizeName(c.properties.dealname ?? "");
    return n.length > 0 && (n === target || n.includes(target) || target.includes(n));
  });
  return matches.length === 1 ? matches[0].id : "";
}

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function ensureSheet() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
  }
  const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:${lastCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

async function existingDealnames() {
  const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:${lastCol}`,
  });
  const rows = res.data.values ?? [];
  const dealnameIdx = HEADERS.indexOf("dealname");
  return new Set(rows.map((r) => normalizeName(r[dealnameIdx] ?? "")));
}

await ensureSheet();
const already = await existingDealnames();
const toInsert = sourceRows.filter((r) => !already.has(normalizeName(r.dealname)));
console.log(`既にdealHearingタブに存在（スキップ）: ${sourceRows.length - toInsert.length}件`);
console.log(`新規に取り込む: ${toInsert.length}件`);

console.log("\nHubSpot上の既存商談を参照確認中（書き込みはしません）...");
let matchedCount = 0;
const rowsToWrite = [];
for (const r of toInsert) {
  let hubspotDealId = "";
  try {
    hubspotDealId = await findDealId(r.dealname);
    if (hubspotDealId) matchedCount++;
  } catch (err) {
    console.error(`HubSpot参照検索失敗: ${r.dealname}: ${err.message}`);
  }
  rowsToWrite.push({
    id: crypto.randomUUID(),
    dealname: r.dealname,
    hubspotDealId,
    ownerName: r.rep,
    category: r.category,
    probability: r.probability,
    plan: r.plan,
    product: "",
    chart: "",
    chartTranscribed: "",
    expectedRevenue: r.expectedRevenue,
    area: "",
    firstMeetingDate: r.firstMeetingDate,
    patientsPerMonth: "",
    callsPerMonth: "",
    visitsPerMonth: "",
    hearingNotes: "",
    status: r.status,
    createdAt: new Date().toISOString(),
  });
}
console.log(`うちHubSpot上に既存商談が見つかった件数（参照のみ）: ${matchedCount}件`);

console.log("\n--- 取り込みサンプル（上位10件） ---");
rowsToWrite.slice(0, 10).forEach((r) => {
  console.log(`  ${r.dealname}（${r.ownerName}）: category=${r.category || "—"}, plan=${r.plan || "—"}, 見込み売上=${r.expectedRevenue || "—"}, hubspotDealId=${r.hubspotDealId || "なし"}`);
});

if (!APPLY) {
  console.log("\nドライラン完了。適用するには --apply を付けて再実行してください。");
  process.exit(0);
}

if (rowsToWrite.length > 0) {
  const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:${lastCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rowsToWrite.map((r) => HEADERS.map((h) => r[h] ?? "")) },
  });
}
console.log(`\n適用完了: dealHearingタブに${rowsToWrite.length}件を追加しました。`);
