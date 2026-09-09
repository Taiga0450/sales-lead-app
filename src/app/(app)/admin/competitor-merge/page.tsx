"use client";

import { useState } from "react";

interface MatchRow {
  leadId: string;
  existingName: string;
  newName: string;
  phone: string;
  note: string;
}

interface NewEntryRow {
  name: string;
  phone: string;
  note: string;
}

interface PreviewResult {
  totalSourceRows: number;
  dedupedSourceRows: number;
  matchedCount: number;
  newCount: number;
  matched: MatchRow[];
  newEntries: NewEntryRow[];
}

interface CommitResult {
  updatedCount: number;
  createdCount: number;
  tabName: string | null;
}

export default function CompetitorMergePage() {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoadingPreview(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/competitor-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "プレビューに失敗しました");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プレビューに失敗しました");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    const ok = window.confirm(
      `既存${preview.matchedCount}件の医療機関名を上書き・メモを追記し、新規${preview.newCount}件を作成します。よろしいですか？（元に戻せません）`,
    );
    if (!ok) return;

    setLoadingCommit(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/competitor-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "実行に失敗しました");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "実行に失敗しました");
    } finally {
      setLoadingCommit(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">他社利用医療機関リストの取り込み</h1>
        <p className="mt-1 text-sm text-foreground/60">
          「他社利用医療機関リスト_MOVEMENT対応リストより抽出」を電話番号で照合し、既存リードには医療機関名の上書きとメモの追記を、未登録のものは新規リードとして作成します。作成・更新した医療機関は「他社リスト」タブにまとめて書き出します。
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={loadingPreview}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loadingPreview ? "確認中..." : "1. プレビューを確認"}
          </button>
          <button
            type="button"
            onClick={runCommit}
            disabled={!preview || loadingCommit}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {loadingCommit ? "実行中..." : "2. 実行する"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {preview && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-foreground/50">元リスト行数</p>
                <p className="text-lg font-bold">{preview.totalSourceRows}件</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">重複統合後</p>
                <p className="text-lg font-bold">{preview.dedupedSourceRows}件</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">既存に一致（上書き・メモ追記）</p>
                <p className="text-lg font-bold text-brand">{preview.matchedCount}件</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">アプリ上に見つからない（新規作成）</p>
                <p className="text-lg font-bold text-amber-600">{preview.newCount}件</p>
              </div>
            </div>

            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground/70">
                新規作成される医療機関（{preview.newEntries.length}件）
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/70">
                {preview.newEntries.map((e) => (
                  <li key={e.phone}>
                    {e.name}（{e.phone}）
                  </li>
                ))}
              </ul>
            </details>

            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground/70">
                既存リードに一致（{preview.matched.length}件）
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/70">
                {preview.matched.map((m) => (
                  <li key={m.leadId}>
                    {m.existingName} → {m.newName}（{m.phone}）
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {result && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            完了しました。既存{result.updatedCount}件を更新、新規{result.createdCount}件を作成しました。
            {result.tabName && <>スプレッドシートの「{result.tabName}」タブに一覧を書き出しました。</>}
          </p>
        )}
      </div>
    </div>
  );
}
