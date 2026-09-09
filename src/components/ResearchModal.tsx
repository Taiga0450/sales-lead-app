"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState("");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "リサーチに失敗しました");

      setResult(`${data.total}件見つかり、うち${data.added}件を新規追加しました`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "リサーチに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        + リサーチ開始
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold">新規リサーチ</h2>
            <p className="mb-4 text-sm text-foreground/60">
              指定エリアの往診対応病院・クリニックをWeb検索で調べ、スコアリングしてシートに追加します
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                地域
                <input
                  required
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="例: 東京都世田谷区"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                追加条件（任意）
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="例: 在宅療養支援診療所"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {result && <p className="text-sm text-emerald-600">{result}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "検索中..." : "リサーチ開始"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
