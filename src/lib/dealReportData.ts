import { getHearingDealsByIds } from "./hubspot";
import { listDealHearings, listSalesTargets } from "./google/sheets";
import { dealHearingRowToListItem, fiscalHalfRange, type HearingListItem } from "./dealHearing";

/**
 * HubSpot側の値が空欄のフィールドだけ、シート側（このアプリで入力・取り込んだデータ）の値で埋める。
 * HubSpotへの書き込みが権限不足で失敗し続けている間、一括インポートした見込み売上等が
 * 「HubSpot側は空 → 表示も空」になってしまうのを防ぐための、フィールド単位のフォールバック。
 * HubSpot側に既に値が入っているフィールドは上書きしない。
 */
function fillBlanksFromSheet(hubspotItem: HearingListItem, sheetItem: HearingListItem): HearingListItem {
  return {
    ...hubspotItem,
    ownerName: hubspotItem.ownerName || sheetItem.ownerName,
    category: hubspotItem.category || sheetItem.category,
    probability: hubspotItem.probability || sheetItem.probability,
    plan: hubspotItem.plan || sheetItem.plan,
    product: hubspotItem.product || sheetItem.product,
    chart: hubspotItem.chart || sheetItem.chart,
    chartTranscribed: hubspotItem.chartTranscribed ?? sheetItem.chartTranscribed,
    expectedRevenue: hubspotItem.expectedRevenue ?? sheetItem.expectedRevenue,
    area: hubspotItem.area || sheetItem.area,
    firstMeetingDate: hubspotItem.firstMeetingDate || sheetItem.firstMeetingDate,
    patientsPerMonth: hubspotItem.patientsPerMonth ?? sheetItem.patientsPerMonth,
    callsPerMonth: hubspotItem.callsPerMonth ?? sheetItem.callsPerMonth,
    visitsPerMonth: hubspotItem.visitsPerMonth ?? sheetItem.visitsPerMonth,
    hearingNotes: hubspotItem.hearingNotes || sheetItem.hearingNotes,
    dealStage: hubspotItem.dealStage || sheetItem.dealStage,
    contractDate: hubspotItem.contractDate || sheetItem.contractDate,
  };
}

/**
 * 商談報告×Hubspot画面（および同じ数値を使うホーム画面）が対象にする商談一覧。
 * シート（dealHearing）に登録されている商談だけを対象にする——HubSpot全体（森・富田だけでも
 * 238件）を検索すると、取り込んでいない無関係な商談まで大量に出てきてしまうため。
 * シートがhubspotDealIdを持つ行だけ、該当するHubSpot Dealをピンポイントで取得してマージする。
 */
export async function getHearingItems(accessToken: string): Promise<HearingListItem[]> {
  const sheetRows = await listDealHearings(accessToken);
  const linkedIds = sheetRows.filter((r) => r.hubspotDealId).map((r) => r.hubspotDealId);
  const hubspotDeals = await getHearingDealsByIds(linkedIds);
  const hubspotById = new Map(hubspotDeals.map((d) => [d.id, d]));

  return sheetRows.map((row) => {
    const sheetItem = dealHearingRowToListItem(row);
    const hubspotDeal = row.hubspotDealId ? hubspotById.get(row.hubspotDealId) : undefined;
    if (!hubspotDeal) return sheetItem;
    return fillBlanksFromSheet({ ...hubspotDeal, source: "hubspot" }, sheetItem);
  });
}

/**
 * 今期（上半期/下半期）の関東目標を、targetsシートから取り出す。商談報告×Hubspot画面・ホーム画面は
 * 森・富田（ともに関東）の商談だけを扱うため、地域は関東固定でよい。同じ期・地域の行が
 * 複数ある場合は最後に登録された行を優先する（他の目標入力箇所と同じ「後勝ち」の方針）。
 */
export async function getCurrentHalfKantoTarget(accessToken: string): Promise<number> {
  const targets = await listSalesTargets(accessToken);
  const currentHalf = fiscalHalfRange(new Date());
  let amount = 0;
  for (const t of targets) {
    if (t.fiscalYear === String(currentHalf.fiscalYear) && t.periodLabel === currentHalf.half && t.region === "関東") {
      amount = Number(t.targetAmount || 0);
    }
  }
  return amount;
}
