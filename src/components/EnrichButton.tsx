"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EnrichButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/enrich`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "調査に失敗しました");

      setNotice(
        data.usedAi
          ? "AIによるWeb検索で詳細を更新しました。"
          : "地域の一般的な特徴のみ反映しました（AI機能が未設定のため、個別の事業内容までは調べていません）。",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "調査に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "リサーチ中..." : "リサーチする"}
      </button>
      {notice && <p className="text-xs text-emerald-600">{notice}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
