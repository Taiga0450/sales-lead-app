import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { createHearingDeal, type DealHearingContent } from "@/lib/hubspot";
import { updateDealHearing } from "@/lib/google/sheets";
import { HEARING_CATEGORIES } from "@/lib/dealHearing";

type LinkBody = { dealname?: string; ownerId?: string } & Partial<
  Omit<DealHearingContent, "id" | "dealname" | "ownerName">
>;

/**
 * シートのみに登録されていて（≒昔まとめて取り込まれた等の理由で）HubSpotの取引をまだ
 * 持っていない商談を、今表示されている内容のままHubSpot上に新規の取引として作成し、
 * 以後はその取引と連携させる（source: "sheet" → "hubspot"）。
 */
export async function POST(request: Request, ctx: RouteContext<"/api/deal-report/[id]/link-hubspot">) {
  const { id } = await ctx.params;

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as LinkBody;
  const dealname = body.dealname?.trim();
  if (!dealname) {
    return NextResponse.json({ error: "機関名を入力してください" }, { status: 400 });
  }
  if (!body.ownerId) {
    return NextResponse.json({ error: "取引担当者を選択してください" }, { status: 400 });
  }
  if (body.category && !HEARING_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
  }

  try {
    const newDeal = await createHearingDeal(dealname, body.ownerId, body);
    // 新規に作ったHubSpot取引のIDを、既存のシート行へ書き足すだけでよい（新しい行は作らない）。
    // 以後はこの取引のライブなプロパティが優先して表示される（getHearingItemsのマージ仕様）。
    await updateDealHearing(accessToken, id, { dealname, hubspotDealId: newDeal.id });
    return NextResponse.json({ deal: newDeal });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `HubSpotとの連携に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
