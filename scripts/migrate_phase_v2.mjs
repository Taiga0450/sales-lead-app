import { google } from "googleapis";

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const APPLY = process.argv.includes("--apply");

const RENAME = {
  追客中: "商談獲得",
  契約済み: "契約医療機関",
};

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "leads!A1:X" });
const rows = res.data.values ?? [];
const header = rows[0];
const statusIdx = header.indexOf("ステータス");
if (statusIdx === -1) throw new Error("ステータス column not found");
const colLetter = String.fromCharCode("A".charCodeAt(0) + statusIdx);

let changed = 0;
const newCol = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row.some((c) => c)) {
    newCol.push([row?.[statusIdx] ?? ""]);
    continue;
  }
  const current = row[statusIdx] ?? "";
  const next = RENAME[current] ?? current;
  if (next !== current) changed++;
  newCol.push([next]);
}

console.log(`対象行数: ${rows.length - 1}, 変更対象: ${changed}件`);
console.log("内訳:", Object.fromEntries(Object.entries(RENAME).map(([k]) => [k, rows.slice(1).filter((r) => r[statusIdx] === k).length])));

if (!APPLY) {
  console.log("ドライラン完了。適用するには --apply を付けて再実行してください。");
  process.exit(0);
}

await sheets.spreadsheets.values.update({
  spreadsheetId: SPREADSHEET_ID,
  range: `leads!${colLetter}2:${colLetter}${rows.length}`,
  valueInputOption: "RAW",
  requestBody: { values: newCol },
});
console.log("適用完了。");
