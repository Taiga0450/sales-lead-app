import { requirePageSession } from "@/lib/session";
import { getHearingItems, getCurrentHalfKantoTarget } from "@/lib/dealReportData";
import { filterToSalesOwners } from "@/lib/salesMeetingStats";
import SalesMeetingBoard from "@/components/SalesMeetingBoard";

export default async function SalesMeetingPage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  const [allItems, currentHalfTarget] = await Promise.all([
    getHearingItems(accessToken),
    getCurrentHalfKantoTarget(accessToken),
  ]);
  const items = filterToSalesOwners(allItems);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">営業定例ミーティング</h1>
        <p className="mt-1 text-sm text-foreground/60">
          カレンダーで期間を選ぶと、その週・月・四半期・半期の商談数（関東全体・担当者別）がすぐに表示されます（森・富田の商談が対象、商談報告×Hubspotと同じデータです）
        </p>
      </div>
      <SalesMeetingBoard items={items} currentHalfTarget={currentHalfTarget} />
    </div>
  );
}
