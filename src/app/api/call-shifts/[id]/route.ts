import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listCallShifts, updateCallShift, deleteCallShift } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

export async function POST(request: Request, ctx: RouteContext<"/api/call-shifts/[id]">) {
  const { id } = await ctx.params;

  let accessToken: string;
  let callerEmail: string;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    callerEmail = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!callerEmail) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    startTime?: string;
    endTime?: string;
    calls?: string;
    apo?: string;
    receptionNg?: string;
    keymanConnected?: string;
    notes?: string;
  };

  try {
    // 自分自身が記録した稼働報告のみ修正できる（架電日/架電者と同じくなりすまし防止のため、
    // 対象行の持ち主をサーバー側で必ず確認する）。統括担当者（isSupervisorEmail）は例外として
    // 他人（バイトメンバー等）の稼働報告も修正できる。
    const shifts = await listCallShifts(accessToken);
    const target = shifts.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "稼働報告が見つかりません" }, { status: 404 });
    }
    if (target.callerEmail !== callerEmail && !isSupervisorEmail(callerEmail)) {
      return NextResponse.json({ error: "自分の稼働報告のみ修正できます" }, { status: 403 });
    }

    const patch: Record<string, string> = {};
    if (body.date !== undefined) patch.date = body.date.trim();
    if (body.startTime !== undefined) patch.startTime = body.startTime.trim();
    if (body.endTime !== undefined) patch.endTime = body.endTime.trim();
    if (body.calls !== undefined) patch.calls = body.calls.trim();
    if (body.apo !== undefined) patch.apo = body.apo.trim();
    if (body.receptionNg !== undefined) patch.receptionNg = body.receptionNg.trim();
    if (body.keymanConnected !== undefined) patch.keymanConnected = body.keymanConnected.trim();
    if (body.notes !== undefined) patch.notes = body.notes.trim();

    const shift = await updateCallShift(accessToken, id, patch);
    return NextResponse.json({ shift });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "修正に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/call-shifts/[id]">) {
  const { id } = await ctx.params;

  let accessToken: string;
  let callerEmail: string;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    callerEmail = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!callerEmail) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    // POSTと同じく、自分自身の稼働報告か統括担当者のみ削除できる。
    const shifts = await listCallShifts(accessToken);
    const target = shifts.find((s) => s.id === id);
    if (!target) {
      return NextResponse.json({ error: "稼働報告が見つかりません" }, { status: 404 });
    }
    if (target.callerEmail !== callerEmail && !isSupervisorEmail(callerEmail)) {
      return NextResponse.json({ error: "自分の稼働報告のみ削除できます" }, { status: 403 });
    }

    await deleteCallShift(accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
