"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function AssigneeField({
  leadId,
  assignee,
  options,
}: {
  leadId: string;
  assignee: string;
  options: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(assignee);
  const [saving, setSaving] = useState(false);

  // 既存データが選択肢にまだ無いメールアドレス（自由入力時代の値等）でも消えないようにする。
  const selectOptions = useMemo(
    () => (assignee && !options.includes(assignee) ? [assignee, ...options] : options),
    [assignee, options],
  );

  async function handleChange(newValue: string) {
    setValue(newValue);
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee: newValue }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="w-40 rounded-lg border border-border px-2.5 py-1.5 text-right text-sm outline-none focus:border-brand disabled:opacity-50"
    >
      <option value="">未設定</option>
      {selectOptions.map((email) => (
        <option key={email} value={email}>
          {email}
        </option>
      ))}
    </select>
  );
}
