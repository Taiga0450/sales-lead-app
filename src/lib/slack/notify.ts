/**
 * バイト・インターンはSlackもcontact-sales@oncall-japan.comの共有アカウントでログインしており、
 * このSlackユーザーID（過去のDM履歴から判明済み）宛にBotがDMを送る。
 */
const INTERN_SLACK_USER_ID = "U0BTZ0M1430";

export async function sendSlackDirectMessageToIntern(text: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return { ok: false, error: "SLACK_BOT_TOKENが設定されていません" };

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ channel: INTERN_SLACK_USER_ID, text }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  return data;
}
