"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getActingAsName } from "@/lib/actingAs";

export default function CallToggle({ leadId, calledAt }: { leadId: string; calledAt: string }) {
  const router = useRouter();
  const [value, setValue] = useState(calledAt);
  const [saving, setSaving] = useState(false);

  async function handleChange(newValue: string) {
    setValue(newValue);
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calledAt: newValue, onBehalfOfName: getActingAsName() || undefined }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-foreground/60">
      架電日
      <input
        type="date"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50"
      />
      {value && (
        <button
          type="button"
          onClick={() => handleChange("")}
          disabled={saving}
          title="架電記録を取り消す"
          className="rounded-lg border border-border px-2 py-1.5 text-xs text-foreground/50 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
        >
          取り消す
        </button>
      )}
    </label>
  );
}
