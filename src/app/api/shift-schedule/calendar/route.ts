import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { isSupervisorEmail } from "@/lib/callShifts";
import { listShiftCalendarEvents } from "@/lib/google/serviceCalendar";

/** シフト管理表（管理者専用）が、Googleカレンダー上の【IS/氏名】【IS研修/氏名】予定を月ごとに取得するためのAPI。 */
export async function GET(request: Request) {
  let email: string;
  try {
    const session = await requireSession();
    email = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isSupervisorEmail(email)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "yearとmonthを指定してください" }, { status: 400 });
  }

  try {
    const events = await listShiftCalendarEvents(year, month);
    return NextResponse.json({ events });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Googleカレンダーの取得に失敗しました。カレンダーがサービスアカウントに共有されているか確認してください。" },
      { status: 500 },
    );
  }
}
