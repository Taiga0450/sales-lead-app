"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CallShiftRow } from "@/lib/callShifts";
import { computeMonthlyShiftCalendar } from "@/lib/callStats";
import { getActingAsName } from "@/lib/actingAs";
import ShiftCalendarGrid from "./ShiftCalendarGrid";

function currentMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 実際の稼働（架電数などの実績込み）を記録するShiftFormとは別に、まだ架電していない
 * 「今後のシフト予定」だけをカレンダーから素早く入れられるようにするフォーム。日付をクリックして
 * 開始/終了時刻を入れるだけで登録できる（架電数等は空のまま登録し、稼働後にShiftFormや
 * 稼働記録の編集で追記する想定）。
 */
export default function ShiftScheduleCalendar({
  shifts,
  isSupervisor,
}: {
  shifts: CallShiftRow[];
  isSupervisor: boolean;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonthStr());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [onBehalfOfName, setOnBehalfOfName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, monthNum] = month.split("-").map(Number);
  const calendar = useMemo(() => computeMonthlyShiftCalendar(shifts, year, monthNum), [shifts, year, monthNum]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/call-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          startTime,
          endTime,
          calls: "",
          apo: "",
          receptionNg: "",
          keymanConnected: "",
          notes: "シフト予定",
          onBehalfOfName: (isSupervisor ? onBehalfOfName.trim() : "") || getActingAsName() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録に失敗しました");
      setSaved(true);
      setStartTime("");
      setEndTime("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground/60">
        日付をクリックしてから、開始・終了時刻を入れて登録してください。架電数などの実績は空のまま登録され、稼働後に稼働記録から追記できます。
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
        >
          ◀
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
        >
          ▶
        </button>
      </div>

      <ShiftCalendarGrid year={year} month={monthNum} calendar={calendar} onDayClick={setSelectedDate} selectedDate={selectedDate} />

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="mb-3 font-bold">{selectedDate} にシフト予定を追加</h3>
        {isSupervisor && (
          <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium">
            対象者名（未入力なら自分の予定として登録）
            <input
              value={onBehalfOfName}
              onChange={(e) => setOnBehalfOfName(e.target.value)}
              placeholder="例: 磯崎（バイトメンバーの代理入力）"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            日付
            <input
              type="date"
              required
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            開始時刻
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            終了時刻
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "登録中..." : "予定を追加する"}
          </button>
          {saved && <span className="text-xs text-emerald-600">登録しました</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
    </div>
  );
}
