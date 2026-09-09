"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Gauge from "./Gauge";
import BarChart from "./BarChart";
import type { RevenueStats } from "@/lib/hubspot";

interface Period {
  fiscalYear: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  targets: Record<string, number>;
}

interface PeriodWithStats {
  period: Period;
  stats: RevenueStats | null;
}

function yen(v: number): string {
  return `¥${v.toLocaleString()}`;
}

function winRateColor(rate: number): string {
  if (rate >= 0.7) return "#059669";
  if (rate >= 0.4) return "#b45309";
  return "#dc2626";
}

/** 目標が未入力（0円）の期はゲージを出さず「目標未設定」と表示する（0%達成という誤解を避けるため）。 */
function GaugeOrUnset({ value, target, label }: { value: number; target: number; label: string }) {
  if (target <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
        <p className="text-sm font-medium text-foreground/40">目標未設定</p>
        <p className="text-xs text-foreground/30">実績 {yen(value)}</p>
      </div>
    );
  }
  return <Gauge value={value} target={target} label={label} />;
}

function AddYearForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fiscalYear, setFiscalYear] = useState("");
  const [kantoH1, setKantoH1] = useState("0");
  const [osakaH1, setOsakaH1] = useState("0");
  const [kantoH2, setKantoH2] = useState("0");
  const [osakaH2, setOsakaH2] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const year = fiscalYear.trim();
    if (!year || Number.isNaN(Number(year))) {
      setError("年度を数値で入力してください（例: 2028）");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rows = [
        { periodLabel: "上半期", startDate: `${year}-04-01`, endDate: `${year}-09-30`, region: "関東", targetAmount: kantoH1 },
        { periodLabel: "上半期", startDate: `${year}-04-01`, endDate: `${year}-09-30`, region: "大阪", targetAmount: osakaH1 },
        {
          periodLabel: "下半期",
          startDate: `${year}-10-01`,
          endDate: `${Number(year) + 1}-03-31`,
          region: "関東",
          targetAmount: kantoH2,
        },
        {
          periodLabel: "下半期",
          startDate: `${year}-10-01`,
          endDate: `${Number(year) + 1}-03-31`,
          region: "大阪",
          targetAmount: osakaH2,
        },
      ];
      for (const row of rows) {
        const res = await fetch("/api/targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fiscalYear: year, ...row }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "作成に失敗しました");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold">新しい年度を追加</h2>
        <p className="mb-4 text-sm text-foreground/60">上半期(4/1〜9/30)・下半期(10/1〜翌3/31)の枠を作成します。</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            年度
            <input
              required
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              placeholder="例: 2028"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              上半期 関東目標
              <input
                type="number"
                value={kantoH1}
                onChange={(e) => setKantoH1(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              上半期 大阪目標
              <input
                type="number"
                value={osakaH1}
                onChange={(e) => setOsakaH1(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              下半期 関東目標
              <input
                type="number"
                value={kantoH2}
                onChange={(e) => setKantoH2(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              下半期 大阪目標
              <input
                type="number"
                value={osakaH2}
                onChange={(e) => setOsakaH2(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50">
              閉じる
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "作成中..." : "作成する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RevenueDashboard({
  items,
  defaultKey,
}: {
  items: PeriodWithStats[];
  defaultKey: string;
}) {
  const router = useRouter();
  const [defaultYear, defaultLabel] = defaultKey.split("|");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAddYear, setShowAddYear] = useState(false);

  const years = [...new Set(items.map((i) => i.period.fiscalYear))].sort((a, b) =>
    sortDir === "desc" ? (a < b ? 1 : -1) : a < b ? -1 : 1,
  );
  const [selectedYear, setSelectedYear] = useState(years.includes(defaultYear) ? defaultYear : years[0]);

  const periodsInYear = items.filter((i) => i.period.fiscalYear === selectedYear);
  const [selectedLabel, setSelectedLabel] = useState(defaultLabel);

  const selected = periodsInYear.find((i) => i.period.periodLabel === selectedLabel) ?? periodsInYear[0];

  function selectYear(year: string) {
    setSelectedYear(year);
    const stillExists = items.some((i) => i.period.fiscalYear === year && i.period.periodLabel === selectedLabel);
    if (!stillExists) {
      const first = items.find((i) => i.period.fiscalYear === year);
      if (first) setSelectedLabel(first.period.periodLabel);
    }
  }

  const stats = selected?.stats ?? null;
  const targets = selected?.period.targets ?? {};
  const totalTarget = Object.values(targets).reduce((a, b) => a + b, 0);

  const peopleSorted = stats
    ? [...stats.people]
        .map((p) => ({ ...p, rate: p.wonCount + p.lostCount > 0 ? p.wonCount / (p.wonCount + p.lostCount) : 0 }))
        .sort((a, b) => b.wonAmount - a.wonAmount)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => selectYear(year)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                year === selectedYear ? "bg-brand text-white" : "border border-border text-foreground/60 hover:bg-brand-light"
              }`}
            >
              {year}年度
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "古い年度順" : "新しい年度順"}
            className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-foreground/50 hover:bg-brand-light"
          >
            {sortDir === "asc" ? "昇順" : "降順"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowAddYear(true)}
          className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-foreground/50 hover:bg-brand-light"
        >
          + 年度を追加
        </button>
      </div>

      {showAddYear && (
        <AddYearForm onClose={() => setShowAddYear(false)} onCreated={() => router.refresh()} />
      )}

      <div className="flex gap-1 border-b border-border">
        {periodsInYear.map(({ period }) => (
          <button
            key={period.periodLabel}
            type="button"
            onClick={() => setSelectedLabel(period.periodLabel)}
            className={`px-4 py-2 text-sm font-medium transition ${
              period.periodLabel === selectedLabel
                ? "border-b-2 border-brand text-brand"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            {period.periodLabel}
          </button>
        ))}
      </div>

      {periodsInYear.length > 1 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground/70">{selectedYear}年度 期別 受注金額</h3>
          <BarChart
            data={periodsInYear.map((i) => ({
              label: i.period.periodLabel,
              value: i.stats?.grandTotal.wonAmount ?? 0,
              tone: i.period.periodLabel === selectedLabel ? "brand" : "muted",
            }))}
            valueFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`}
            height={120}
          />
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {selected.period.fiscalYear}年度 {selected.period.periodLabel}
              <span className="ml-2 text-sm font-normal text-foreground/40">
                {selected.period.startDate} 〜 {selected.period.endDate}
              </span>
            </h2>
          </div>

          {!stats ? (
            <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground/40 shadow-sm">
              HubSpotからのデータ取得に失敗しました。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-5">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <h3 className="mb-1 text-sm font-bold text-foreground/70">関東 達成率</h3>
                  <GaugeOrUnset value={stats.regionTotals["関東"].wonAmount} target={targets["関東"] ?? 0} label="対目標" />
                </div>
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <h3 className="mb-1 text-sm font-bold text-foreground/70">大阪 達成率</h3>
                  <GaugeOrUnset value={stats.regionTotals["大阪"].wonAmount} target={targets["大阪"] ?? 0} label="対目標" />
                </div>
                <div className="rounded-2xl border border-border bg-brand-light/30 p-5 shadow-sm">
                  <h3 className="mb-1 text-sm font-bold text-foreground/70">合計 達成率</h3>
                  <GaugeOrUnset value={stats.grandTotal.wonAmount} target={totalTarget} label="対目標" />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-foreground/70">個人別 受注金額</h3>
                <BarChart
                  data={peopleSorted.map((p) => ({
                    label: p.name,
                    value: p.wonAmount,
                    tone: p.region === "関東" ? "brand" : "success",
                  }))}
                  valueFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`}
                />
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="border-b border-border bg-brand-light/40 px-5 py-3">
                  <h3 className="font-bold">個人別サマリー</h3>
                </div>
                <div className="grid grid-cols-7 gap-3 border-b border-border px-5 py-2 text-xs font-medium text-foreground/50">
                  <span>担当者</span>
                  <span>地域</span>
                  <span>受注件数</span>
                  <span>受注金額</span>
                  <span>失注件数</span>
                  <span>商談数</span>
                  <span>受注率</span>
                </div>
                {peopleSorted.map((p) => (
                  <div key={p.ownerId} className="grid grid-cols-7 gap-3 border-b border-border px-5 py-2.5 text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-foreground/60">{p.region}</span>
                    <span>{p.wonCount}件</span>
                    <span className="font-semibold text-brand">{yen(p.wonAmount)}</span>
                    <span>{p.lostCount}件</span>
                    <span>{p.wonCount + p.lostCount + p.openCount}件</span>
                    <span className="font-semibold" style={{ color: winRateColor(p.rate) }}>
                      {(p.rate * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-7 gap-3 bg-brand-light/30 px-5 py-2.5 text-sm font-bold">
                  <span className="col-span-2">合計</span>
                  <span>{stats.grandTotal.wonCount}件</span>
                  <span className="text-brand">{yen(stats.grandTotal.wonAmount)}</span>
                  <span>{stats.grandTotal.lostCount}件</span>
                  <span>{stats.grandTotal.wonCount + stats.grandTotal.lostCount + stats.grandTotal.openCount}件</span>
                  <span style={{ color: winRateColor(stats.grandTotal.winRate) }}>
                    {(stats.grandTotal.winRate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
