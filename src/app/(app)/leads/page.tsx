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

export default async function LeadsPage() {
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  const { leads } = await getDashboardData(accessToken);
  const assigneeOptions = deriveAssigneeOptions(leads);

  // シェアレジ担当者は同じリード一覧を見るが、架電日・フェーズ・架電メモ（オンコール営業側の
  // 記録）は閲覧のみとし、シェアレジメモの入力だけを行う。
  const isShareRegi = session?.user?.email ? getSharedAccountKey(session.user.email) === "shareregi" : false;

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

      <KpiCards leads={leads} />
      <TodayCallSummary leads={leads} />
      <LeadsBoard leads={leads} assigneeOptions={assigneeOptions} canEditCallTracking={!isShareRegi} />
    </div>
  );
}
