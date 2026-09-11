import type { LeadRow } from "./leads";
import { HEARING_CATEGORIES, type HearingCategory, type DealStage, type DealStageOrLost } from "./dealHearing";

export { HEARING_CATEGORIES };
export type { HearingCategory };

const HUBSPOT_BASE = "https://api.hubapi.com";

function authHeaders(): Record<string, string> | null {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function toHubspotDate(dateStr: string): string {
  if (!dateStr) return "";
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isNaN(ms) ? "" : String(ms);
}

const LEGAL_ENTITY_PREFIXES =
  /医療法人社団|医療法人財団|社会医療法人|公益社団法人|一般社団法人|医療法人/g;

function normalizeName(name: string): string {
  return name.replace(/[\s　]+/g, "").replace(LEGAL_ENTITY_PREFIXES, "");
}

async function searchCompanies(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Array<{ id: string; properties: { name?: string } }>> {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot company search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.results ?? [];
}

/**
 * 完全一致を優先し、見つからなければ全文検索＋法人格・空白を除いた名前の
 * 包含比較で候補を絞る。候補が1件に絞れない場合はnull（呼び出し側が新規作成）。
 * HubSpot側の会社名には「医療法人社団〇〇　△△クリニック」のように法人格が
 * 前置されていることが多く、アプリのシート上の名前（△△クリニックのみ）とは
 * 完全一致しないため、この二段階での突き合わせが必要。
 */
async function findCompanyIdByName(name: string, headers: Record<string, string>): Promise<string | null> {
  const exact = await searchCompanies(
    {
      filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: name }] }],
      properties: ["name"],
      limit: 1,
    },
    headers,
  );
  if (exact[0]) return exact[0].id;

  const candidates = await searchCompanies({ query: name, properties: ["name"], limit: 10 }, headers);
  const target = normalizeName(name);
  const matches = candidates.filter((c) => {
    const n = normalizeName(c.properties.name ?? "");
    return n.length > 0 && (n === target || n.includes(target) || target.includes(n));
  });
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * 既存のHubSpot Companyプロパティ「フェーズ」(ridochokkinsutetasu) の選択肢と
 * こちらのLEAD_STATUSESの対応表。
 * - 値がそのまま一致するものはそのまま使う
 * - 「商談獲得」はラベルは一致するが内部値が「商談済み」のためマッピングする
 * - 「契約医療機関」はHubSpot側に選択肢が無く、追加もしない方針のためnull（送信しない）
 */
const PHASE_VALUE_MAP: Record<string, string | null> = {
  未活動: "未活動",
  対象外: "対象外",
  受付NG: "受付NG",
  不在: "不在",
  キーマンNG: "キーマンNG",
  資料送付: "資料送付",
  商談獲得: "商談済み",
  契約医療機関: null,
};

/**
 * 架電日・フェーズ・架電メモの3項目のみを、医療機関名が一致するHubSpot Companyへ反映する。
 * 一致するCompanyが無ければ新規作成する。HUBSPOT_ACCESS_TOKEN未設定の環境では何もしない。
 * 書き込み先はHubSpot側に既存の3プロパティ（架電日=saishinkadenbi、フェーズ=ridochokkinsutetasu、
 * 架電メモ=ridokyuukadenmemo）。
 */
