import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { deleteActingAsRosterEntry } from "@/lib/google/sheets";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/acting-as/roster/[id]">) {
  const { id } = await ctx.params;

  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    await deleteActingAsRosterEntry(accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
