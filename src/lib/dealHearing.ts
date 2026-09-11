/**
 * Pure constants/types for the "dealHearing" Google Sheets tab — kept separate from
 * lib/google/sheets.ts (pulls in googleapis) and lib/hubspot.ts (needs HUBSPOT_ACCESS_TOKEN),
 * same reasoning as lib/leads.ts: importing either from a "use client" file would bundle
 * server-only code/secrets into the browser.
 *
 * This tab holds 商談報告×Hubspot hearing-content rows that are NOT (yet) backed by a real
 * HubSpot Deal — e.g. bulk-imported from a spreadsheet where HubSpot writes were skipped on
 * purpose. Rows with a hubspotDealId are shown merged with live HubSpot data; rows without one
 * are sheet-only until someone links/creates the HubSpot side.
 */
export const DEAL_HEARING_HEADERS = [
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
] as const;

export type DealHearingField = (typeof DEAL_HEARING_HEADERS)[number];
export type DealHearingRow = Record<DealHearingField, string>;

/** UI上はこの4値のみ選択させる（HubSpot側のcategory enumは6値だが、この画面では4値に統合する）。 */
export const HEARING_CATEGORIES = ["TC案件", "FD案件", "自院完結", "その他"] as const;
export type HearingCategory = (typeof HEARING_CATEGORIES)[number];

/**
 * 取引ステージ。進行4段階はHubSpotの実パイプラインステージとラベルが一致している
 * （appointmentscheduled=初回商談, qualifiedtobuy=見積提出, contractsent=口頭受注, closedwon=クローズ済み）。
 * 「失注」は進行バーには乗せない別枠の状態で、HubSpotのclosedlostには反映しない方針
 * （売上ダッシュボードの受注率計算に影響を与えないため）。
 */
export const DEAL_STAGES = ["初回商談", "見積提出", "口頭受注", "クローズ済み"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const LOST_STAGE = "失注" as const;
export type DealStageOrLost = DealStage | typeof LOST_STAGE | "";

/** 商談報告×Hubspot画面の「取引担当者」選択肢。今のところ森・富田の2名のみ。 */
export const DEAL_OWNERS = ["森", "富田"] as const;

/**
 * 商談報告×Hubspot画面の一覧に表示する1件分。HubSpotの実データ（source: "hubspot"）と、
 * まだHubSpotに反映していないシート上だけのデータ（source: "sheet"）を同じ形にそろえてマージする。
 */
export interface HearingListItem {
  id: string;
  source: "hubspot" | "sheet";
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

export interface FiscalHalf {
  fiscalYear: number;
  half: "上半期" | "下半期";
}

/**
 * 会計年度（4月始まり）の上半期(4/1〜9/30)・下半期(10/1〜翌3/31)。指定した日付がどちらに属するかを判定する。
 * 商談報告×Hubspot画面（期間フィルタ）と売上ダッシュボード（目標設定）の両方で同じ定義を使う。
 */
export function fiscalHalfOf(dateStr: string): FiscalHalf | null {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-11
  if (m >= 3 && m <= 8) return { fiscalYear: y, half: "上半期" }; // 4-9月
  if (m >= 9) return { fiscalYear: y, half: "下半期" }; // 10-12月
  return { fiscalYear: y - 1, half: "下半期" }; // 1-3月は前年度の下半期
}

/** 指定した日時が属する上半期/下半期の実際の開始日・終了日（YYYY-MM-DD）を返す（「今期」の判定に使う）。 */
export function fiscalHalfRange(now: Date): FiscalHalf & { startDate: string; endDate: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m >= 3 && m <= 8) return { fiscalYear: y, half: "上半期", startDate: `${y}-04-01`, endDate: `${y}-09-30` };
  if (m >= 9) return { fiscalYear: y, half: "下半期", startDate: `${y}-10-01`, endDate: `${y + 1}-03-31` };
  return { fiscalYear: y - 1, half: "下半期", startDate: `${y - 1}-10-01`, endDate: `${y}-03-31` };
}

export function dealHearingRowToListItem(row: DealHearingRow): HearingListItem {
  // シートは人が直接編集することもあるため、数値のつもりで空白や全角混じりの文字が入る場合がある。
  // Number()がNaNを返すと、そのままではreduce()の合計全体がNaNに化けてしまうため、
  // 数値として読めない値は「未入力」と同じ扱い（null）にする。
  const num = (v: string) => {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const category = row.category as HearingCategory | "";
  return {
    id: row.id,
    source: "sheet",
    dealname: row.dealname,
    ownerName: row.ownerName,
    category: HEARING_CATEGORIES.includes(category as HearingCategory) ? category : "",
    probability: row.probability,
    plan: row.plan,
    product: row.product,
    chart: row.chart,
    chartTranscribed: !row.chartTranscribed ? null : row.chartTranscribed.toLowerCase() === "true",
    expectedRevenue: num(row.expectedRevenue),
    area: row.area,
    firstMeetingDate: row.firstMeetingDate,
    patientsPerMonth: num(row.patientsPerMonth),
    callsPerMonth: num(row.callsPerMonth),
    visitsPerMonth: num(row.visitsPerMonth),
    hearingNotes: row.hearingNotes,
    dealStage: (row.dealStage as DealStageOrLost) || "",
    contractDate: row.contractDate,
  };
}
