import ShiftScheduleCalendar from "@/components/ShiftScheduleCalendar";
import type { CallShiftRow } from "@/lib/callShifts";

function shift(callerName: string, date: string, startTime: string, endTime: string): CallShiftRow {
  return {
    id: `${callerName}-${date}-${startTime}`,
    callerEmail: `${callerName}@example.com`,
    callerName,
    date,
    startTime,
    endTime,
    calls: "",
    apo: "",
    receptionNg: "",
    keymanConnected: "",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

const SHIFTS: CallShiftRow[] = [
  shift("磯崎", "2026-09-01", "10:00", "18:00"),
  shift("磯崎", "2026-09-16", "10:00", "18:00"),
  shift("富田", "2026-09-16", "09:00", "13:00"),
];

/** OAuth無しで見た目を確認するためのプレビュー。 */
export default function ShiftSchedulePreviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト予定を入れる（プレビュー）</h1>
        <p className="mt-1 text-sm text-foreground/60">サンプルデータでの見た目確認用ページです</p>
      </div>
      <ShiftScheduleCalendar shifts={SHIFTS} isSupervisor={true} />
    </div>
  );
}
