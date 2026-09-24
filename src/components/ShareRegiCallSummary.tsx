import type { ShareRegiCallerStats } from "@/lib/shareRegiCalls";

/**
 * シェアレジの担当者別架電件数（本日・今月・累計）。シェアレジメモを保存した回数から数える
 * （同じ人・同じ医療機関・同じ日の保存は1件）。営業の「本日の架電集計」とは別物として紫系で分ける。
 */
export default function ShareRegiCallSummary({
  stats,
  error,
}: {
  stats: ShareRegiCallerStats[];
  error?: string | null;
}) {
  const totals = stats.reduce(
    (acc, s) => ({ today: acc.today + s.today, thisMonth: acc.thisMonth + s.thisMonth, total: acc.total + s.total }),
    { today: 0, thisMonth: 0, total: 0 },
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-200 bg-surface shadow-sm">
      <div className="border-b border-violet-200 bg-violet-50 px-5 py-3">
        <h3 className="font-bold text-violet-700">シェアレジ 架電件数</h3>
        <p className="text-xs text-foreground/50">
          シェアレジメモを保存した件数を、画面上部で選んだ架電者ごとに集計します（同じ日に同じ医療機関は1件）
        </p>
      </div>
      {error ? (
        <p className="px-5 py-4 text-sm text-red-600">{error}</p>
      ) : stats.length === 0 ? (
        <p className="px-5 py-4 text-center text-sm text-foreground/40">まだ架電記録がありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium text-foreground/50">
              <th className="px-5 py-2 text-left">架電者</th>
              <th className="px-5 py-2 text-right">本日</th>
              <th className="px-5 py-2 text-right">今月</th>
              <th className="px-5 py-2 text-right">累計</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.callerName} className="border-b border-border last:border-b-0">
                <td className="px-5 py-2 font-medium">{s.callerName}</td>
                <td className="px-5 py-2 text-right">{s.today}件</td>
                <td className="px-5 py-2 text-right">{s.thisMonth}件</td>
                <td className="px-5 py-2 text-right">{s.total}件</td>
              </tr>
            ))}
            <tr className="bg-violet-50/50 font-bold">
              <td className="px-5 py-2">合計</td>
              <td className="px-5 py-2 text-right">{totals.today}件</td>
              <td className="px-5 py-2 text-right">{totals.thisMonth}件</td>
              <td className="px-5 py-2 text-right">{totals.total}件</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
