"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const yen = (v: number) => `¥${Math.round(v).toLocaleString()}`;

/**
 * ホームの「売上の進捗（関東）」。売上は半期（上半期/下半期）単位で、目標・実績とも管理者が手入力する。
 * 表示は全員、入力は管理者のみ。参考として、商談報告で「クローズ済み」の見込み売上の合計も小さく出す。
 */
export default function SalesProgressCard({
  fiscalYear,
  half,
  rangeLabel,
  target,
  actual,
  reference,
  canEdit,
}: {
  fiscalYear: number;
  half: "上半期" | "下半期";
  rangeLabel: string;
  target: number;
  /** 未入力ならnull */
  actual: number | null;
  /** 参考値：クローズ済み商談の見込み売上の合計 */
  reference: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [targetDraft, setTargetDraft] = useState(target ? String(target) : "");
  const [actualDraft, setActualDraft] = useState(actual === null ? "" : String(actual));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratio = target > 0 && actual !== null ? actual / target : null;
  const remaining = target > 0 && actual !== null ? target - actual : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: String(fiscalYear),
          periodLabel: half,
          targets: [{ region: "関東", targetAmount: targetDraft, actualAmount: actualDraft }],
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
            {fiscalYear}年度{half}
            <span className="ml-1.5 rounded-md bg-foreground/5 px-1.5 py-0.5 text-xs">{rangeLabel}</span>
          </p>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground/70 hover:bg-brand-light"
          >
            目標・実績を入力
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-background/60 p-4">
          {[
            { label: "目標", value: targetDraft, set: setTargetDraft },
            { label: "実績（確定額）", value: actualDraft, set: setActualDraft },
          ].map((f) => (
            <label key={f.label} className="flex flex-col gap-1 text-xs text-foreground/50">
              {f.label}
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder="0"
                  className="w-44 rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
                />
                <span>円</span>
              </span>
            </label>
          ))}
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
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-foreground/50">目標</p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{target > 0 ? yen(target) : "未設定"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/50">実績</p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-brand">{actual === null ? "未入力" : yen(actual)}</p>
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
            参考：商談報告で「クローズ済み」の見込み売上の合計 {yen(reference)}
            {target === 0 && canEdit && "　／　「目標・実績を入力」から今期の目標を設定してください"}
          </p>
        </>
      )}
    </section>
  );
}
