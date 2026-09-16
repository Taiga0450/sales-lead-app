import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { listCallShifts, listStaffWages } from "@/lib/google/sheets";
import { isSupervisorEmail, isHourlyStaffShift } from "@/lib/callShifts";
import ShiftManagementView from "@/components/ShiftManagementView";

/**
 * バイトスタッフの稼働状況・人件費を確認する管理者専用ページ。/calls
 * （本人・統括担当者が稼働報告そのものを入力・修正する画面）とはデータソース
 * （callShiftsタブ）は共通だが、こちらは月間カレンダー表示と時給ベースの人件費集計に特化する。
 */
export default async function ShiftManagementPage() {
  const session = await requirePageSession();
  const email = session.user?.email ?? "";
  if (!isSupervisorEmail(email)) {
    redirect("/");
  }

  const accessToken = session.accessToken;
  const [allShifts, wages] = await Promise.all([listCallShifts(accessToken), listStaffWages(accessToken)]);
  // 通常社員（個別アカウントでの記録）は時給・人件費の対象外のため、バイト・インターン
  // （contact-sales@共有アカウント経由）の記録だけに絞って集計する。
  const shifts = allShifts.filter(isHourlyStaffShift);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">シフト管理表</h1>
        <p className="mt-1 text-sm text-foreground/60">
          スタッフの稼働報告をもとに、月間の稼働時間と人件費を確認できます（管理者のみ閲覧可能）
        </p>
      </div>
      <ShiftManagementView shifts={shifts} initialWages={wages} />
    </div>
  );
}
