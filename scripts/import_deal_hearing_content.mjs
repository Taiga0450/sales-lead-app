// 商談報告×Hubspot: 営業KPIスプレッドシート（案件台帳）から森・富田の商談ヒアリング内容を
// HubSpot Dealへバックフィルするための一度限りのスクリプト。
// データソース: scripts/data/deal_kpi_ledger_snapshot.md
//   (https://docs.google.com/spreadsheets/d/1A5OaGUX9Ng2Wc_-RbNU2vJYZtnDF_-UK26RLg1Wa5kc の
//    案件台帳シートを2026-08-20に取得したスナップショット)
//
// 安全のため、HubSpot側で既に値が入っているプロパティは上書きしない（空欄のみ埋める）。
// 名前が一致するDealが見つからない行は更新せず、一覧としてレポートするのみ。
//
// 実行: node scripts/import_deal_hearing_content.mjs        (ドライラン。書き込みなし)
//       node scripts/import_deal_hearing_content.mjs --apply (実際に更新)
//       node scripts/import_deal_hearing_content.mjs --rep=森  (対象担当者を絞る。省略時は森・富田両方)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const repArg = process.argv.find((a) => a.startsWith("--rep="));
const TARGET_REPS = repArg ? [repArg.split("=")[1]] : ["森", "富田"];

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!HUBSPOT_TOKEN) {
  console.error("HUBSPOT_ACCESS_TOKEN が設定されていません（.env.local を読み込んで実行してください）");
  process.exit(1);
}
const HS_HEADERS = { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
const HUBSPOT_BASE = "https://api.hubapi.com";

const LEGAL_ENTITY_PREFIXES =
  /医療法人社団|医療法人財団|社会医療法人|公益社団法人|一般社団法人|医療法人/g;
const DEALNAME_DECORATION = /[|｜]\s*新規\s*$/;
function normalizeName(name) {
  return (name || "").replace(DEALNAME_DECORATION, "").replace(/[\s　]+/g, "").replace(LEGAL_ENTITY_PREFIXES, "");
}

// src/lib/hubspot.ts の CATEGORY_CONSOLIDATE / PLAN_VALUE_MAP と同じ対応表
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
  if (!raw) return null;
  const n = Number(raw.replace(/[¥,]/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseProbability(raw) {
  // "C（40％未満）" -> "C"
  const m = (raw || "").match(/^[ABCD]/);
  return m ? m[0] : "";
}

function parseSheetDate(raw) {
  // "2025/04/20" や "2025/9/10" のようなゆれを "YYYY-MM-DD" に統一する
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

const rows = rawRows
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

console.log(`スナップショットから対象行を抽出: ${rows.length}件（${TARGET_REPS.join("・")}）`);

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

const HEARING_PROPS = ["category", "sabisu", "kategori", "mikomiuriage", "firstcontact__c"];

async function findDeal(name) {
  const exact = await searchDeals({
    filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: name }] }],
    properties: ["dealname", ...HEARING_PROPS],
    limit: 1,
  });
  if (exact[0]) return exact[0];

  const candidates = await searchDeals({ query: name, properties: ["dealname", ...HEARING_PROPS], limit: 10 });
  const target = normalizeName(name);
  const matches = candidates.filter((c) => {
    const n = normalizeName(c.properties.dealname ?? "");
    return n.length > 0 && (n === target || n.includes(target) || target.includes(n));
  });
  return matches.length === 1 ? matches[0] : null;
}

const updates = []; // { deal, sheetRow, properties }
const noChangeNeeded = [];
const unmatched = [];

for (const row of rows) {
  let deal;
  try {
    deal = await findDeal(row.dealname);
  } catch (err) {
    console.error(`検索失敗: ${row.dealname}: ${err.message}`);
    continue;
  }
  if (!deal) {
    unmatched.push(row);
    continue;
  }

  const p = deal.properties;
  const properties = {};
  if (row.category && !p.category) properties.category = row.category;
  if (row.plan && !p.sabisu) properties.sabisu = row.plan;
  if (row.probability && !p.kategori) properties.kategori = row.probability;
  if (row.expectedRevenue !== null && !p.mikomiuriage) properties.mikomiuriage = String(row.expectedRevenue);
  if (row.firstMeetingDate && !p.firstcontact__c) properties.firstcontact__c = row.firstMeetingDate;

  if (Object.keys(properties).length === 0) {
    noChangeNeeded.push({ dealname: deal.properties.dealname, sheetName: row.dealname });
  } else {
    updates.push({ dealId: deal.id, dealname: deal.properties.dealname, sheetName: row.dealname, properties });
  }
}

console.log(`\n=== 集計（${TARGET_REPS.join("・")}） ===`);
console.log(`更新予定: ${updates.length}件`);
console.log(`既に埋まっていて変更不要: ${noChangeNeeded.length}件`);
console.log(`HubSpot側に一致するDealが見つからない: ${unmatched.length}件`);

if (unmatched.length > 0) {
  console.log("\n--- 未一致（機関名でHubSpot Dealが見つからない） ---");
  unmatched.forEach((r) => console.log(`  ${r.dealname}（${r.rep}, ${r.status}）`));
}

console.log("\n--- 更新サンプル（上位20件） ---");
updates.slice(0, 20).forEach((u) => {
  const fields = Object.entries(u.properties).map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`  ${u.sheetName} (HubSpot: ${u.dealname}): ${fields}`);
});

if (!APPLY) {
  console.log("\nドライラン完了。適用するには --apply を付けて再実行してください。");
  process.exit(0);
}

console.log(`\n${updates.length}件をHubSpotに書き込みます...`);
let success = 0;
for (const u of updates) {
  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${u.dealId}`, {
      method: "PATCH",
      headers: HS_HEADERS,
      body: JSON.stringify({ properties: u.properties }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    success++;
  } catch (err) {
    console.error(`更新失敗: ${u.sheetName} (${u.dealId}): ${err.message}`);
  }
}
console.log(`適用完了: ${success}/${updates.length}件`);
