import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { buildCompetitorMergePlan, executeCompetitorMerge } from "@/lib/competitorImport";
import { listLeads, exportLeadsToNewTab } from "@/lib/google/sheets";
import type { LeadRow } from "@/lib/leads";

function scoreSummary(lead: LeadRow): string {
  return `適合${lead.適合度スコア || 0} 規模${lead.規模スコア || 0} 地域${lead.地域スコア || 0}`;
}

function businessSummary(lead: LeadRow): string {
  return [lead.事業内容メモ, lead.地域特徴].filter(Boolean).join(" / ");
}

/**
 * 他社リスト一括取り込みは実データを大量に作成・上書きする一度限りの社内作業用ツールのため、
 * サイドバーには載せず、実行できる人もこの担当者に限定する（他のログイン中スタッフが
 * 誤ってURLを踏んでも実行できないようにするため）。
 */
const ADMIN_EMAILS = new Set(["t.mori@oncall-japan.com"]);

export async function POST(request: Request) {
  let accessToken: string;
  let email: string | undefined;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    email = session.user?.email ?? undefined;
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { mode?: "preview" | "commit" };

  try {
    const plan = await buildCompetitorMergePlan(accessToken);

    if (body.mode !== "commit") {
      return NextResponse.json({
        totalSourceRows: plan.totalSourceRows,
        dedupedSourceRows: plan.dedupedSourceRows,
        matchedCount: plan.matched.length,
        newCount: plan.newEntries.length,
        matched: plan.matched,
        newEntries: plan.newEntries,
      });
    }

    const result = await executeCompetitorMerge(accessToken, plan);
    const touchedIds = [...result.updatedIds, ...result.createdIds];

    let tabName: string | null = null;
    if (touchedIds.length > 0) {
      const leads = await listLeads(accessToken);
      const byId = new Map(leads.map((l) => [l.id, l]));
      const rows = touchedIds
        .map((id) => byId.get(id))
        .filter((l): l is LeadRow => Boolean(l))
        .map((l) => [l.架電日, l.ステータス, l.医療機関名, l.電話番号, l.住所, businessSummary(l), scoreSummary(l), l.メモ]);
      tabName = await exportLeadsToNewTab(accessToken, "他社リスト", rows);
    }

    return NextResponse.json({
      updatedCount: result.updatedIds.length,
      createdCount: result.createdIds.length,
      tabName,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
}
