// ローカル開発用：「アップセル」タブを一定間隔でHubSpotと同期し続ける。
// 本番ではVercel Cron等から /api/cron/upsell-sync を叩く想定で、これはその代わり。
// 使い方（別ターミナルで npm run dev を起動した状態で）:
//   node --env-file=.env.local scripts/sync_upsell_watch.mjs            # 10分ごと
//   node --env-file=.env.local scripts/sync_upsell_watch.mjs --minutes 5
//   node --env-file=.env.local scripts/sync_upsell_watch.mjs --once     # 1回だけ
const BASE_URL = process.env.UPSELL_SYNC_BASE_URL ?? "http://localhost:3001";
const SECRET = process.env.CRON_SECRET;
const once = process.argv.includes("--once");
const minutesArg = process.argv.indexOf("--minutes");
const minutes = minutesArg >= 0 ? Number(process.argv[minutesArg + 1]) : 10;

if (!SECRET) {
  console.error("CRON_SECRET が .env.local にありません");
  process.exit(1);
}

async function syncOnce() {
  const started = new Date().toLocaleTimeString("ja-JP");
  try {
    const res = await fetch(`${BASE_URL}/api/cron/upsell-sync`, { headers: { Authorization: `Bearer ${SECRET}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.status);
    console.log(`[${started}] 同期OK: 契約${data.totalCount}件 / 更新2ヶ月以内${data.renewalCount}件 / 契約日未入力${data.missingDatesCount}件`);
  } catch (err) {
    console.error(`[${started}] 同期失敗: ${err instanceof Error ? err.message : err}`);
    if (once) process.exitCode = 1;
  }
}

await syncOnce();
if (!once) {
  console.log(`${minutes}分ごとに同期します（Ctrl+Cで停止）`);
  setInterval(syncOnce, minutes * 60 * 1000);
}
