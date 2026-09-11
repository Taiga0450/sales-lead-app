"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadRow } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/leads";
import { getActingAsName } from "@/lib/actingAs";
import ScoreBadge from "./ScoreBadge";
import ShareRegiMemoField from "./ShareRegiMemoField";
import AssigneeField from "./AssigneeField";
import EnrichButton from "./EnrichButton";
import DeleteLeadButton from "./DeleteLeadButton";

const PHASE_SELECT_STYLE: Record<string, string> = {
  未活動: "bg-zinc-100 text-zinc-600",
  対象外: "bg-zinc-100 text-zinc-400",
  受付NG: "bg-orange-50 text-orange-700",
  不在: "bg-amber-50 text-amber-700",
  キーマンNG: "bg-red-50 text-red-700",
  資料送付: "bg-sky-50 text-sky-700",
  商談獲得: "bg-blue-50 text-blue-700",
  契約医療機関: "bg-emerald-600 text-white",
};

function PhaseSelect({ leadId, status, canEdit = true }: { leadId: string; status: string; canEdit?: boolean }) {
  const router = useRouter();
  const normalizedStatus = status || "未活動";
  const [value, setValue] = useState(normalizedStatus);
  const [prevStatus, setPrevStatus] = useState(normalizedStatus);
  const [pending, setPending] = useState(false);

  // 他の担当者が同じリードを更新した後にrouter.refresh()で新しいpropsが来た場合、
  // 表示だけ古いまま（未保存に見える）にならないよう同期する。
  if (normalizedStatus !== prevStatus) {
    setPrevStatus(normalizedStatus);
    setValue(normalizedStatus);
  }

  async function handleChange(newStatus: string) {
    const previous = value;
    setValue(newStatus);
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      setValue(previous);
      window.alert("フェーズの更新に失敗しました。もう一度お試しください。");
    }
  }

  if (!canEdit) {
    return (
      <span
        className={`inline-block w-full truncate rounded-full px-2.5 py-1 text-center text-xs font-medium ${
          PHASE_SELECT_STYLE[value] ?? "bg-zinc-100 text-zinc-600"
        }`}
      >
        {value}
      </span>
    );
  }

  return (
    <select
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value)}
      className={`w-full rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${
        PHASE_SELECT_STYLE[value] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export interface ListConditions {
  region: string;
  status: string;
  keyword: string;
  call: "all" | "called" | "not_called";
  assignee?: string;
  /** 保存済みリストの名前。スプレッドシートへの出力先タブ名の初期値に使う（表示専用、書き込みには使わない）。 */
  name?: string;
}

const REGION_FILTER_STORAGE_KEY = "leads.regionFilter";
const ASSIGNEE_FILTER_STORAGE_KEY = "leads.assigneeFilter";
const CALLED_FROM_STORAGE_KEY = "leads.calledFrom";
const CALLED_TO_STORAGE_KEY = "leads.calledTo";

/**
 * 保存済みリストを選んでいない（自由入力の絞り込み）ときだけ、絞り込みの入力内容をブラウザの
 * localStorageに保存・復元する。保存済みリストを選んでいる間は、そのリストの条件を優先し、
 * 上書きしない（リストごとの地域はupdateSavedListでリスト自体に保存する。下記参照）。
 */
function usePersistedFilter(
  storageKey: string,
  value: string,
  setValue: (v: string) => void,
  presetFilter: ListConditions | null | undefined,
) {
  useEffect(() => {
    if (presetFilter) return;
    // ブラウザのlocalStorageは初回レンダー時点（サーバー側）では読めないため、マウント後に
    // 一度だけ復元する。
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setValue(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (presetFilter) return;
    window.localStorage.setItem(storageKey, value);
  }, [storageKey, value, presetFilter]);
}

function CallDateField({
  leadId,
  calledAt,
  calledBy,
  canEdit = true,
}: {
  leadId: string;
  calledAt: string;
  calledBy: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(calledAt);
  const [prevCalledAt, setPrevCalledAt] = useState(calledAt);
  const [saving, setSaving] = useState(false);

  if (calledAt !== prevCalledAt) {
    setPrevCalledAt(calledAt);
    setValue(calledAt);
  }

  async function handleChange(newValue: string) {
    const previous = value;
    setValue(newValue);
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calledAt: newValue, onBehalfOfName: getActingAsName() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      setValue(previous);
      window.alert("架電日の更新に失敗しました。もう一度お試しください。");
    }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-0.5 text-xs text-foreground/60">
        <span>{value || "—"}</span>
        {value && calledBy && (
          <span className="truncate text-[10px] text-foreground/40" title={calledBy}>
            {calledBy}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="w-full min-w-0 rounded-md border border-border px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-50"
        />
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleChange("");
            }}
            disabled={saving}
            title="架電記録を取り消す"
            className="shrink-0 rounded-md border border-border px-1.5 py-1 text-[10px] text-foreground/50 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            ×
          </button>
        )}
      </div>
      {value && calledBy && (
        <span className="truncate text-[10px] text-foreground/40" title={calledBy}>
          {calledBy}
        </span>
      )}
    </div>
  );
}

function CallMemoField({ leadId, memo, canEdit = true }: { leadId: string; memo: string; canEdit?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(memo);
  const [prevMemo, setPrevMemo] = useState(memo);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  // 入力中（フォーカス中）にサーバー側の最新値で上書きすると、他の行の保存で発生した
  // router.refresh()が入力途中の文字を消してしまう。フォーカスが外れている間だけ同期する。
  if (memo !== prevMemo) {
    setPrevMemo(memo);
    if (!focused) setValue(memo);
  }

  async function handleBlur() {
    setFocused(false);
    if (value === memo) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: value }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      setValue(memo);
      window.alert("架電メモの更新に失敗しました。もう一度お試しください。");
    }
  }

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      disabled={saving}
      readOnly={!canEdit}
      rows={2}
      placeholder="架電メモを入力"
      className={`w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-50 ${
        canEdit ? "border-border" : "border-border bg-zinc-50 text-foreground/60"
      }`}
    />
  );
}

const PHASE_ROW_STYLE: Record<string, string> = {
  契約医療機関: "border-l-4 border-l-emerald-500 bg-emerald-50/60 hover:bg-emerald-50",
  資料送付: "border-l-4 border-l-sky-400 bg-sky-50/50 hover:bg-sky-50",
  商談獲得: "border-l-4 border-l-blue-400 bg-blue-50/50 hover:bg-blue-50",
  キーマンNG: "border-l-4 border-l-red-300 bg-red-50/40 hover:bg-red-50/70 opacity-70",
  受付NG: "border-l-4 border-l-orange-300 bg-orange-50/40 hover:bg-orange-50/70 opacity-70",
  不在: "border-l-4 border-l-amber-300 bg-amber-50/40 hover:bg-amber-50/70 opacity-80",
  対象外: "opacity-50 hover:bg-zinc-50",
};

const GRID_COLS = "grid-cols-[110px_100px_1.7fr_1.3fr_110px_1.3fr]";

/** 1ページに表示するリード件数。全件を一度に表示すると件数が多いときに見づらいため、ページ送りする。 */
const PAGE_SIZE = 30;

/**
 * 一覧の行をクリックすると、別ページ（/leads/[id]）に遷移せずその場でカードが開き、
 * 詳細ページにあった項目（担当者・住所・メール・登録日・情報ソース・リサーチ・削除）を
 * 編集できる（商談報告×Hubspot画面のカード展開と同じ考え方）。
 */
function LeadListRow({
  lead,
  assigneeOptions,
  canEdit,
}: {
  lead: LeadRow;
  assigneeOptions: string[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rowStyle = PHASE_ROW_STYLE[lead.ステータス] ?? "hover:bg-brand-light/60";

  return (
    <div className="border-b border-border transition last:border-0">
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative grid ${GRID_COLS} cursor-pointer items-start gap-4 px-5 py-4 transition hover:z-10 hover:shadow-lg ${rowStyle}`}
      >
        <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-foreground/30">
          {open ? "▲" : "▼"}
        </span>

        <div onClick={(e) => e.stopPropagation()}>
          <CallDateField leadId={lead.id} calledAt={lead.架電日} calledBy={lead.架電者} canEdit={canEdit} />
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <PhaseSelect leadId={lead.id} status={lead.ステータス} canEdit={canEdit} />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{lead.医療機関名}</span>
          <div className="text-xs text-foreground/50">
            {lead.種別} ・ {lead.地域}
            {lead.電話番号 && ` ・ ${lead.電話番号}`}
          </div>
          {lead.担当者 && <span className="text-xs text-foreground/40">担当: {lead.担当者}</span>}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          {lead.事業内容メモ ? (
            <p className="line-clamp-3 text-xs leading-relaxed text-foreground/70">{lead.事業内容メモ}</p>
          ) : (
            <p className="text-xs text-foreground/30">分析情報はまだありません</p>
          )}
          {lead.地域特徴 && <p className="line-clamp-2 text-xs text-foreground/40">{lead.地域特徴}</p>}
        </div>

        <div className="flex flex-col gap-0.5">
          <ScoreBadge label="適合" score={Number(lead.適合度スコア || 0)} />
          <ScoreBadge label="規模" score={Number(lead.規模スコア || 0)} />
          <ScoreBadge label="地域" score={Number(lead.地域スコア || 0)} />
        </div>

        <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
          <CallMemoField leadId={lead.id} memo={lead.メモ} canEdit={canEdit} />
          <ShareRegiMemoField leadId={lead.id} memo={lead.シェアレジメモ} />
        </div>
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="border-t border-border bg-brand-light/10 px-5 py-4"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground/50">担当者</span>
                {canEdit ? (
                  <AssigneeField leadId={lead.id} assignee={lead.担当者} options={assigneeOptions} />
                ) : (
                  <span className="font-medium">{lead.担当者 || "未設定"}</span>
                )}
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-foreground/50">住所</span>
                <span className="max-w-[65%] text-right font-medium">{lead.住所 || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-foreground/50">メール</span>
                <span className="max-w-[65%] truncate text-right font-medium">{lead.メールアドレス || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-foreground/50">登録日</span>
                <span className="font-medium">{lead.登録日?.slice(0, 10) || "—"}</span>
              </div>
              {lead.情報ソースURL && (
                <div className="flex justify-between gap-4">
                  <span className="text-foreground/50">情報ソース</span>
                  <a
                    href={lead.情報ソースURL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    リンク
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground/70">リサーチ</h4>
                {canEdit && <EnrichButton leadId={lead.id} />}
              </div>
              {lead.事業内容メモ ? (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-foreground/80">
                  {lead.事業内容メモ}
                </p>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-foreground/40">
                  まだリサーチ結果はありません。
                </p>
              )}
              {lead.地域特徴 && <p className="text-xs text-foreground/50">地域特徴: {lead.地域特徴}</p>}
            </div>
          </div>

          {canEdit && (
            <div className="mt-4 max-w-xs">
              <DeleteLeadButton leadId={lead.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadTable({
  leads,
  presetFilter,
  assigneeOptions = [],
  canEditCallTracking = true,
}: {
  leads: LeadRow[];
  presetFilter?: ListConditions | null;
  assigneeOptions?: string[];
  /** falseの場合、架電日・フェーズ・架電メモは閲覧専用になる（シェアレジ担当者向け）。 */
  canEditCallTracking?: boolean;
}) {
  // Initial state derives from presetFilter (a saved list's conditions). The parent
  // remounts this component with a fresh `key` whenever the selected list changes,
  // so switching lists always starts from the new preset instead of a stale filter.
  const [statusFilter, setStatusFilter] = useState<string>(presetFilter?.status ?? "all");
  const [callFilter, setCallFilter] = useState<"all" | "called" | "not_called">(presetFilter?.call ?? "all");
  const [regionFilter, setRegionFilter] = useState(presetFilter?.region ?? "");
  const [keyword, setKeyword] = useState(presetFilter?.keyword ?? "");
  const [sortKey, setSortKey] = useState<"score" | "date" | "name" | "call">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 「誰が何日に架電したか」を確認するための、担当者（メールアドレス）・架電日での絞り込み。
  // 保存済みリスト（ListConditions）の対象外——あくまでその場での一時的な絞り込みとして扱う。
  const [assigneeFilter, setAssigneeFilter] = useState(presetFilter?.assignee ?? "");
  const [calledFrom, setCalledFrom] = useState("");
  const [calledTo, setCalledTo] = useState("");

  // 保存済みリストを選んでいない（自由入力の絞り込み）ときだけ、各絞り込みの入力内容をブラウザに
  // 保存する。保存済みリストを切り替えるとLeadTableごと再マウントされ、その度にこれらの欄が
  // 初期値に戻って再入力が必要になっていたため、直前に入力した内容を復元できるようにする。
  usePersistedFilter(REGION_FILTER_STORAGE_KEY, regionFilter, setRegionFilter, presetFilter);
  usePersistedFilter(ASSIGNEE_FILTER_STORAGE_KEY, assigneeFilter, setAssigneeFilter, presetFilter);
  usePersistedFilter(CALLED_FROM_STORAGE_KEY, calledFrom, setCalledFrom, presetFilter);
  usePersistedFilter(CALLED_TO_STORAGE_KEY, calledTo, setCalledTo, presetFilter);

  // 担当者欄には、メールアドレス選択式に変更する前の自由入力データ（「森」のような短い名前）が
  // 残っている行がある。同じリードの架電者（実際に架電した人のメールアドレス、常に本物のメール）と
  // 担当者が一致して現れる頻度から、短い名前が実際はどのメールアドレスを指しているかを推測する。
  const inferredEmailByAssignee = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const lead of leads) {
      const raw = lead.担当者;
      const email = lead.架電者;
      if (!raw || !email || !email.includes("@") || raw === email) continue;
      const emailCounts = counts.get(raw) ?? new Map<string, number>();
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
      counts.set(raw, emailCounts);
    }
    const result = new Map<string, string>();
    for (const [raw, emailCounts] of counts) {
      let bestEmail = "";
      let bestCount = 0;
      for (const [email, count] of emailCounts) {
        if (count > bestCount) {
          bestEmail = email;
          bestCount = count;
        }
      }
      if (bestEmail) result.set(raw, bestEmail);
    }
    return result;
  }, [leads]);

  const filtered = useMemo(() => {
    let rows = leads;
    if (statusFilter !== "all") {
      rows = rows.filter((lead) => (lead.ステータス || "未活動") === statusFilter);
    }
    if (callFilter === "called") {
      rows = rows.filter((lead) => Boolean(lead.架電日));
    } else if (callFilter === "not_called") {
      rows = rows.filter((lead) => !lead.架電日);
    }
    const regionTerms = regionFilter
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    if (regionTerms.length > 0) {
      rows = rows.filter((lead) => regionTerms.some((term) => lead.地域.includes(term)));
    }
    if (keyword.trim()) {
      const q = keyword.trim();
      rows = rows.filter(
        (lead) =>
          lead.医療機関名.includes(q) ||
          lead.電話番号.includes(q) ||
          lead.事業内容メモ.includes(q),
      );
    }
    if (assigneeFilter) {
      // 担当者欄はメールアドレス選択式に変更する前の自由入力データが残っており、
      // 「i.tomita@oncall-japan.com」ではなく「i.tomita」（メールの@より前の部分）や、
      // 「森」のような短い名前だけが入っている行もある。完全一致・@より前の部分の一致に加え、
      // 架電者との組み合わせから推測した対応関係（inferredEmailByAssignee）でも一致させる。
      const localPart = assigneeFilter.split("@")[0];
      rows = rows.filter(
        (lead) =>
          lead.担当者 === assigneeFilter ||
          lead.担当者 === localPart ||
          inferredEmailByAssignee.get(lead.担当者) === assigneeFilter,
      );
    }
    if (calledFrom) {
      rows = rows.filter((lead) => lead.架電日 && lead.架電日 >= calledFrom);
    }
    if (calledTo) {
      rows = rows.filter((lead) => lead.架電日 && lead.架電日 <= calledTo);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === "score") cmp = Number(a.総合スコア || 0) - Number(b.総合スコア || 0);
      else if (sortKey === "name") cmp = a.医療機関名.localeCompare(b.医療機関名, "ja");
      else if (sortKey === "call") cmp = (a.架電日 || "").localeCompare(b.架電日 || "");
      else cmp = (a.登録日 || "").localeCompare(b.登録日 || "");
      return cmp * dir;
    });
  }, [
    leads,
    statusFilter,
    callFilter,
    regionFilter,
    keyword,
    assigneeFilter,
    calledFrom,
    calledTo,
    sortKey,
    sortDir,
    inferredEmailByAssignee,
  ]);

  // 絞り込み・検索・並び替えの条件が変わったら1ページ目に戻す（前のページ番号のまま
  // 該当件数が減ると空白ページが表示されてしまうため）。
  const [page, setPage] = useState(1);
  const filterSignature = JSON.stringify([
    statusFilter,
    callFilter,
    regionFilter,
    keyword,
    assigneeFilter,
    calledFrom,
    calledTo,
    sortKey,
    sortDir,
  ]);
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  async function handleExport() {
    const tabName = window.prompt("書き出し先のタブ名を入力してください", presetFilter?.name ?? "");
    if (!tabName || !tabName.trim()) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch("/api/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabName: tabName.trim(), leadIds: filtered.map((lead) => lead.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "出力に失敗しました");
      setExportMessage(`「${data.tabName}」タブに${filtered.length}件書き出しました`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "出力に失敗しました");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="医療機関名・電話番号・特色で検索"
          className="min-w-[220px] flex-1 rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="all">すべてのフェーズ</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={callFilter}
          onChange={(e) => setCallFilter(e.target.value as typeof callFilter)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="all">架電すべて</option>
          <option value="called">架電済み</option>
          <option value="not_called">未架電</option>
        </select>

        <input
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          placeholder="地域で絞り込み（複数はカンマ区切り）"
          className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        />

        <div className="flex items-center gap-1.5">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="score">総合スコア順</option>
            <option value="date">登録日順</option>
            <option value="name">医療機関名順</option>
            <option value="call">架電日順</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "昇順" : "降順"}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground/60 hover:bg-brand-light"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>

        <span className="ml-auto text-xs text-foreground/50">該当{filtered.length}件</span>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || filtered.length === 0}
          title="現在の絞り込み結果をスプレッドシートの新しいタブに書き出します"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/60 hover:bg-brand-light disabled:opacity-50"
        >
          {exporting ? "出力中..." : "スプレッドシートに出力"}
        </button>
        {exportMessage && <span className="w-full text-xs text-foreground/50">{exportMessage}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="text-xs font-medium text-foreground/50">誰が何日に架電したかで絞る:</span>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="">担当者すべて</option>
          {assigneeOptions.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-foreground/50">
          架電日
          <input
            type="date"
            value={calledFrom}
            onChange={(e) => setCalledFrom(e.target.value)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
          〜
          <input
            type="date"
            value={calledTo}
            onChange={(e) => setCalledTo(e.target.value)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </div>
        {(assigneeFilter || calledFrom || calledTo) && (
          <button
            type="button"
            onClick={() => {
              setAssigneeFilter("");
              setCalledFrom("");
              setCalledTo("");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground/60 hover:bg-brand-light"
          >
            クリア
          </button>
        )}
      </div>

      <div className={`grid ${GRID_COLS} gap-4 border-b border-border bg-brand-light/40 px-5 py-2.5 text-xs font-medium text-foreground/50`}>
        <span>架電日</span>
        <span>フェーズ</span>
        <span>医療機関名</span>
        <span>医療機関の特色</span>
        <span>状況</span>
        <span>架電メモ／シェアレジメモ</span>
      </div>

      <div className="flex flex-col">
        {pageItems.map((lead) => (
          <LeadListRow
            key={lead.id}
            lead={lead}
            assigneeOptions={assigneeOptions}
            canEdit={canEditCallTracking}
          />
        ))}

        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-foreground/40">
            該当するリードがありません。Claudeに医療機関の調査を依頼してみましょう。
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-foreground/50">
            {(currentPage - 1) * PAGE_SIZE + 1}〜{Math.min(currentPage * PAGE_SIZE, filtered.length)}件 / 全{filtered.length}件
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
