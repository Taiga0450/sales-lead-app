import { NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack/verify";
import { upsertShiftFromSlack } from "@/lib/google/serviceSheets";

interface SlackViewSubmissionPayload {
  type: string;
  view?: {
    callback_id?: string;
    state?: {
      values?: Record<string, Record<string, { value?: string; selected_date?: string; selected_time?: string }>>;
    };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const ok =
    !!signingSecret &&
    verifySlackSignature({
      signingSecret,
      timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
      signature: request.headers.get("x-slack-signature") ?? "",
      rawBody,
    });
  if (!ok) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return new NextResponse("", { status: 200 });

  const payload = JSON.parse(payloadRaw) as SlackViewSubmissionPayload;
  if (payload.type !== "view_submission" || payload.view?.callback_id !== "shift_submit") {
    return new NextResponse("", { status: 200 });
  }

  const values = payload.view.state?.values ?? {};
  const name = values.name_block?.name_input?.value?.trim();
  const date = values.date_block?.date_input?.selected_date;
  const startTime = values.start_block?.start_input?.selected_time;
  const endTime = values.end_block?.end_input?.selected_time;

  const errors: Record<string, string> = {};
  if (!name) errors.name_block = "お名前を入力してください";
  if (!date) errors.date_block = "日付を選択してください";
  if (!startTime) errors.start_block = "開始時刻を選択してください";
  if (!endTime) errors.end_block = "終了時刻を選択してください";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ response_action: "errors", errors });
  }

  try {
    await upsertShiftFromSlack({ callerIdentity: name!, date: date!, startTime: startTime!, endTime: endTime! });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      response_action: "errors",
      errors: { name_block: "登録に失敗しました。時間をおいて再度お試しください" },
    });
  }

  return new NextResponse("", { status: 200 });
}
