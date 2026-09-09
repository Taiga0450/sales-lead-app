import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { getHearingDealsByIds } from "@/lib/hubspot";
import { upsertDealHearingRowForDeal } from "@/lib/google/sheets";

/**
 * 「機関名で検索」でHubSpot全体から見つけた商談を、dealHearingシートに取り込んで
 * 一覧に反映する（＝以後アプリ上で直接編集できるようにする）。
 */
export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { hubspotDealId?: string };
  const hubspotDealId = body.hubspotDealId?.trim();
  if (!hubspotDealId) {
    return NextResponse.json({ error: "商談IDが必要です" }, { status: 400 });
  }

  try {
    const [deal] = await getHearingDealsByIds([hubspotDealId]);
    if (!deal) {
      return NextResponse.json({ error: "HubSpot上に見つかりませんでした" }, { status: 404 });
    }
    await upsertDealHearingRowForDeal(accessToken, deal, deal.ownerName);
    return NextResponse.json({ deal: { ...deal, source: "hubspot" } });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `追加に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
