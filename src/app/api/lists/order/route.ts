import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { reorderSavedLists } from "@/lib/google/sheets";
import { LIST_CATEGORIES } from "@/lib/savedLists";

/** 保存済みリストの並び順と区分（往診代行/シェアレジ）をまとめて保存する。 */
export async function PUT(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { items?: { id?: string; category?: string }[] };
  const items = [];
  for (const [i, item] of (body.items ?? []).entries()) {
    if (!item.id || !LIST_CATEGORIES.includes(item.category as (typeof LIST_CATEGORIES)[number])) {
      return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
    }
    items.push({ id: item.id, category: item.category!, sortOrder: i + 1 });
  }

  try {
    await reorderSavedLists(accessToken, items);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
