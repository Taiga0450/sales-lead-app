import { requirePageSession } from "@/lib/session";
import { listCallShifts } from "@/lib/google/sheets";
import { computeShiftCallerTotals, computeQuarterlySummary, buildCallerNames } from "@/lib/callStats";
import { isSupervisorEmail } from "@/lib/callShifts";
import { isSharedAccountEmail } from "@/lib/actingAs";
import GridBarChart from "@/components/GridBarChart";
import ShiftForm from "@/components/ShiftForm";
import MyShiftsTable from "@/components/MyShiftsTable";
import QuarterlyCallDashboard from "@/components/QuarterlyCallDashboard";
import SectionTabs from "@/components/SectionTabs";
import ShiftScheduleCalendar from "@/components/ShiftScheduleCalendar";

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

export default async function CallsPage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;
  const selfEmail = session.user?.email ?? "";
  const shifts = await listCallShifts(accessToken);

  const now = new Date();
  const callers = computeShiftCallerTotals(shifts, now);
  const quarterlySummary = computeQuarterlySummary(shifts);
  const callerNames = buildCallerNames(shifts);
  const nameOf = (email: string) => callerNames[email] ?? email.split("@")[0];
  const isSupervisor = isSupervisorEmail(selfEmail);
  // 共有アカウント（バイトメンバー全員が同じアカウントでログイン）の場合、「自分の記録」という
  // 絞り込みが意味を持たない（記録ごとに実際の人がonBehalfOfNameで別々に記録されているため）。
  // 統括担当者と同じく、全員分を人ごとのタブで見られるようにする。
  const canSeeAllShifts = isSupervisor || isSharedAccountEmail(selfEmail);
  const myShifts = canSeeAllShifts ? shifts : shifts.filter((s) => s.callerEmail === selfEmail);

  const totals = callers.reduce(
    (acc, c) => ({
      hoursThisMonth: acc.hoursThisMonth + c.hoursThisMonth,
      thisMonth: acc.thisMonth + c.thisMonth,
      apoThisMonth: acc.apoThisMonth + c.apoThisMonth,
    }),
    { hoursThisMonth: 0, thisMonth: 0, apoThisMonth: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">架電状況</h1>
        <p className="mt-1 text-sm text-foreground/60">
          メンバーごとの架電件数・稼働時間を一目で確認できます（稼働報告の入力値をもとにした集計です）
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月の総稼働時間</p>
          <p className="mt-2 text-3xl font-bold text-brand">{totals.hoursThisMonth.toFixed(1)}h</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月の架電件数</p>
          <p className="mt-2 text-3xl font-bold text-brand">{totals.thisMonth.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月のアポ獲得数</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{totals.apoThisMonth.toLocaleString()}</p>
        </div>
      </div>

      <ShiftForm isSupervisor={isSupervisor} />

      <SectionTabs
        sections={[
          {
            key: "shifts",
            label: isSupervisor ? "全員の稼働記録（修正可能）" : "自分の稼働記録（修正可能）",
            content: (
              <MyShiftsTable
                shifts={myShifts}
                title={isSupervisor ? "全員の稼働記録（修正可能）" : "自分の稼働記録（修正可能）"}
                groupByPerson={isSupervisor}
              />
            ),
          },
          {
            key: "schedule",
            label: "シフト予定を入れる（カレンダー）",
            content: <ShiftScheduleCalendar shifts={myShifts} isSupervisor={isSupervisor} />,
          },
          {
            key: "quarterly",
            label: "四半期サマリー（稼働時間・架電数・アポ獲得数）",
            content: (
              <div>
                <QuarterlyCallDashboard summary={quarterlySummary} fiscalYears={[2026, 2027]} names={callerNames} />
              </div>
            ),
          },
          {
            key: "apo",
            label: "今月のアポ獲得数（メンバー別）",
            content: (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <GridBarChart
                  title="今月のアポ獲得数（メンバー別）"
                  data={callers.map((c) => ({ label: nameOf(c.email), value: c.apoThisMonth }))}
                  color="#059669"
                />
              </div>
            ),
          },
          {
            key: "calls",
            label: "今月の架電件数（メンバー別）",
            content: (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <GridBarChart
                  title="今月の架電件数（メンバー別）"
                  data={callers.map((c) => ({ label: nameOf(c.email), value: c.thisMonth }))}
                />
              </div>
            ),
          },
          {
            key: "members",
            label: "メンバー",
            content: (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="grid grid-cols-9 gap-3 border-b border-border bg-brand-light/40 px-5 py-2.5 text-xs font-medium text-foreground/50">
                  <span className="col-span-2">メンバー</span>
                  <span>今月の架電数</span>
                  <span>累計架電数</span>
                  <span>稼働時間</span>
                  <span>アポ獲得</span>
                  <span>アポ率</span>
                  <span>受付NG率</span>
                  <span>接続率</span>
                </div>
                <div className="flex flex-col">
                  {callers.map((c) => (
                    <div key={c.email} className="grid grid-cols-9 gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
                      <span className="col-span-2 font-medium">{nameOf(c.email)}</span>
                      <span className="font-semibold text-brand">{c.thisMonth}</span>
                      <span className="font-semibold">{c.callsTotal}</span>
                      <span>{c.hoursThisMonth.toFixed(1)}h</span>
                      <span className="font-semibold text-emerald-600">{c.apoThisMonth}</span>
                      <span>{pct(c.apoThisMonth, c.thisMonth)}</span>
                      <span>{pct(c.receptionNgThisMonth, c.thisMonth)}</span>
                      <span>{pct(c.keymanConnectedThisMonth, c.thisMonth)}</span>
                    </div>
                  ))}
                  {callers.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-foreground/40">稼働報告がまだありません</div>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
