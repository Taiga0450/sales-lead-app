import type { ShareRegiCallRecord } from "@/lib/google/serviceSheets";
import { SHARED_ACCOUNTS } from "@/lib/actingAs";

/**
 * シェアレジの架電件数を見られるアカウント。営業側の架電状況とは混ぜない方針のため、
 * シェアレジの共有アカウントと、シェアレジ事業の責任者だけに表示する。
 */
export const SHAREREGI_STATS_VIEWERS = [SHARED_ACCOUNTS.shareregi, "j.tamada@oncall-japan.com"];

export function canViewShareRegiStats(email: string): boolean {
  return SHAREREGI_STATS_VIEWERS.includes(email);
}

export interface ShareRegiCallerStats {
  callerName: string;
  today: number;
  thisMonth: number;
  total: number;
}

function jstDate(iso: string): string {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t + 9 * 3600000).toISOString().slice(0, 10) : "";
}

/**
 * 担当者別の架電件数。同じ人が同じ日に同じ医療機関のメモを何度保存しても（書き直し・追記）
 * 1件と数える——メモ保存＝架電として記録しているため、書き直しで件数が膨らまないようにする。
 */
export function summarizeShareRegiCalls(records: ShareRegiCallRecord[], now: Date = new Date()): ShareRegiCallerStats[] {
  const today = jstDate(now.toISOString());
  const month = today.slice(0, 7);
  const seen = new Set<string>();
  const byCaller = new Map<string, ShareRegiCallerStats>();

  for (const r of records) {
    const date = jstDate(r.calledAt);
    const key = `${r.callerName}|${r.leadId}|${date}`;
    if (!date || seen.has(key)) continue;
    seen.add(key);
    const stats = byCaller.get(r.callerName) ?? { callerName: r.callerName, today: 0, thisMonth: 0, total: 0 };
    stats.total++;
    if (date.startsWith(month)) stats.thisMonth++;
    if (date === today) stats.today++;
    byCaller.set(r.callerName, stats);
  }
  return [...byCaller.values()].sort((a, b) => b.thisMonth - a.thisMonth || b.total - a.total);
}
