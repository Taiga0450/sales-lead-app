import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { listLeads, exportLeadsToNewTab } from "@/lib/google/sheets";
import type { LeadRow } from "@/lib/leads";

function scoreSummary(lead: LeadRow): string {
  return `適合${lead.適合度スコア || 0} 規模${lead.規模スコア || 0} 地域${lead.地域スコア || 0}`;
}

function businessSummary(lead: LeadRow): string {
  return [lead.事業内容メモ, lead.地域特徴].filter(Boolean).join(" / ");
}

export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tabName?: string; leadIds?: string[] };
  const tabName = body.tabName?.trim();
  const leadIds = body.leadIds ?? [];
  if (!tabName) {
    return NextResponse.json({ error: "タブ名を入力してください" }, { status: 400 });
  }
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "出力対象のリードがありません" }, { status: 400 });
  }

  try {
    const leads = await listLeads(accessToken);
    const byId = new Map(leads.map((l) => [l.id, l]));
    const rows = leadIds
      .map((id) => byId.get(id))
      .filter((l): l is LeadRow => Boolean(l))
      .map((l) => [
        l.架電日,
        l.ステータス,
        l.医療機関名,
        l.電話番号,
        l.住所,
        businessSummary(l),
        scoreSummary(l),
        l.メモ,
      ]);

    const finalTabName = await exportLeadsToNewTab(accessToken, tabName, rows);
    return NextResponse.json({ ok: true, tabName: finalTabName });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "出力に失敗しました" }, { status: 500 });
  }
}