export async function syncLeadToHubSpot(lead: LeadRow): Promise<void> {
  const headers = authHeaders();
  if (!headers || !lead.医療機関名) return;

  const properties: Record<string, string> = {
    saishinkadenbi: toHubspotDate(lead.架電日),
    ridokyuukadenmemo: lead.メモ || "",
  };
  const mappedPhase = PHASE_VALUE_MAP[lead.ステータス];
  if (mappedPhase) properties.ridochokkinsutetasu = mappedPhase;

  const companyId = await findCompanyIdByName(lead.医療機関名, headers);

  if (companyId) {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies/${companyId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) throw new Error(`HubSpot company update failed: ${res.status} ${await res.text()}`);
  } else {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies`, {
      method: "POST",
      headers,
      body: JSON.stringify({ properties: { name: lead.医療機関名, ...properties } }),
    });
    if (!res.ok) throw new Error(`HubSpot company create failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * 商談報告×Hubspot画面で使うプロパティ名（HubSpot Deal側の内部プロパティ名。
 * 内部名は歴史的な経緯でローマ字/英語表記がラベルと一致しないものがある
 * ——例えば `kategori` はラベルが「見込み確度」で、カテゴリを表すのは `category`。
 * discover_hubspot_schema / search_properties で確認済み。
 */
export const HEARING_PROPERTIES = {
  category: "category",
  probability: "kategori",
  plan: "sabisu",
  product: "shouhin",
  chart: "karute",
  chartTranscribed: "tenki",
  expectedRevenue: "mikomiuriage",
  area: "area__c",
  firstMeetingDate: "firstcontact__c",
  patientsPerMonth: "patientsnumber__c",
  callsPerMonth: "nightcall__c",
  visitsPerMonth: "outnumber__c",
  hearingNotes: "hearingnotes__c",
  dealStage: "dealstage",
  /** 売上ダッシュボード（getRevenueStats）が使うCONTRACT_DATE_PROPERTYと同一プロパティ。 */
  contractDate: "keiyakuteiketsubi",
} as const;

/**
 * 取引ステージ（4段階）とHubSpotの実パイプラインステージの対応表。ラベルが完全一致しているため
 * 変換はステージID⇔日本語ラベルの単純な対応で済む（discover_hubspot_schemaで確認済み）。
 * 「失注」はこの対応表に含めない——HubSpotのclosedlostには反映しない方針のため。
 */
const DEAL_STAGE_TO_HUBSPOT: Record<DealStage, string> = {
  初回商談: "appointmentscheduled",
  見積提出: "qualifiedtobuy",
  口頭受注: "contractsent",
  クローズ済み: "closedwon",
};
const HUBSPOT_TO_DEAL_STAGE: Record<string, DealStageOrLost> = {
  appointmentscheduled: "初回商談",
  qualifiedtobuy: "見積提出",
  contractsent: "口頭受注",
  closedwon: "クローズ済み",
  // CS引き継ぎ完了はクローズ後の運用ステージのため、進行バー上は「クローズ済み」として扱う
  "3778240242": "クローズ済み",
};

/**
 * HubSpotの`category`enumに残る「ネック案件」2値を「自院」に統合するための対応表。
 * 統合はこの画面から書き込む値にのみ適用する（HubSpot側のenum定義自体は6値のまま）。
 */
const CATEGORY_CONSOLIDATE: Record<string, HearingCategory> = {
  医師ネック案件: "自院完結",
  受電ネック案件: "自院完結",
};

/** 表示用に6値→4値へ丸める。TC案件・FD案件はそのまま、その他（他社利用中）はその他、それ以外は自院扱い。 */
export function consolidateCategory(raw: string): HearingCategory {
  if (raw === "TC案件" || raw === "FD案件") return raw;
  if (raw === "その他（他社利用中）") return "その他";
  return CATEGORY_CONSOLIDATE[raw] ?? "自院完結";
}

/**
 * 書き込み用に4値→HubSpot実enum値へ変換する。アプリの「その他」はHubSpot側に存在しない値なので、
 * 実在する enum 値「その他（他社利用中）」として書き込む（そうしないと400エラーで作成・更新に失敗する）。
 */
export function expandCategoryForWrite(category: string): string {
  return category === "その他" ? "その他（他社利用中）" : category;
}

/** スプレッドシートの半角カナ表記 → HubSpot `sabisu` enumの全角表記への変換表 */
const PLAN_VALUE_MAP: Record<string, string> = {
  "1stcall": "1stcall",
  "2ndcallﾁｹｯﾄ": "2ndcallチケット",
  "2ndcallｽﾎﾟｯﾄ": "2ndcallスポット",
  callｺﾈｸﾄ: "callコネクト",
};

export function normalizePlanValue(raw: string): string {
  return PLAN_VALUE_MAP[raw] ?? raw;
}

export interface DealHearingContent {
  id: string;
  dealname: string;
  ownerName: string;
  category: HearingCategory | "";
  probability: string;
  plan: string;
  product: string;
  chart: string;
  chartTranscribed: boolean | null;
  expectedRevenue: number | null;
  area: string;
  firstMeetingDate: string;
  patientsPerMonth: number | null;
  callsPerMonth: number | null;
  visitsPerMonth: number | null;
  hearingNotes: string;
  dealStage: DealStageOrLost;
  contractDate: string;
}

interface HubspotHearingDeal {
  id: string;
  properties: Record<string, string | undefined> & { dealname?: string; dealstage?: string; hubspot_owner_id?: string };
}

/** SALES_OWNERSのフルネームから、シート上の短い担当者表記（例:「森 太雅」→「森」）に揃える。 */
function shortOwnerName(fullName: string): string {
  return fullName.split(/[\s　]/)[0] ?? fullName;
}

function toHearingContent(deal: HubspotHearingDeal): DealHearingContent {
  const p = deal.properties;
  const num = (v: string | undefined) => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const ownerInfo = p.hubspot_owner_id ? SALES_OWNERS[p.hubspot_owner_id] : undefined;
  return {
    id: deal.id,
    dealname: p.dealname ?? "",
    ownerName: ownerInfo ? shortOwnerName(ownerInfo.name) : "",
    category: p[HEARING_PROPERTIES.category] ? consolidateCategory(p[HEARING_PROPERTIES.category]!) : "",
    probability: p[HEARING_PROPERTIES.probability] ?? "",
    plan: p[HEARING_PROPERTIES.plan] ?? "",
    product: p[HEARING_PROPERTIES.product] ?? "",
    chart: p[HEARING_PROPERTIES.chart] ?? "",
    chartTranscribed:
      // HubSpotは未設定のプロパティをnullで返すことがある（undefinedではない）ため、
      // == nullでnull/undefinedの両方を弾いてからでないと.toLowerCase()で例外になる。
      p[HEARING_PROPERTIES.chartTranscribed] == null || p[HEARING_PROPERTIES.chartTranscribed] === ""
        ? null
        : p[HEARING_PROPERTIES.chartTranscribed]!.toLowerCase() === "true",
    expectedRevenue: num(p[HEARING_PROPERTIES.expectedRevenue]),
    area: p[HEARING_PROPERTIES.area] ?? "",
    firstMeetingDate: p[HEARING_PROPERTIES.firstMeetingDate] ?? "",
    patientsPerMonth: num(p[HEARING_PROPERTIES.patientsPerMonth]),
    callsPerMonth: num(p[HEARING_PROPERTIES.callsPerMonth]),
    visitsPerMonth: num(p[HEARING_PROPERTIES.visitsPerMonth]),
    hearingNotes: p[HEARING_PROPERTIES.hearingNotes] ?? "",
    dealStage: (p.dealstage && HUBSPOT_TO_DEAL_STAGE[p.dealstage]) || "",
    contractDate: p[HEARING_PROPERTIES.contractDate] ?? "",
  };
}

const DEALNAME_DECORATION = /[|｜]\s*新規\s*$/;

/**
 * findCompanyIdByNameと同じ二段階マッチングを商談名向けに行う。装飾サフィックス（｜新規等）も除去する。
 * 一括インポートスクリプト（スプレッドシート行→既存Dealの突き合わせ）から利用する想定でexportしている。
 */
export async function findDealIdByName(name: string, headers: Record<string, string>): Promise<string | null> {
  async function searchDeals(body: Record<string, unknown>): Promise<Array<{ id: string; properties: { dealname?: string } }>> {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.results ?? [];
  }

  const exact = await searchDeals({
    filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: name }] }],
    properties: ["dealname"],
    limit: 1,
  });
  if (exact[0]) return exact[0].id;

  const candidates = await searchDeals({ query: name, properties: ["dealname"], limit: 10 });
  const target = normalizeName(name.replace(DEALNAME_DECORATION, ""));
  const matches = candidates.filter((c) => {
    const n = normalizeName((c.properties.dealname ?? "").replace(DEALNAME_DECORATION, ""));
    return n.length > 0 && (n === target || n.includes(target) || target.includes(n));
  });
  return matches.length === 1 ? matches[0].id : null;
}

