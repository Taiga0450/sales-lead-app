import { redirect } from "next/navigation";
import { after } from "next/server";
import { requirePageSession } from "@/lib/session";
import { isSupervisorEmail } from "@/lib/callShifts";
import { HEARING_OWNERS, listContractedDealsForUpsell } from "@/lib/hubspot";
import { summarizeUpsellCandidates, type UpsellListSummary } from "@/lib/upsell";
import { listUpsellCalls } from "@/lib/google/serviceSheets";
import { syncUpsellSheetQuietly } from "@/lib/upsellSync";
import UpsellBoard from "@/components/UpsellBoard";

/**
 * 契約済みの医療機関からアップセルを狙う管理者専用ページ。一覧・同期は /api/admin/upsell-extract、
 * 各医療機関のアクティビティ（タスク）は商談報告×Hubspotと同じくHubSpotの取引に直接記録する。
 */
export const maxDuration = 60;

export default async function UpsellPage() {
  const session = await requirePageSession();
  if (!isSupervisorEmail(session.user?.email ?? "")) {
    redirect("/");
  }

  let initial: UpsellListSummary | null = null;
  let initialError: string | null = null;
  try {
    const [deals, calls] = await Promise.all([listContractedDealsForUpsell(), listUpsellCalls()]);
    initial = summarizeUpsellCandidates(deals, calls);
    after(() => syncUpsellSheetQuietly({ deals, calls }));
  } catch (err) {
    console.error("upsell list fetch failed", err);
    initialError = err instanceof Error ? err.message.slice(0, 300) : "読み込みに失敗しました";
  }

  return <UpsellBoard owners={HEARING_OWNERS} initial={initial} initialError={initialError} />;
}
