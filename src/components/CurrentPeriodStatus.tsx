import { fiscalHalfRange, type HearingListItem } from "@/lib/dealHearing";
import Gauge from "./Gauge";

function yen(v: number): string {
  return `¥${v.toLocaleString()}`;
}

/**
 * 商談報告×Hubspot画面・ホーム画面の両方で使う「今期の状況」カード。絞り込み条件に関わらず
 * 常に見える、現在時点のサマリー（今月の新規商談数、今期の初回商談・契約締結件数、目標までの進捗）。
 *
 * 契約締結数・確定売上は取引ステージが「クローズ済み」の商談を対象にする。契約締結日が入力済みなら
 * その日付が今期に入っているかで判定し、契約締結日が未入力の場合は今期分としてカウントする——
 * 契約締結日は今後の商談から入力運用を始めるため、過去にクローズ済みにした商談の多くはまだ
 * 日付が入っていない。それらを除外すると今期の実績が実態より少なく出てしまうための救済措置。
 * 契約締結日の入力が定着すれば、この救済措置は自然と使われなくなっていく。
 *
 * 2026年度上半期のみ、さらに例外がある：このアプリで期別に管理する前（スプレッドシートで
 * 管理していた頃）の確定売上も、今期（2026年度上半期）の実績として一括で含める——今回限りの
 * 移行措置。下半期以降は、この例外は自動的に外れ、契約締結日に基づく通常の判定に戻る。
 */
const TRANSITION_FISCAL_YEAR = 2026;
const TRANSITION_HALF = "上半期";
export default function CurrentPeriodStatus({
  items,
  currentHalfTarget = 0,
}: {
  items: HearingListItem[];
  currentHalfTarget?: number;
}) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const thisMonthStr = todayStr.slice(0, 7);
  const currentHalf = fiscalHalfRange(now);

  const thisMonthNewDeals = items.filter((d) => d.firstMeetingDate.startsWith(thisMonthStr)).length;
  const halfFirstMeetings = items.filter(
    (d) => d.firstMeetingDate >= currentHalf.startDate && d.firstMeetingDate <= currentHalf.endDate,
  ).length;
  const isTransitionPeriod = currentHalf.fiscalYear === TRANSITION_FISCAL_YEAR && currentHalf.half === TRANSITION_HALF;
  const halfContractedDeals = items.filter((d) => {
    if (d.dealStage !== "クローズ済み") return false;
    if (isTransitionPeriod) return true;
    if (!d.contractDate) return true;
    return d.contractDate >= currentHalf.startDate && d.contractDate <= currentHalf.endDate;
  });
  const halfConfirmedRevenue = halfContractedDeals.reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-brand-light/20 p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-foreground/70">
        今期の状況（{currentHalf.fiscalYear}年度{currentHalf.half}）
      </h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-foreground/50">今月の新規商談数</p>
          <p className="text-2xl font-bold">{thisMonthNewDeals}件</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">今期の初回商談数</p>
          <p className="text-2xl font-bold">{halfFirstMeetings}件</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">今期の契約締結数</p>
          <p className="text-2xl font-bold text-emerald-600">{halfContractedDeals.length}件</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-xs text-foreground/50">目標までの進捗</p>
          {currentHalfTarget > 0 ? (
            <Gauge value={halfConfirmedRevenue} target={currentHalfTarget} label="対目標" valueFormatter={yen} />
          ) : (
            <p className="mt-2 text-sm text-foreground/40">
              目標未設定
              <span className="ml-1 text-xs">（実績 {yen(halfConfirmedRevenue)}）</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
