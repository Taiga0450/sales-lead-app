/**
 * 稼働者ごとの時給を管理するタブ。callShifts（稼働報告）と組み合わせて月間人件費を計算するために使う。
 * 稼働者の識別は callShifts と同じく callerIdentityOf（名前優先）を使う——共有アカウント経由の
 * 代理入力でも同一人物として時給を引けるようにするため。
 */
export const STAFF_WAGE_HEADERS = ["id", "callerIdentity", "hourlyWage", "updatedAt"] as const;

export type StaffWageField = (typeof STAFF_WAGE_HEADERS)[number];
export type StaffWageRow = Record<StaffWageField, string>;

export function wageMapOf(wages: StaffWageRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const w of wages) {
    const value = Number(w.hourlyWage);
    if (w.callerIdentity && !Number.isNaN(value)) map[w.callerIdentity] = value;
  }
  return map;
}
