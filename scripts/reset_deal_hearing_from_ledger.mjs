// 商談報告×Hubspot: dealHearingタブを一旦全件クリアし、最新の案件台帳
// （scripts/data/deal_kpi_ledger_v2.md、担当者列に「森」「富田」のみを含む）から
// 105件を再インポートする。
//
// 今回は意図的にHubSpot側の既存Dealとの突き合わせ（hubspotDealId）を行わない
// ——同一医療機関が「医療法人〇〇」付き/なしの2つの重複Dealとして存在し、
// 内容が分かれて表示されてしまう問題を避けるため。今回インポートする105件は
// 完全にシート単独のデータとして扱う（HubSpotへの書き込みも行わない）。
//
// データソース: https://docs.google.com/spreadsheets/d/1ByKyDic0zf31dTuR-0bZTalF6G02wlbGiWMI-gLP-pM
//   を2026-08-20に取得したスナップショット（scripts/data/deal_kpi_ledger_v2.md）
//
// 実行: node scripts/reset_deal_hearing_from_ledger.mjs         (ドライラン。書き込みなし)
//       node scripts/reset_deal_hearing_from_ledger.mjs --apply  (実際にクリア＋再インポート)

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
function deriveStage(status, contractDate) {
  if (contractDate) return "クローズ済み";
  if (status === "失注") return "失注";
  return "見積提出";
}
function parseMarkdownTable(text) {
  const lines = text
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    // 区切り行（| :-: | :-: | ...）を除外する
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l.trim()));
  const header = lines[0].split("|").map((c) => c.trim()).slice(1, -1);
  return lines.slice(1).map((line) => {
    const cells = line.split("|").map((c) => c.trim()).slice(1, -1);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const snapshotPath = join(__dirname, "data", "deal_kpi_ledger_v2.md");
const sourceRows = parseMarkdownTable(readFileSync(snapshotPath, "utf-8")).filter((r) => r["医療機関"]);

const rowsToWrite = sourceRows.map((r) => {
  const contractDate = parseSheetDate(r["契約書締結日"]);
  return {
    id: crypto.randomUUID(),
    dealname: r["医療機関"].trim(),
    hubspotDealId: "", // 意図的に未設定（HubSpotとの突き合わせをしない）
    ownerName: r[""],
    category: r["カテゴリ"] ? consolidateCategory(r["カテゴリ"]) : "",
    probability: parseProbability(r["見込み確度"]),
    plan: r["検討プラン"] ? normalizePlanValue(r["検討プラン"]) : "",
    product: "",
    chart: "",
    chartTranscribed: "",
    expectedRevenue: parseYen(r["見込み売上"]),
    area: "",
    firstMeetingDate: parseSheetDate(r["初回商談完了日"]),
    patientsPerMonth: "",
    callsPerMonth: "",
    visitsPerMonth: "",
    hearingNotes: "",
    status: r["ステータス"] || "",
    dealStage: deriveStage(r["ステータス"], contractDate),
    contractDate,
    createdAt: new Date().toISOString(),
  };
});

console.log(`案件台帳から抽出: ${rowsToWrite.length}件`);
const byStage = {};
for (const r of rowsToWrite) byStage[r.dealStage] = (byStage[r.dealStage] ?? 0) + 1;
console.log("ステージ内訳:", byStage);
console.log("\n--- サンプル（上位10件） ---");
rowsToWrite.slice(0, 10).forEach((r) => {
  console.log(`  ${r.dealname}（${r.ownerName}）: category=${r.category || "—"}, 見込み売上=${r.expectedRevenue || "—"}, dealStage=${r.dealStage}, contractDate=${r.contractDate || "—"}`);
});

if (!APPLY) {
  console.log("\nドライラン完了。適用するには --apply を付けて再実行してください。");
  console.log("（--apply実行時は、まずdealHearingタブの既存データを全件クリアしてから書き込みます）");
  process.exit(0);
}

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);

console.log("\n既存データをクリア中...");
await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A2:${lastCol}` });

console.log("再インポート中...");
await sheets.spreadsheets.values.append({
  spreadsheetId: SPREADSHEET_ID,
  range: `${SHEET_NAME}!A:${lastCol}`,
  valueInputOption: "USER_ENTERED",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: rowsToWrite.map((r) => HEADERS.map((h) => r[h] ?? "")) },
});

console.log(`\n適用完了: ${rowsToWrite.length}件を再インポートしました。`);
