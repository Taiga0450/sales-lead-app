// dealHearingタブに既に取り込み済みの105件（森・富田）へ、取引ステージ追跡機能で使う
// dealStage / contractDate を後付けするパッチスクリプト。
//
// ルール（ユーザー指示）:
// - 案件台帳のJ列「受注日」が入っている行 → dealStage="クローズ済み", contractDate=受注日
// - ステータスが「商談中」（受注日なし） → dealStage="見積提出" で統一
// - ステータスが「失注」 → dealStage="失注"（HubSpotのclosedlostには反映しない、ローカルのみ）
//
// 実行: node scripts/patch_deal_hearing_stage.mjs        (ドライラン。書き込みなし)
//       node scripts/patch_deal_hearing_stage.mjs --apply  (実際にSheetへ書き込む)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
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
  "dealStage",
  "contractDate",
  "createdAt",
];

const LEGAL_ENTITY_PREFIXES =
  /医療法人社団|医療法人財団|社会医療法人|公益社団法人|一般社団法人|医療法人/g;
function normalizeName(name) {
  return (name || "").replace(/[\s　]+/g, "").replace(LEGAL_ENTITY_PREFIXES, "");
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

function deriveStage(sourceRow) {
  const contractDate = parseSheetDate(sourceRow["受注日"]);
  if (contractDate) return { dealStage: "クローズ済み", contractDate };
  if (sourceRow["ステータス"] === "失注") return { dealStage: "失注", contractDate: "" };
  return { dealStage: "見積提出", contractDate: "" };
}

const snapshotPath = join(__dirname, "data", "deal_kpi_ledger_snapshot.md");
const sourceRows = parseMarkdownTable(readFileSync(snapshotPath, "utf-8")).filter((r) => r["機関名"]);
const sourceByName = new Map();
for (const r of sourceRows) sourceByName.set(normalizeName(r["機関名"]), r);

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID,
  range: `${SHEET_NAME}!A2:${lastCol}`,
});
const rows = res.data.values ?? [];
const dealnameIdx = HEADERS.indexOf("dealname");
const dealStageIdx = HEADERS.indexOf("dealStage");
const contractDateIdx = HEADERS.indexOf("contractDate");
const dealStageCol = String.fromCharCode("A".charCodeAt(0) + dealStageIdx);
const contractDateCol = String.fromCharCode("A".charCodeAt(0) + contractDateIdx);

console.log(`dealHearingタブの既存行: ${rows.length}件`);

const updates = []; // { rowNumber, dealStage, contractDate, dealname }
let noSource = 0;
rows.forEach((row, i) => {
  const dealname = row[dealnameIdx] ?? "";
  const source = sourceByName.get(normalizeName(dealname));
  if (!source) {
    noSource++;
    return;
  }
  const { dealStage, contractDate } = deriveStage(source);
  const currentStage = row[dealStageIdx] ?? "";
  const currentContractDate = row[contractDateIdx] ?? "";
  if (currentStage === dealStage && currentContractDate === contractDate) return; // 既に反映済み
  updates.push({ rowNumber: i + 2, dealname, dealStage, contractDate });
});

console.log(`案件台帳に対応データが見つからない行: ${noSource}件`);
console.log(`更新対象: ${updates.length}件`);
const byStage = {};
for (const u of updates) byStage[u.dealStage] = (byStage[u.dealStage] ?? 0) + 1;
console.log("内訳:", byStage);

console.log("\n--- サンプル（上位15件） ---");
updates.slice(0, 15).forEach((u) => console.log(`  ${u.dealname}: dealStage=${u.dealStage}, contractDate=${u.contractDate || "—"}`));

if (!APPLY) {
  console.log("\nドライラン完了。適用するには --apply を付けて再実行してください。");
  process.exit(0);
}

// 1件ずつupdate()を呼ぶとSheets APIの書き込みレート制限（60回/分）にすぐ当たるため、
// batchUpdate()でまとめて送る（500件ずつのチャンクに分割）。
const data = updates.map((u) => ({
  range: `${SHEET_NAME}!${dealStageCol}${u.rowNumber}:${contractDateCol}${u.rowNumber}`,
  values: [[u.dealStage, u.contractDate]],
}));
for (let i = 0; i < data.length; i += 500) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data: data.slice(i, i + 500) },
  });
}
console.log(`\n適用完了: ${updates.length}件を更新しました。`);