const HEARING_SEARCH_PROPERTIES = ["dealname", "hubspot_owner_id", ...Object.values(HEARING_PROPERTIES)];

/**
 * 商談報告×Hubspot画面の一覧に出す商談。既知4名の営業担当が持つ商談のうち、失注（closedlost）を除く
 * すべて（クローズ済みも含む）が対象——取引ステージ追跡バーで初回商談〜クローズ済みまでを見せるため。
 * 失注はHubSpot側のdealstageに反映しない方針（このアプリからは検索・表示できない）。
 * テスト商談・対象外オーナーの商談は売上ダッシュボードと同じロジック（isTestDeal）で除外する。
 */
export async function listHearingDeals(query?: string): Promise<DealHearingContent[]> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const deals = await searchDealsAll(
    {
      filterGroups: [
        {
          filters: [{ propertyName: "dealstage", operator: "NEQ", value: "closedlost" }],
        },
      ],
      properties: HEARING_SEARCH_PROPERTIES,
      ...(query ? { query } : {}),
    },
    headers,
  );

  return deals
    .filter((d) => !isTestDeal(d as unknown as HubspotDeal))
    .map((d) => toHearingContent(d as unknown as HubspotHearingDeal));
}

/**
 * 商談報告×Hubspot画面の「HubSpotで検索」用。listHearingDealsは売上集計の対象4名のオーナーに限定するが、
 * ここではそれ以外のオーナーが持つ商談（＝まだアプリで追跡していない医療機関）も検索・追加できるようにする
 * ため、明らかなテスト商談（名前に「テスト」「test」を含むもの）だけを除外する。
 */
