"use client";

import { useState } from "react";
import type { QuarterlyCallerSummary } from "@/lib/callStats";
import { fiscalQuarterLabel } from "@/lib/callStats";

const QUARTERS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

function hours(v: number): string {
  return `${v.toFixed(1)}h`;
}

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

/**
 * 稼働時間・架電数・アポ獲得数を、選択した会計年度×四半期のカードでグリッド表示する。
 * Salesforceのダッシュボードのような「複数カードをグリッド配置」を参考にした見た目。
 * 年度は選択式（チップボタン）にして、一度に表示される情報量を絞る。
 */
export default function QuarterlyCallDashboard({
  summary,
  fiscalYears,
  names = {},
}: {
  summary: QuarterlyCallerSummary[];
  fiscalYears: number[];
  names?: Record<string, string>;
}) {
  const [selectedYear, setSelectedYear] = useState(fiscalYears[0]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {fiscalYears.map((fiscalYear) => (
          <button
            key={fiscalYear}
            type="button"
            onClick={() => setSelectedYear(fiscalYear)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              fiscalYear === selectedYear ? "bg-brand text-white" : "border border-border text-foreground/60 hover:bg-brand-light"
            }`}
          >
            {fiscalYear}年度
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {QUARTERS.map((quarter) => {
          const rows = summary.filter((s) => s.fiscalYear === selectedYear && s.quarter === quarter);
          const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0);
          const totalApo = rows.reduce((sum, r) => sum + r.apo, 0);
          const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
          const totalReceptionNg = rows.reduce((sum, r) => sum + r.receptionNg, 0);
          const totalKeymanConnected = rows.reduce((sum, r) => sum + r.keymanConnected, 0);
          const byPerson = [...rows].sort((a, b) => b.hours - a.hours);

          return (
            <div key={quarter} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-foreground/70">
                {fiscalQuarterLabel({ fiscalYear: selectedYear, quarter })}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-brand">{totalCalls}</p>
                  <p className="text-[11px] text-foreground/50">架電数</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">{totalApo}</p>
                  <p className="text-[11px] text-foreground/50">アポ獲得</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{hours(totalHours)}</p>
                  <p className="text-[11px] text-foreground/50">稼働時間</p>
                </div>
              </div>
              {rows.length > 0 && (
                <div className="mt-2 flex justify-center gap-3 text-[11px] text-foreground/40">
                  <span>アポ率 {pct(totalApo, totalCalls)}</span>
                  <span>受付NG率 {pct(totalReceptionNg, totalCalls)}</span>
                  <span>接続率 {pct(totalKeymanConnected, totalCalls)}</span>
                </div>
              )}
              {byPerson.length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
                  {byPerson.map((p) => (
                    <div key={p.email} className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground/60">{names[p.email] ?? p.email.split("@")[0]}</span>
                      <span className="shrink-0 text-foreground/70">
                        {hours(p.hours)} ・ {p.calls}件 ・ {p.apo}アポ ({pct(p.apo, p.calls)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {rows.length === 0 && (
                <p className="mt-4 border-t border-border pt-3 text-center text-xs text-foreground/40">データなし</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
