import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    throw new Error("認証が必要です");
  }
  return session;
}

export async function requireAccessToken(): Promise<string> {
  const session = await requireSession();
  return session.accessToken!;
}

/**
 * サーバーコンポーネント（ページ）用。APIルートのrequireSession/requireAccessTokenと違い、
 * 例外を投げてエラー画面を出す代わりに/loginへリダイレクトする——セッション切れ・
 * トークン更新失敗（session.error）は「バグ」ではなく普通に起こりうるので、
 * ログイン画面へ静かに戻すのが正しい挙動。
 */
export async function requirePageSession(): Promise<Session & { accessToken: string }> {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    redirect("/login");
  }
  return session as Session & { accessToken: string };
}