export async function searchDealsForImport(query: string): Promise<DealHearingContent[]> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const deals = await searchDealsAll(
    {
      filterGroups: [
        { filters: [{ propertyName: "dealstage", operator: "NEQ", value: "closedlost" }] },
      ],
      properties: HEARING_SEARCH_PROPERTIES,
      query,
    },
    headers,
  );

  return deals
    .filter((d) => !/テスト|test/i.test((d as unknown as HubspotDeal).properties.dealname ?? ""))
    .map((d) => toHearingContent(d as unknown as HubspotHearingDeal));
}

/**
 * 「HubSpotで検索」用。医療機関（HubSpot Company）を名前で検索する。まだ商談化していない
 * （searchDealsForImportでは見つからない）医療機関を見つけるためのもの。
 */
export async function searchCompaniesForImport(query: string): Promise<Array<{ id: string; name: string }>> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const results = await searchCompanies({ query, properties: ["name"], limit: 20 }, headers);
  return results
    .filter((c) => !/テスト|test/i.test(c.properties.name ?? ""))
    .map((c) => ({ id: c.id, name: c.properties.name ?? "" }));
}

/**
 * 新規作成したDealを、検索元のCompanyへ既定の関連付け（default association）で紐付ける。
 * 「機関名で検索」でCompanyしか見つからなかった医療機関を追加するときに使う。
 */
export async function associateDealWithCompany(dealId: string, companyId: string): Promise<void> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const res = await fetch(
    `${HUBSPOT_BASE}/crm/v4/objects/deals/${dealId}/associations/default/companies/${companyId}`,
    { method: "PUT", headers },
  );
  if (!res.ok) throw new Error(`HubSpot deal-company association failed: ${res.status} ${await res.text()}`);
}

/** 重複などで不要になったHubSpot Dealを削除する（HubSpot上ではアーカイブ扱いになる）。 */
export async function deleteHearingDeal(dealId: string): Promise<void> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`HubSpot deal delete failed: ${res.status} ${await res.text()}`);
}

/**
 * 指定したID群のHubSpot Dealだけをまとめて取得する（検索ではなくバッチ取得）。
 * 商談報告×Hubspot画面はシート（dealHearing）に登録された商談のみを対象とする方針のため、
 * HubSpot全体を検索するlistHearingDealsではなく、シートが参照しているIDだけをピンポイントで取得する。
 */
export async function getHearingDealsByIds(ids: string[]): Promise<DealHearingContent[]> {
  if (ids.length === 0) return [];
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const results: DealHearingContent[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ properties: HEARING_SEARCH_PROPERTIES, inputs: chunk.map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot deal batch read failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const d of data.results ?? []) {
      results.push(toHearingContent(d as unknown as HubspotHearingDeal));
    }
  }
  return results;
}

/**
 * DealHearingContentのdealStage/contractDateを、HubSpotのdealstage/keiyakuteiketsubiプロパティ
 * 用のpropertiesオブジェクトへ変換する。「失注」はHubSpotのclosedlostに反映しない方針のため、
 * dealStageが"失注"の場合はdealstageプロパティを送らない（ローカルのシート上でのみ管理する）。
 */
function stageFieldsToProperties(fields: { dealStage?: DealStageOrLost; contractDate?: string }): Record<string, string> {
  const properties: Record<string, string> = {};
  if (fields.dealStage && fields.dealStage !== "失注") {
    properties[HEARING_PROPERTIES.dealStage] = DEAL_STAGE_TO_HUBSPOT[fields.dealStage];
  }
  if (fields.contractDate !== undefined) properties[HEARING_PROPERTIES.contractDate] = fields.contractDate;
  return properties;
}

