/**
 * Pure constants/types shared by server code and client components.
 * Kept separate from lib/google/sheets.ts, which pulls in `googleapis` —
 * importing that from a "use client" file would bundle Node-only deps for the browser.
 *
 * Column order is optimized for scanning during telemarketing (架電) and email
 * outreach — name/phone/region/status up front, less-frequently-needed fields at the end.
 */
export const LEAD_HEADERS = [
  "医療機関名",
  "種別",
  "電話番号",
  "地域",
  "地域特徴",
  "住所",
  "メールアドレス",
  "担当者",
  "ステータス",
  "総合スコア",
  "適合度スコア",
  "規模スコア",
  "地域スコア",
  "事業内容メモ",
  "メモ",
  "送信日",
  "架電日",
  "架電者",
  "登録日",
  "情報ソースURL",
  "件名",
  "本文",
  "下書きID",
  "id",
  "シェアレジメモ",
] as const;

export type LeadField = (typeof LEAD_HEADERS)[number];
export type LeadRow = Record<LeadField, string>;

/**
 * フェーズは営業の進行段階を表す。架電の有無は独立した「架電日」で管理する。
 */
export const LEAD_STATUSES = [
  "未活動",
  "対象外",
  "受付NG",
  "不在",
  "キーマンNG",
  "資料送付",
  "商談獲得",
  "契約医療機関",
] as const;

/**
 * 「誰が何日に架電したか」で絞り込むための担当者一覧。担当者を管理するマスタが無いため、
 * 実際に使われている担当者（担当者欄）・架電者（架電時にログイン中のGoogleアカウントが
 * 自動で入る欄）の値をリードから集めて選択肢にする。
 */
export function deriveAssigneeOptions(leads: LeadRow[]): string[] {
  const values = new Set<string>();
  for (const lead of leads) {
    if (lead.担当者) values.add(lead.担当者);
    if (lead.架電者) values.add(lead.架電者);
  }
  return [...values].sort();
}
