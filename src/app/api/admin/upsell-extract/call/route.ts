import { NextResponse, after } from "next/server";
import { requireSession } from "@/lib/session";
import { canUseUpsell } from "@/lib/upsellAccess";
import { archiveCallLog, createDealCallLog } from "@/lib/hubspot";
import { listUpsellCalls, saveUpsellCall } from "@/lib/google/serviceSheets";
import { syncUpsellSheetQuietly } from "@/lib/upsellSync";

export const maxDuration = 60;

/**
 * アップセル画面の「架電済み」チェックのON/OFF。記録の正はシートの upsellCalls タブで、
 * あわせてHubSpotの取引にコールを記録する（OFFにしたらそのコールをアーカイブ）。
 * HubSpot側が失敗してもチェック自体は保存し、warningで知らせる——HubSpotの一時的な不調や
 * 権限不足でアプリ上の架電管理まで止まらないようにするため。
 */
export async function POST(request: Request) {
  let email = "";
  try {
    const session = await requireSession();
    email = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!canUseUpsell(email)) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { dealId?: string; dealname?: string; called?: boolean };
  if (!body.dealId || !/^\d+$/.test(body.dealId) || typeof body.called !== "boolean") {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const dealId = body.dealId;

  try {
    const existing = (await listUpsellCalls())[dealId];
    let warning: string | null = null;

    if (body.called) {
      if (existing) return NextResponse.json({ call: existing, warning: null });
      const now = new Date();
      let hubspotCallId = "";
      try {
        const call = await createDealCallLog(dealId, {
          title: `アップセル架電${body.dealname ? `：${body.dealname}` : ""}`,
          body: `営業アプリのアップセル画面で「架電済み」にチェック（${email}）`,
          timestamp: now,
        });
        hubspotCallId = call.id;
      } catch (error) {
        console.error(error);
        warning = "架電済みは保存しましたが、HubSpotへのコール記録に失敗しました";
      }
      const record = { dealId, calledAt: now.toISOString(), calledBy: email, hubspotCallId };
      await saveUpsellCall(dealId, record);
      after(() => syncUpsellSheetQuietly());
      return NextResponse.json({ call: record, warning });
    }

    if (existing?.hubspotCallId) {
      try {
        await archiveCallLog(existing.hubspotCallId);
      } catch (error) {
        console.error(error);
        warning = "チェックは外しましたが、HubSpotのコール記録の取り消しに失敗しました（HubSpot上で削除してください）";
      }
    }
    await saveUpsellCall(dealId, null);
    after(() => syncUpsellSheetQuietly());
    return NextResponse.json({ call: null, warning });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `保存に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
