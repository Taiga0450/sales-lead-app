import ShiftManagementView from "@/components/ShiftManagementView";
import { isHourlyStaffShift } from "@/lib/callShifts";
import type { CallShiftRow } from "@/lib/callShifts";
import type { StaffWageRow } from "@/lib/staffWages";

function shift(
  callerName: string,
  date: string,
  startTime: string,
  endTime: string,
  extra: Partial<CallShiftRow> = {},
): CallShiftRow {
  return {
    id: `${callerName}-${date}-${startTime}`,
    // 実際のバイト・インターンの記録は共有アカウント経由のonBehalfOfName入力のため、
    // callerEmailにも@を含まない氏名そのものが入る（isHourlyStaffShiftの判定に合わせる）。
    callerEmail: callerName,
    callerName,
    date,
    startTime,
    endTime,
    calls: "20",
    apo: "2",
    receptionNg: "5",
    keymanConnected: "8",
    notes: "",
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

const RAW_SHIFTS: CallShiftRow[] = [
  shift("磯崎", "2026-09-01", "10:00", "18:00", { apo: "1" }),
  shift("磯崎", "2026-09-03", "10:00", "18:00", { apo: "0" }),
  shift("磯崎", "2026-09-08", "10:00", "18:00", { apo: "2" }),
  shift("磯崎", "2026-09-10", "13:00", "18:00", { apo: "1" }),
  shift("磯崎", "2026-09-16", "10:00", "18:00", { apo: "0" }),
  shift("藤川", "2026-09-01", "09:00", "13:00", { apo: "0" }),
  shift("藤川", "2026-09-02", "09:00", "13:00", { apo: "1" }),
  shift("藤川", "2026-09-04", "09:00", "17:00", { apo: "1" }),
  shift("藤川", "2026-09-09", "09:00", "13:00", { apo: "0" }),
  shift("藤川", "2026-09-16", "09:00", "13:00", { apo: "0" }),
  shift("大坪", "2026-09-02", "18:00", "21:00", { apo: "0" }),
  shift("大坪", "2026-09-09", "18:00", "21:00", { apo: "1" }),
  shift("大坪", "2026-09-15", "18:00", "22:00", { apo: "0" }),
  // 管理者本人（森太雅）が代理入力した場合など——人件費対象から除外されるはず。
  shift("森太雅", "2026-09-05", "10:00", "18:00", { apo: "5" }),
];
const SHIFTS = RAW_SHIFTS.filter(isHourlyStaffShift);

const WAGES: StaffWageRow[] = [
  { id: "w1", callerIdentity: "磯崎", hourlyWage: "1200", updatedAt: new Date().toISOString() },
  { id: "w2", callerIdentity: "藤川", hourlyWage: "1100", updatedAt: new Date().toISOString() },
];

/**
 * OAuth無しで見た目を確認するためのプレビュー（/preview配下はproxy.tsで認証をバイパスする）。
 * サンプルデータは全て架空。/api/staff-wagesへの保存は認証が必要なため、ここでは失敗する
 * （見た目確認が目的のため許容）。
 */
export default function ShiftManagementPreviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト管理表（プレビュー）</h1>
        <p className="mt-1 text-sm text-foreground/60">サンプルデータでの見た目確認用ページです</p>
      </div>
      <ShiftManagementView shifts={SHIFTS} initialWages={WAGES} />
    </div>
  );
}