/** 商談報告フォームの入力を、対応するHubSpot Dealのプロパティへ書き込む。 */
export async function updateDealHearingContent(
  dealId: string,
  fields: Partial<Omit<DealHearingContent, "id" | "ownerName">>,
): Promise<void> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const properties: Record<string, string> = { ...stageFieldsToProperties(fields) };
  if (fields.dealname !== undefined) properties.dealname = fields.dealname;
  if (fields.category !== undefined) properties[HEARING_PROPERTIES.category] = expandCategoryForWrite(fields.category);
  if (fields.probability !== undefined) properties[HEARING_PROPERTIES.probability] = fields.probability;
  if (fields.plan !== undefined) properties[HEARING_PROPERTIES.plan] = normalizePlanValue(fields.plan);
  if (fields.product !== undefined) properties[HEARING_PROPERTIES.product] = fields.product;
  if (fields.chart !== undefined) properties[HEARING_PROPERTIES.chart] = fields.chart;
  if (fields.chartTranscribed !== undefined && fields.chartTranscribed !== null) {
    properties[HEARING_PROPERTIES.chartTranscribed] = String(fields.chartTranscribed);
  }
  if (fields.expectedRevenue !== undefined && fields.expectedRevenue !== null) {
    properties[HEARING_PROPERTIES.expectedRevenue] = String(fields.expectedRevenue);
  }
  if (fields.area !== undefined) properties[HEARING_PROPERTIES.area] = fields.area;
  if (fields.firstMeetingDate !== undefined) properties[HEARING_PROPERTIES.firstMeetingDate] = fields.firstMeetingDate;
  if (fields.patientsPerMonth !== undefined && fields.patientsPerMonth !== null) {
    properties[HEARING_PROPERTIES.patientsPerMonth] = String(fields.patientsPerMonth);
  }
  if (fields.callsPerMonth !== undefined && fields.callsPerMonth !== null) {
    properties[HEARING_PROPERTIES.callsPerMonth] = String(fields.callsPerMonth);
  }
  if (fields.visitsPerMonth !== undefined && fields.visitsPerMonth !== null) {
    properties[HEARING_PROPERTIES.visitsPerMonth] = String(fields.visitsPerMonth);
  }
  if (fields.hearingNotes !== undefined) properties[HEARING_PROPERTIES.hearingNotes] = fields.hearingNotes;

  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`HubSpot deal update failed: ${res.status} ${await res.text()}`);
}

/**
 * 「新規商談を追加」で、機関名がHubSpot上の既存Dealと一致する場合はそのDealを更新し、
 * 一致しない場合のみ新規作成する（重複Deal防止のためのupsert）。
 */
export async function upsertHearingDeal(
  dealname: string,
  ownerId: string,
  fields: Partial<Omit<DealHearingContent, "id" | "dealname" | "ownerName">>,
): Promise<DealHearingContent> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const existingId = await findDealIdByName(dealname, headers);
  if (!existingId) return createHearingDeal(dealname, ownerId, fields);

  await updateDealHearingContent(existingId, fields);
  const [updated] = await getHearingDealsByIds([existingId]);
  return updated;
}

export type SalesRegion = "関東" | "大阪";

/**
 * 集計対象の営業担当者。HubSpotのownerIdと地域の対応表。
 * ここに載っていないオーナー（他部署の商談等）は売上ダッシュボードの集計から除外する。
 */
const SALES_OWNERS: Record<string, { name: string; region: SalesRegion }> = {
  "1938309047": { name: "森 太雅", region: "関東" },
  "163485404": { name: "富田 いおな", region: "関東" },
  "163485405": { name: "松本 拓馬", region: "大阪" },
  "208446240": { name: "松長 可菜子", region: "大阪" },
};

/**
 * 商談報告×Hubspot画面の「担当者」選択肢用。アプリのログイン（Google）とHubSpotの
 * 商談オーナーは別々のID体系のため、新規商談作成時は担当者を手動で選んでもらう。
 */
export const HEARING_OWNERS = Object.entries(SALES_OWNERS).map(([ownerId, info]) => ({ ownerId, name: info.name }));

/**
 * 商談報告×Hubspot画面から新規商談を作成する。dealstageは初期段階（未クローズ）で固定する。
 */
