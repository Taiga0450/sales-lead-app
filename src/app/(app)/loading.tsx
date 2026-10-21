/**
 * 画面遷移中（サーバーでデータを集めている間）の表示。ホームやリード一覧は読み込みに数秒かかるため、
 * 何も変わらずに固まって見えないよう、進捗バーと「読み込み中」を出す。
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/3 animate-[progress-slide_1.2s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
      <p className="text-sm text-foreground/50">読み込み中…</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
    </div>
  );
}
