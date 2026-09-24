"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getActingAsName } from "@/lib/actingAs";

/**
 * シェアレジ（別事業）担当者が使うメモ欄。オンコールの架電メモとは別の列
 * （lead.シェアレジメモ）に保存する。オンコール営業・シェアレジどちらのアカウントでログイン
 * していても同じLeadTableの架電メモの下に表示される（シェアレジ側は架電メモが閲覧専用になる）。
 */
export default function ShareRegiMemoField({ leadId, memo }: { leadId: string; memo: string }) {
  const router = useRouter();
  const [value, setValue] = useState(memo);
  const [prevMemo, setPrevMemo] = useState(memo);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  // 入力中（フォーカス中）にサーバー側の最新値で上書きすると、他の行の保存で発生した
  // router.refresh()が入力途中の文字を消してしまう。フォーカスが外れている間だけ同期する。
  if (memo !== prevMemo) {
    setPrevMemo(memo);
    if (!focused) setValue(memo);
  }

  async function handleBlur() {
    setFocused(false);
    if (value === memo) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareRegiMemo: value, onBehalfOfName: getActingAsName() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setValue(memo);
      window.alert(data.error ?? "シェアレジメモの更新に失敗しました。もう一度お試しください。");
    }
  }

  return (
    <div>
      <span className="mb-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
        シェアレジ
      </span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        disabled={saving}
        rows={2}
        placeholder="シェアレジメモを入力"
        className="w-full resize-none rounded-lg border border-violet-200 bg-violet-50/30 px-2 py-1.5 text-xs outline-none focus:border-violet-400 disabled:opacity-50"
      />
    </div>
  );
}
