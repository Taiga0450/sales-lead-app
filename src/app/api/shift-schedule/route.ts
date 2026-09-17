import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { createCallShift } from "@/lib/google/sheets";
import { createShiftCalendarEvent } from "@/lib/google/serviceCalendar";
import { isSupervisorEmail } from "@/lib/callShifts";
import { isSharedAccountEmail } from "@/lib/actingAs";

/**
 * /calls の「シフト予定を入れる（カレンダー）」タブ専用。既存の/api/call-shiftsと同じくシート
 * （callShifts）へ記録しつつ、あわせてt.moriのGoogleカレンダーにも【IS/氏名】で予定を追加する
 * （相互反映の要望に対応）。カレンダー登録が失敗しても、シート側の記録は失わない。
 */
export async function POST(request: Request) {
  let accessToken: string;
  let sessionEmail: string;
  let sessionName: string;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    sessionEmail = session.user?.email ?? "";
    sessionName = session.user?.name ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!sessionEmail) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    startTime?: string;
    endTime?: string;
    onBehalfOfName?: string;
  };
  const date = body.date?.trim();
  const startTime = body.startTime?.trim();
  const endTime = body.endTime?.trim();
  if (!date || !startTime || !endTime) {
    return NextResponse.json({ error: "日付・開始時刻・終了時刻を入力してください" }, { status: 400 });
  }

  const onBehalfOfName = body.onBehalfOfName?.trim();
  const useOnBehalfOf = onBehalfOfName && (isSupervisorEmail(sessionEmail) || isSharedAccountEmail(sessionEmail));
  const callerEmail = useOnBehalfOf ? onBehalfOfName : sessionEmail;
  const callerName = useOnBehalfOf ? onBehalfOfName : sessionName;

  try {
    const shift = await createCallShift(accessToken, {
      callerEmail,
      callerName,
      date,
      startTime,
      endTime,
      calls: "",
      apo: "",
      receptionNg: "",
      keymanConnected: "",
      notes: "シフト予定",
    });

    let calendarError: string | undefined;
    try {
      await createShiftCalendarEvent({ date, startTime, endTime, name: callerName || callerEmail });
    } catch (error) {
      console.error("createShiftCalendarEvent failed", error);
      calendarError = "Googleカレンダーへの反映には失敗しました（シートへの登録は完了しています）";
    }

    return NextResponse.json({ shift, calendarError });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}
