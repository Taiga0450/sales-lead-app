import { requirePageSession } from "@/lib/session";
import { getDashboardData } from "@/lib/google/sheets";
import { deriveAssigneeOptions } from "@/lib/leads";
import { hasAnthropicKey } from "@/lib/anthropic/client";
import { getSharedAccountKey } from "@/lib/actingAs";
import KpiCards from "@/components/KpiCards";
import TodayCallSummary from "@/components/TodayCallSummary";
import LeadsBoard from "@/components/LeadsBoard";
import ResearchModal from "@/components/ResearchModal";
import ManualLeadModal from "@/components/ManualLeadModal";
import BulkImportModal from "@/components/BulkImportModal";
import ShareRegiCallSummary from "@/components/ShareRegiCallSummary";
import { listShareRegiCalls } from "@/lib/google/serviceSheets";
import { canViewShareRegiStats, summarizeShareRegiCalls, type ShareRegiCallerStats } from "@/lib/shareRegiCalls";

export default async function LeadsPage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  const { leads } = await getDashboardData(accessToken);
  const assigneeOptions = deriveAssigneeOptions(leads);

  // シェアレジ担当者は同じリード一覧を見るが、架電日・フェーズ・架電メモ（オンコール営業側の
  // 記録）は閲覧のみとし、シェアレジメモの入力だけを行う。
  const isShareRegi = session?.user?.email ? getSharedAccountKey(session.user.email) === "shareregi" : false;

  // シェアレジの架電件数は営業と混ぜないため、シェアレジの共有アカウントと責任者にだけ表示する。
  const showShareRegiStats = canViewShareRegiStats(session?.user?.email ?? "");
  let shareRegiStats: ShareRegiCallerStats[] = [];
  let shareRegiStatsError: string | null = null;
  if (showShareRegiStats) {
    try {
      shareRegiStats = summarizeShareRegiCalls(await listShareRegiCalls());
    } catch (err) {
      console.error("shareregi call stats fetch failed", err);
      shareRegiStatsError = "シェアレジの架電件数を読み込めませんでした";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">リード一覧</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {isShareRegi
              ? "医療機関ごとにシェアレジの架電メモを記録します（架電日・フェーズ・架電メモは閲覧のみです）"
              : "往診対応の病院・クリニックの営業リードを管理します"}
          </p>
          {!isShareRegi && !hasAnthropicKey && (
            <p className="mt-1 text-xs text-amber-600">
AI機能（自動リサーチ）は未設定です。手動追加で動作しています。
            </p>
          )}
        </div>
        {!isShareRegi && (
          <div className="flex items-center gap-3">
            <BulkImportModal />
            {hasAnthropicKey ? <ResearchModal /> : <ManualLeadModal />}
          </div>
        )}
      </div>

      {showShareRegiStats && <ShareRegiCallSummary stats={shareRegiStats} error={shareRegiStatsError} />}
      <KpiCards leads={leads} />
      {/* シェアレジのアカウントには営業側の架電集計を出さない（件数が混ざって見えないように） */}
      {!isShareRegi && <TodayCallSummary leads={leads} />}
      <LeadsBoard leads={leads} assigneeOptions={assigneeOptions} canEditCallTracking={!isShareRegi} />
    </div>
  );
}
