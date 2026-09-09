import { LEAD_STATUSES, type LeadRow } from "@/lib/leads";

/**
 * 「その日にバイトが架電した案件」を、架電者（実際に架電したログイン中の担当者）×ステータスで
 * すぐに集計できるようにする一覧。架電日が今日のリードだけを対象にする。
 */
export default function TodayCallSummary({ leads }: { leads: LeadRow[] }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysCalls = leads.filter((l) => l.架電日 === todayStr);

  const callerNames = [...new Set(todaysCalls.map((l) => l.架電者 || "不明"))].sort();
  const rows = callerNames.map((caller) => {
    const callerLeads = todaysCalls.filter((l) => (l.架電者 || "不明") === caller);
    const counts = LEAD_STATUSES.map((status) => ({
      status,
      count: callerLeads.filter((l) => (l.ステータス || "未活動") === status).length,
    }));
    return { caller, total: callerLeads.length, counts };
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-center text-sm text-foreground/40 shadow-sm">
        本日（{todayStr}）はまだ架電記録がありません
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-brand-light/40 px-5 py-3">
        <h3 className="font-bold">本日の架電集計（{todayStr}）</h3>
        <p className="text-xs text-foreground/50">担当者ごとに、本日架電した件数をステータス別に集計します</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-brand-light/10 text-xs font-medium text-foreground/50">
              <th className="px-5 py-2 text-left">担当者</th>
              {LEAD_STATUSES.map((s) => (
                <th key={s} className="whitespace-nowrap px-3 py-2 text-right">
                  {s}
                </th>
              ))}
              <th className="px-5 py-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.caller} className="border-b border-border last:border-0">
                <td className="truncate px-5 py-2.5" title={row.caller}>
                  {row.caller}
                </td>
                {row.counts.map(({ status, count }) => (
                  <td key={status} className="px-3 py-2.5 text-right">
                    {count > 0 ? `${count}件` : "—"}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-semibold text-brand">{row.total}件</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
