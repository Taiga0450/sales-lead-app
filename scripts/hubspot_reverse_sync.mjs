import { google } from "googleapis";

const SPREADSHEET_ID = "1BODLsYjp5R8AgUJb3nUOJX8sZaWuMKPb-CqhfHjol6s";
const APPLY = process.argv.includes("--apply");
const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HS_HEADERS = { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" };

const LEGAL_ENTITY_PREFIXES =
  /医療法人社団|医療法人財団|社会医療法人|公益社団法人|一般社団法人|医療法人/g;
function normalizeName(name) {
  return (name || "").replace(/[\s　]+/g, "").replace(LEGAL_ENTITY_PREFIXES, "");
}

// Reverse of the forward PHASE_VALUE_MAP in src/lib/hubspot.ts. Only values with an
// unambiguous equivalent in our LEAD_STATUSES are included; everything else (アポイント,
// コンタクトのみ, 不通, 本部アポ, 追客（日程調整）, 保留, コンタクト済み, 導入済み,
// アポ見込み, 追客（今は良い）) has no safe mapping and is left for manual review.
const REVERSE_PHASE_MAP = {
  未活動: "未活動",
  対象外: "対象外",
  受付NG: "受付NG",
  不在: "不在",
  キーマンNG: "キーマンNG",
  資料送付: "資料送付",
  商談済み: "商談獲得",
};

function hubspotDateToYMD(v) {
  if (!v) return "";
  // HubSpot returns date properties as "YYYY-MM-DD" already via the read API.
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

async function fetchHubspotCandidates() {
  const props = ["name", "saishinkadenbi", "ridokyuukadenmemo", "ridochokkinsutetasu"];
  const targetFields = ["saishinkadenbi", "ridokyuukadenmemo", "ridochokkinsutetasu"];
  const results = [];
  for (const prop of targetFields) {
    let after;
    do {
      const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
        method: "POST",
        headers: HS_HEADERS,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: prop, operator: "HAS_PROPERTY" }] }],
          properties: props,
          limit: 100,
          after,
        }),
      });
      if (!res.ok) throw new Error(`HubSpot search failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      results.push(...(data.results ?? []));
      after = data.paging?.next?.after;
    } while (after);
  }
  // de-dupe by company id (a company can match more than one HAS_PROPERTY query)
  const byId = new Map();
  for (const r of results) byId.set(r.id, r);
  return [...byId.values()];
}

const auth = new google.auth.GoogleAuth({
  keyFile: new URL("../credentials/service-account.json", import.meta.url).pathname,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "leads!A1:X" });
const rows = res.data.values ?? [];
const header = rows[0];
const idx = {
  name: header.indexOf("医療機関名"),
  status: header.indexOf("ステータス"),
  call: header.indexOf("架電日"),
  memo: header.indexOf("メモ"),
};

const leadsByExactName = new Map();
const leadsByNormalized = new Map(); // normalized name -> array of {row, i}
rows.slice(1).forEach((row, i) => {
  const name = row[idx.name];
  if (!name) return;
  leadsByExactName.set(name, { row, i });
  const n = normalizeName(name);
  if (!leadsByNormalized.has(n)) leadsByNormalized.set(n, []);
  leadsByNormalized.get(n).push({ row, i });
});

console.log("HubSpotから対象Companyを取得中...");
const candidates = await fetchHubspotCandidates();
console.log(`対象Company件数: ${candidates.length}`);

const plan = []; // { rowIndex, field, oldValue, newValue, leadName, hubspotName }
const noMatch = [];
const ambiguous = [];
const skippedPhase = [];

for (const c of candidates) {
  const hsName = c.properties.name || "";
  let match = leadsByExactName.get(hsName);
  if (!match) {
    const n = normalizeName(hsName);
    const candidatesForName = leadsByNormalized.get(n) || [];
    // also try containment both ways across all normalized keys (cheap since map is small-ish per lookup miss is rare)
    if (candidatesForName.length === 1) {
      match = candidatesForName[0];
    } else if (candidatesForName.length > 1) {
      ambiguous.push({ hsName, count: candidatesForName.length });
      continue;
    }
  }
  if (!match) {
    noMatch.push(hsName);
    continue;
  }

  const { row, i } = match;
  const rowIndex = i + 2; // +1 header, +1 to 1-based

  const hsDate = hubspotDateToYMD(c.properties.saishinkadenbi);
  if (hsDate && !row[idx.call]) {
    plan.push({ rowIndex, field: "架電日", colIdx: idx.call, oldValue: row[idx.call] || "", newValue: hsDate, leadName: row[idx.name], hubspotName: hsName });
  }

  const hsMemo = c.properties.ridokyuukadenmemo || "";
  if (hsMemo && !row[idx.memo]) {
    plan.push({ rowIndex, field: "メモ", colIdx: idx.memo, oldValue: row[idx.memo] || "", newValue: hsMemo, leadName: row[idx.name], hubspotName: hsName });
  }

  const hsPhase = c.properties.ridochokkinsutetasu || "";
  if (hsPhase) {
    const mapped = REVERSE_PHASE_MAP[hsPhase];
    const appStatusIsBlankish = !row[idx.status] || row[idx.status] === "未活動";
    if (mapped && appStatusIsBlankish && mapped !== (row[idx.status] || "未活動")) {
      plan.push({ rowIndex, field: "ステータス", colIdx: idx.status, oldValue: row[idx.status] || "", newValue: mapped, leadName: row[idx.name], hubspotName: hsName });
    } else if (!mapped) {
      skippedPhase.push({ leadName: row[idx.name], hubspotName: hsName, hsPhase });
    }
  }
}

console.log(`\n=== 集計 ===`);
console.log(`一致して更新予定: ${plan.length}件の項目更新`);
console.log(`  内訳: 架電日=${plan.filter(p => p.field === "架電日").length}, メモ=${plan.filter(p => p.field === "メモ").length}, ステータス=${plan.filter(p => p.field === "ステータス").length}`);
console.log(`未一致（アプリ側に該当医療機関が見つからない）: ${noMatch.length}件`);
console.log(`複数候補で一致（スキップ・要手動確認）: ${ambiguous.length}件`);
console.log(`フェーズが未対応の値のためスキップ: ${skippedPhase.length}件`);

if (skippedPhase.length > 0) {
  console.log("\n--- フェーズ未対応の値（上位10件） ---");
  skippedPhase.slice(0, 10).forEach(s => console.log(`${s.leadName} <- HubSpot:「${s.hsPhase}」`));
}

if (ambiguous.length > 0) {
  console.log("\n--- 複数候補で一致（上位10件） ---");
  ambiguous.slice(0, 10).forEach(a => console.log(`${a.hsName} (候補${a.count}件)`));
}

console.log("\n--- 更新サンプル（上位15件） ---");
plan.slice(0, 15).forEach(p => console.log(`[${p.field}] ${p.leadName} (HubSpot: ${p.hubspotName}): "${p.oldValue}" -> "${p.newValue}"`));

if (!APPLY) {
  console.log("\nドライラン完了。適用するには --apply を付けて再実行してください。");
  process.exit(0);
}

// group by column for batch update
const byCol = new Map();
for (const p of plan) {
  if (!byCol.has(p.colIdx)) byCol.set(p.colIdx, new Map());
  byCol.get(p.colIdx).set(p.rowIndex, p.newValue);
}

for (const [colIdx, rowMap] of byCol) {
  const colLetter = String.fromCharCode("A".charCodeAt(0) + colIdx);
  const data = [...rowMap.entries()].map(([rowIndex, value]) => ({
    range: `leads!${colLetter}${rowIndex}`,
    values: [[value]],
  }));
  // batchUpdate in chunks of 500 to stay well under API limits
  for (let i = 0; i < data.length; i += 500) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "RAW", data: data.slice(i, i + 500) },
    });
  }
  console.log(`列${colLetter}: ${data.length}件更新`);
}

console.log("適用完了。");
