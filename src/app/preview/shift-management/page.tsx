import ShiftManagementView from "@/components/ShiftManagementView";
import type { StaffWageRow } from "@/lib/staffWages";
import type { MonthlyApoRow } from "@/lib/monthlyApo";

const currentMonth = new Date().toISOString().slice(0, 7);

const WAGES: StaffWageRow[] = [
  { id: "w1", callerIdentity: "磯崎", hourlyWage: "1200", updatedAt: new Date().toISOString() },
  { id: "w2", callerIdentity: "藤川", hourlyWage: "1100", updatedAt: new Date().toISOString() },
];

const APO_COUNTS: MonthlyApoRow[] = [
  { id: "a1", callerIdentity: "磯崎", month: currentMonth, apoCount: "4", updatedAt: new Date().toISOString() },
  { id: "a2", callerIdentity: "藤川", month: currentMonth, apoCount: "2", updatedAt: new Date().toISOString() },
];

/**
 * OAuth無しで見た目を確認するためのプレビュー（/preview配下はproxy.tsで認証をバイパスする）。
 * 稼働時間はGoogleカレンダーAPI（管理者セッション必須）から取得するため、認証の無いこの
 * プレビューでは0hのまま・シフト予定一覧も空で表示される（時給・アポ手入力欄の見た目確認が目的）。
 */
export default function ShiftManagementPreviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト管理表（プレビュー）</h1>
        <p className="mt-1 text-sm text-foreground/60">
          サンプルデータでの見た目確認用ページです（カレンダー取得は認証が必要なため失敗表示になります）
        </p>
      </div>
      <ShiftManagementView initialWages={WAGES} initialApoCounts={APO_COUNTS} initialPublishedEventIds={[]} />
    </div>
  );
}
