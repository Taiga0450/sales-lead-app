"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** ホームの「今期の商談状況」から、今期の地域別の売上目標を設定する（管理者のみ）。 */
export default function TargetEditor({
  fiscalYear,
  half,
  kanto,
  osaka,
}: {
  fiscalYear: number;
  half: "上半期" | "下半期";
  kanto: number;
  osaka: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kantoDraft, setKantoDraft] = useState(String(kanto || ""));
  const [osakaDraft, setOsakaDraft] = useState(String(osaka || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: String(fiscalYear),
          periodLabel: half,
          targets: [
            { region: "関東", targetAmount: kantoDraft },
            { region: "大阪", targetAmount: osakaDraft },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-brand-light"
      >
        {kanto > 0 ? "目標を変更" : "目標を設定"}
      </button>
    );
  }

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-10 text-xs text-foreground/50">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder="0"
        className="w-36 rounded-md border border-border px-2 py-1 text-sm"
      />
      <span className="text-xs text-foreground/40">円</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <p className="text-xs font-semibold text-foreground/60">
        {fiscalYear}年度{half}の売上目標（ゲージは関東の目標で表示）
      </p>
      {field("関東", kantoDraft, setKantoDraft)}
      {field("大阪", osakaDraft, setOsakaDraft)}
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-rose-600">{error}</span>}
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-foreground/50 hover:text-foreground">
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
