/**
 * インセンティブ計算用のアポ獲得数。架電実績シートからの自動集計はアポの定義（カウント基準）が
 * 実態と合わないため、月×稼働者ごとに管理者が手入力する（staffWagesの時給と同じ考え方）。
 */
export const MONTHLY_APO_HEADERS = ["id", "callerIdentity", "month", "apoCount", "updatedAt"] as const;

export type MonthlyApoField = (typeof MONTHLY_APO_HEADERS)[number];
export type MonthlyApoRow = Record<MonthlyApoField, string>;

/** callerIdentity+month（"YYYY-MM"）→アポ数、のマップを作る。 */
export function monthlyApoMapOf(rows: MonthlyApoRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const value = Number(r.apoCount);
    if (r.callerIdentity && r.month && !Number.isNaN(value)) {
      map[`${r.callerIdentity}|${r.month}`] = value;
    }
  }
  return map;
}
