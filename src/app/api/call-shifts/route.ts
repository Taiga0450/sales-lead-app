import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { createCallShift } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";
import { isSharedAccountEmail } from "@/lib/actingAs";

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
    calls?: string;
    apo?: string;
    receptionNg?: string;
    keymanConnected?: string;
    notes?: string;
    onBehalfOfName?: string;
  };

  const date = body.date?.trim();
  const startTime = body.startTime?.trim();
  const endTime = body.endTime?.trim();
  if (!date || !startTime || !endTime) {
    return NextResponse.json({ error: "日付・開始時刻・終了時刻を入力してください" }, { status: 400 });
  }

  // callerEmail/callerNameは基本的にクライアントから受け取らず、ログイン中のセッションから付与する
  // （架電日/架電者と同じく、なりすまし防止のため）。ただし統括担当者（isSupervisorEmail）による
  // 代理入力、または共有アカウント（バイトメンバー全員がcontact-sales@oncall-japan.comでログインして
  // いるため、誰の記録か区別するために名前を申告してもらう）の場合に限り、onBehalfOfNameを使う——
  // この権限も必ずサーバー側で確認する。
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
      calls: body.calls?.trim() ?? "",
      apo: body.apo?.trim() ?? "",
      receptionNg: body.receptionNg?.trim() ?? "",
      keymanConnected: body.keymanConnected?.trim() ?? "",
      notes: body.notes?.trim() ?? "",
    });
    return NextResponse.json({ shift });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "記録に失敗しました" }, { status: 500 });
  }
}
