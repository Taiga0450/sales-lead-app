"use client";

import { useEffect, useState } from "react";
import { getActingAsName, setActingAsName } from "@/lib/actingAs";

interface RosterEntry {
  id: string;
  name: string;
}

/**
 * 共有アカウント（バイトメンバー用）でログインしている時だけ表示する、
 * 「今この端末を使っているのは誰か」の選択・表示バナー。ここで設定した名前は、この端末に
 * 保存され（localStorage）、次回このアプリを開いた時も同じ名前がそのまま使われる。
 * 架電記録・稼働報告のたびに、この名前がサーバーへ一緒に送られ、架電者/稼働報告の記録に使われる。
 *
 * 名前の一覧（roster）はサーバー側で明示的に管理する（過去の記録から推測するのではない）ため、
 * 間違えて登録した名前も削除できる。
 */
export default function ActingAsBanner() {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadRoster() {
    fetch("/api/acting-as/roster")
      .then((res) => (res.ok ? res.json() : { roster: [] }))
      .then((data: { roster?: RosterEntry[] }) => setRoster(data.roster ?? []))
      .catch(() => setRoster([]));
  }

  useEffect(() => {
    // localStorageは初回レンダー時点（サーバー側）では読めないため、マウント後に一度だけ復元する。
    const saved = getActingAsName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(saved);
    setEditing(!saved);
    loadRoster();
  }, []);

  function select(value: string) {
    setActingAsName(value);
    setName(value);
    setEditing(false);
    setError(null);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/acting-as/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "追加に失敗しました");
      setRoster((prev) => (prev.some((e) => e.name === data.entry.name) ? prev : [...prev, data.entry]));
      setNewName("");
      select(data.entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(entry: RosterEntry, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`「${entry.name}」を一覧から削除しますか？（過去の記録は変わりません）`)) return;
    try {
      const res = await fetch(`/api/acting-as/roster/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "削除に失敗しました");
      setRoster((prev) => prev.filter((e2) => e2.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
        <span className="whitespace-nowrap text-amber-700">共有アカウント：あなたのお名前を選択してください</span>
        {roster.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {roster.map((entry) => (
              <span
                key={entry.id}
                className="flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs"
              >
                <button type="button" onClick={() => select(entry.name)} className="font-medium hover:text-brand">
                  {entry.name}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(entry, e)}
                  title="一覧から削除"
                  className="text-foreground/30 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="新しい名前を入力"
            className="w-28 rounded-md border border-amber-300 px-2 py-1 text-xs outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            ＋ 追加して選択
          </button>
        </div>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="クリックして変更"
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/60 hover:bg-brand-light"
    >
      架電者: <span className="font-semibold text-foreground">{name}</span> ✎
    </button>
  );
}
