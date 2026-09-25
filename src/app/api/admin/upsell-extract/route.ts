import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { canUseUpsell } from "@/lib/upsellAccess";
import { listContractedDealsForUpsell } from "@/lib/hubspot";
import { summarizeUpsellCandidates } from "@/lib/upsell";
import { syncUpsellSheet } from "@/lib/upsellSync";
import { listUpsellCalls } from "@/lib/google/serviceSheets";

export const maxDuration = 60;

export async function POST(request: Request) {
  let email: string | undefined;
  try {
    const session = await requireSession();
    email = session.user?.email ?? undefined;
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!email || !canUseUpsell(email)) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { mode?: "preview" | "commit" };

  try {
    if (body.mode === "commit") {
      return NextResponse.json(await syncUpsellSheet());
    }

    const [deals, calls] = await Promise.all([listContractedDealsForUpsell(), listUpsellCalls()]);
    return NextResponse.json(summarizeUpsellCandidates(deals, calls));
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `処理に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
