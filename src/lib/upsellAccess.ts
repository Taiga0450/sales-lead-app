/**
 * アップセル画面（契約院一覧・架電済みチェック・タスク作成）を使える個人アカウント。
 * 営業担当だけに絞り、アルバイト用の共有アカウント（contact-sales@ / contact-shareregi@）は含めない。
 * シフト管理表などの統括担当者専用機能（SUPERVISOR_EMAILS）とは別に管理する。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */
export const UPSELL_USER_EMAILS: readonly string[] = [
  "t.mori@oncall-japan.com",
  "i.tomita@oncall-japan.com",
  "k.matsunaga@oncall-japan.com",
];

export function canUseUpsell(email: string): boolean {
  return UPSELL_USER_EMAILS.includes(email);
}
