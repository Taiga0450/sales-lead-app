import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { listCallShifts } from "@/lib/google/sheets";
import { getHearingItems, getCurrentHalfKantoTarget } from "@/lib/dealReportData";
import { computeQuarterlySummary, fiscalQuarterOf, fiscalQuarterLabel, buildCallerNames } from "@/lib/callStats";
import type { HearingListItem } from "@/lib/dealHearing";
import CurrentPeriodStatus from "@/components/CurrentPeriodStatus";
import { getSharedAccountKey } from "@/lib/actingAs";

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

export default async function HomePage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  // シェアレジ担当者はメモ記録のみが目的で、このホーム画面（オンコール営業の架電状況・
  // 商談進捗ダッシュボード）は使わないため、リード一覧へ直接案内する。
  if (session?.user?.email && getSharedAccountKey(session.user.email) === "shareregi") {
    redirect("/leads");
  }

  const [shifts, dealItems, currentHalfTarget] = await Promise.all([
    listCallShifts(accessToken),
    getHearingItems(accessToken).catch((err) => {
      console.error("home: hearing items fetch failed", err);
      return [] as HearingListItem[];
    }),
    getCurrentHalfKantoTarget(accessToken).catch((err) => {
      console.error("home: target fetch failed", err);
      return 0;
    }),
  ]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentQuarter = fiscalQuarterOf(todayStr)!;
  const callerNames = buildCallerNames(shifts);

  // 架電状況: 現在の四半期に自動で切り替わる（年度が変わればQ1に、7月になればQ2に…と自動で進む）。
  const quarterRows = computeQuarterlySummary(shifts).filter(
    (s) => s.fiscalYear === currentQuarter.fiscalYear && s.quarter === currentQuarter.quarter,
  );
  const totalCalls = quarterRows.reduce((sum, r) => sum + r.calls, 0);
  const totalApo = quarterRows.reduce((sum, r) => sum + r.apo, 0);
  const totalHours = quarterRows.reduce((sum, r) => sum + r.hours, 0);
  const totalReceptionNg = quarterRows.reduce((sum, r) => sum + r.receptionNg, 0);
  const totalKeymanConnected = quarterRows.reduce((sum, r) => sum + r.keymanConnected, 0);
  const byPerson = [...quarterRows].sort((a, b) => b.calls - a.calls);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ホーム</h1>
        <p className="mt-1 text-sm text-foreground/60">架電状況と今期の商談状況を一目で確認できます</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground/70">架電状況（{fiscalQuarterLabel(currentQuarter)}）</h2>
          <Link href="/calls" className="text-xs text-brand">
            詳細を見る →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-foreground/50">架電数</p>
            <p className="text-2xl font-bold text-brand">{totalCalls}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">アポ獲得</p>
            <p className="text-2xl font-bold text-emerald-600">{totalApo}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">稼働時間</p>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
          </div>
        </div>
        {quarterRows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-foreground/40">
            <span>アポ率 {pct(totalApo, totalCalls)}</span>
            <span>受付NG率 {pct(totalReceptionNg, totalCalls)}</span>
            <span>接続率 {pct(totalKeymanConnected, totalCalls)}</span>
          </div>
        )}
        {byPerson.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
            {byPerson.map((p) => (
              <div key={p.email} className="flex items-center justify-between text-sm">
                <span className="text-foreground/60">{callerNames[p.email] ?? p.email.split("@")[0]}</span>
                <span className="text-foreground/70">
                  {p.calls}件 ・ {p.apo}アポ ({pct(p.apo, p.calls)})
                </span>
              </div>
            ))}
          </div>
        )}
        {quarterRows.length === 0 && (
          <p className="mt-4 border-t border-border pt-3 text-center text-sm text-foreground/40">
            今期の稼働報告がまだありません
          </p>
        )}
      </div>

      <CurrentPeriodStatus items={dealItems} currentHalfTarget={currentHalfTarget} />
    </div>
  );
}
