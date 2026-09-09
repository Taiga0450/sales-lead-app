// Direct-to-Sheet import, bypassing the app's login entirely.
// Used when Claude gathers institution data in chat — writes straight into the
// real spreadsheet via a service account, so the result shows up in the app
// on next load with no copy/paste step.
//
// Usage: node scripts/import-leads.mjs <path-to-leads.json>
// leads.json is an array of the same shape as the in-app bulk-import feature.

import { readFileSync } from "node:fs";
import { google } from "googleapis";
import crypto from "node:crypto";

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const SHEET_NAME = "leads";

const LEAD_HEADERS = [
  "医療機関名", "種別", "電話番号", "地域", "地域特徴", "住所", "メールアドレス", "担当者",
  "ステータス", "総合スコア", "適合度スコア", "規模スコア", "地域スコア",
  "事業内容メモ", "メモ", "送信日", "架電日", "架電者", "登録日", "情報ソースURL",
  "件名", "本文", "下書きID", "id",
];

function leadToRow(lead) {
  return LEAD_HEADERS.map((h) => lead[h] ?? "");
}

function rowToLead(row) {
  const lead = {};
  LEAD_HEADERS.forEach((h, i) => (lead[h] = row[i] ?? ""));
  return lead;
}

function buildLeadRow(item, now) {
  const name = (item.name ?? "").trim();
  if (!name) return null;

  const fit = Number(item.fitScore) || 0;
  const size = Number(item.sizeScore) || 0;
  const region = Number(item.regionScore) || 0;
  const hasScores = fit > 0 || size > 0 || region > 0;
  const total = hasScores ? Math.round((fit + size + region) / 3) : 0;

  return {
    id: crypto.randomUUID(),
    医療機関名: name,
    種別: item.facilityType === "病院" ? "病院" : "クリニック",
    電話番号: (item.phone ?? "").trim(),
    地域: (item.region ?? "").trim(),
    地域特徴: (item.regionNotes ?? "").trim(),
    住所: (item.address ?? "").trim(),
    メールアドレス: (item.email ?? "").trim(),
    担当者: (item.assignee ?? "").trim(),
    ステータス: "未着手",
    総合スコア: total ? String(total) : "",
    適合度スコア: fit ? String(fit) : "",
    規模スコア: size ? String(size) : "",
    地域スコア: region ? String(region) : "",
    事業内容メモ: (item.summary ?? "").trim(),
    メモ: "",
    送信日: "",
    架電日: "",
    架電者: "",
    登録日: now,
    情報ソースURL: (item.sourceUrl ?? "").trim(),
    件名: "",
    本文: "",
    下書きID: "",
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/import-leads.mjs <path-to-leads.json>");
    process.exit(1);
  }

  const items = JSON.parse(readFileSync(inputPath, "utf-8"));
  if (!Array.isArray(items)) throw new Error("Input must be a JSON array");

  const auth = new google.auth.GoogleAuth({
    keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:X`,
  });
  const existingRows = (existingRes.data.values ?? []).filter((row) =>
    row.some((cell) => cell),
  );
  const existingKeys = new Set(
    existingRows
      .map(rowToLead)
      .map((lead) => `${lead.医療機関名}|${lead.電話番号}`.trim()),
  );

  const now = new Date().toISOString();
  const errors = [];
  const parsed = [];

  items.forEach((item, i) => {
    const row = buildLeadRow(item, now);
    if (!row) {
      errors.push(`${i + 1}件目: name（医療機関名）が空です`);
      return;
    }
    parsed.push(row);
  });

  const newRows = parsed.filter(
    (lead) => !existingKeys.has(`${lead.医療機関名}|${lead.電話番号}`.trim()),
  );
  const skipped = parsed.length - newRows.length;

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:X`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: newRows.map(leadToRow) },
    });
  }

  console.log(JSON.stringify({ added: newRows.length, skipped, errors }, null, 2));
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
