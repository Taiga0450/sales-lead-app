import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { hasAnthropicKey } from "@/lib/anthropic/client";
import { enrichLead } from "@/lib/anthropic/enrich";
import { getGenericRegionNotes } from "@/lib/region-notes";
import { getLeadById, updateLead } from "@/lib/google/sheets";

export async function POST(_request: Request, ctx: RouteContext<"/api/leads/[id]/enrich">) {
  const { id } = await ctx.params;

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const lead = await getLeadById(accessToken, id);
    if (!lead) {
      return NextResponse.json({ error: "リードが見つかりません" }, { status: 404 });
    }

    if (hasAnthropicKey) {
      const result = await enrichLead(lead);
      const total = Math.round((result.fit_score + result.size_score + result.region_score) / 3);

      const updated = await updateLead(accessToken, id, {
        地域特徴: result.region_notes || lead.地域特徴,
        事業内容メモ: result.summary || lead.事業内容メモ,
        メールアドレス: result.email || lead.メールアドレス,
        情報ソースURL: result.source_url || lead.情報ソースURL,
        適合度スコア: result.fit_score ? String(result.fit_score) : lead.適合度スコア,
        規模スコア: result.size_score ? String(result.size_score) : lead.規模スコア,
        地域スコア: result.region_score ? String(result.region_score) : lead.地域スコア,
        総合スコア: total ? String(total) : lead.総合スコア,
      });

      return NextResponse.json({ lead: updated, usedAi: true });
    }

    // No-AI fallback: only fill in the generic, ward-level region note — never
    // fabricate institution-specific facts (business summary, scores, email)
    // without a real source.
    const updated = await updateLead(accessToken, id, {
      地域特徴: lead.地域特徴 || getGenericRegionNotes(lead.地域),
    });

    return NextResponse.json({ lead: updated, usedAi: false });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "調査中にエラーが発生しました" }, { status: 500 });
  }
}
