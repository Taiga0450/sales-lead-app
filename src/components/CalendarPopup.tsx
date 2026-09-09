"use client";

import { useState } from "react";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 月カレンダーのポップアップ。日付を1つ選ぶための最小限のUI
 * （前月/次月の送り、当日・選択日のハイライト）。
 */
export default function CalendarPopup({
  value,
  onSelect,
  onClose,
}: {
  /** "YYYY-MM-DD" 形式の現在選択されている日付。 */
  value: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
}) {
  const selected = new Date(`${value}T00:00:00`);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth()); // 0-11

  const todayStr = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=日
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: Array<{ y: number; m: number; d: number; inMonth: boolean }> = [];
  for (let i = 0; i < startOffset; i++) {
    const d = daysInPrevMonth - startOffset + 1 + i;
    const prev = new Date(viewYear, viewMonth - 1, 1);
    cells.push({ y: prev.getFullYear(), m: prev.getMonth(), d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: viewYear, m: viewMonth, d, inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const next = new Date(last.y, last.m, last.d + 1);
    cells.push({ y: next.getFullYear(), m: next.getMonth(), d: next.getDate(), inMonth: false });
    if (cells.length >= 42) break;
  }

  return (
    <div className="absolute z-30 mt-2 w-72 rounded-2xl border border-border bg-surface p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-light/40 px-2 py-1.5">
        <span className="font-semibold text-foreground/80">
          {viewYear}/{viewMonth + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 hover:bg-brand-light hover:text-brand"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 hover:bg-brand-light hover:text-brand"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={onClose}
            title="閉じる"
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/40 hover:bg-zinc-100"
          >
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-brand" : "text-foreground/50"}>
            {w}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dateStr = toDateStr(cell.y, cell.m, cell.d);
          const isSelected = dateStr === value;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs transition ${
                !cell.inMonth
                  ? "text-foreground/25 hover:bg-zinc-50"
                  : isSelected
                    ? "bg-brand font-semibold text-white"
                    : isToday
                      ? "ring-1 ring-brand text-brand font-semibold"
                      : "text-foreground/80 hover:bg-brand-light"
              }`}
            >
              {cell.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
