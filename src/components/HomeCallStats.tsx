"use client";

import { useState } from "react";
import type { PeriodSummary, PersonRow } from "@/lib/homeStats";

type Kind = "month" | "quarter";

function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** 前の期間との差。増えたら緑の↑、減ったら赤の↓。 */
function Delta({ now, prev, unit = "", digits = 0 }: { now: number; prev: number; unit?: string; digits?: number }) {
  const diff = now - prev;
  if (Math.abs(diff) < 10 ** -digits / 2) return <span className="text-xs text-foreground/40">±0{unit}</span>;
  const up = diff > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(diff).toFixed(digits)}
      {unit}
    </span>
  );
}

function Kpi({
  label,
  value,
  unit,
  prev,
  prevLabel,
  digits = 0,
  accent,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  prev: number;
  prevLabel: string;
  digits?: number;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm" title={hint}>
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${accent ?? "text-foreground"}`}>
        {value.toFixed(digits)}
        <span className="ml-0.5 text-base font-semibold text-foreground/50">{unit}</span>
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground/40">
        {prevLabel} <Delta now={value} prev={prev} unit={unit} digits={digits} />
      </p>
    </div>
  );
}

function PeopleTable({ people }: { people: PersonRow[] }) {
  const groups: { type: PersonRow["type"]; rows: PersonRow[] }[] = [
    { type: "バイト", rows: people.filter((p) => p.type === "バイト") },
    { type: "社員", rows: people.filter((p) => p.type === "社員") },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-foreground/50">
            <th className="py-2 text-left font-medium">担当者</th>
            <th className="py-2 text-right font-medium">稼働時間</th>
            <th className="py-2 text-right font-medium">架電数</th>
            <th className="py-2 text-right font-medium">1時間あたり</th>
            <th className="py-2 text-right font-medium">架電した医療機関</th>
            <th className="py-2 text-right font-medium">アポ獲得</th>
            <th className="py-2 text-right font-medium">アポ率</th>
          </tr>
        </thead>
        {groups
          .filter((g) => g.rows.length > 0)
          .map((g) => {
            const sum = g.rows.reduce(
              (a, p) => ({ hours: a.hours + p.hours, calls: a.calls + p.calls, leads: a.leads + p.calledLeads, apo: a.apo + p.apo }),
              { hours: 0, calls: 0, leads: 0, apo: 0 },
            );
            return (
              <tbody key={g.type}>
                <tr>
                  <td colSpan={7} className="pt-3 pb-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        g.type === "バイト" ? "bg-brand-light text-brand" : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {g.type}
                    </span>
                  </td>
                </tr>
                {g.rows.map((p) => (
                  <tr key={p.name} className="border-b border-border/60">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right tabular-nums">{p.hours.toFixed(1)}h</td>
                    <td className="py-2 text-right tabular-nums">{p.calls}</td>
                    <td className="py-2 text-right tabular-nums text-foreground/60">
                      {p.hours > 0 ? `${(p.calls / p.hours).toFixed(1)}件` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.calledLeads}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-emerald-600">{p.apo}</td>
                    <td className="py-2 text-right tabular-nums">{fmtPct(rate(p.apo, p.calledLeads))}</td>
                  </tr>
                ))}
                <tr className="text-foreground/60">
                  <td className="py-2 text-xs font-semibold">{g.type} 計</td>
                  <td className="py-2 text-right text-xs tabular-nums">{sum.hours.toFixed(1)}h</td>
                  <td className="py-2 text-right text-xs tabular-nums">{sum.calls}</td>
                  <td className="py-2 text-right text-xs tabular-nums">
                    {sum.hours > 0 ? `${(sum.calls / sum.hours).toFixed(1)}件` : "—"}
                  </td>
                  <td className="py-2 text-right text-xs tabular-nums">{sum.leads}</td>
                  <td className="py-2 text-right text-xs font-semibold tabular-nums">{sum.apo}</td>
                  <td className="py-2 text-right text-xs tabular-nums">{fmtPct(rate(sum.apo, sum.leads))}</td>
                </tr>
              </tbody>
            );
          })}
      </table>
    </div>
  );
}

/**
 * ホームの「架電状況」。今月／四半期を切り替え、前の期間との差（↑↓）を出す。
 * 架電数・稼働時間は稼働報告、架電した医療機関・アポ獲得はリード一覧（架電日・商談獲得）から集計済みのものを受け取る。
 */
export default function HomeCallStats({
  data,
}: {
  data: Record<Kind, { current: PeriodSummary; previous: PeriodSummary }>;
}) {
  const [kind, setKind] = useState<Kind>("month");
  const { current: c, previous: p } = data[kind];
  const prevLabel = kind === "month" ? "先月比" : "前四半期比";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">架電状況</h2>
          <p className="text-sm text-foreground/50">
            {c.period.label}
            <span className="ml-1.5 rounded-md bg-foreground/5 px-1.5 py-0.5 text-xs">{c.period.rangeLabel}</span>
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1 shadow-sm">
          {(["month", "quarter"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                kind === k ? "bg-brand text-white shadow" : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {k === "month" ? "今月" : "四半期"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="架電数" value={c.calls} unit="件" prev={p.calls} prevLabel={prevLabel} accent="text-brand" hint="稼働報告の架電数の合計" />
        <Kpi
          label="架電した医療機関"
          value={c.calledLeads}
          unit="件"
          prev={p.calledLeads}
          prevLabel={prevLabel}
          hint="リード一覧で、この期間に架電日がある医療機関（委託分を除く）"
        />
        <Kpi
          label="アポ獲得"
          value={c.apo}
          unit="件"
          prev={p.apo}
          prevLabel={prevLabel}
          accent="text-emerald-600"
          hint="この期間に架電日があり、フェーズが「商談獲得」の医療機関"
        />
        <Kpi label="稼働時間" value={c.hours} unit="h" prev={p.hours} prevLabel={prevLabel} digits={1} hint="稼働報告の開始〜終了時刻の合計" />
        <div className="col-span-2 rounded-2xl border border-border bg-surface p-4 shadow-sm md:col-span-1">
          <p className="text-xs font-medium text-foreground/50">率</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-foreground/50">アポ率</dt>
            <dd className="text-right font-bold text-emerald-600">{fmtPct(rate(c.apo, c.calledLeads))}</dd>
            <dt className="text-foreground/50">受付NG</dt>
            <dd className="text-right font-semibold">{fmtPct(rate(c.receptionNg, c.calledLeads))}</dd>
            <dt className="text-foreground/50">キーマンNG</dt>
            <dd className="text-right font-semibold">{fmtPct(rate(c.keymanNg, c.calledLeads))}</dd>
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground/70">担当者別</h3>
          <span className="text-[11px] text-foreground/40">率は「架電した医療機関」あたり</span>
        </div>
        {c.people.length > 0 ? (
          <PeopleTable people={c.people} />
        ) : (
          <p className="py-6 text-center text-sm text-foreground/40">この期間の架電記録はまだありません</p>
        )}
      </div>
    </section>
  );
}
