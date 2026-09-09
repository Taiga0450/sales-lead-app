import { requirePageSession } from "@/lib/session";
import { listSalesTargets } from "@/lib/google/sheets";
import { getRevenueStats, type RevenueStats } from "@/lib/hubspot";
import RevenueDashboard from "@/components/RevenueDashboard";

interface Period {
  fiscalYear: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  targets: Record<string, number>;
}

export default async function RevenuePage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  const targets = await listSalesTargets(accessToken);

  const periodMap = new Map<string, Period>();
  for (const t of targets) {
    const key = `${t.fiscalYear}|${t.periodLabel}`;
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        fiscalYear: t.fiscalYear,
        periodLabel: t.periodLabel,
        startDate: t.startDate,
        endDate: t.endDate,
        targets: {},
      });
    }
    periodMap.get(key)!.targets[t.region] = Number(t.targetAmount || 0);
  }

  // 開始日が新しい順（＝下半期→上半期の逆年代順）だと選択タブが直感に反しにくい
  const periods = [...periodMap.values()].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const items = await Promise.all(
    periods.map(async (period) => {
      let stats: RevenueStats | null = null;
      try {
        stats = await getRevenueStats(period.startDate, period.endDate);
      } catch (error) {
        console.error(`getRevenueStats failed for ${period.fiscalYear} ${period.periodLabel}`, error);
        stats = null;
      }
      return { period, stats };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">売上ダッシュボード</h1>
        <p className="mt-1 text-sm text-foreground/60">
          HubSpotの商談データから、地域別・担当者別の受注状況を自動集計します
        </p>
        <p className="mt-1 text-xs text-foreground/40">
          ※重複商談（同一医療機関・同成約日）とテスト商談は集計から除外しています。金額は「月額利用料(税込・自動)」を優先し、未入力の場合は標準の金額項目を使用します。
        </p>
      </div>

      {items.length > 0 ? (
        <RevenueDashboard items={items} defaultKey="2026|上半期" />
      ) : (
        <p className="text-sm text-foreground/40">目標データがまだ登録されていません。</p>
      )}
    </div>
  );
}
