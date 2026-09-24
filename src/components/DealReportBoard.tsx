"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PieChart from "./PieChart";
import DealStageBar from "./DealStageBar";
import CurrentPeriodStatus from "./CurrentPeriodStatus";
import DealTaskForm from "./DealTaskForm";
import {
  DEAL_STAGES,
  DEAL_OWNERS,
  LOST_STAGE,
  fiscalHalfOf,
  type HearingListItem,
  type HearingCategory,
} from "@/lib/dealHearing";

/**
 * UI用の選択肢はここに直書きする（src/lib/hubspot.ts はHUBSPOT_ACCESS_TOKENを扱うサーバー専用
 * コードなので、"use client" ファイルからは値をimportせず、型だけimportする。leads.tsのコメント参照）。
 */
const CATEGORY_OPTIONS: Array<{ value: HearingCategory; label: string }> = [
  { value: "TC案件", label: "TC" },
  { value: "FD案件", label: "FD" },
  { value: "自院完結", label: "自院" },
  { value: "その他", label: "その他" },
];
const CATEGORY_COLORS: Record<string, string> = {
  TC案件: "var(--brand)",
  FD案件: "#eab308",
  自院完結: "#a1a1aa",
  その他: "#818cf8",
};
const PROBABILITY_OPTIONS = ["A", "B", "C", "D"];
const PROBABILITY_LABELS: Record<string, string> = {
  A: "A（80％以上）",
  B: "B（50％以上）",
  C: "C（40％未満）",
  D: "D（20％未満）",
};
const PLAN_OPTIONS = ["1stcall", "2ndcallチケット", "2ndcallスポット", "callコネクト", "医師会プラン"];
const PRODUCT_OPTIONS = ["ON CALL", "ON CALL connect", "人材紹介", "振り込み代行", "シェアレジ"];

/** 1ページに表示する商談件数。全件を一度に表示すると件数が多いときに見づらいため、ページ送りする。 */
const DEAL_PAGE_SIZE = 30;

/** GET /api/deal-report/search が返すHubSpot Deal検索結果（表示に必要な項目だけ）。 */
interface HubspotSearchResult {
  id: string;
  dealname: string;
  ownerName: string;
  dealStage: string;
}

/** GET /api/deal-report/search が返す、まだ商談化していないHubSpot Company検索結果。 */
interface HubspotCompanyResult {
  id: string;
  name: string;
}

function yen(v: number | null): string {
  if (v === null) return "¥0";
  return `¥${v.toLocaleString()}`;
}

function winRateColor(rate: number): string {
  if (rate >= 0.7) return "#059669";
  if (rate >= 0.4) return "#b45309";
  return "#dc2626";
}


/**
 * シートのみに登録されていてHubSpotの取引をまだ持っていない商談を、今表示中の内容のまま
 * HubSpot上に新規の取引として作成し、以後はその取引と連携させる（タスク追加もできるようになる）。
 */
