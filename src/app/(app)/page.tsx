import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import {
  listCallShifts,
  listLeads,
  listCallPlans,
  listShiftBudgets,
  listStaffWages,
  listMonthlyApo,
} from "@/lib/google/sheets";
import { getHearingItems, getCurrentHalfKantoTarget } from "@/lib/dealReportData";
import type { HearingListItem } from "@/lib/dealHearing";
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
import HomeCallStats from "@/components/HomeCallStats";
import AreaProgressCard from "@/components/AreaProgressCard";
import BudgetMiniCard from "@/components/BudgetMiniCard";

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
  const [shifts, leads, planRows, dealItems, currentHalfTarget, budget] = await Promise.all([
    listCallShifts(accessToken),
    listLeads(accessToken),
    listCallPlans(accessToken),
    getHearingItems(accessToken).catch((err) => {
      console.error("home: hearing items fetch failed", err);
      return [] as HearingListItem[];
    }),
    getCurrentHalfKantoTarget(accessToken).catch((err) => {
      console.error("home: target fetch failed", err);
      return 0;
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
  const progress = planProgress(plansOf(planRows, month), leads, month);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ホーム</h1>
        <p className="mt-1 text-sm text-foreground/60">架電の状況と、今月の計画・今期の商談の進み具合をまとめて確認できます</p>
      </div>

      <HomeCallStats data={callStats} />

      <AreaProgressCard month={month} monthLabel={monthLabel} progress={progress} canEdit={isSupervisor} />

      <div className={`grid gap-6 ${budget ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <CurrentPeriodStatus items={dealItems} currentHalfTarget={currentHalfTarget} />
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
