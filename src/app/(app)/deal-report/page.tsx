import { requirePageSession } from "@/lib/session";
import { HEARING_OWNERS } from "@/lib/hubspot";
import { getHearingItems, getCurrentHalfKantoTarget } from "@/lib/dealReportData";
import type { HearingListItem } from "@/lib/dealHearing";
import DealReportBoard from "@/components/DealReportBoard";

export default async function DealReportPage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  let items: HearingListItem[] = [];
  let error: string | null = null;
  let currentHalfTarget = 0;

  try {
    currentHalfTarget = await getCurrentHalfKantoTarget(accessToken);
  } catch (err) {
    console.error("target fetch failed", err);
  }

  try {
    items = await getHearingItems(accessToken);
  } catch (err) {
    console.error("deal-report data fetch failed", err);
    error = "データの取得に失敗しました。";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">商談報告×Hubspot</h1>
        <p className="mt-1 text-sm text-foreground/60">
          対応中の商談のヒアリング内容を入力すると、HubSpotの商談プロパティに反映されます
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground/40 shadow-sm">{error}</p>
      ) : (
        <DealReportBoard items={items} owners={HEARING_OWNERS} currentHalfTarget={currentHalfTarget} />
      )}
    </div>
  );
}
