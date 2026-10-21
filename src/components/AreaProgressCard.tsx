"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanOwner, PlanProgress } from "@/lib/callPlans";

const PREFS = ["東京都", "神奈川県", "千葉県", "埼玉県", "大阪府", "兵庫県"];

interface DraftPlan {
  owner: PlanOwner;
  pref: string;
  city: string;
  target: string;
  note: string;
}

function ProgressBar({ value, target }: { value: number; target: number }) {
  const ratio = target > 0 ? value / target : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border/70">
      <div
        className={`h-full rounded-full ${ratio >= 1 ? "bg-emerald-500" : "bg-brand"}`}
        style={{ width: `${Math.min(100, ratio * 100)}%`, transition: "width 600ms ease-out" }}
      />
    </div>
  );
}

function PlanGroup({ title, tone, rows }: { title: string; tone: string; rows: PlanProgress[] }) {
  const total = rows.reduce((a, r) => ({ called: a.called + r.called, target: a.target + r.target, apo: a.apo + r.apo }), {
    called: 0,
    target: 0,
    apo: 0,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{title}</span>
        <span className="text-xs text-foreground/50">
          <span className="text-lg font-bold text-foreground">{total.called}</span> / {total.target}件
          {total.apo > 0 && <span className="ml-2 font-semibold text-emerald-600">アポ {total.apo}</span>}
        </span>
      </div>
      <ProgressBar value={total.called} target={total.target} />
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-sm">
              <span className="text-foreground/50">{r.pref}</span> {r.city}
              {r.note && <span className="ml-1.5 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] text-foreground/50">{r.note}</span>}
            </span>
            <span className="text-right text-xs tabular-nums text-foreground/60">
              <span className="font-semibold text-foreground">{r.called}</span>/{r.target}
              {r.apo > 0 && <span className="ml-1.5 text-emerald-600">アポ{r.apo}</span>}
            </span>
            <div className="col-span-2">
              <ProgressBar value={r.called} target={r.target} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 月の架電計画に対する進み具合（IS・委託を分けて表示）。管理者は計画をここで編集できる。
 * 実績は「その月に架電日が入った医療機関の数」（架電者がmovementなら委託、それ以外はIS）。
 */
export default function AreaProgressCard({
  month,
  monthLabel,
  progress,
  canEdit,
}: {
  month: string;
  monthLabel: string;
  progress: PlanProgress[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRows = progress.filter((p) => p.owner === "IS");
  const outsourceRows = progress.filter((p) => p.owner === "movement");

  function startEdit() {
    setDrafts(progress.map((p) => ({ owner: p.owner, pref: p.pref, city: p.city, target: String(p.target), note: p.note })));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/call-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, plans: drafts.map((d) => ({ ...d, target: Number(d.target) || 0 })) }),
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

  const update = (i: number, patch: Partial<DraftPlan>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">エリア別の進み具合</h2>
          <p className="text-sm text-foreground/50">{monthLabel}の架電計画に対して、架電した医療機関の数</p>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground/70 hover:bg-brand-light"
          >
            計画を編集
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={d.owner}
                onChange={(e) => update(i, { owner: e.target.value as PlanOwner })}
                className="rounded-md border border-border px-2 py-1 text-sm"
              >
                <option value="IS">IS</option>
                <option value="movement">movement 様</option>
              </select>
              <select value={d.pref} onChange={(e) => update(i, { pref: e.target.value })} className="rounded-md border border-border px-2 py-1 text-sm">
                {PREFS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <input
                value={d.city}
                onChange={(e) => update(i, { city: e.target.value })}
                placeholder="市区（空欄なら県全体）"
                className="w-44 rounded-md border border-border px-2 py-1 text-sm"
              />
              <input
                type="number"
                min="0"
                value={d.target}
                onChange={(e) => update(i, { target: e.target.value })}
                className="w-20 rounded-md border border-border px-2 py-1 text-sm"
              />
              <span className="text-xs text-foreground/40">件</span>
              <input
                value={d.note}
                onChange={(e) => update(i, { note: e.target.value })}
                placeholder="メモ（例: 再架電）"
                className="w-36 rounded-md border border-border px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}
                className="text-xs text-foreground/40 hover:text-rose-500"
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDrafts((x) => [...x, { owner: "IS", pref: "東京都", city: "", target: "0", note: "" }])}
            className="self-start rounded-md border border-dashed border-border px-3 py-1 text-sm text-foreground/60 hover:bg-brand-light"
          >
            ＋ 行を追加
          </button>
          <div className="mt-2 flex items-center justify-end gap-3">
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
              {saving ? "保存中..." : "計画を保存"}
            </button>
          </div>
        </div>
      ) : progress.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground/40">
          {monthLabel}の架電計画はまだありません{canEdit ? "（「計画を編集」から追加できます）" : ""}
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
          {isRows.length > 0 && <PlanGroup title="IS（社内）" tone="bg-brand-light text-brand" rows={isRows} />}
          {outsourceRows.length > 0 && (
            <div className="md:border-l md:border-border md:pl-6">
              <PlanGroup title="movement 様（委託）" tone="bg-amber-100 text-amber-700" rows={outsourceRows} />
              <p className="mt-3 text-[11px] text-foreground/40">委託分は、架電結果をアプリに入力した時点で進みます</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
