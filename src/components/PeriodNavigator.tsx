"use client";

import { useState } from "react";
import CalendarPopup from "./CalendarPopup";

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function formatMD(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 開始日・終了日をそれぞれ個別にカレンダーで選べる期間ナビゲーター。◀/▶は、今選んでいる
 * 期間の長さ（日数）をそのまま維持して前後にずらす（例: 1週間分を選んでいれば1週間ずつ送る）。
 */
export default function PeriodNavigator({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: { start: string; end: string }) => void;
}) {
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null);
  const spanDays = daysBetween(startDate, endDate) + 1;

  function shiftRange(direction: 1 | -1) {
    onChange({
      start: shiftDate(startDate, direction * spanDays),
      end: shiftDate(endDate, direction * spanDays),
    });
  }

  function selectStart(d: string) {
    onChange({ start: d, end: d > endDate ? d : endDate });
    setOpenPicker(null);
  }

  function selectEnd(d: string) {
    onChange({ start: d < startDate ? d : startDate, end: d });
    setOpenPicker(null);
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <button
        type="button"
        onClick={() => shiftRange(-1)}
        title="前の期間"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
      >
        ◀
      </button>

      <div className="relative flex items-center gap-2">
        <span className="text-xs font-medium text-foreground/40">開始日</span>
        <button
          type="button"
          onClick={() => setOpenPicker((v) => (v === "start" ? null : "start"))}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-brand-light"
        >
          {formatMD(startDate)} <span className="text-xs">📅</span>
        </button>
        {openPicker === "start" && (
          <div className="absolute left-0 top-full z-30 mt-2">
            <CalendarPopup value={startDate} onSelect={selectStart} onClose={() => setOpenPicker(null)} />
          </div>
        )}
      </div>

      <span className="text-foreground/40">〜</span>

      <div className="relative flex items-center gap-2">
        <span className="text-xs font-medium text-foreground/40">終了日</span>
        <button
          type="button"
          onClick={() => setOpenPicker((v) => (v === "end" ? null : "end"))}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-brand-light"
        >
          {formatMD(endDate)} <span className="text-xs">📅</span>
        </button>
        {openPicker === "end" && (
          <div className="absolute left-0 top-full z-30 mt-2">
            <CalendarPopup value={endDate} onSelect={selectEnd} onClose={() => setOpenPicker(null)} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => shiftRange(1)}
        title="次の期間"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
      >
        ▶
      </button>
    </div>
  );
}
