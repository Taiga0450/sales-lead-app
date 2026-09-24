import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { updateLead, LEAD_STATUSES } from "@/lib/google/sheets";
import { syncLeadToHubSpot } from "@/lib/hubspot";
import { getSharedAccountKey, isSharedAccountEmail } from "@/lib/actingAs";
import { appendShareRegiCall } from "@/lib/google/serviceSheets";
import { isSupervisorEmail } from "@/lib/callShifts";

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/status">) {
  const { id } = await ctx.params;

  let accessToken: string;
  let callerEmail: string | undefined;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    callerEmail = session.user?.email ?? undefined;
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    memo?: string;
    shareRegiMemo?: string;
    calledAt?: string;
    assignee?: string;
    onBehalfOfName?: string;
  };

  if (body.status && !LEAD_STATUSES.includes(body.status as (typeof LEAD_STATUSES)[number])) {
    return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
  }

  // シェアレジの共有アカウントでは、シェアレジメモの保存＝架電として「誰が」架電したかを記録する。
  // 名前が無いと件数を集計できないため、画面上部のバナーで架電者を選ぶまで保存させない。
  const isShareRegiAccount = getSharedAccountKey(callerEmail ?? "") === "shareregi";
  const shareRegiCaller = body.onBehalfOfName?.trim() ?? "";
  if (isShareRegiAccount && body.shareRegiMemo !== undefined && !shareRegiCaller) {
    return NextResponse.json(
      { error: "架電した人の名前が選ばれていません。画面上部で名前を選んでから保存してください。" },
      { status: 400 },
    );
  }

  try {
    const patch: Record<string, string> = {};
    if (body.status) patch.ステータス = body.status;
    if (body.memo !== undefined) patch.メモ = body.memo;
    if (body.shareRegiMemo !== undefined) patch.シェアレジメモ = body.shareRegiMemo;
    if (body.calledAt !== undefined) {
      // バイトメンバーは全員contact-sales@oncall-japan.comという共有アカウントでログインしているため、
      // 架電者をセッションのメールアドレスのまま記録すると誰が架電したか分からなくなる。共有アカウント
      // （または代理入力できる統括担当者）からの場合は、クライアントが申告した名前(onBehalfOfName)を
      // 代わりに使う。
      const onBehalfOfName = body.onBehalfOfName?.trim();
      const useOnBehalfOf =
        onBehalfOfName && (isSharedAccountEmail(callerEmail ?? "") || isSupervisorEmail(callerEmail ?? ""));
      patch.架電日 = body.calledAt;
      patch.架電者 = body.calledAt ? (useOnBehalfOf ? onBehalfOfName : (callerEmail ?? "")) : "";
    }
    if (body.assignee !== undefined) patch.担当者 = body.assignee;

    const updated = await updateLead(accessToken, id, patch);

    if (isShareRegiAccount && body.shareRegiMemo !== undefined) {
      try {
        await appendShareRegiCall({
          leadId: id,
          leadName: updated.医療機関名,
          callerName: shareRegiCaller,
          calledAt: new Date().toISOString(),
        });
      } catch (error) {
        // メモ自体は保存済み。記録の失敗でメモ保存までエラー扱いにしない
        console.error("shareregi call log failed", error);
      }
    }

    if (body.status !== undefined || body.memo !== undefined || body.calledAt !== undefined) {
      try {
        await syncLeadToHubSpot(updated);
      } catch (error) {
        console.error("HubSpot sync failed", error);
      }
    }

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
