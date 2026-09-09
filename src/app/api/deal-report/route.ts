import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import {
  HEARING_CATEGORIES,
  HEARING_OWNERS,
  upsertHearingDeal,
  associateDealWithCompany,
  type DealHearingContent,
} from "@/lib/hubspot";
import { upsertDealHearingRowForDeal } from "@/lib/google/sheets";

type CreateBody = { dealname?: string; ownerId?: string; hubspotCompanyId?: string } & Partial<
  Omit<DealHearingContent, "id" | "dealname" | "ownerName">
>;

export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const dealname = body.dealname?.trim();
  if (!dealname) {
    return NextResponse.json({ error: "機関名を入力してください" }, { status: 400 });
  }
  const owner = HEARING_OWNERS.find((o) => o.ownerId === body.ownerId);
  if (!owner) {
    return NextResponse.json({ error: "担当者を選択してください" }, { status: 400 });
  }
  if (body.category && !HEARING_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
  }

  try {
    // 機関名が既存のHubSpot Dealと一致する場合はそちらを更新し、重複作成を避ける
    // （一致しない場合のみ新規作成）。
    const deal = await upsertHearingDeal(dealname, body.ownerId!, body);

    // 「機関名で検索」でCompanyしか見つからなかった医療機関から追加した場合、
    // 新規作成したDealをそのCompanyへ関連付ける。
    if (body.hubspotCompanyId) {
      try {
        await associateDealWithCompany(deal.id, body.hubspotCompanyId);
      } catch (assocErr) {
        console.error("deal-company association failed", assocErr);
      }
    }

    // 商談報告×Hubspot画面はシート（dealHearing）に登録された商談だけを一覧表示する方針のため、
    // 新規作成したHubSpot Dealもここでシートに登録し、今後の一覧に出るようにする。
    try {
      await upsertDealHearingRowForDeal(accessToken, deal, owner.name.split(/[\s　]/)[0] ?? owner.name);
    } catch (sheetErr) {
      // HubSpot側の作成/更新自体は成功しているため、シート登録の失敗はログのみに留める
      // （一覧に出ないだけで、データの喪失にはならない——HubSpot上には反映済み）。
      console.error("sheet upsert failed after HubSpot deal upsert", sheetErr);
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `作成に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
