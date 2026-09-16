import { SHARED_ACCOUNTS } from "@/lib/actingAs";

/**
 * Pure constants/types for the "callShifts" Google Sheets tab — kept separate from
 * lib/google/sheets.ts (pulls in googleapis), same reasoning as lib/leads.ts.
 *
 * Replaces the external「テレアポ稼働報告」spreadsheet（旧 src/lib/isCallSheet.ts）: 稼働者本人が
 * 日付・開始/終了時刻に加えて、その回の架電数・アポ獲得数・受付NG・キーマン接続数・備考を
 * アプリ上で直接入力する（旧シートと同じ手入力の項目構成）。担当者は架電マーク（架電日/架電者）と
 * 同じく、ログイン中のGoogleアカウントの情報をサーバー側で自動付与し、なりすましを防ぐ。
 */
export const CALL_SHIFT_HEADERS = [
  "id",
  "callerEmail",
  "callerName",
  "date",
  "startTime",
  "endTime",
  "calls",
  "apo",
  "receptionNg",
  "keymanConnected",
  "notes",
  "createdAt",
] as const;

export type CallShiftField = (typeof CALL_SHIFT_HEADERS)[number];
export type CallShiftRow = Record<CallShiftField, string>;

/**
 * 時刻を`<input type="time">`が受け付ける"HH:MM"形式（0埋め2桁）に正規化する。
 * シートに"9:30"のように0埋めされていない値が入っていると、input要素が値を認識できず
 * 空欄（--:--）に見えてしまう——見た目は空でも稼働時間の計算自体は正しく行われるため
 * 気づきにくい。表示前にこれを通しておけば、以後「保存」するたびに正しい形式で書き戻される。
 */
export function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!match) return value;
  const [, h, m] = match;
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** 開始・終了時刻（"HH:MM"）から稼働時間（時間単位、小数）を計算する。終了が開始より前なら日をまたいだとみなす。 */
export function shiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

/**
 * 統括担当者のメールアドレス。この一覧に含まれるアカウントは、自分以外（バイトメンバー等）の
 * 稼働報告を代理で入力・修正できる（例: 本人がまだアプリにログインできない/していない場合の代筆）。
 * 実際の権限チェックはAPIルート側でも必ずサーバー側で再確認する。
 */
export const SUPERVISOR_EMAILS = ["t.mori@oncall-japan.com"];

export function isSupervisorEmail(email: string): boolean {
  return SUPERVISOR_EMAILS.includes(email);
}

/**
 * 稼働報告の集計・グルーピングで「同一人物」を判定するためのキー。
 *
 * callerEmailは「本人が個別アカウントでログインした場合は実際のメールアドレス、共有アカウントや
 * 統括担当者による代理入力の場合は入力された名前そのもの」という2通りの値が混在する列のため、
 * これをそのままグルーピングキーに使うと、同一人物が個別ログインと代理入力の両方で記録した場合に
 * 別人として2行に分かれてしまう（例: callerEmail="t.mori@oncall-japan.com" と
 * callerEmail="森太雅" が両方とも実際には同じ「森太雅」さんの記録）。
 * callerNameは代理入力・個別ログインのどちらでも人間が識別できる名前がそのまま入るため、
 * こちらを正としてグルーピングキーに使う（空の場合のみcallerEmailにフォールバック）。
 */
export function callerIdentityOf(shift: { callerEmail: string; callerName: string }): string {
  return (shift.callerName || shift.callerEmail).trim();
}

/**
 * 管理者本人の識別名。管理者は統括担当者として他人の代理入力（onBehalfOfName）を行うことがあり、
 * その際にcallerName/callerEmailへ管理者自身の名前がそのまま入る場合がある——時給・人件費の
 * 対象ではないため、@を含まない記録だからといって自動でバイト扱いにしない。
 */
const NON_HOURLY_IDENTITY_NAMES = ["森太雅"];

/**
 * 稼働報告のうち、バイト・インターン（時給が発生する人件費対象）分だけを絞り込むための判定。
 * バイト・インターンはSlack同様アプリもcontact-sales@oncall-japan.comの共有アカウントでログイン
 * するため、その記録のcallerEmailは「共有アカウント自身のメール」または「onBehalfOfNameで入力した
 * 生の氏名（@を含まない）」のいずれかになる。社員が自分の個別アカウントで記録した架電実績（人件費の
 * 対象外）は、実在するメールアドレスがそのまま入るため、@を含み、かつ共有アカウント自身とも異なる
 * 値になる——これで区別する。ただし管理者自身の名前（NON_HOURLY_IDENTITY_NAMES）は常に除外する。
 */
export function isHourlyStaffShift(shift: { callerEmail: string; callerName: string }): boolean {
  if (NON_HOURLY_IDENTITY_NAMES.includes(callerIdentityOf(shift))) return false;
  return shift.callerEmail === SHARED_ACCOUNTS.sales || !shift.callerEmail.includes("@");
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" から曜日（日本語1文字）を返す。旧シートの「曜日」列に相当。 */
export function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_LABELS[d.getDay()];
}
