import { listContractedDealsForUpsell, type UpsellCandidate } from "@/lib/hubspot";
import { listUpsellCalls, replaceSheetValues, type UpsellCallRecord } from "@/lib/google/serviceSheets";
import { UPSELL_SHEET_HEADERS, compareByContractEnd, isRenewalWindow, upsellCandidateToRow } from "@/lib/upsell";

export const UPSELL_SHEET_NAME = "アップセル";

/**
 * 日付・数値はシート側で解釈させたいが、「=」「+」始まりの文字列が数式として実行されるのと、
 * 0始まりの数字（ハイフン無しの電話番号など）が数値化されて先頭の0が消えるのは防ぐ。
 */
function asLiteral(value: string): string {
  return /^[=+]/.test(value) || /^0\d+$/.test(value) ? `'${value}` : value;
}

export interface UpsellSyncResult {
  totalCount: number;
  renewalCount: number;
  missingDatesCount: number;
  syncedAt: string;
}

/**
 * HubSpotの契約済み商談を取り直して「アップセル」タブを丸ごと差し替える。タブはHubSpotの鏡として
 * 扱う（手入力のメモ等は次回同期で消える）——HubSpot側を正とし、シートはいつ見ても最新にするため。
 * ログイン中ユーザーのトークンに依存しないよう、サービスアカウントで書き込む（定期同期から呼ぶため）。
 */
export async function syncUpsellSheet(
  now: Date = new Date(),
  /** 呼び出し側ですでにHubSpot・架電記録を取得済みなら渡す（同じ内容を取り直さないため） */
  prefetched?: { deals: UpsellCandidate[]; calls: Record<string, UpsellCallRecord> },
): Promise<UpsellSyncResult> {
  const [deals, calls] = prefetched
    ? [[...prefetched.deals], prefetched.calls]
    : await Promise.all([listContractedDealsForUpsell(), listUpsellCalls()]);
  const candidates = deals.sort(compareByContractEnd);
  const syncedAt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(now);

  await replaceSheetValues(UPSELL_SHEET_NAME, [
    [...UPSELL_SHEET_HEADERS, `最終同期: ${syncedAt}`],
    ...candidates.map((c) => upsellCandidateToRow(c, now, calls[c.id]).map(asLiteral)),
  ]);

  return {
    totalCount: candidates.length,
    renewalCount: candidates.filter((c) => isRenewalWindow(c, now)).length,
    missingDatesCount: candidates.filter((c) => !c.contractStartDate || !c.contractEndDate).length,
    syncedAt,
  };
}

/**
 * 画面表示・架電済みチェックの後に、レスポンスを待たせず裏で「アップセル」タブを同期する用。
 * Vercel Hobbyの定期実行は1日1回までなので、使われたタイミングでも最新化してタイムリーさを補う。
 */
export async function syncUpsellSheetQuietly(
  prefetched?: Parameters<typeof syncUpsellSheet>[1],
): Promise<void> {
  try {
    await syncUpsellSheet(new Date(), prefetched);
  } catch (error) {
    console.error("upsell background sync failed", error);
  }
}
