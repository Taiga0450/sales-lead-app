"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const yen = (v: number) => `¥${Math.round(v).toLocaleString()}`;

export interface HalfSales {
  half: "上半期" | "下半期";
  rangeLabel: string;
  target: number;
  /** HubSpotの関東の受注金額（契約締結日がこの半期に入る成約取引の月額利用料の合計） */
  actual: number;
  wonCount: number;
  /** HubSpotから取得できなかった場合のメッセージ */
  error?: string | null;
}

/**
 * ホームの「売上の進捗（関東）」。実績はHubSpotの関東の受注金額を自動集計し（売上画面と同じ計算）、
 * 上半期/下半期を切り替えて目標・実績・残り・達成率を見る。目標は管理者のみ入力できる。
 */
export default function SalesProgressCard({
  fiscalYear,
  halves,
  currentHalf,
  canEdit,
}: {
  fiscalYear: number;
  halves: HalfSales[];
  currentHalf: "上半期" | "下半期";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentHalf);
  const h = halves.find((x) => x.half === selected) ?? halves[0];
  const [editing, setEditing] = useState(false);
  const [targetDraft, setTargetDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratio = h.target > 0 ? h.actual / h.target : null;
  const remaining = h.target > 0 ? h.target - h.actual : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: String(fiscalYear),
          periodLabel: h.half,
          targets: [{ region: "関東", targetAmount: targetDraft }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">売上の進捗（関東）</h2>
          <p className="text-sm text-foreground/50">
            {fiscalYear}年度{h.half}
            <span className="ml-1.5 rounded-md bg-foreground/5 px-1.5 py-0.5 text-xs">{h.rangeLabel}</span>
            {h.half === currentHalf && <span className="ml-1.5 text-xs font-semibold text-brand">今期</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1 shadow-sm">
            {halves.map((x) => (
              <button
                key={x.half}
                type="button"
                onClick={() => {
                  setSelected(x.half);
                  setEditing(false);
                }}
                className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${
                  selected === x.half ? "bg-brand text-white shadow" : "text-foreground/50 hover:text-foreground"
                }`}
              >
                {x.half}
              </button>
            ))}
          </div>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => {
                setTargetDraft(h.target ? String(h.target) : "");
                setError(null);
                setEditing(true);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground/70 hover:bg-brand-light"
            >
              {h.target > 0 ? "目標を変更" : "目標を設定"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-background/60 p-4">
          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            {fiscalYear}年度{h.half}の関東の目標
            <span className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                placeholder="0"
                className="w-48 rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
              />
              <span>円</span>
            </span>
          </label>
          <div className="ml-auto flex items-center gap-3">
            {error && <span className="text-xs text-rose-600">{error}</span>}
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-foreground/50 hover:text-foreground">
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {h.error ? (
        <p className="text-sm text-amber-700">売上の実績をHubSpotから読み込めませんでした（{h.error}）</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-foreground/50">目標</p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{h.target > 0 ? yen(h.target) : "未設定"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/50">実績（自動）</p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-brand">{yen(h.actual)}</p>
              <p className="text-[11px] text-foreground/40">受注 {h.wonCount}件</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/50">残り</p>
              <p
                className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${
                  remaining !== null && remaining <= 0 ? "text-emerald-600" : "text-foreground"
                }`}
              >
                {remaining === null ? "—" : remaining <= 0 ? "達成" : yen(remaining)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/50">達成率</p>
              <p className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${ratio !== null && ratio >= 1 ? "text-emerald-600" : ""}`}>
                {ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`}
              </p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-border/70">
            <div
              className={`h-full rounded-full ${ratio !== null && ratio >= 1 ? "bg-emerald-500" : "bg-brand"}`}
              style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%`, transition: "width 700ms ease-out" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-foreground/40">
            実績はHubSpotで成約（Closed Won）した関東（森・富田）の取引の月額利用料の合計です。契約締結日（未入力なら成約日）で上半期・下半期に振り分けています。
          </p>
        </>
      )}
    </section>
  );
}
