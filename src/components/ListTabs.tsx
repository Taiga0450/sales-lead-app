"use client";

import { useEffect, useState } from "react";
import { LEAD_STATUSES } from "@/lib/leads";
import type { ListConditions } from "./LeadTable";

interface SavedList {
  id: string;
  name: string;
  region: string;
  status: string;
  keyword: string;
  call: string;
  assignee: string;
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
        body: JSON.stringify({ name, region, status, keyword, call, assignee }),
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
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>

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
