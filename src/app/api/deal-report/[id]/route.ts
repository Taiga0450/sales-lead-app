import { NextResponse } from "next/server";
import { requireSession, requireAccessToken } from "@/lib/session";
import { updateDealHearingContent, deleteHearingDeal, type DealHearingContent } from "@/lib/hubspot";
import { updateDealHearing, deleteDealHearing, deleteDealHearingByHubspotId } from "@/lib/google/sheets";
import { HEARING_CATEGORIES, type DealHearingRow } from "@/lib/dealHearing";

type HearingBody = { source?: "hubspot" | "sheet" } & Partial<Omit<DealHearingContent, "id">>;

function toSheetPatch(body: HearingBody): Partial<DealHearingRow> {
  const patch: Partial<DealHearingRow> = {};
  if (body.dealname !== undefined) patch.dealname = body.dealname;
  if (body.ownerName !== undefined) patch.ownerName = body.ownerName;
  if (body.dealStage !== undefined) patch.dealStage = body.dealStage;
  if (body.contractDate !== undefined) patch.contractDate = body.contractDate;
  if (body.category !== undefined) patch.category = body.category;
  if (body.probability !== undefined) patch.probability = body.probability;
  if (body.plan !== undefined) patch.plan = body.plan;
  if (body.product !== undefined) patch.product = body.product;
  if (body.chart !== undefined) patch.chart = body.chart;
  if (body.chartTranscribed !== undefined) {
    patch.chartTranscribed = body.chartTranscribed === null ? "" : String(body.chartTranscribed);
  }
  if (body.expectedRevenue !== undefined) {
    patch.expectedRevenue = body.expectedRevenue === null ? "" : String(body.expectedRevenue);
  }
  if (body.area !== undefined) patch.area = body.area;
  if (body.firstMeetingDate !== undefined) patch.firstMeetingDate = body.firstMeetingDate;
  if (body.patientsPerMonth !== undefined) {
    patch.patientsPerMonth = body.patientsPerMonth === null ? "" : String(body.patientsPerMonth);
  }
  if (body.callsPerMonth !== undefined) {
    patch.callsPerMonth = body.callsPerMonth === null ? "" : String(body.callsPerMonth);
  }
  if (body.visitsPerMonth !== undefined) {
    patch.visitsPerMonth = body.visitsPerMonth === null ? "" : String(body.visitsPerMonth);
  }
  if (body.hearingNotes !== undefined) patch.hearingNotes = body.hearingNotes;
  return patch;
}

export async function POST(request: Request, ctx: RouteContext<"/api/deal-report/[id]">) {
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as HearingBody;

  if (body.category && !HEARING_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
  }
  if (body.dealname !== undefined && !body.dealname.trim()) {
    return NextResponse.json({ error: "機関名を入力してください" }, { status: 400 });
  }

  if (body.source === "sheet") {
    let accessToken: string;
    try {
      accessToken = await requireAccessToken();
    } catch {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    try {
      await updateDealHearing(accessToken, id, toSheetPatch(body));
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message.slice(0, 300) : "";
      return NextResponse.json({ error: `更新に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
    }
  }

  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    await updateDealHearingContent(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `更新に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}

/**
 * 重複した医療機関を削除する。source="hubspot"の場合はHubSpot Dealをアーカイブし、
 * それを参照しているシート行（あれば）も削除する。source="sheet"の場合はシート行のみ削除する。
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/deal-report/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { source?: "hubspot" | "sheet" };

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    if (body.source === "hubspot") {
      await deleteHearingDeal(id);
      await deleteDealHearingByHubspotId(accessToken, id);
    } else {
      await deleteDealHearing(accessToken, id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `削除に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