function LinkHubSpotButton({
  dealId,
  form,
  owners,
  onLinked,
}: {
  dealId: string;
  form: HearingListItem;
  owners: Array<{ ownerId: string; name: string }>;
  onLinked: () => void;
}) {
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!form.dealname.trim()) {
      setError("医療機関名を入力してください");
      return;
    }
    const ownerId = owners.find((o) => form.ownerName && o.name.startsWith(form.ownerName))?.ownerId;
    if (!ownerId) {
      setError("先に取引担当者を選択してください");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      const res = await fetch(`/api/deal-report/${dealId}/link-hubspot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealname: form.dealname.trim(),
          ownerId,
          category: form.category,
          probability: form.probability,
          plan: form.plan,
          product: form.product,
          chart: form.chart,
          chartTranscribed: form.chartTranscribed,
          expectedRevenue: form.expectedRevenue,
          area: form.area,
          firstMeetingDate: form.firstMeetingDate,
          patientsPerMonth: form.patientsPerMonth,
          callsPerMonth: form.callsPerMonth,
          visitsPerMonth: form.visitsPerMonth,
          hearingNotes: form.hearingNotes,
          dealStage: form.dealStage,
          contractDate: form.contractDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "連携に失敗しました");
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "連携に失敗しました");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-border p-4">
      <p className="mb-2 text-xs text-foreground/50">
        この医療機関はHubSpot上の取引とまだ連携されていないため、タスクを追加できません。今表示されている内容でHubSpotに取引を新規作成し、連携できます。
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={linking}
        className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-light disabled:opacity-50"
      >
        {linking ? "連携中..." : "HubSpotに連携する"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * HubSpotの「取引 → アクティビティー → その他 → タスク」と同じ項目で、この商談（Deal）に
 * 紐づくタスクを作成する。折りたたみ式で、「+ タスクを追加」を押すと開く。
 * リマインダー・繰り返し・キューはHubSpot側でも高度な設定のため対象外。
 */
function DealCard({
  deal,
  owners,
  onDeleted,
  onLinked,
}: {
  deal: HearingListItem;
  owners: Array<{ ownerId: string; name: string }>;
  onDeleted: () => void;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(deal);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/deal-report/${form.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: deal.source }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "削除に失敗しました");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  function set<K extends keyof HearingListItem>(key: K, value: HearingListItem[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  /** 契約締結日を入力したら、取引ステージも自動でクローズ済みに進める。空にしたら手動選択に戻す。 */
  function setContractDate(value: string) {
    setForm((f) => ({ ...f, contractDate: value, dealStage: value ? "クローズ済み" : f.dealStage }));
    setSaved(false);
  }

  async function handleSave() {
    if (!form.dealname.trim()) {
      setError("機関名を入力してください");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    const fields: Omit<HearingListItem, "id" | "source"> & { source: HearingListItem["source"] } = {
      source: deal.source,
      dealname: form.dealname.trim(),
      ownerName: form.ownerName,
      category: form.category,
      probability: form.probability,
      plan: form.plan,
      product: form.product,
      chart: form.chart,
      chartTranscribed: form.chartTranscribed,
      expectedRevenue: form.expectedRevenue,
      area: form.area,
      firstMeetingDate: form.firstMeetingDate,
      patientsPerMonth: form.patientsPerMonth,
      callsPerMonth: form.callsPerMonth,
      visitsPerMonth: form.visitsPerMonth,
      hearingNotes: form.hearingNotes,
      dealStage: form.dealStage,
      contractDate: form.contractDate,
    };
    try {
      const res = await fetch(`/api/deal-report/${form.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "更新に失敗しました");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  // クローズ済み（成約）の医療機関は一覧で一目で分かるよう、カード全体を塗りつぶす。
  const isClosed = form.dealStage === "クローズ済み";

  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-sm ${
        isClosed ? "border-emerald-200 bg-emerald-50" : "border-border bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-semibold">{form.dealname}</span>
          {form.ownerName && (
            <span className="shrink-0 text-xs text-foreground/40">{form.ownerName}</span>
          )}
          {form.category && (
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: CATEGORY_COLORS[form.category] }}
            >
              {CATEGORY_OPTIONS.find((c) => c.value === form.category)?.label ?? form.category}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-foreground/50">
          <span className="flex flex-col items-end leading-tight">
            <span>初回商談 {form.firstMeetingDate || "—"}</span>
            <span>契約締結 {form.contractDate || "—"}</span>
          </span>
          <DealStageBar stage={form.dealStage} compact />
          <span className="text-sm">{yen(form.expectedRevenue)}</span>
          <span className="text-foreground/30">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4">
          <label className="mb-4 flex flex-col gap-1 text-xs text-foreground/50">
            医療機関名
            <input
              value={form.dealname}
              onChange={(e) => set("dealname", e.target.value)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium outline-none focus:border-brand"
            />
          </label>

          <div className="mb-4 rounded-xl border border-border bg-brand-light/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground/70">取引ステージ追跡</h3>
              <div className="flex gap-1">
                {DEAL_STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("dealStage", s)}
                    className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                      form.dealStage === s
                        ? "border-brand bg-brand text-white"
                        : "border-border text-foreground/60 hover:bg-brand-light"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set("dealStage", form.dealStage === LOST_STAGE ? "" : LOST_STAGE)}
                  className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                    form.dealStage === LOST_STAGE
                      ? "border-red-500 bg-red-500 text-white"
                      : "border-border text-foreground/60 hover:bg-red-50"
                  }`}
                >
                  失注
                </button>
              </div>
            </div>
            <DealStageBar stage={form.dealStage} />
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                契約締結日
                <input
                  type="date"
                  value={form.contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                取引担当者
                <select
                  value={form.ownerName}
                  onChange={(e) => set("ownerName", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                >
                  <option value="">未選択</option>
                  {DEAL_OWNERS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground/70">ヒアリング内容</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                初回商談完了日
                <input
                  type="date"
                  value={form.firstMeetingDate}
                  onChange={(e) => set("firstMeetingDate", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                カテゴリ
                <div className="flex gap-1">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set("category", c.value)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
                        form.category === c.value
                          ? "border-brand bg-brand text-white"
                          : "border-border text-foreground/60 hover:bg-brand-light"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                検討プラン
                <select
                  value={form.plan}
                  onChange={(e) => set("plan", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                >
                  <option value="">未選択</option>
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                見込み売上
                <input
                  type="number"
                  value={form.expectedRevenue ?? ""}
                  onChange={(e) => set("expectedRevenue", e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                見込み確度
                <select
                  value={form.probability}
                  onChange={(e) => set("probability", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                >
                  <option value="">未選択</option>
                  {PROBABILITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {PROBABILITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                商品
                <select
                  value={form.product}
                  onChange={(e) => set("product", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                >
                  <option value="">未選択</option>
                  {PRODUCT_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                カルテ
                <input
                  value={form.chart}
                  onChange={(e) => set("chart", e.target.value)}
                  placeholder="例: モバカル"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                カルテ転記
                <div className="flex gap-1">
                  {[
                    { value: true, label: "あり" },
                    { value: false, label: "なし" },
                  ].map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      onClick={() => set("chartTranscribed", o.value)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
                        form.chartTranscribed === o.value
                          ? "border-brand bg-brand text-white"
                          : "border-border text-foreground/60 hover:bg-brand-light"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                患者数/月
                <input
                  type="number"
                  value={form.patientsPerMonth ?? ""}
                  onChange={(e) => set("patientsPerMonth", e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                受電件数/月
                <input
                  type="number"
                  value={form.callsPerMonth ?? ""}
                  onChange={(e) => set("callsPerMonth", e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                往診件数/月
                <input
                  type="number"
                  value={form.visitsPerMonth ?? ""}
                  onChange={(e) => set("visitsPerMonth", e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-foreground/50">
                エリア
                <input
                  value={form.area}
                  onChange={(e) => set("area", e.target.value)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-foreground/70">商談報告</h3>
            <label className="flex flex-col gap-1 text-xs text-foreground/50">
              ヒアリングメモ
              <textarea
                value={form.hearingNotes}
                onChange={(e) => set("hearingNotes", e.target.value)}
                onFocus={() => setNotesExpanded(true)}
                rows={notesExpanded ? 4 : 1}
                placeholder="ヒアリング内容を入力"
                className="resize-none rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none transition-all focus:border-brand"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-600">本当に削除しますか？（重複解消などに使ってください）</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1 font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? "削除中..." : "削除する"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg px-3 py-1 text-foreground/60 hover:bg-zinc-50"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                この医療機関を削除
              </button>
            )}
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-red-600">{error}</span>}
              {saved && <span className="text-xs text-emerald-600">保存しました</span>}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>

          {deal.source === "hubspot" ? (
            <DealTaskForm dealId={deal.id} owners={owners} defaultOwnerName={form.ownerName} />
          ) : (
            <LinkHubSpotButton dealId={form.id} form={form} owners={owners} onLinked={onLinked} />
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM: Omit<HearingListItem, "id" | "dealname" | "source"> = {
  ownerName: "",
  category: "",
  probability: "",
  plan: "",
  product: "",
  chart: "",
  chartTranscribed: null,
  expectedRevenue: null,
  area: "",
  firstMeetingDate: "",
  patientsPerMonth: null,
  callsPerMonth: null,
  visitsPerMonth: null,
  hearingNotes: "",
  dealStage: "",
  contractDate: "",
};

function AddDealModal({
  owners,
  initialDealname = "",
  hubspotCompanyId,
  onClose,
  onCreated,
}: {
  owners: Array<{ ownerId: string; name: string }>;
  initialDealname?: string;
  hubspotCompanyId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [dealname, setDealname] = useState(initialDealname);
  const [ownerId, setOwnerId] = useState(owners[0]?.ownerId ?? "");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealname.trim()) {
      setError("機関名を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/deal-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealname: dealname.trim(), ownerId, hubspotCompanyId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold">新規商談を追加</h2>
        <p className="mb-4 text-sm text-foreground/60">
          {hubspotCompanyId
            ? "HubSpot上のこの医療機関に紐づく商談を新規作成します。担当者を選び、分かる範囲で入力してください。"
            : "機関名以外は分かる範囲で入力してください。"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            機関名 <span className="text-red-500">*</span>
            <input
              required
              value={dealname}
              onChange={(e) => setDealname(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            担当者
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {owners.map((o) => (
                <option key={o.ownerId} value={o.ownerId}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              カテゴリ
              <div className="flex gap-1">
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set("category", c.value)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
                      form.category === c.value
                        ? "border-brand bg-brand text-white"
                        : "border-border text-foreground/60 hover:bg-brand-light"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              初回商談完了日
              <input
                type="date"
                value={form.firstMeetingDate}
                onChange={(e) => set("firstMeetingDate", e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              検討プラン
              <select
                value={form.plan}
                onChange={(e) => set("plan", e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">未選択</option>
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              見込み確度
              <select
                value={form.probability}
                onChange={(e) => set("probability", e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">未選択</option>
                {PROBABILITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PROBABILITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              見込み売上
              <input
                type="number"
                value={form.expectedRevenue ?? ""}
                onChange={(e) => set("expectedRevenue", e.target.value === "" ? null : Number(e.target.value))}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              商品
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">未選択</option>
                {PRODUCT_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            エリア
            <input
              value={form.area}
              onChange={(e) => set("area", e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            ヒアリングメモ
            <textarea
              value={form.hearingNotes}
              onChange={(e) => set("hearingNotes", e.target.value)}
              rows={2}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50">
              閉じる
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DealReportBoard({
  items,
  owners,
  currentHalfTarget = 0,
}: {
  items: HearingListItem[];
  owners: Array<{ ownerId: string; name: string }>;
  currentHalfTarget?: number;
}) {
  const router = useRouter();
  const [addPrefill, setAddPrefill] = useState<{ dealname: string; companyId?: string } | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"" | "firstMeetingDate" | "contractDate" | "dealname">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 期間での絞り込み: 契約締結日 or 初回商談日 のどちらを基準にするか選び、
  // 開始日〜終了日（例: 4/1〜9/30）で直接絞り込む。年度・半期ボタンは、
  // その期間の開始日・終了日を日付欄に自動入力するだけのショートカット。
  // 開始日・終了日の入力欄は常に表示し、両方空なら絞り込みなしとして扱う
  // （「対象」の切り替えだけで日付欄が隠れて見つけづらくなるのを防ぐため）。
  const [periodField, setPeriodField] = useState<"firstMeetingDate" | "contractDate">("firstMeetingDate");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  // 取引ステージでの絞り込み
  const [stageFilter, setStageFilter] = useState<"" | (typeof DEAL_STAGES)[number] | typeof LOST_STAGE>("");

  // 取引担当者（森・富田）での絞り込み
  const [ownerFilter, setOwnerFilter] = useState<"" | (typeof DEAL_OWNERS)[number]>("");

  // 「機関名で検索」ボタンを押した時だけ、HubSpot全体（このアプリに未取り込みの商談も含む）を検索する。
  // 常時HubSpotの医療機関を全件表示すると見づらくなるため、一覧はdealHearingシート登録済みのものに限定し、
  // 検索結果だけを別枠で見せる。
  const [hubspotResults, setHubspotResults] = useState<HubspotSearchResult[] | null>(null);
  const [hubspotCompanyResults, setHubspotCompanyResults] = useState<HubspotCompanyResult[] | null>(null);
  const [searchingHub, setSearchingHub] = useState(false);
  const [hubSearchError, setHubSearchError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const knownIds = useMemo(() => new Set(items.map((d) => d.id)), [items]);

  async function handleHubSearch() {
    const q = search.trim();
    if (!q) {
      setHubspotResults(null);
      setHubspotCompanyResults(null);
      return;
    }
    setSearchingHub(true);
    setHubSearchError(null);
    try {
      const res = await fetch(`/api/deal-report/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "検索に失敗しました");
      setHubspotResults(data.deals ?? []);
      setHubspotCompanyResults(data.companies ?? []);
    } catch (err) {
      setHubSearchError(err instanceof Error ? err.message : "検索に失敗しました");
      setHubspotResults(null);
      setHubspotCompanyResults(null);
    } finally {
      setSearchingHub(false);
    }
  }

  async function handleImport(dealId: string) {
    setImportingId(dealId);
    setHubSearchError(null);
    try {
      const res = await fetch("/api/deal-report/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspotDealId: dealId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "追加に失敗しました");
      router.refresh();
    } catch (err) {
      setHubSearchError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setImportingId(null);
    }
  }

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const d of items) {
      for (const dateStr of [d.firstMeetingDate, d.contractDate]) {
        const fh = dateStr ? fiscalHalfOf(dateStr) : null;
        if (fh) years.add(fh.fiscalYear);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [items]);

  // 年度・半期ボタン用: そのプリセットが表す開始日・終了日を計算する（例: 2026年度上半期 → 4/1〜9/30）。
  const periodPresets = useMemo(
    () =>
      availableYears.flatMap((y) => [
        { label: `${y}年度上半期`, range: `${y}/4/1〜${y}/9/30`, from: `${y}-04-01`, to: `${y}-09-30` },
        { label: `${y}年度下半期`, range: `${y}/10/1〜${y + 1}/3/31`, from: `${y}-10-01`, to: `${y + 1}-03-31` },
      ]),
    [availableYears],
  );

  const dateInPeriod = useCallback(
    (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      if (periodFrom && dateStr < periodFrom) return false;
      if (periodTo && dateStr > periodTo) return false;
      return true;
    },
    [periodFrom, periodTo],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    let base = q ? items.filter((d) => d.dealname.includes(q)) : items;

    if (periodFrom || periodTo) {
      base = base.filter((d) => dateInPeriod(d[periodField]));
    }

    if (stageFilter) {
      base = base.filter((d) => d.dealStage === stageFilter);
    }

    if (ownerFilter) {
      base = base.filter((d) => d.ownerName === ownerFilter);
    }

    if (!sortKey) return base;
    if (sortKey === "dealname") {
      const sorted = [...base].sort((a, b) => a.dealname.localeCompare(b.dealname, "ja"));
      return sortDir === "asc" ? sorted : sorted.reverse();
    }
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey] || (sortDir === "asc" ? "9999-99-99" : "");
      const bv = b[sortKey] || (sortDir === "asc" ? "9999-99-99" : "");
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [items, search, sortKey, sortDir, periodField, periodFrom, periodTo, dateInPeriod, stageFilter, ownerFilter]);

  // 絞り込み・検索・並び替えの条件が変わったら1ページ目に戻す（前のページ番号のまま
  // 該当件数が減ると空白ページが表示されてしまうため）。
  const [page, setPage] = useState(1);
  const filterSignature = JSON.stringify([search, sortKey, sortDir, periodField, periodFrom, periodTo, stageFilter, ownerFilter]);
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / DEAL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * DEAL_PAGE_SIZE, currentPage * DEAL_PAGE_SIZE);

  // 確定売上: 取引ステージが「クローズ済み」の商談の見込み売上合計。契約締結日で判定すると、
  // 契約締結日をまだ入力していない過去のクローズ済み商談が漏れてしまう（CurrentPeriodStatusと同じ考え方）。
  const confirmedRevenue = filtered
    .filter((d) => d.dealStage === "クローズ済み")
    .reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0);
  // 見込み売上: 見込み確度A（80%以上）かつ未クローズ（クローズ済み以外）の商談の見込み売上合計
  const pipelineRevenue = filtered
    .filter((d) => d.probability === "A" && d.dealStage !== "クローズ済み")
    .reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0);

  const categoryBreakdown = CATEGORY_OPTIONS.map((c) => ({
    label: c.label,
    value: filtered.filter((d) => d.category === c.value).length,
    color: CATEGORY_COLORS[c.value],
  }));

  // 個人の売上（確定売上）・受注件数（クローズ済み件数）を担当者別に集計
  const closedDeals = filtered.filter((d) => d.dealStage === "クローズ済み");
  const revenueByOwner = DEAL_OWNERS.map((owner) => {
    const ownerDeals = closedDeals.filter((d) => d.ownerName === owner);
    return {
      owner,
      revenue: ownerDeals.reduce((sum, d) => sum + (d.expectedRevenue ?? 0), 0),
      count: ownerDeals.length,
    };
  });

  // 進捗レポート: 担当者別の取引ステージ内訳（現在の絞り込み条件を反映）と、受注率などの率。
  const progressRows = [...DEAL_OWNERS, "全体"].map((owner) => {
    const ownerDeals = owner === "全体" ? filtered : filtered.filter((d) => d.ownerName === owner);
    const stageCounts = DEAL_STAGES.map((s) => ({ stage: s, count: ownerDeals.filter((d) => d.dealStage === s).length }));
    const lostCount = ownerDeals.filter((d) => d.dealStage === LOST_STAGE).length;
    const closedCount = ownerDeals.filter((d) => d.dealStage === "クローズ済み").length;
    const winRate = closedCount + lostCount > 0 ? closedCount / (closedCount + lostCount) : null;
    return { owner, total: ownerDeals.length, stageCounts, lostCount, winRate };
  });

  // 期間で絞り込み中の場合のみ、その期間内に初回商談・契約締結した件数を「期間内の進捗」として出す
  // （取引ステージの変化日時そのものは記録していないため、記録がある2つの日付での近似値）。
  const periodProgress =
    periodFrom || periodTo
      ? {
          firstMeetings: filtered.filter((d) => dateInPeriod(d.firstMeetingDate)).length,
          contracts: filtered.filter((d) => dateInPeriod(d.contractDate)).length,
        }
      : null;

  return (
    <div className="flex flex-col gap-5">
      <CurrentPeriodStatus items={items} currentHalfTarget={currentHalfTarget} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground/70">確定売上（契約締結済み）</h3>
          <p className="text-3xl font-bold text-emerald-600">{yen(confirmedRevenue)}</p>
          <p className="mt-1 text-xs text-foreground/40">契約締結日が入力済みの商談の合計</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground/70">見込み売上（確度A・未クローズ）</h3>
          <p className="text-3xl font-bold text-brand">{yen(pipelineRevenue)}</p>
          <p className="mt-1 text-xs text-foreground/40">見込み確度A（80％以上）かつ未クローズの商談の合計</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground/70">カテゴリ別内訳</h3>
          <PieChart data={categoryBreakdown} size={120} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground/70">個人の売上・受注件数（クローズ済み）</h3>
          <div className="flex flex-col gap-2">
            {revenueByOwner.map((o) => (
              <div key={o.owner} className="flex items-center justify-between text-sm">
                <span className="text-foreground/60">{o.owner}</span>
                <span className="font-semibold text-emerald-600">
                  {yen(o.revenue)}
                  <span className="ml-2 text-xs font-normal text-foreground/50">{o.count}件</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-brand-light/40 px-5 py-3">
          <h3 className="font-bold">進捗レポート（担当者別）</h3>
          <p className="text-xs text-foreground/50">現在の絞り込み条件（期間・取引ステージ・担当者）を反映した集計です</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-brand-light/10 text-xs font-medium text-foreground/50">
                <th className="px-5 py-2 text-left">担当者</th>
                {DEAL_STAGES.map((s) => (
                  <th key={s} className="px-3 py-2 text-right">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">失注</th>
                <th className="px-3 py-2 text-right">対象件数</th>
                <th className="px-5 py-2 text-right">受注率</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map((row) => (
                <tr
                  key={row.owner}
                  className={`border-b border-border last:border-0 ${row.owner === "全体" ? "bg-brand-light/20 font-bold" : ""}`}
                >
                  <td className="px-5 py-2.5">{row.owner}</td>
                  {row.stageCounts.map(({ stage, count }) => (
                    <td key={stage} className="px-3 py-2.5 text-right">
                      {count}件
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right text-red-600">{row.lostCount}件</td>
                  <td className="px-3 py-2.5 text-right">{row.total}件</td>
                  <td className="px-5 py-2.5 text-right" style={{ color: row.winRate === null ? undefined : winRateColor(row.winRate) }}>
                    {row.winRate === null ? "—" : `${(row.winRate * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {periodProgress && (
          <div className="flex flex-wrap items-center gap-6 border-t border-border bg-brand-light/10 px-5 py-3 text-sm">
            <span className="text-xs font-medium text-foreground/50">期間内の進捗:</span>
            <span>
              初回商談 <span className="font-semibold text-brand">{periodProgress.firstMeetings}件</span>
            </span>
            <span>
              契約締結 <span className="font-semibold text-emerald-600">{periodProgress.contracts}件</span>
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-brand-light/10 p-3">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground/50">期間:</span>
              <select
                value={periodField}
                onChange={(e) => setPeriodField(e.target.value as typeof periodField)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="contractDate">契約締結日</option>
                <option value="firstMeetingDate">初回商談日</option>
              </select>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <span className="text-xs text-foreground/40">〜</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground/50">取引ステージ:</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="">すべて</option>
                {[...DEAL_STAGES, LOST_STAGE].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground/50">取引担当者:</span>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value as typeof ownerFilter)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="">すべて</option>
                {DEAL_OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            {(periodFrom || periodTo || stageFilter || ownerFilter) && (
              <button
                type="button"
                onClick={() => {
                  setPeriodFrom("");
                  setPeriodTo("");
                  setStageFilter("");
                  setOwnerFilter("");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground/60 hover:bg-brand-light"
              >
                絞り込みをクリア
              </button>
            )}
          </div>
          {periodField === "contractDate" && (periodFrom || periodTo) && (
            <p className="text-[11px] text-foreground/40">
              ※ 契約締結日が未入力の商談（成約済みだが日付未記録）はこの期間絞り込みには含まれません。件数・売上を全体で見たい場合は上の「確定売上（契約締結済み）」をご覧ください。
            </p>
          )}
          {periodPresets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-foreground/40">よく使う期間:</span>
              {periodPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPeriodFrom(p.from);
                    setPeriodTo(p.to);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    periodFrom === p.from && periodTo === p.to
                      ? "bg-brand text-white"
                      : "border border-border text-foreground/60 hover:bg-brand-light"
                  }`}
                >
                  {p.label} ({p.range})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs text-foreground/50">対象件数</p>
            <p className="text-xl font-bold">{filtered.length}件</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">確定売上</p>
            <p className="text-xl font-bold text-emerald-600">{yen(confirmedRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">見込み売上</p>
            <p className="text-xl font-bold text-brand">{yen(pipelineRevenue)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHubspotResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleHubSearch();
            }
          }}
          placeholder="機関名で検索"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={handleHubSearch}
          disabled={searchingHub || !search.trim()}
          title="このアプリにまだ取り込んでいない医療機関も含め、HubSpot全体から検索します"
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-foreground/60 hover:bg-brand-light disabled:opacity-50"
        >
          {searchingHub ? "検索中..." : "HubSpotで検索"}
        </button>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">並び替えなし</option>
          <option value="dealname">医療機関名（あいうえお順）</option>
          <option value="firstMeetingDate">初回商談日で並び替え</option>
          <option value="contractDate">契約締結日で並び替え</option>
        </select>
        {sortKey && (
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-foreground/60 hover:bg-brand-light"
          >
            {sortDir === "asc" ? "古い順" : "新しい順"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setAddPrefill({ dealname: "" })}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          + 新規商談を追加
        </button>
      </div>

      {(hubspotResults !== null || hubspotCompanyResults !== null || hubSearchError) && (
        <div className="rounded-2xl border border-dashed border-border bg-brand-light/20 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground/70">HubSpot全体の検索結果</h3>
            <button
              type="button"
              onClick={() => {
                setHubspotResults(null);
                setHubspotCompanyResults(null);
                setHubSearchError(null);
              }}
              className="text-xs text-foreground/40 hover:text-foreground/70"
            >
              閉じる
            </button>
          </div>
          {hubSearchError && <p className="text-sm text-red-600">{hubSearchError}</p>}
          {hubspotResults &&
            hubspotCompanyResults &&
            hubspotResults.length === 0 &&
            hubspotCompanyResults.length === 0 &&
            !hubSearchError && <p className="text-sm text-foreground/40">見つかりませんでした</p>}
          <div className="flex flex-col gap-2">
            {hubspotResults?.map((d) => {
              const alreadyAdded = knownIds.has(d.id);
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.dealname}</p>
                    <p className="text-xs text-foreground/50">
                      商談 ・ {d.ownerName || "担当者未設定"} ・ {d.dealStage || "ステージ未設定"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyAdded || importingId === d.id}
                    onClick={() => handleImport(d.id)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-light disabled:opacity-50"
                  >
                    {alreadyAdded ? "追加済み" : importingId === d.id ? "追加中..." : "追加"}
                  </button>
                </div>
              );
            })}
            {hubspotCompanyResults?.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-foreground/50">医療機関（まだ商談なし）</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddPrefill({ dealname: c.name, companyId: c.id })}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-light"
                >
                  追加
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {addPrefill && (
        <AddDealModal
          owners={owners}
          initialDealname={addPrefill.dealname}
          hubspotCompanyId={addPrefill.companyId}
          onClose={() => setAddPrefill(null)}
          onCreated={() => {
            router.refresh();
            const companyId = addPrefill.companyId;
            if (companyId) {
              setHubspotCompanyResults((prev) => prev?.filter((c) => c.id !== companyId) ?? null);
            }
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        {pageItems.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            owners={owners}
            onDeleted={() => router.refresh()}
            onLinked={() => router.refresh()}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/40">
            対応中の商談が見つかりません
          </p>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-3 shadow-sm">
          <span className="text-xs text-foreground/50">
            {(currentPage - 1) * DEAL_PAGE_SIZE + 1}〜{Math.min(currentPage * DEAL_PAGE_SIZE, filtered.length)}件 / 全{filtered.length}件
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/60 hover:bg-brand-light disabled:opacity-40"
            >
              ◀ 前へ
            </button>
            <span className="text-xs text-foreground/50">
              {currentPage} / {totalPages}ページ
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/60 hover:bg-brand-light disabled:opacity-40"
            >
              次へ ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
