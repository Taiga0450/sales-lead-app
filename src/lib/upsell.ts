import type { UpsellCandidate } from "./hubspot";

/**
 * 契約終了日までの残り日数。過去日・空欄はnull。
 * 日本時間の日付として厳密に計算する（サーバーの実行タイムゾーンに依存しないように）。
 */
export function daysUntilContractEnd(contractEndDate: string, now: Date = new Date()): number | null {
  if (!contractEndDate) return null;
  const end = new Date(`${contractEndDate}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(end)) return null;
  // toISOString()はUTCなので、+9時間ずらしてから日付部分を取る（JSTの0〜9時に前日扱いになるのを防ぐ）
  const jstDate = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const today = new Date(`${jstDate}T00:00:00+09:00`).getTime();
  return Math.round((end - today) / 86400000);
}

/** 契約終了日の何ヶ月前から「更新対象」とみなすか。 */
export const RENEWAL_WINDOW_MONTHS = 2;

/** YYYY-MM-DDの日付をNヶ月前にずらす。移動先の月に同じ日が無い場合は月末に丸める（例: 4/30の2ヶ月前→2/28）。 */
function subtractMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * 契約終了日の2ヶ月前〜契約終了日当日の期間に入っているか。契約開始日・契約終了日の
 * 両方が入力されている契約だけを対象にする（どちらかが空欄、または開始日＞終了日ならfalse）。
 */
export function isRenewalWindow(
  candidate: Pick<UpsellCandidate, "contractStartDate" | "contractEndDate">,
  now: Date = new Date(),
): boolean {
  const { contractStartDate, contractEndDate } = candidate;
  if (!contractStartDate || !contractEndDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contractEndDate)) return false;
  // 開始日＞終了日はHubSpot側の入力ミス（終了日の年ズレ等）なので、更新対象としては扱わない
  if (contractStartDate > contractEndDate) return false;
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return subtractMonths(contractEndDate, RENEWAL_WINDOW_MONTHS) <= today && today <= contractEndDate;
}

export const UPSELL_SHEET_HEADERS = [
  "医療機関名",
  "担当者",
  "電話番号",
  "架電済み",
  "架電日",
  "カテゴリ",
  "検討プラン",
  "商品",
  "カルテ",
  "見込み売上",
  "エリア",
  "初回商談完了日",
  "患者数/月",
  "受電件数/月",
  "往診件数/月",
  "ヒアリングメモ",
  "契約開始日",
  "契約終了日",
  "契約終了までの日数",
  "更新2ヶ月以内",
  "受電対応時間",
  "契約書_郵便番号",
  "契約書_住所",
  "契約書_法人名",
  "契約書_代表者肩書",
  "契約書_代表者氏名",
  "契約書_送付先担当者",
  "契約書_送付先メールアドレス",
  "契約書_締結方法",
  "契約メモ",
  "契約書リンク",
  "取引ステージ",
  "成約日",
  "HubSpotリンク",
] as const;

/** 架電済み記録（UTCのISO日時）を日本時間の日付（YYYY-MM-DD）にする。 */
export function toJstDate(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t + 9 * 3600000).toISOString().slice(0, 10) : "";
}

/** 架電済み記録のうち、一覧・シートに必要な分だけ。 */
export interface UpsellCallInfo {
  calledAt: string;
  calledBy: string;
}

export function upsellCandidateToRow(
  candidate: UpsellCandidate,
  now: Date = new Date(),
  call?: UpsellCallInfo,
): string[] {
  const days = daysUntilContractEnd(candidate.contractEndDate, now);
  return [
    candidate.dealname,
    candidate.ownerName,
    candidate.phone,
    call ? "○" : "",
    call ? toJstDate(call.calledAt) : "",
    candidate.category,
    candidate.plan,
    candidate.product,
    candidate.chart,
    candidate.expectedRevenue === null ? "" : String(candidate.expectedRevenue),
    candidate.area,
    candidate.firstMeetingDate,
    candidate.patientsPerMonth === null ? "" : String(candidate.patientsPerMonth),
    candidate.callsPerMonth === null ? "" : String(candidate.callsPerMonth),
    candidate.visitsPerMonth === null ? "" : String(candidate.visitsPerMonth),
    candidate.hearingNotes,
    candidate.contractStartDate,
    candidate.contractEndDate,
    days === null ? "" : String(days),
    isRenewalWindow(candidate, now) ? "○" : "",
    candidate.receptionHours,
    candidate.contractZip,
    candidate.contractAddress,
    candidate.contractCorporateName,
    candidate.contractRepresentativeTitle,
    candidate.contractRepresentativeName,
    candidate.contractManager,
    candidate.contractEmail,
    candidate.contractMethod,
    candidate.contractNotes,
    candidate.contractUrl,
    candidate.stageLabel,
    candidate.closeDate,
    candidate.dealUrl,
  ];
}

/**
 * シート上の並び順。更新が近い順に見られるよう契約終了日の昇順、終了日が空欄のものは末尾
 * （同じ終了日の中では医療機関名順）。
 */
export function compareByContractEnd(a: UpsellCandidate, b: UpsellCandidate): number {
  if (a.contractEndDate !== b.contractEndDate) {
    if (!a.contractEndDate) return 1;
    if (!b.contractEndDate) return -1;
    return a.contractEndDate < b.contractEndDate ? -1 : 1;
  }
  return a.dealname.localeCompare(b.dealname, "ja");
}

/** アップセル画面の一覧1行分（ページの初期表示とAPIの再読み込みで共用）。 */
export interface UpsellListItem {
  id: string;
  dealname: string;
  ownerName: string;
  phone: string;
  stageLabel: string;
  contractStartDate: string;
  contractEndDate: string;
  daysLeft: number | null;
  renewalWindow: boolean;
  receptionHours: string;
  contractManager: string;
  contractEmail: string;
  contractNotes: string;
  dealUrl: string;
  calledAt: string;
  calledBy: string;
}

export interface UpsellListSummary {
  totalCount: number;
  renewalCount: number;
  missingDatesCount: number;
  calledCount: number;
  candidates: UpsellListItem[];
}

export function summarizeUpsellCandidates(
  candidates: UpsellCandidate[],
  calls: Record<string, UpsellCallInfo> = {},
  now: Date = new Date(),
): UpsellListSummary {
  const sorted = [...candidates].sort(compareByContractEnd);
  return {
    totalCount: sorted.length,
    renewalCount: sorted.filter((c) => isRenewalWindow(c, now)).length,
    missingDatesCount: sorted.filter((c) => !c.contractStartDate || !c.contractEndDate).length,
    calledCount: sorted.filter((c) => calls[c.id]).length,
    candidates: sorted.map((c) => ({
      id: c.id,
      dealname: c.dealname,
      ownerName: c.ownerName,
      phone: c.phone,
      stageLabel: c.stageLabel,
      contractStartDate: c.contractStartDate,
      contractEndDate: c.contractEndDate,
      daysLeft: daysUntilContractEnd(c.contractEndDate, now),
      renewalWindow: isRenewalWindow(c, now),
      receptionHours: c.receptionHours,
      contractManager: c.contractManager,
      contractEmail: c.contractEmail,
      contractNotes: c.contractNotes,
      dealUrl: c.dealUrl,
      calledAt: calls[c.id]?.calledAt ?? "",
      calledBy: calls[c.id]?.calledBy ?? "",
    })),
  };
}
