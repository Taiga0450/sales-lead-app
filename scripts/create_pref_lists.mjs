import { google } from "googleapis";
import crypto from "node:crypto";

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const LISTS_SHEET_NAME = "lists";

const PREF_LISTS = [
  { name: "東京都リスト", region: "東京都" },
  { name: "埼玉県リスト", region: "埼玉県" },
  { name: "千葉県リスト", region: "千葉県" },
  { name: "神奈川県リスト", region: "神奈川県" },
  { name: "大阪府リスト", region: "大阪府" },
  { name: "兵庫県リスト", region: "兵庫県" },
];

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const existingRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID,
  range: `${LISTS_SHEET_NAME}!A2:B`,
});
const existingNames = new Set((existingRes.data.values ?? []).map((r) => r[1]));

const now = new Date().toISOString();
const rows = PREF_LISTS.filter((p) => !existingNames.has(p.name)).map((p) => [
  crypto.randomUUID(),
  p.name,
  p.region,
  "all",
  "",
  "",
  "all",
  now,
]);

if (rows.length === 0) {
  console.log("All prefecture lists already exist.");
} else {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LISTS_SHEET_NAME}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
  console.log(`Created ${rows.length} prefecture lists.`);
}