export async function createHearingDeal(
  dealname: string,
  ownerId: string,
  fields: Partial<Omit<DealHearingContent, "id" | "dealname" | "ownerName">>,
): Promise<DealHearingContent> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");
  if (!SALES_OWNERS[ownerId]) throw new Error("不正な担当者です");

  const properties: Record<string, string> = {
    dealname,
    hubspot_owner_id: ownerId,
    dealstage: DEAL_STAGE_TO_HUBSPOT["初回商談"],
    ...stageFieldsToProperties(fields),
  };
  if (fields.category) properties[HEARING_PROPERTIES.category] = expandCategoryForWrite(fields.category);
  if (fields.probability) properties[HEARING_PROPERTIES.probability] = fields.probability;
  if (fields.plan) properties[HEARING_PROPERTIES.plan] = normalizePlanValue(fields.plan);
  if (fields.product) properties[HEARING_PROPERTIES.product] = fields.product;
  if (fields.chart) properties[HEARING_PROPERTIES.chart] = fields.chart;
  if (fields.chartTranscribed !== undefined && fields.chartTranscribed !== null) {
    properties[HEARING_PROPERTIES.chartTranscribed] = String(fields.chartTranscribed);
  }
  if (fields.expectedRevenue !== undefined && fields.expectedRevenue !== null) {
    properties[HEARING_PROPERTIES.expectedRevenue] = String(fields.expectedRevenue);
  }
  if (fields.area) properties[HEARING_PROPERTIES.area] = fields.area;
  if (fields.firstMeetingDate) properties[HEARING_PROPERTIES.firstMeetingDate] = fields.firstMeetingDate;
  if (fields.patientsPerMonth !== undefined && fields.patientsPerMonth !== null) {
    properties[HEARING_PROPERTIES.patientsPerMonth] = String(fields.patientsPerMonth);
  }
  if (fields.callsPerMonth !== undefined && fields.callsPerMonth !== null) {
    properties[HEARING_PROPERTIES.callsPerMonth] = String(fields.callsPerMonth);
  }
  if (fields.visitsPerMonth !== undefined && fields.visitsPerMonth !== null) {
    properties[HEARING_PROPERTIES.visitsPerMonth] = String(fields.visitsPerMonth);
  }
  if (fields.hearingNotes) properties[HEARING_PROPERTIES.hearingNotes] = fields.hearingNotes;

  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
    method: "POST",
    headers,
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`HubSpot deal create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return toHearingContent(data);
}

export const TASK_TYPES = ["TODO", "CALL", "EMAIL"] as const;
export type DealTaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type DealTaskPriority = (typeof TASK_PRIORITIES)[number];

export interface DealTaskInput {
  subject: string;
  body: string;
  /** datetime-localの値（例: "2026-09-15T08:00"）。ブラウザのローカルタイムゾーンで解釈する。 */
  dueAt: string;
  taskType: DealTaskType;
  priority: DealTaskPriority;
  ownerId: string;
}

/**
 * 商談報告×Hubspot画面の「HubSpotタスクを追加」から、HubSpotの取引（Deal）に紐づくタスクを作成する。
 * HubSpot上の「取引→アクティビティー→その他→タスク」で作るタスクと同じ項目（件名・期日・
 * タスクタイプ・優先度・担当者・メモ）だけを対象にする（リマインダー・繰り返し・キューは対象外）。
 */
export async function createDealTask(dealId: string, input: DealTaskInput): Promise<{ id: string }> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");
  if (!SALES_OWNERS[input.ownerId]) throw new Error("不正な担当者です");

  // input.dueAtはdatetime-local入力の値（例: "2026-09-15T08:00"、タイムゾーン情報なし）。
  // タイムゾーンを指定せずnew Date()に渡すと、実行環境（Vercelのサーバーは基本UTC）の
  // ローカル時刻として解釈されてしまい、日本時間のつもりの時刻が最大9時間ずれる。
  // 明示的に日本時間（+09:00）として解釈する。
  const dueTimestamp = new Date(`${input.dueAt}:00+09:00`).getTime();
  if (!Number.isFinite(dueTimestamp)) throw new Error("期日が不正です");

  const properties: Record<string, string> = {
    hs_task_subject: input.subject,
    hs_task_body: input.body,
    hs_task_status: "NOT_STARTED",
    hs_task_type: input.taskType,
    hs_task_priority: input.priority,
    hs_timestamp: String(dueTimestamp),
    hubspot_owner_id: input.ownerId,
  };

  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`HubSpot task create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  // v4の「default」関連付けエンドポイントを使うと、関連付けの種類ID（associationTypeId）を
  // 事前に調べておかなくても、取引⇔タスクの標準的な関連付けを自動で作成できる。
  const assocRes = await fetch(
    `${HUBSPOT_BASE}/crm/v4/objects/tasks/${data.id}/associations/default/deals/${dealId}`,
    { method: "PUT", headers },
  );
  if (!assocRes.ok) {
    throw new Error(`HubSpot task association failed: ${assocRes.status} ${await assocRes.text()}`);
  }

  return { id: data.id };
}

/** 「月額利用料(手動)」— 受注金額として使う金額項目。指定が無い商談は税込・自動計算 → amount の順にフォールバック */
const MANUAL_FEE_PROPERTY = "monthlyfee__c";
const AUTO_FEE_PROPERTY = "getsugakuriyouryouzeikomijidou";
/** 契約締結日 — 期の分類はこちらを優先し、未入力の商談は closedate にフォールバックする */
const CONTRACT_DATE_PROPERTY = "keiyakuteiketsubi";

