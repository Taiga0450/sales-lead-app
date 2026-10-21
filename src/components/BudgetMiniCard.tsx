import Link from "next/link";

const yen = (v: number) => `¥${Math.round(v).toLocaleString()}`;

/**
 * ホームに出す「今月のIS販管費」の要約（管理者のみ）。計算はシフト管理表と同じ
 * （カレンダーのシフト×時給＋確定したアポのインセンティブ、森さんは対象外）。
 */
export default function BudgetMiniCard({
  monthLabel,
  budget,
  spent,
  error,
}: {
  monthLabel: string;
  budget: number | null;
  spent: number;
  error?: string | null;
}) {
  const ratio = budget && budget > 0 ? spent / budget : null;
  const remaining = budget === null ? null : budget - spent;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">IS販管費</h2>
          <p className="text-sm text-foreground/50">{monthLabel}・管理者のみ表示</p>
        </div>
        <Link href="/shift-management" className="text-xs font-semibold text-brand">
          シフト管理表 →
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-amber-700">{error}</p>
      ) : budget === null ? (
        <p className="text-sm text-foreground/50">
          今月の販管費が未設定です。<Link href="/shift-management" className="font-semibold text-brand">シフト管理表</Link>
          で入力してください。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-foreground/50">販管費</p>
              <p className="text-xl font-bold tabular-nums">{yen(budget)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">使用（予定含む）</p>
              <p className="text-xl font-bold tabular-nums">{yen(spent)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">残り</p>
              <p className={`text-xl font-bold tabular-nums ${remaining! < 0 ? "text-rose-600" : "text-emerald-600"}`}>{yen(remaining!)}</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/70">
            <div
              className={`h-full rounded-full ${ratio! > 1 ? "bg-rose-500" : ratio! > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, ratio! * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-foreground/50">消化率 {(ratio! * 100).toFixed(1)}%</p>
        </>
      )}
    </section>
  );
}
