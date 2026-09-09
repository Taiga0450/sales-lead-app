/**
 * バイトメンバーは共有アカウントでログインしているため、ログインセッションのメールアドレス
 * だけでは「実際に架電・稼働報告したのが誰か」が分からない。このファイルはその対応——共有
 * アカウントでログイン中は、その端末に「今どの名前で操作しているか」を覚えておき（localStorage。
 * ブラウザを閉じても消えない）、架電記録・稼働報告のたびにその名前を一緒にサーバーへ送る
 * （onBehalfOfName）。t.mori@oncall-japan.comのような個別アカウントではこの仕組みは
 * 一切使わず、これまで通りセッションのメールアドレスがそのまま使われる。
 *
 * 共有アカウントは事業ごとに複数存在する（インサイドセールス用／シェアレジ用）。名前の一覧
 * （roster、サーバー管理）はアカウントごとに別々に持つため、どちらのアカウントでログイン中かを
 * 判定できるようにしている。
 *
 * server/clientどちらからもimportされるため、googleapis等のサーバー専用コードは持ち込まない。
 */
export const SHARED_ACCOUNTS = {
  sales: "contact-sales@oncall-japan.com",
  shareregi: "contact-shareregi@oncall-japan.com",
} as const;

export type SharedAccountKey = keyof typeof SHARED_ACCOUNTS;

export function getSharedAccountKey(email: string): SharedAccountKey | null {
  const entry = (Object.entries(SHARED_ACCOUNTS) as [SharedAccountKey, string][]).find(
    ([, value]) => value === email,
  );
  return entry ? entry[0] : null;
}

export function isSharedAccountEmail(email: string): boolean {
  return getSharedAccountKey(email) !== null;
}

const ACTING_AS_STORAGE_KEY = "actingAsName";

/**
 * 今この端末が「どの共有アカウントとしてログイン中か」を読み取る。(app)/layout.tsx が
 * ルート要素に埋め込む data-shared-account属性から取得する（クライアント側にはNextAuthの
 * セッション情報を直接渡していないため）。
 */
function currentAccountKey(): SharedAccountKey | null {
  if (typeof document === "undefined") return null;
  const value = document.querySelector<HTMLElement>("[data-shared-account]")?.dataset.sharedAccount;
  return value === "sales" || value === "shareregi" ? value : null;
}

/**
 * sales用は既存ユーザーが端末に保存済みの値を引き継ぐため、これまで通り無印のキーを使う。
 * それ以外の共有アカウントは、同じ端末でsalesと混ざらないよう名前空間を分ける。
 * 個別アカウント（共有アカウントではない）の場合はnullを返し、acting-as機能自体を無効にする——
 * そうしないと、同じ端末で以前共有アカウントとして選んだ名前が、後で個別アカウントにログインした
 * 本人の架電記録にまで紛れ込んでしまう（例: t.mori@oncall-japan.comでログインしているのに、
 * 以前この端末でcontact-sales@として選ばれていた名前が架電者として記録される）。
 */
function storageKey(): string | null {
  const key = currentAccountKey();
  if (!key) return null;
  return key === "sales" ? ACTING_AS_STORAGE_KEY : `${ACTING_AS_STORAGE_KEY}:${key}`;
}

/**
 * 現在「誰として」操作しているかを取得する（ブラウザ環境でのみ有効）。localStorageに保存するため、
 * 一度選べば、次にこの端末でアプリを開いた時も同じ名前がそのまま使われる（架電のたびに名前が
 * 変わって管理しづらくなることを防ぐ）。共有アカウントでログインしていない場合は常に空文字を返す。
 */
export function getActingAsName(): string {
  if (typeof window === "undefined") return "";
  const key = storageKey();
  if (!key) return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function setActingAsName(name: string): void {
  if (typeof window === "undefined") return;
  const key = storageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, name);
  } catch {
    // ブラウザ設定でstorageが使えない場合は諦める（この画面での名前表示だけが機能しなくなる）
  }
}
