import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { deleteSavedList, renameSavedList } from "@/lib/google/sheets";

export async function PATCH(request: Request, ctx: RouteContext<"/api/lists/[id]">) {
  const { id } = await ctx.params;

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "リスト名を入力してください" }, { status: 400 });
  }

  try {
    await renameSavedList(accessToken, id, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/lists/[id]">) {
  const { id } = await ctx.params;

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    await deleteSavedList(accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
