"use client";

import { useState } from "react";

/**
 * HubSpotの取引（Deal）に紐づくタスクを作る折りたたみフォーム。商談報告×Hubspotとアップセルの
 * 両画面で使う。送信先の /api/deal-report/[id]/task はHubSpotの取引IDであればどの取引にも使える。
 */
const TASK_TYPE_OPTIONS: Array<{ value: "TODO" | "CALL" | "EMAIL"; label: string }> = [
  { value: "TODO", label: "ToDo" },
  { value: "CALL", label: "電話" },
  { value: "EMAIL", label: "メール" },
];
const TASK_PRIORITY_OPTIONS: Array<{ value: "NONE" | "LOW" | "MEDIUM" | "HIGH"; label: string }> = [
  { value: "NONE", label: "なし" },
  { value: "LOW", label: "低" },
  { value: "MEDIUM", label: "中" },
  { value: "HIGH", label: "高" },
];

export default function DealTaskForm({
  dealId,
  owners,
  defaultOwnerName,
}: {
  dealId: string;
  owners: Array<{ ownerId: string; name: string }>;
  defaultOwnerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [taskType, setTaskType] = useState<"TODO" | "CALL" | "EMAIL">("TODO");
  const [priority, setPriority] = useState<"NONE" | "LOW" | "MEDIUM" | "HIGH">("NONE");
  const [ownerId, setOwnerId] = useState(
    () => owners.find((o) => o.name.startsWith(defaultOwnerName))?.ownerId ?? owners[0]?.ownerId ?? "",
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      setError("タスク内容を入力してください");
      return;
    }
    if (!dueAt) {
      setError("期日を入力してください");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/deal-report/${dealId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: notes, dueAt, taskType, priority, ownerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
      setSaved(true);
      setSubject("");
      setNotes("");
      setDueAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-bold text-foreground/70 hover:bg-brand-light/20"
      >
        + タスクを追加
        <span className="text-foreground/30">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border p-4">
          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            タスクを入力
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例: 見積もり再送のフォローコール"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-foreground/50">
              期日
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground/50">
              担当者
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              >
                {owners.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-foreground/50">
              タスクタイプ
              <div className="flex gap-1">
                {TASK_TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTaskType(o.value)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
                      taskType === o.value
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
              優先度
              <div className="flex gap-1">
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPriority(o.value)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
                      priority === o.value
                        ? "border-brand bg-brand text-white"
                        : "border-border text-foreground/60 hover:bg-brand-light"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            メモ
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="タスクの詳細を入力"
              className="resize-none rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            {saved && <span className="text-xs text-emerald-600">タスクを作成しました</span>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "作成中..." : "タスクを作成"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
