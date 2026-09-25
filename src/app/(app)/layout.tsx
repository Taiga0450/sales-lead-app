import { signOut } from "@/auth";
import { requirePageSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import ActingAsBanner from "@/components/ActingAsBanner";
import { isSharedAccountEmail, getSharedAccountKey } from "@/lib/actingAs";
import { isSupervisorEmail } from "@/lib/callShifts";
import { canUseUpsell } from "@/lib/upsellAccess";

/**
 * ログイン必須の画面はすべてこのレイアウト配下（(app)グループ）に置く。ここで一括して
 * セッションを検証することで、個々のpage.tsxがチェックを書き忘れても未ログインのまま
 * 画面が見えてしまうことがないようにする（トークスクリプトのような一覧に出ない画面も含む）。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const sharedAccountKey = session.user?.email ? getSharedAccountKey(session.user.email) : null;
  const isSupervisor = session.user?.email ? isSupervisorEmail(session.user.email) : false;
  const showUpsell = session.user?.email ? canUseUpsell(session.user.email) : false;

  return (
    <div className="flex min-h-full flex-1" data-shared-account={sharedAccountKey ?? undefined}>
      <Sidebar sharedAccountKey={sharedAccountKey} isSupervisor={isSupervisor} showUpsell={showUpsell} />

      <div className="flex min-h-full flex-1 flex-col">
        <header className="border-b border-border bg-surface">
          <div className="flex items-center justify-end gap-4 px-6 py-4">
            {session?.user?.email && isSharedAccountEmail(session.user.email) && <ActingAsBanner />}
            {session?.user?.email && (
              <span className="text-sm text-foreground/60">{session.user.email}</span>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 transition hover:bg-zinc-50"
              >
                ログアウト
              </button>
            </form>
          </div>
        </header>

        <main className="w-full flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