interface HubspotDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    closedate?: string;
    createdate?: string;
    hubspot_owner_id?: string;
    amount?: string;
    [MANUAL_FEE_PROPERTY]?: string;
    [AUTO_FEE_PROPERTY]?: string;
    [CONTRACT_DATE_PROPERTY]?: string;
  };
}

/** 月額利用料(手動) → 月額利用料(税込・自動) → amount の順にフォールバックする */
function dealRevenue(deal: HubspotDeal): number {
  // HubSpot側の数値プロパティも人が手入力できるため、数値として読めない値（空白や文字混じり等）が
  // 入っていることがある。NaNのまま返すと合計全体がNaNになってしまうため、その項目は無視して
  // 次のフォールバックに進む。
  const toNum = (v: string | undefined): number | null => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return (
    toNum(deal.properties[MANUAL_FEE_PROPERTY]) ??
    toNum(deal.properties[AUTO_FEE_PROPERTY]) ??
    toNum(deal.properties.amount) ??
    0
  );
}

/** 契約締結日が入っていればそちらを、無ければ closedate を「実質の成約日」として使う（YYYY-MM-DD） */
function dealEffectiveDate(deal: HubspotDeal): string {
  const contractDate = deal.properties[CONTRACT_DATE_PROPERTY];
  if (contractDate) return contractDate.slice(0, 10);
  return (deal.properties.closedate ?? "").slice(0, 10);
}

async function searchDealsAll(body: Record<string, unknown>, headers: Record<string, string>): Promise<HubspotDeal[]> {
  const results: HubspotDeal[] = [];
  let after: string | undefined;
  do {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, limit: 100, after }),
    });
    if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    results.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  } while (after);
  return results;
}

function isTestDeal(deal: HubspotDeal): boolean {
  const name = deal.properties.dealname ?? "";
  if (/テスト|test/i.test(name)) return true;
  const ownerId = deal.properties.hubspot_owner_id ?? "";
  if (!SALES_OWNERS[ownerId]) return true; // 集計対象4名以外は除外
  return false;
}

/**
 * 同一会社名(正規化)・同成約日(日付のみ)の重複商談を1件に潰す。
 * 同じ組み合わせが複数ある場合は、金額（月額利用料、無ければamount）が入っている方を優先する
 * ——同じ商談が「金額あり」「金額なし(null)」の2レコードで重複登録されているケースがあるため。
 */
function dedupeDeals(deals: HubspotDeal[]): HubspotDeal[] {
  const byKey = new Map<string, HubspotDeal>();
  for (const d of deals) {
    const name = normalizeName(d.properties.dealname ?? "");
    const closeDate = dealEffectiveDate(d);
    const key = `${name}|${closeDate}`;
    const existing = byKey.get(key);
    if (!existing || dealRevenue(d) > dealRevenue(existing)) {
      byKey.set(key, d);
    }
  }
  return [...byKey.values()];
}

export interface SalesPersonStats {
  ownerId: string;
  name: string;
  region: SalesRegion;
  wonAmount: number;
  wonCount: number;
  lostCount: number;
  openCount: number;
}

export interface RegionStats {
  wonAmount: number;
  wonCount: number;
  lostCount: number;
  openCount: number;
  winRate: number; // wonCount / (wonCount + lostCount)、0-1
}

export interface RevenueStats {
  startDate: string;
  endDate: string;
  people: SalesPersonStats[];
  regionTotals: Record<SalesRegion, RegionStats>;
  grandTotal: RegionStats;
}

function emptyRegionStats(): RegionStats {
  return { wonAmount: 0, wonCount: 0, lostCount: 0, openCount: 0, winRate: 0 };
}

/**
 * 指定期間（契約締結日ベース。未入力の商談は成約日で代用）の受注金額・受注件数・失注件数・
 * 受注率と、期間中に新規作成された商談数（＝アプローチ量の目安）を、担当者別・地域別に集計する。
 *
 * 定義:
 * - 受注/失注: 契約締結日（無ければ成約日）が期間内で dealstage が closedwon / closedlost の商談
 * - 商談数: createdate が期間内の商談（クローズ済みも含む全件、テスト・対象外オーナーは除く）
 * - 受注率: 受注件数 ÷ (受注件数 + 失注件数)（期間内にクローズしたものの中での割合）
 * - 受注金額: 月額利用料(手動) → 月額利用料(税込・自動) → amount の順にフォールバック
 * - 重複商談（同一会社名・同実質成約日）と、テスト名や対象外オーナーの商談は集計から除外する
 *
 * 契約締結日はHubSpotの検索フィルタで直接絞り込めないため、成約日を広めの窓（前後4ヶ月）で
 * 取得したうえで、実質の成約日（契約締結日優先）でクライアント側から厳密に絞り込む。
 */
