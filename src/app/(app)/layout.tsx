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
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            {session?.user?.email && isSharedAccountEmail(session.user.email) && <ActingAsBanner />}
            {session?.user?.email && (
              <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground/60">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                  {session.user.email.slice(0, 1).toUpperCase()}
                </span>
                {session.user.email}
              </span>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground/60 transition hover:text-foreground"
              >
                ログアウト
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
