"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CallShiftRow } from "@/lib/callShifts";
import { shiftHours, weekdayLabel, normalizeTime, callerIdentityOf } from "@/lib/callShifts";

function ShiftRow({ shift, showCaller }: { shift: CallShiftRow; showCaller: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...shift,
    startTime: normalizeTime(shift.startTime),
    endTime: normalizeTime(shift.endTime),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof CallShiftRow>(key: K, value: CallShiftRow[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/call-shifts/${form.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          calls: form.calls,
          apo: form.apo,
          receptionNg: form.receptionNg,
          keymanConnected: form.keymanConnected,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "修正に失敗しました");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修正に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("この稼働記録を削除しますか？（元に戻せません）")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/call-shifts/${form.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
    }
  }

  const cellClass = "w-full rounded-md border border-transparent px-1.5 py-1 text-xs outline-none focus:border-brand focus:bg-white";

  return (
    <div
      className={`grid items-center gap-1 border-b border-border px-3 py-1.5 text-xs last:border-0 ${
        showCaller ? "grid-cols-12" : "grid-cols-11"
      }`}
    >
      {showCaller && (
        <span className="truncate text-foreground/70" title={form.callerEmail}>
          {form.callerName || form.callerEmail}
        </span>
      )}
      <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={cellClass} />
      <span className="text-center text-foreground/50">{weekdayLabel(form.date)}</span>
      <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={cellClass} />
      <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className={cellClass} />
      <span className="text-center text-foreground/60">{shiftHours(form.startTime, form.endTime).toFixed(1)}h</span>
      <input type="number" min="0" value={form.calls} onChange={(e) => set("calls", e.target.value)} className={cellClass} />
      <input type="number" min="0" value={form.apo} onChange={(e) => set("apo", e.target.value)} className={cellClass} />
      <input type="number" min="0" value={form.receptionNg} onChange={(e) => set("receptionNg", e.target.value)} className={cellClass} />
      <input
        type="number"
        min="0"
        value={form.keymanConnected}
        onChange={(e) => set("keymanConnected", e.target.value)}
        className={cellClass}
      />
      <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={cellClass} />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting}
          className="shrink-0 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中" : "保存"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          title="この稼働記録を削除"
          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-foreground/50 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
        >
          {deleting ? "削除中" : "削除"}
        </button>
        {saved && <span className="text-emerald-600">✓</span>}
        {error && <span className="truncate text-red-600" title={error}>!</span>}
      </div>
    </div>
  );
}

export default function MyShiftsTable({
  shifts,
  title = "自分の稼働記録（修正可能）",
  groupByPerson = false,
}: {
  shifts: CallShiftRow[];
  title?: string;
  /** trueの場合、全員分を1つの表にまとめて出さず、担当者ごとのタブで切り替えて表示する。 */
  groupByPerson?: boolean;
}) {
  // 同一人物が個別ログインと代理入力の両方で記録している場合でも1人にまとまるよう、
  // callerEmailではなくcallerIdentityOf（名前優先）でグルーピングする。
  const people = groupByPerson
    ? [...new Map(shifts.map((s) => [callerIdentityOf(s), s.callerName || s.callerEmail])).entries()]
    : [];
  const [selectedEmail, setSelectedEmail] = useState<string>(people[0]?.[0] ?? "");
  const [monthFilter, setMonthFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visibleShifts = groupByPerson ? shifts.filter((s) => callerIdentityOf(s) === selectedEmail) : shifts;
  const monthFiltered = monthFilter ? visibleShifts.filter((s) => s.date.startsWith(monthFilter)) : visibleShifts;
  const dir = sortDir === "asc" ? -1 : 1;
  const sorted = [...monthFiltered].sort((a, b) => (a.date < b.date ? dir : a.date > b.date ? -dir : 0));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-brand-light/40 px-5 py-3">
        <h2 className="font-bold">{title}</h2>
      </div>
      {groupByPerson && people.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border bg-surface px-5 py-3">
          {people.map(([email, name]) => (
            <button
              key={email}
              type="button"
              onClick={() => setSelectedEmail(email)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedEmail === email ? "bg-brand text-white" : "border border-border text-foreground/60 hover:bg-brand-light"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-3">
        <label className="flex items-center gap-1.5 text-xs text-foreground/50">
          月で絞る
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="rounded-lg border border-border px-2 py-1 text-xs outline-none focus:border-brand"
          />
        </label>
        {monthFilter && (
          <button
            type="button"
            onClick={() => setMonthFilter("")}
            className="rounded-lg border border-border px-2 py-1 text-xs text-foreground/60 hover:bg-brand-light"
          >
            クリア
          </button>
        )}
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground/60 hover:bg-brand-light"
        >
          日付 {sortDir === "asc" ? "昇順 ↑" : "降順 ↓"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <div
          className={`grid min-w-[860px] gap-1 border-b border-border px-3 py-2 text-[11px] font-medium text-foreground/50 ${
            groupByPerson ? "grid-cols-11" : "grid-cols-12"
          }`}
        >
          {!groupByPerson && <span>担当者</span>}
          <span>日付</span>
          <span className="text-center">曜日</span>
          <span>開始</span>
          <span>終了</span>
          <span className="text-center">稼働</span>
          <span>架電数</span>
          <span>アポ</span>
          <span>受付NG</span>
          <span>キーマン</span>
          <span>備考</span>
          <span></span>
        </div>
        <div className="min-w-[860px]">
          {sorted.map((s) => (
            <ShiftRow key={s.id} shift={s} showCaller={!groupByPerson} />
          ))}
          {sorted.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-foreground/40">まだ稼働報告がありません</p>
          )}
        </div>
      </div>
    </div>
  );
}
