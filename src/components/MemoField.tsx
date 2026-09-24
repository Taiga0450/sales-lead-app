"use client";

import { useState } from "react";
import { getActingAsName } from "@/lib/actingAs";

export default function MemoField({
  leadId,
  memo,
  field = "memo",
  placeholder = "自由記入メモ",
  readOnly = false,
}: {
  leadId: string;
  memo: string;
  /** どちらの列を更新するか。シェアレジ担当者用の欄は "shareRegiMemo" を渡す。 */
  field?: "memo" | "shareRegiMemo";
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(memo);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value, onBehalfOfName: getActingAsName() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "メモの保存に失敗しました。もう一度お試しください。");
    }
  }

  if (readOnly) {
    return (
      <p className="whitespace-pre-wrap rounded-lg border border-border bg-zinc-50 px-3 py-2 text-sm text-foreground/60">
        {value || "（記録なし）"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder={placeholder}
        className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2 self-end">
        {saved && <span className="text-xs text-emerald-600">保存しました</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? "保存中..." : "メモを保存"}
        </button>
      </div>
    </div>
  );
}
