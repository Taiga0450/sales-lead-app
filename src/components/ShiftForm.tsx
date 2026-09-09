"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getActingAsName } from "@/lib/actingAs";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ShiftForm({ isSupervisor = false }: { isSupervisor?: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [calls, setCalls] = useState("");
  const [apo, setApo] = useState("");
  const [receptionNg, setReceptionNg] = useState("");
  const [keymanConnected, setKeymanConnected] = useState("");
  const [notes, setNotes] = useState("");
  const [onBehalfOfName, setOnBehalfOfName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/call-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          calls,
          apo,
          receptionNg,
          keymanConnected,
          notes,
          // 統括担当者が代理入力した名前を優先し、無ければ共有アカウントの「今の操作者」名を使う。
          onBehalfOfName: (isSupervisor ? onBehalfOfName.trim() : "") || getActingAsName() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "記録に失敗しました");
      setSaved(true);
      setStartTime("");
      setEndTime("");
      setCalls("");
      setApo("");
      setReceptionNg("");
      setKeymanConnected("");
      setNotes("");
      setOnBehalfOfName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "記録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-3 font-bold">稼働報告を記録する</h2>
      {isSupervisor && (
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium">
          対象者名（未入力なら自分の記録として登録）
          <input
            value={onBehalfOfName}
            onChange={(e) => setOnBehalfOfName(e.target.value)}
            placeholder="例: 磯崎（バイトメンバーの代理入力）"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          日付
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          開始時刻
          <input
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          終了時刻
          <input
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          架電数
          <input
            type="number"
            min="0"
            value={calls}
            onChange={(e) => setCalls(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          アポ獲得数
          <input
            type="number"
            min="0"
            value={apo}
            onChange={(e) => setApo(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          受付NG
          <input
            type="number"
            min="0"
            value={receptionNg}
            onChange={(e) => setReceptionNg(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          キーマン接続数
          <input
            type="number"
            min="0"
            value={keymanConnected}
            onChange={(e) => setKeymanConnected(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium md:col-span-1">
          備考
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "記録中..." : "記録する"}
        </button>
        {saved && <span className="text-xs text-emerald-600">記録しました</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
