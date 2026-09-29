import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { replaceShiftSlots } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 人数枠の保存（管理者のみ）。weekStartが空なら毎週の基本の型、日付ならその週だけの上書き。 */
export async function POST(request: Request) {
  let accessToken: string;
  let email: string;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    email = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isSupervisorEmail(email)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    weekStart?: string;
    slots?: { weekday?: number; startTime?: string; endTime?: string; capacity?: number }[];
  };
  const weekStart = body.weekStart ?? "";
  if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "weekStartが不正です" }, { status: 400 });
  }
  const slots = [];
  for (const s of body.slots ?? []) {
    const weekday = Number(s.weekday);
    const capacity = Number(s.capacity);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "曜日が不正です" }, { status: 400 });
    }
    if (!TIME.test(s.startTime ?? "") || !TIME.test(s.endTime ?? "") || s.startTime! >= s.endTime!) {
      return NextResponse.json({ error: "開始・終了時刻を正しく入力してください（終了は開始より後）" }, { status: 400 });
    }
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 50) {
      return NextResponse.json({ error: "人数は0〜50の整数で入力してください" }, { status: 400 });
    }
    slots.push({ weekday, startTime: s.startTime!, endTime: s.endTime!, capacity });
  }

  try {
    const rows = await replaceShiftSlots(accessToken, weekStart, slots);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
