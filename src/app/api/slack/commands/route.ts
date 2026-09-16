import { NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack/verify";

/**
 * Slackスラッシュコマンド（/shift）のRequest URL。
 * 3秒以内にSlackへ200を返す必要があるため、ここではモーダルを開くだけ（views.open）で即座に応答し、
 * 実際のシート書き込みはモーダル送信時（/api/slack/interactions）で行う。
 */
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
  const triggerId = params.get("trigger_id");
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!triggerId || !botToken) {
    return new NextResponse("configuration error", { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const view = {
    type: "modal",
    callback_id: "shift_submit",
    title: { type: "plain_text", text: "シフト登録" },
    submit: { type: "plain_text", text: "登録" },
    close: { type: "plain_text", text: "キャンセル" },
    blocks: [
      {
        type: "input",
        block_id: "name_block",
        label: { type: "plain_text", text: "お名前（フルネーム）" },
        element: { type: "plain_text_input", action_id: "name_input", placeholder: { type: "plain_text", text: "例: 磯崎 太郎" } },
      },
      {
        type: "input",
        block_id: "date_block",
        label: { type: "plain_text", text: "日付" },
        element: { type: "datepicker", action_id: "date_input", initial_date: today },
      },
      {
        type: "input",
        block_id: "start_block",
        label: { type: "plain_text", text: "開始時刻" },
        element: { type: "timepicker", action_id: "start_input" },
      },
      {
        type: "input",
        block_id: "end_block",
        label: { type: "plain_text", text: "終了時刻" },
        element: { type: "timepicker", action_id: "end_input" },
      },
    ],
  };

  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("views.open failed", data.error);
    // 原因調査のため、一時的にSlack側へエラー内容を直接表示する（本人にだけ見える一時メッセージ）。
    return NextResponse.json({ response_type: "ephemeral", text: `views.open failed: ${data.error}` });
  }
  return new NextResponse("", { status: 200 });
}
