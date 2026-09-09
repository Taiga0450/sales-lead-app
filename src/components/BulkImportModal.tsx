"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLACEHOLDER = `[
  {
    "name": "サンプルクリニック",
    "facilityType": "クリニック",
    "phone": "03-0000-0000",
    "region": "東京都〇〇区",
    "regionNotes": "地域の特徴",
    "address": "住所",
    "email": "",
    "summary": "事業内容の要約",
    "fitScore": 4,
    "sizeScore": 3,
    "regionScore": 5,
    "sourceUrl": "https://..."
  }
]`;

export default function BulkImportModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    let leads: unknown;
    try {
      leads = JSON.parse(text);
    } catch {
      setError("JSONとして読み込めませんでした。形式を確認してください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "インポートに失敗しました");

      let message = `${data.added}件を追加しました`;
      if (data.skipped > 0) message += `（重複${data.skipped}件はスキップ）`;
      if (data.errors?.length > 0) message += `\n警告: ${data.errors.join(" / ")}`;
      setResult(message);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground/70 shadow-sm transition hover:bg-zinc-50"
      >
        一括インポート
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold">リードを一括インポート</h2>
            <p className="mb-4 text-sm text-foreground/60">
              JSON形式のリード一覧を貼り付けてください。列がずれる心配のない形式です。
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                rows={12}
                spellCheck={false}
                className="rounded-lg border border-border px-3 py-2 font-mono text-xs outline-none focus:border-brand"
              />

              {result && <p className="whitespace-pre-wrap text-sm text-emerald-600">{result}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}

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
                  disabled={loading || !text.trim()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "インポート中..." : "インポートする"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
