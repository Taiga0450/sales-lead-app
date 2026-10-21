import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import {
  listCallShifts,
  listLeads,
  listCallPlans,
  listShiftBudgets,
  listStaffWages,
  listMonthlyApo,
  listSalesTargets,
} from "@/lib/google/sheets";
import { getHearingItems } from "@/lib/dealReportData";
import { fiscalHalfRange, type HearingListItem } from "@/lib/dealHearing";
import { getSharedAccountKey } from "@/lib/actingAs";
import { isSupervisorEmail } from "@/lib/callShifts";
import { jstToday, periodOf, summarizePeriod } from "@/lib/homeStats";
import { plansOf, planProgress } from "@/lib/callPlans";
import { listShiftCalendarEvents } from "@/lib/google/calendar";
import { wageMapOf } from "@/lib/staffWages";
import { monthlyApoMapOf } from "@/lib/monthlyApo";
import {
  INCENTIVE_PER_APO,
  buildNameMerger,
  isAdminStaff,
  mergedWagesOf,
  monthBudgetOf,
  weeklyBudgetRows,
} from "@/lib/shiftBudget";
import CurrentPeriodStatus from "@/components/CurrentPeriodStatus";
import { ownerShortNamesOf } from "@/lib/hubspot";
import HomeCallStats from "@/components/HomeCallStats";
import AreaProgressCard from "@/components/AreaProgressCard";
import BudgetMiniCard from "@/components/BudgetMiniCard";
import SalesProgressCard, { type HalfSales } from "@/components/SalesProgressCard";
import NeedsCheckCard from "@/components/NeedsCheckCard";

/**
 * 今月のIS販管費の使用額（シフト管理表と同じ計算）。カレンダーは管理者本人のトークンで読むため、
 * calendar.readonlyを許可する前のログインのままだと読めない——その場合はメッセージを返す。
 */
async function monthBudgetSummary(accessToken: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  const [budgets, wageRows, apoRows, calendar] = await Promise.all([
    listShiftBudgets(accessToken),
    listStaffWages(accessToken),
    listMonthlyApo(accessToken),
    listShiftCalendarEvents(accessToken, y, m),
  ]);
  const wages = wageMapOf(wageRows);
  const apoCounts = monthlyApoMapOf(apoRows);
  const merge = buildNameMerger([...calendar.events.flatMap((e) => e.names), ...Object.keys(wages)]);
  const setting = monthBudgetOf(budgets, month);
  const wageCost = weeklyBudgetRows({ month, events: calendar.events, wages: mergedWagesOf(wages, merge), merge, setting }).reduce(
    (sum, w) => sum + w.cost,
    0,
  );
  const incentive = Object.entries(apoCounts)
    .filter(([key]) => key.endsWith(`|${month}`) && !isAdminStaff(merge(key.split("|")[0])))
    .reduce((sum, [, n]) => sum + n * INCENTIVE_PER_APO, 0);
  return { budget: setting.budget, spent: wageCost + incentive };
}

