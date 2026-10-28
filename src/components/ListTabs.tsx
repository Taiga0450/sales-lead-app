"use client";

import { Fragment, useEffect, useState } from "react";
import { LEAD_STATUSES } from "@/lib/leads";
import type { ListConditions } from "./LeadTable";
import { LIST_CATEGORIES, categoryOf, groupLists, type ListCategory } from "@/lib/savedLists";

interface SavedList {
  id: string;
  name: string;
  region: string;
  status: string;
  keyword: string;
  call: string;
  assignee: string;
  category?: string;
  sortOrder?: string;
  createdAt?: string;
}

const CATEGORY_LABEL: Record<ListCategory, string> = { 往診代行: "往診代行（ON CALL）", シェアレジ: "シェアレジ" };

/**
 * リストの並び替え・区分の変更。ドラッグで順番を入れ替え（もう一方の区分へドラッグすれば区分も移る）、
 * 細かい調整は↑↓、「区分を移す」ボタンでも往診代行⇔シェアレジを切り替えられる。
 */
export function ReorderModal({ lists, onClose, onSaved }: { lists: SavedList[]; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(() =>
    groupLists(lists).flatMap((g) => g.lists.map((l) => ({ id: l.id, name: l.name, category: g.category }))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // ドロップ先の目印：{ category, index }（その区分のindex番目の前に入る。末尾ならlength）
  const [dropAt, setDropAt] = useState<{ category: ListCategory; index: number } | null>(null);

  /** ドラッグ中のリストを、指定した区分のindex番目の位置へ移す。 */
  function dropTo(category: ListCategory, index: number) {
    setDraft((d) => {
      const item = d.find((x) => x.id === dragId);
      if (!item) return d;
      const rest = d.filter((x) => x.id !== item.id);
      const target = rest.filter((x) => x.category === category);
      // 同じ区分の中で下へ動かす場合、自分を抜いた分だけ位置が1つ前にずれる
      const original = d.filter((x) => x.category === category).findIndex((x) => x.id === item.id);
      const at = original !== -1 && original < index ? index - 1 : index;
      target.splice(Math.max(0, Math.min(at, target.length)), 0, { ...item, category });
      return LIST_CATEGORIES.flatMap((c) => (c === category ? target : rest.filter((x) => x.category === c)));
    });
    setDragId(null);
    setDropAt(null);
  }

  function move(id: string, dir: -1 | 1) {
    setDraft((d) => {
      const item = d.find((x) => x.id === id)!;
      const same = d.filter((x) => x.category === item.category);
      const i = same.indexOf(item);
      const j = i + dir;
      if (j < 0 || j >= same.length) return d;
      [same[i], same[j]] = [same[j], same[i]];
      return LIST_CATEGORIES.flatMap((c) => (c === item.category ? same : d.filter((x) => x.category === c)));
    });
  }

  function switchCategory(id: string) {
    setDraft((d) => {
      const item = d.find((x) => x.id === id)!;
      const next: ListCategory = item.category === "往診代行" ? "シェアレジ" : "往診代行";
      const rest = d.filter((x) => x.id !== id);
      return LIST_CATEGORIES.flatMap((c) => [
        ...rest.filter((x) => x.category === c),
        ...(c === next ? [{ ...item, category: next }] : []),
      ]);
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/lists/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draft.map((x) => ({ id: x.id, category: x.category })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-bold">リストの並び替え</h2>
        <p className="mb-4 text-sm text-foreground/60">
          ドラッグして順番を入れ替えます。もう一方の区分へドラッグすると、区分も移ります（↑↓でも動かせます）。
        </p>
        <div className="flex-1 overflow-y-auto pr-1">
          {LIST_CATEGORIES.map((c) => {
            const items = draft.filter((x) => x.category === c);
            const marker = (index: number) =>
              dragId && dropAt?.category === c && dropAt.index === index ? (
                <li aria-hidden className="h-1 rounded-full bg-brand" />
              ) : null;
            return (
              <div
                key={c}
                className={`mb-4 rounded-xl p-1 transition-colors ${dragId && dropAt?.category === c ? "bg-brand-light/50" : ""}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  // リストの行の上でないところ（見出し・余白）に来たら、その区分の末尾に入れる
                  if (e.target === e.currentTarget) setDropAt({ category: c, index: items.length });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) dropTo(c, dropAt?.category === c ? dropAt.index : items.length);
                }}
              >
                <p className="mb-1.5 px-1 text-xs font-bold tracking-wide text-foreground/50">{CATEGORY_LABEL[c]}</p>
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-foreground/40">
                    {dragId ? "ここにドロップ" : "リストはありません"}
                  </p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {items.map((x, i) => (
                    <Fragment key={x.id}>
                    {marker(i)}
                    <li
                      draggable
                      onDragStart={(e) => {
                        setDragId(x.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", x.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropAt(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        // 行の上半分なら前、下半分なら後ろに入れる
                        const rect = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > rect.top + rect.height / 2;
                        setDropAt({ category: c, index: after ? i + 1 : i });
                      }}
                      className={`flex cursor-grab items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm active:cursor-grabbing ${
                        dragId === x.id ? "opacity-40" : ""
                      }`}
                    >
                      <span aria-hidden className="select-none text-foreground/30">⋮⋮</span>
                      <span className="w-5 text-right text-xs tabular-nums text-foreground/40">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{x.name}</span>
                      <button
                        type="button"
                        onClick={() => move(x.id, -1)}
                        disabled={i === 0}
                        title="上へ"
                        className="h-7 w-7 rounded-md border border-border text-foreground/60 hover:bg-brand-light disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(x.id, 1)}
                        disabled={i === items.length - 1}
                        title="下へ"
                        className="h-7 w-7 rounded-md border border-border text-foreground/60 hover:bg-brand-light disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => switchCategory(x.id)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground/60 hover:bg-brand-light"
                      >
                        {c === "往診代行" ? "シェアレジへ移す" : "往診代行へ移す"}
                      </button>
                    </li>
                    </Fragment>
                  ))}
                  {marker(items.length)}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50">
            閉じる
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "並び順を保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toConditions(list: SavedList): ListConditions {
  return {
    name: list.name,
    region: list.region,
    status: list.status || "all",
    keyword: list.keyword,
    call: (list.call as ListConditions["call"]) || "all",
    assignee: list.assignee || "",
  };
}

export default function ListTabs({
  onSelect,
  assigneeOptions = [],
}: {
  onSelect: (conditions: ListConditions | null) => void;
  assigneeOptions?: string[];
}) {
  const [lists, setLists] = useState<SavedList[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [call, setCall] = useState("all");
  const [assignee, setAssignee] = useState("");
  const [category, setCategory] = useState<ListCategory>("往診代行");
  const [reordering, setReordering] = useState(false);

  async function loadLists() {
    try {
      const res = await fetch("/api/lists");
      if (!res.ok) return;
      const data = await res.json();
      setLists(data.lists ?? []);
    } catch {
      // Preview/offline contexts have no API — fall back to no saved lists.
      setLists([]);
    }
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/lists");
        if (!res.ok) return;
        const data = await res.json();
        if (!ignore) setLists(data.lists ?? []);
      } catch {
        if (!ignore) setLists([]);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  function selectAll() {
    setActiveId(null);
    onSelect(null);
  }

  function selectList(list: SavedList) {
    setActiveId(list.id);
    onSelect(toConditions(list));
  }

  function resetForm() {
    setName("");
    setRegion("");
    setStatus("all");
    setKeyword("");
    setCall("all");
    setAssignee("");
    setCategory("往診代行");
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, region, status, keyword, call, assignee, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
      await loadLists();
      // 作成したリストをすぐに選択状態にする——これをしないと、直前に選んでいた別のリストの
      // 絞り込み条件が残ったままになり、「新しいリストを作ったのに反映されない」ように見えてしまう。
      selectList(data.list as SavedList);
      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("このリストを削除しますか？（元データは削除されません）")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "削除に失敗しました");
      }
      if (activeId === id) selectAll();
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename(list: SavedList, e: React.MouseEvent) {
    e.stopPropagation();
    const newName = window.prompt("新しいリスト名を入力してください", list.name);
    if (!newName || !newName.trim() || newName.trim() === list.name) return;
    const res = await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) await loadLists();
  }

  const activeList = lists.find((l) => l.id === activeId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={activeId ?? ""}
        onChange={(e) => {
          if (!e.target.value) {
            selectAll();
            return;
          }
          const list = lists.find((l) => l.id === e.target.value);
          if (list) selectList(list);
        }}
        className="min-w-[160px] rounded-lg border border-border px-3 py-1.5 text-sm font-medium outline-none focus:border-brand"
      >
        <option value="">すべて</option>
        {groupLists(lists)
          .filter((g) => g.lists.length > 0)
          .map((g) => (
            <optgroup key={g.category} label={CATEGORY_LABEL[g.category]}>
              {g.lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </optgroup>
          ))}
      </select>

      {activeList && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            categoryOf(activeList) === "シェアレジ" ? "bg-violet-100 text-violet-700" : "bg-brand-light text-brand"
          }`}
        >
          {CATEGORY_LABEL[categoryOf(activeList)]}
        </span>
      )}

      {activeList && (
        <>
          <button
            type="button"
            onClick={(e) => handleRename(activeList, e)}
            title="リスト名を変更"
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground/60 hover:bg-brand-light"
          >
            名前を変更
          </button>
          <button
            type="button"
            onClick={(e) => handleDelete(activeList.id, e)}
            disabled={deleting}
            title="リストを削除"
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "削除中..." : "このリストを削除"}
          </button>
        </>
      )}

      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm font-medium text-foreground/50 hover:bg-brand-light"
      >
        + リストを作成
      </button>

      {lists.length > 1 && (
        <button
          type="button"
          onClick={() => setReordering(true)}
          className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-foreground/60 hover:bg-brand-light"
        >
          並び替え
        </button>
      )}

      {reordering && (
        <ReorderModal
          lists={lists}
          onClose={() => setReordering(false)}
          onSaved={() => {
            setReordering(false);
            void loadLists();
          }}
        />
      )}

      {error && !open && <span className="text-sm text-red-600">{error}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold">新しいリストを作成</h2>
            <p className="mb-4 text-sm text-foreground/60">
              条件を指定すると、その条件で絞り込まれた「リスト」として保存されます。
            </p>

            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                リスト名 <span className="text-red-500">*</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 関東リスト、森リスト"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <div className="flex flex-col gap-1.5 text-sm font-medium">
                区分
                <div className="flex gap-2">
                  {LIST_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                        category === c ? "border-brand bg-brand text-white" : "border-border text-foreground/60 hover:bg-brand-light"
                      }`}
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                地域（部分一致・複数はカンマ区切り・任意）
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="例: 東京都,神奈川県,埼玉県"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  ステータス
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="all">すべて</option>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  架電状況
                  <select
                    value={call}
                    onChange={(e) => setCall(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="all">すべて</option>
                    <option value="called">架電済み</option>
                    <option value="not_called">未架電</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                キーワード（任意）
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="医療機関名・電話番号・特色"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                担当者（任意）
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">すべて</option>
                  {assigneeOptions.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "作成中..." : "作成する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
