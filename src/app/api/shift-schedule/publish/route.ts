import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { markShiftPublished } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";
import { sendSlackDirectMessageToIntern } from "@/lib/slack/notify";

/**
 * シフト管理表で「公開する」を押したときのAPI。対象のGoogleカレンダーイベントIDを既読管理シート
 * （publishedShifts）に記録し、初回のみSlackのインターン共有アカウント宛にDM通知する。
 */
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
    eventId?: string;
    name?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    category?: "IS" | "IS研修";
  };
  const { eventId, name, date, startTime, endTime } = body;
  if (!eventId || !name || !date || !startTime || !endTime) {
    return NextResponse.json({ error: "必要な項目が不足しています" }, { status: 400 });
  }

  try {
    const { alreadyPublished } = await markShiftPublished(accessToken, eventId);
    if (alreadyPublished) {
      return NextResponse.json({ ok: true, alreadyPublished: true });
    }

    const categoryLabel = body.category === "IS研修" ? "（研修）" : "";
    const text = `📅 シフトが公開されました\n${date} ${startTime}〜${endTime}\n担当: ${name}${categoryLabel}`;
    const result = await sendSlackDirectMessageToIntern(text);
    if (!result.ok) {
      return NextResponse.json({ ok: true, alreadyPublished: false, slackError: result.error });
    }
    return NextResponse.json({ ok: true, alreadyPublished: false });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "公開処理に失敗しました" }, { status: 500 });
  }
}
