"use client";

import { useState } from "react";
import DealTaskForm from "./DealTaskForm";
import type { UpsellListItem as Candidate, UpsellListSummary as PreviewResult } from "@/lib/upsell";

interface SyncResult {
  totalCount: number;
  renewalCount: number;
  missingDatesCount: number;
  syncedAt: string;
}

async function postUpsell<T>(mode: "preview" | "commit"): Promise<T> {
  const res = await fetch("/api/admin/upsell-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
  return data as T;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

/** 架電日（UTCのISO）を「9/24」の形に（日本時間）。 */
function shortJstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function CalledCheckbox({
  candidate: c,
  onChange,
}: {
  candidate: Candidate;
  onChange: (dealId: string, calledAt: string, calledBy: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const called = !!c.calledAt;

  async function toggle() {
    const next = !called;
    if (!next && !window.confirm(`「${c.dealname}」の架電済みを取り消します（HubSpotのコール記録もアーカイブします）。よろしいですか？`)) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/upsell-extract/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: c.id, dealname: c.dealname, called: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      onChange(c.id, data.call?.calledAt ?? "", data.call?.calledBy ?? "");
      if (data.warning) window.alert(data.warning);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex w-20 shrink-0 cursor-pointer items-center gap-1.5 pl-4 text-xs text-foreground/60">
      <input type="checkbox" checked={called} disabled={saving} onChange={() => void toggle()} />
      {saving ? "保存中" : called ? shortJstDate(c.calledAt) : "未架電"}
    </label>
  );
}

function CandidateRow({
  candidate: c,
  owners,
  onCalledChange,
}: {
  candidate: Candidate;
  owners: Array<{ ownerId: string; name: string }>;
  onCalledChange: (dealId: string, calledAt: string, calledBy: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-t border-border first:border-t-0 ${c.renewalWindow ? "bg-amber-50/60" : ""}`}>
      <div className="flex items-center">
        <CalledCheckbox candidate={c} onChange={onCalledChange} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-3 py-2.5 pl-2 pr-4 text-left hover:bg-brand-light/20 md:grid-cols-[minmax(0,1fr)_4rem_8rem_6rem_6rem_1.5rem]"
        >
          <span className="truncate text-sm font-medium">
            {c.renewalWindow && (
              <span className="mr-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">更新2ヶ月以内</span>
            )}
            {c.dealname}
          </span>
          <span className="hidden text-xs text-foreground/60 md:block">{c.ownerName || "—"}</span>
          <span className="hidden text-xs text-foreground/60 md:block">{c.phone || "—"}</span>
          <span className="hidden text-xs text-foreground/60 md:block">{c.contractEndDate || "—"}</span>
          <span className="hidden text-xs text-foreground/60 md:block">
            {c.daysLeft === null ? "" : c.daysLeft < 0 ? "終了済み" : `残り${c.daysLeft}日`}
          </span>
          <span className="text-foreground/30">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <DetailItem
              label="電話番号"
              value={
                c.phone && (
                  <a href={`tel:${c.phone}`} className="text-brand hover:underline">
                    {c.phone}
                  </a>
                )
              }
            />
            <DetailItem label="担当者" value={c.ownerName} />
            <DetailItem label="架電済み" value={c.calledAt ? `${shortJstDate(c.calledAt)}（${c.calledBy}）` : ""} />
            <DetailItem
              label="契約期間"
              value={c.contractStartDate || c.contractEndDate ? `${c.contractStartDate || "?"} 〜 ${c.contractEndDate || "?"}` : ""}
            />
            <DetailItem label="受電対応時間" value={c.receptionHours} />
            <DetailItem label="契約書_送付先担当者" value={c.contractManager} />
            <DetailItem label="契約書_送付先メールアドレス" value={c.contractEmail} />
            <DetailItem label="契約メモ" value={c.contractNotes} />
            <DetailItem
              label="HubSpot"
              value={
                <a href={c.dealUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  取引を開く（{c.stageLabel}）
                </a>
              }
            />
          </div>
          <DealTaskForm dealId={c.id} owners={owners} defaultOwnerName={c.ownerName} />
        </div>
      )}
    </div>
  );
}

export default function UpsellBoard({
  owners,
  initial,
  initialError,
}: {
  owners: Array<{ ownerId: string; name: string }>;
  initial: PreviewResult | null;
  initialError: string | null;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [renewalOnly, setRenewalOnly] = useState(false);
  const [uncalledOnly, setUncalledOnly] = useState(false);

  function handleCalledChange(dealId: string, calledAt: string, calledBy: string) {
    setPreview((prev) => {
      if (!prev) return prev;
      const candidates = prev.candidates.map((c) => (c.id === dealId ? { ...c, calledAt, calledBy } : c));
      return { ...prev, candidates, calledCount: candidates.filter((c) => c.calledAt).length };
    });
  }
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPreview(await postUpsell<PreviewResult>("preview"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function runSync() {
    const ok = window.confirm(
      "HubSpotの最新内容で「アップセル」タブを丸ごと差し替えます（タブ上で手入力した内容は消えます）。よろしいですか？",
    );
    if (!ok) return;
    setSyncing(true);
    setError(null);
    try {
      setResult(await postUpsell<SyncResult>("commit"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  }

  const q = query.trim();
  const visible = (preview?.candidates ?? []).filter(
    (c) =>
      (!renewalOnly || c.renewalWindow) &&
      (!uncalledOnly || !c.calledAt) &&
      (!q || c.dealname.includes(q) || c.phone.includes(q)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">アップセル</h1>
        <p className="mt-1 text-sm text-foreground/60">
          HubSpotで契約済み（Closed Won・CS引き継ぎ完了）の全医療機関です。医療機関を開くと契約院情報の確認と、HubSpotの取引へのタスク（アクティビティ）の記録ができます。スプレッドシートの「アップセル」タブは定期的にHubSpotの最新内容へ同期されます。
        </p>
      </div>

      {preview && (
        <div className="grid grid-cols-2 gap-4 rounded-2xl md:grid-cols-4 border border-border bg-surface p-5 shadow-sm">
          <div>
            <p className="text-xs text-foreground/50">契約医療機関 総数</p>
            <p className="text-lg font-bold">{preview.totalCount}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">契約終了2ヶ月以内</p>
            <p className="text-lg font-bold text-amber-600">{preview.renewalCount}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">契約開始日・終了日が未入力</p>
            <p className="text-lg font-bold text-foreground/40">{preview.missingDatesCount}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">架電済み</p>
            <p className="text-lg font-bold text-emerald-600">{preview.calledCount}件</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="医療機関名・電話番号で検索"
          className="min-w-56 flex-1 rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <label className="flex items-center gap-2 text-sm text-foreground/70">
          <input type="checkbox" checked={renewalOnly} onChange={(e) => setRenewalOnly(e.target.checked)} />
          契約終了2ヶ月以内のみ
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/70">
          <input type="checkbox" checked={uncalledOnly} onChange={(e) => setUncalledOnly(e.target.checked)} />
          未架電のみ
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/70 hover:bg-brand-light disabled:opacity-50"
        >
          {loading ? "読み込み中..." : "再読み込み"}
        </button>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {syncing ? "同期中..." : "「アップセル」タブを今すぐ同期"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          同期しました（{result.syncedAt}）。契約医療機関{result.totalCount}件（うち更新2ヶ月以内{result.renewalCount}件、契約日未入力
          {result.missingDatesCount}件）を「アップセル」タブに反映しました。
        </p>
      )}

      {preview && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="hidden grid-cols-[4rem_minmax(0,1fr)_4rem_8rem_6rem_6rem_1.5rem] gap-3 border-b border-border px-4 py-2 text-xs text-foreground/50 md:grid">
            <span>架電済み</span>
            <span>医療機関名（{visible.length}件）</span>
            <span>担当者</span>
            <span>電話番号</span>
            <span>契約終了日</span>
            <span />
            <span />
          </div>
          {visible.map((c) => (
            <CandidateRow key={c.id} candidate={c} owners={owners} onCalledChange={handleCalledChange} />
          ))}
          {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-foreground/50">該当する医療機関はありません</p>}
        </div>
      )}
    </div>
  );
}