export default async function HomePage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;
  const email = session.user?.email ?? "";

  // シェアレジ担当者はメモ記録のみが目的で、このホーム画面（オンコール営業の架電状況・
  // 商談進捗ダッシュボード）は使わないため、リード一覧へ直接案内する。
  if (getSharedAccountKey(email) === "shareregi") {
    redirect("/leads");
  }
  const isSupervisor = isSupervisorEmail(email);

  const today = jstToday();
  const month = today.slice(0, 7);
  const fiscalYear = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const HALVES = [
    { half: "上半期" as const, start: `${fiscalYear}-04-01`, end: `${fiscalYear}-09-30`, rangeLabel: "4/1〜9/30" },
    { half: "下半期" as const, start: `${fiscalYear}-10-01`, end: `${fiscalYear + 1}-03-31`, rangeLabel: "10/1〜3/31" },
  ];
  const [shifts, leads, planRows, dealItems, targets, budget] = await Promise.all([
    listCallShifts(accessToken),
    listLeads(accessToken),
    listCallPlans(accessToken),
    getHearingItems(accessToken).catch((err) => {
      console.error("home: hearing items fetch failed", err);
      return [] as HearingListItem[];
    }),
    listSalesTargets(accessToken).catch((err) => {
      console.error("home: target fetch failed", err);
      return [];
    }),
    isSupervisor
      ? monthBudgetSummary(accessToken, month).catch((err) => {
          console.error("home: budget fetch failed", err);
          return { error: err instanceof Error ? err.message : "販管費を読み込めませんでした" };
        })
      : Promise.resolve(null),
  ]);

  const callStats = {
    month: {
      current: summarizePeriod(periodOf("month", today), shifts, leads),
      previous: summarizePeriod(periodOf("month", today, -1), shifts, leads),
    },
    quarter: {
      current: summarizePeriod(periodOf("quarter", today), shifts, leads),
      previous: summarizePeriod(periodOf("quarter", today, -1), shifts, leads),
    },
  };
  const monthLabel = periodOf("month", today).label;
  const nowJst = new Date(`${today}T12:00:00+09:00`);
  const half = fiscalHalfRange(nowJst);
  const targetFor = (periodLabel: string) =>
    Number(
      targets.findLast((t) => t.fiscalYear === String(fiscalYear) && t.periodLabel === periodLabel && t.region === "関東")
        ?.targetAmount ?? 0,
    ) || 0;
  // 売上の実績は、アプリの商談報告で「クローズ済み」（受注）になった関東の担当者の商談の見込み売上を、
  // 契約締結日で半期に振り分けて合計する。契約締結日が未入力の商談は、今期の分として数える
  // （「今期の商談状況」と同じ扱い）。
  const kantoOwners = new Set(ownerShortNamesOf("関東"));
  const kantoWon = dealItems.filter((d) => d.dealStage === "クローズ済み" && kantoOwners.has(d.ownerName));
  // 見込み：まだ受注していない（初回商談〜口頭受注の）関東の商談の見込み売上。今の時点の商談の状況なので、
  // 半期には振り分けず今期の表示にだけ出す。
  const PIPELINE_STAGES = ["口頭受注", "見積提出", "初回商談"] as const;
  const kantoOpen = dealItems.filter((d) => kantoOwners.has(d.ownerName));
  const pipeline = PIPELINE_STAGES.map((stage) => {
    const deals = kantoOpen.filter((d) => d.dealStage === stage);
    return { stage, amount: deals.reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0), count: deals.length };
  });
  const halves: HalfSales[] = HALVES.map((h) => {
    const won = kantoWon.filter((d) =>
      d.contractDate ? d.contractDate >= h.start && d.contractDate <= h.end : h.half === half.half,
    );
    return {
      half: h.half,
      rangeLabel: h.rangeLabel,
      target: targetFor(h.half),
      actual: won.reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0),
      wonCount: won.length,
    };
  });
  // 架電したのにフェーズが「未活動」のまま（更新漏れ）のリード。委託分は入力時にフェーズを入れるので除く。
  const phaseNotUpdated = leads.filter((l) => l.架電日 && (l.ステータス || "未活動") === "未活動").length;
  const progress = planProgress(plansOf(planRows, month), leads, month);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ホーム</h1>
        <p className="mt-1 text-sm text-foreground/60">架電の状況と、今月の計画・今期の商談の進み具合をまとめて確認できます</p>
      </div>

      <SalesProgressCard
        fiscalYear={fiscalYear}
        halves={halves}
        currentHalf={half.half}
        pipeline={pipeline}
        canEdit={isSupervisor}
      />

      <HomeCallStats data={callStats} />

      {phaseNotUpdated > 0 && <NeedsCheckCard phaseNotUpdated={phaseNotUpdated} />}

      <AreaProgressCard month={month} monthLabel={monthLabel} progress={progress} canEdit={isSupervisor} />

      <div className={`grid gap-6 ${budget ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <CurrentPeriodStatus items={dealItems} showGoal={false} />
        {budget && (
          <BudgetMiniCard
            monthLabel={monthLabel}
            budget={"error" in budget ? null : budget.budget}
            spent={"error" in budget ? 0 : budget.spent}
            error={"error" in budget ? budget.error : null}
          />
        )}
      </div>
    </div>
  );
}
