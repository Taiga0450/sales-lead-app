import { DEAL_STAGES, DEAL_OWNERS, LOST_STAGE, fiscalHalfOf, type HearingListItem, type DealStageOrLost } from "./dealHearing";
import { fiscalQuarterOf, fiscalQuarterLabel } from "./callStats";

/** 営業定例ミーティング画面が対象にする担当者（森・富田）だけに絞り込む。 */
export function filterToSalesOwners(items: HearingListItem[]): HearingListItem[] {
  return items.filter((item) => (DEAL_OWNERS as readonly string[]).includes(item.ownerName));
}

/** "YYYY-MM-DD" を "M/D" 表記にする（見出し表示用）。 */
function formatMD(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 指定日が属する週の月曜日を返す（週次ミーティングの集計単位）。 */
function mondayOf(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=日,1=月,...
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** 今日が属する週（月曜始まり）の開始日・終了日を返す。期間選択の初期値に使う。 */
export function defaultWeekRange(): { start: string; end: string } {
  const monday = mondayOf(new Date());
  const start = toDateStr(monday);
  const endDate = new Date(monday);
  endDate.setDate(endDate.getDate() + 6);
  return { start, end: toDateStr(endDate) };
}

const PHASE_COLUMNS = [...DEAL_STAGES, LOST_STAGE] as const;

export interface PhaseCountRow {
  counts: Record<DealStageOrLost, number>;
  total: number;
  /** クローズ済み商談の見込み売上合計（確定売上）。 */
  confirmedRevenue: number;
  /** 口頭受注商談の見込み売上合計（合意はできているが契約締結前の見込み）。 */
  verbalOrderRevenue: number;
  /** 確度A（80%以上）かつ未クローズの商談の見込み売上合計（一般的な意味での見込み売上）。 */
  pipelineRevenue: number;
}

function countPhases(items: HearingListItem[]): Record<DealStageOrLost, number> {
  const counts = Object.fromEntries(PHASE_COLUMNS.map((s) => [s, 0])) as Record<DealStageOrLost, number>;
  for (const item of items) {
    if (item.dealStage) counts[item.dealStage] = (counts[item.dealStage] ?? 0) + 1;
  }
  return counts;
}

function sumRevenue(items: HearingListItem[]): number {
  return items.reduce((sum, item) => sum + (item.expectedRevenue ?? 0), 0);
}

function phaseCountRow(items: HearingListItem[]): PhaseCountRow {
  return {
    counts: countPhases(items),
    total: items.length,
    confirmedRevenue: sumRevenue(items.filter((item) => item.dealStage === "クローズ済み")),
    verbalOrderRevenue: sumRevenue(items.filter((item) => item.dealStage === "口頭受注")),
    pipelineRevenue: sumRevenue(items.filter((item) => item.probability === "A" && item.dealStage !== "クローズ済み")),
  };
}

export interface PeriodBreakdown {
  key: string;
  label: string;
  /** 関東全体（森・富田の合計）の内訳。 */
  overall: PhaseCountRow;
  /** 担当者ごと（森・富田それぞれ）の内訳。 */
  byOwner: Array<{ owner: string } & PhaseCountRow>;
}

function buildBreakdown(items: HearingListItem[], key: string, label: string): PeriodBreakdown {
  return {
    key,
    label,
    overall: phaseCountRow(items),
    byOwner: DEAL_OWNERS.map((owner) => ({ owner, ...phaseCountRow(items.filter((item) => item.ownerName === owner)) })),
  };
}

export interface RangeMeetingGroup {
  startDate: string;
  endDate: string;
  label: string;
  items: HearingListItem[];
  breakdown: PeriodBreakdown;
}

/**
 * 開始日〜終了日（両端含む）で指定した任意の期間の商談だけを集計する。
 * 商談が無くても、件数0の空の結果を返す（一覧ではなく「選んだ期間の数値」を見せるため）。
 */
export function rangeSummaryFor(items: HearingListItem[], startDate: string, endDate: string): RangeMeetingGroup {
  // 終了日が開始日より前に指定された場合は入れ替えて扱う（操作ミスで範囲が壊れないように）。
  const [rangeStart, rangeEnd] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];

  const rangeItems = items.filter(
    (item) => item.firstMeetingDate >= rangeStart && item.firstMeetingDate <= rangeEnd,
  );
  const sorted = [...rangeItems].sort((a, b) =>
    a.firstMeetingDate < b.firstMeetingDate ? -1 : a.firstMeetingDate > b.firstMeetingDate ? 1 : 0,
  );
  const label = `${formatMD(rangeStart)}〜${formatMD(rangeEnd)}`;

  return {
    startDate: rangeStart,
    endDate: rangeEnd,
    label,
    items: sorted,
    breakdown: buildBreakdown(rangeItems, `${rangeStart}|${rangeEnd}`, label),
  };
}

/** カレンダーで選んだ日付が属する月1件分を、関東全体・担当者別の取引ステージ件数で集計する。 */
export function monthBreakdownFor(items: HearingListItem[], dateStr: string): PeriodBreakdown {
  const month = dateStr.slice(0, 7);
  const monthItems = items.filter((item) => item.firstMeetingDate.slice(0, 7) === month);
  return buildBreakdown(monthItems, month, `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`);
}

/**
 * カレンダーで選んだ日付が属する会計四半期（4月始まり: Q1=4-6月, Q2=7-9月, Q3=10-12月, Q4=1-3月）
 * 1件分を、関東全体・担当者別の取引ステージ件数で集計する。
 */
export function quarterBreakdownFor(items: HearingListItem[], dateStr: string): PeriodBreakdown {
  const fq = fiscalQuarterOf(dateStr) ?? fiscalQuarterOf(toDateStr(new Date()))!;
  const quarterItems = items.filter((item) => {
    if (!item.firstMeetingDate) return false;
    const itemFq = fiscalQuarterOf(item.firstMeetingDate);
    return itemFq !== null && itemFq.fiscalYear === fq.fiscalYear && itemFq.quarter === fq.quarter;
  });
  return buildBreakdown(quarterItems, `${fq.fiscalYear}|${fq.quarter}`, fiscalQuarterLabel(fq));
}

// 2026年度上半期のみの一時的な例外（CurrentPeriodStatus.tsxの確定売上の扱いと同じ考え方）。
// このアプリで初回商談完了日を厳密に記録する前からHubSpot/シートに反映されていた商談が
// 多いため、日付で厳密に絞ると今期の実績が実態より少なく出てしまう。今回限りの移行措置として、
// 2026年度上半期だけは日付を問わず現時点の対象商談を全て上半期分としてカウントする。
// 下半期以降は自動的にこの例外が外れ、初回商談完了日に基づく通常の判定に戻る。
//
// 「今が2026年度上半期かどうか」ではなく「今カレンダーで見ている期間が2026年度上半期かどうか」
// だけで判定すると、下半期に入った後でもカレンダーを2026年度上半期に戻せば毎回この例外が
// 発動してしまい、移行措置が永久に外れない。実際の現在時刻も2026年度上半期である場合に限定する。
const TRANSITION_FISCAL_YEAR = 2026;
const TRANSITION_HALF = "上半期" as const;

/**
 * カレンダーで選んだ日付が属する会計半期（4/1〜9/30=上半期, 10/1〜翌3/31=下半期）1件分を、
 * 関東全体・担当者別の取引ステージ件数で集計する。
 */
export function halfBreakdownFor(items: HearingListItem[], dateStr: string): PeriodBreakdown {
  const fh = fiscalHalfOf(dateStr) ?? fiscalHalfOf(toDateStr(new Date()))!;
  const nowFh = fiscalHalfOf(toDateStr(new Date()))!;
  const isTransitionPeriod =
    fh.fiscalYear === TRANSITION_FISCAL_YEAR &&
    fh.half === TRANSITION_HALF &&
    nowFh.fiscalYear === TRANSITION_FISCAL_YEAR &&
    nowFh.half === TRANSITION_HALF;
  const halfItems = isTransitionPeriod
    ? items
    : items.filter((item) => {
        if (!item.firstMeetingDate) return false;
        const itemFh = fiscalHalfOf(item.firstMeetingDate);
        return itemFh !== null && itemFh.fiscalYear === fh.fiscalYear && itemFh.half === fh.half;
      });
  return buildBreakdown(halfItems, `${fh.fiscalYear}|${fh.half}`, `${fh.fiscalYear}年度${fh.half}`);
}

export const PHASE_COUNT_COLUMNS = PHASE_COLUMNS;
