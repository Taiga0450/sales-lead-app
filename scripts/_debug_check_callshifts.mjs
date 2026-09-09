import { google } from "googleapis";
const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "callShifts!A1:Z" });
console.log(JSON.stringify(res.data.values ?? [], null, 1));
