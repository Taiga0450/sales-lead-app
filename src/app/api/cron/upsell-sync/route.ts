import { NextResponse } from "next/server";
import { syncUpsellSheet } from "@/lib/upsellSync";

export const maxDuration = 60;

/**
 * 「アップセル」タブの定期同期用。ログインセッションを持たない呼び出し元（Vercel Cron・
 * ローカルの scripts/sync_upsell_watch.mjs）から叩くため、CRON_SECRETのBearerトークンで保護する。
 * Vercel Cronは環境変数CRON_SECRETがあれば自動で Authorization: Bearer <CRON_SECRET> を付ける。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncUpsellSheet());
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `同期に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
