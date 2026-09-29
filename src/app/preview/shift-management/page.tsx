import ShiftManagementView, { type ShiftCalendarApiEvent } from "@/components/ShiftManagementView";
import type { ShiftBudgetRow } from "@/lib/shiftBudget";
import type { StaffWageRow } from "@/lib/staffWages";
import type { MonthlyApoRow } from "@/lib/monthlyApo";

const currentMonth = new Date().toISOString().slice(0, 7);

const WAGES: StaffWageRow[] = [
  { id: "w1", callerIdentity: "磯崎", hourlyWage: "1200", updatedAt: new Date().toISOString() },
  { id: "w2", callerIdentity: "藤川", hourlyWage: "1100", updatedAt: new Date().toISOString() },
  { id: "w3", callerIdentity: "大坪", hourlyWage: "1150", updatedAt: new Date().toISOString() },
];

const ev = (day: string, startTime: string, endTime: string, names: string[], category: "IS" | "IS研修" = "IS") => ({
  id: `${day}-${startTime}-${names.join("")}`,
  date: `${currentMonth}-${day}`,
  startTime,
  endTime,
  category,
  name: names.join(", "),
  names,
});

const EVENTS: ShiftCalendarApiEvent[] = [
  ev("02", "14:00", "17:00", ["磯崎"]),
  ev("06", "10:00", "13:00", ["藤川", "大坪"], "IS研修"),
  ev("09", "09:30", "12:00", ["磯崎様"]),
  ev("14", "13:00", "16:00", ["大坪", "藤川"]),
  ev("15", "13:00", "17:00", ["磯崎愁斗", "森"]),
  ev("22", "10:00", "18:00", ["藤川", "大坪", "磯崎"]),
  ev("28", "09:30", "12:00", ["藤川", "磯崎"]),
];

const BUDGETS: ShiftBudgetRow[] = [
  {
    id: "b1",
    month: currentMonth,
    budget: "150000",
    includeTraining: "TRUE",
    weekAllocations: "{}",
    updatedAt: new Date().toISOString(),
  },
];

const APO_COUNTS: MonthlyApoRow[] = [
  { id: "a1", callerIdentity: "磯崎", month: currentMonth, apoCount: "4", updatedAt: new Date().toISOString() },
  { id: "a2", callerIdentity: "藤川", month: currentMonth, apoCount: "2", updatedAt: new Date().toISOString() },
];

/**
 * OAuth無しで見た目を確認するためのプレビュー（/preview配下はproxy.tsで認証をバイパスする）。
 * 稼働時間は本来GoogleカレンダーAPI（管理者セッション必須）から取得するため、ここではサンプルの
 * シフト予定（表記ゆれ・研修・管理者を含む）を渡して、販管費・週ごとの表の見た目を確認する。
 */
export default function ShiftManagementPreviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト管理表（プレビュー）</h1>
        <p className="mt-1 text-sm text-foreground/60">
          サンプルデータでの見た目確認用ページです（保存ボタンはログインが必要なため失敗します）
        </p>
      </div>
      <ShiftManagementView
        initialWages={WAGES}
        initialApoCounts={APO_COUNTS}
        initialPublishedEventIds={[]}
        initialBudgets={BUDGETS}
        previewEvents={EVENTS}
      />
    </div>
  );
}
