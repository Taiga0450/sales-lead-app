/**
 * 「公開する」を押した個々のシフト予定（Googleカレンダーのイベント）の記録。
 * 二重にSlack通知しないための既読管理として、対象のカレンダーイベントIDを保存しておく。
 */
export const PUBLISHED_SHIFT_HEADERS = ["id", "eventId", "publishedAt"] as const;

export type PublishedShiftField = (typeof PUBLISHED_SHIFT_HEADERS)[number];
export type PublishedShiftRow = Record<PublishedShiftField, string>;

export function publishedEventIdSetOf(rows: PublishedShiftRow[]): Set<string> {
  return new Set(rows.map((r) => r.eventId).filter(Boolean));
}