export async function getRevenueStats(startDate: string, endDate: string): Promise<RevenueStats> {
  const headers = authHeaders();
  if (!headers) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const widenedStart = new Date(`${startDate}T00:00:00Z`);
  widenedStart.setUTCMonth(widenedStart.getUTCMonth() - 4);
  const widenedEnd = new Date(`${endDate}T23:59:59Z`);
  widenedEnd.setUTCMonth(widenedEnd.getUTCMonth() + 4);

  const startMs = String(widenedStart.getTime());
  const endMs = String(widenedEnd.getTime());
  const createStartMs = String(Date.parse(`${startDate}T00:00:00Z`));
  const createEndMs = String(Date.parse(`${endDate}T23:59:59Z`));
  const props = [
    "dealname",
    MANUAL_FEE_PROPERTY,
    AUTO_FEE_PROPERTY,
    "amount",
    "dealstage",
    "closedate",
    CONTRACT_DATE_PROPERTY,
    "createdate",
    "hubspot_owner_id",
  ];

  const [closedDealsWide, openDealsRaw] = await Promise.all([
    searchDealsAll(
      {
        filterGroups: [
          {
            filters: [
              { propertyName: "closedate", operator: "BETWEEN", value: startMs, highValue: endMs },
              { propertyName: "dealstage", operator: "IN", values: ["closedwon", "closedlost"] },
            ],
          },
        ],
        properties: props,
      },
      headers,
    ),
    searchDealsAll(
      {
        filterGroups: [
          { filters: [{ propertyName: "createdate", operator: "BETWEEN", value: createStartMs, highValue: createEndMs }] },
        ],
        properties: props,
      },
      headers,
    ),
  ]);

  const closedDealsInPeriod = closedDealsWide.filter((d) => {
    const eff = dealEffectiveDate(d);
    return eff >= startDate && eff <= endDate;
  });

  const closedDeals = dedupeDeals(closedDealsInPeriod.filter((d) => !isTestDeal(d)));
  const openDeals = dedupeDeals(openDealsRaw.filter((d) => !isTestDeal(d)));

  const peopleMap = new Map<string, SalesPersonStats>();
  for (const [ownerId, info] of Object.entries(SALES_OWNERS)) {
    peopleMap.set(ownerId, { ownerId, name: info.name, region: info.region, wonAmount: 0, wonCount: 0, lostCount: 0, openCount: 0 });
  }

  for (const deal of closedDeals) {
    const ownerId = deal.properties.hubspot_owner_id ?? "";
    const person = peopleMap.get(ownerId);
    if (!person) continue;
    if (deal.properties.dealstage === "closedwon") {
      person.wonCount++;
      person.wonAmount += dealRevenue(deal);
    } else if (deal.properties.dealstage === "closedlost") {
      person.lostCount++;
    }
  }
  for (const deal of openDeals) {
    const ownerId = deal.properties.hubspot_owner_id ?? "";
    const person = peopleMap.get(ownerId);
    if (!person) continue;
    person.openCount++;
  }

  const people = [...peopleMap.values()];
  const regionTotals: Record<SalesRegion, RegionStats> = { 関東: emptyRegionStats(), 大阪: emptyRegionStats() };
  const grandTotal = emptyRegionStats();

  for (const p of people) {
    const region = regionTotals[p.region];
    region.wonAmount += p.wonAmount;
    region.wonCount += p.wonCount;
    region.lostCount += p.lostCount;
    region.openCount += p.openCount;
    grandTotal.wonAmount += p.wonAmount;
    grandTotal.wonCount += p.wonCount;
    grandTotal.lostCount += p.lostCount;
    grandTotal.openCount += p.openCount;
  }
  for (const region of Object.values(regionTotals)) {
    region.winRate = region.wonCount + region.lostCount > 0 ? region.wonCount / (region.wonCount + region.lostCount) : 0;
  }
  grandTotal.winRate = grandTotal.wonCount + grandTotal.lostCount > 0 ? grandTotal.wonCount / (grandTotal.wonCount + grandTotal.lostCount) : 0;

  return { startDate, endDate, people, regionTotals, grandTotal };
}
