import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { listStaffWages, listMonthlyApo, listPublishedShifts } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";
import { publishedEventIdSetOf } from "@/lib/publishedShifts";
import ShiftManagementView from "@/components/ShiftManagementView";

/**
 * バイトスタッフの稼働状況・人件費を確認する管理者専用ページ。稼働時間はGoogleカレンダー
 * （【IS/氏名】【IS研修/氏名】予定）が一次情報源で、アポ獲得数・時給は管理者が月ごとに手入力する。
 */
export default async function ShiftManagementPage() {
  const session = await requirePageSession();
  const email = session.user?.email ?? "";
  if (!isSupervisorEmail(email)) {
    redirect("/");
  }

  const accessToken = session.accessToken;
  const [wages, apoCounts, publishedShifts] = await Promise.all([
    listStaffWages(accessToken),
    listMonthlyApo(accessToken),
    listPublishedShifts(accessToken),
  ]);
  const publishedEventIds = [...publishedEventIdSetOf(publishedShifts)];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト管理表</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Googleカレンダーのシフト予定をもとに、月間の稼働時間と人件費を確認できます（管理者のみ閲覧可能）
        </p>
      </div>
      <ShiftManagementView initialWages={wages} initialApoCounts={apoCounts} initialPublishedEventIds={publishedEventIds} />
    </div>
  );
}
