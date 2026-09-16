"use client";

import type { ShiftCalendarEntry } from "@/lib/callStats";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 稼働者が多くなっても見分けやすいよう、識別キーのハッシュで色を固定割り当てする
// （担当者マスタを別途持たずに、あくまで表示上の色分けとして使う）。
const COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function colorFor(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** カレンダーの先頭マス（月初が何曜日か）を埋めるための空白日数を返す。 */
function leadingBlanks(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function ShiftCalendarGrid({
  year,
  month,
  calendar,
  onDayClick,
  selectedDate,
}: {
  year: number;
  month: number;
  calendar: Record<string, ShiftCalendarEntry[]>;
  /** 指定すると各日付マスがクリック可能になる（シフト予定の追加用）。 */
  onDayClick?: (dateStr: string) => void;
  selectedDate?: string;
}) {
  const blanks = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="grid grid-cols-7 border-b border-border bg-brand-light/40 text-center text-xs font-semibold text-foreground/50">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[92px] border-b border-r border-border bg-zinc-50/40 last:border-r-0" />;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entries = calendar[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <div
              key={i}
              onClick={onDayClick ? () => onDayClick(dateStr) : undefined}
              className={`min-h-[92px] border-b border-r border-border p-1.5 last:border-r-0 ${isToday ? "bg-brand-light/30" : ""} ${
                onDayClick ? "cursor-pointer hover:bg-brand-light/50" : ""
              } ${isSelected ? "ring-2 ring-inset ring-brand" : ""}`}
            >
              <span className={`text-xs ${isToday ? "font-bold text-brand" : "text-foreground/50"}`}>{day}</span>
              <div className="mt-1 flex flex-col gap-0.5">
                {entries.map((e, idx) => (
                  <div
                    key={idx}
                    title={`${e.name}: ${e.startTime}〜${e.endTime}（${e.hours.toFixed(1)}h）`}
                    className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${colorFor(e.identity)}`}
                  >
                    {e.name} {e.hours.toFixed(1)}h
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
