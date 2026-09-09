import KpiCards from "@/components/KpiCards";
import TodayCallSummary from "@/components/TodayCallSummary";
import LeadsBoard from "@/components/LeadsBoard";
import ScoreBadge from "@/components/ScoreBadge";
import ManualLeadModal from "@/components/ManualLeadModal";
import BulkImportModal from "@/components/BulkImportModal";
import EnrichButton from "@/components/EnrichButton";
import Logo from "@/components/Logo";
import { deriveAssigneeOptions, type LeadRow } from "@/lib/leads";

const LEADS: LeadRow[] = [
  {
    id: "l1",
    医療機関名: "せたがや在宅クリニック",
    種別: "クリニック",
    電話番号: "03-1234-5678",
    住所: "東京都世田谷区若林1-2-3",
    地域: "東京都世田谷区",
    地域特徴: "高齢化率が高く在宅医療ニーズが増加傾向。競合の往診代行は少ない。",
    メールアドレス: "info@example-setagaya.jp",
    担当者: "森",
    事業内容メモ: "在宅療養支援診療所。24時間対応を掲げているが夜間往診の実績は限定的。",
    適合度スコア: "5",
    規模スコア: "3",
    地域スコア: "5",
    総合スコア: "4",
    ステータス: "未活動",
    送信日: "",
    架電日: "",
    架電者: "",
    情報ソースURL: "https://example.com",
    メモ: "",
    登録日: "2026-08-01T00:00:00.000Z",
    件名: "",
    本文: "",
    下書きID: "",
    シェアレジメモ: "",
  },
  {
    id: "l2",
    医療機関名: "みなと往診クリニック",
    種別: "クリニック",
    電話番号: "03-9876-5432",
    住所: "東京都港区芝浦4-5-6",
    地域: "東京都港区",
    地域特徴: "単身高齢者世帯が多いエリア。近隣に同業の在宅医療グループあり。",
    メールアドレス: "contact@example-minato.jp",
    担当者: "i.tomita",
    事業内容メモ: "訪問診療専門。医師2名体制で夜間・休日は近隣病院と連携中。",
    適合度スコア: "4",
    規模スコア: "2",
    地域スコア: "4",
    総合スコア: "3",
    ステータス: "商談獲得",
    送信日: "",
    架電日: "2026-08-04",
    架電者: "t.mori@oncall-japan.com",
    情報ソースURL: "https://example.com",
    メモ: "担当者と一度電話で話した",
    登録日: "2026-08-02T00:00:00.000Z",
    件名: "夜間・休日の往診体制についてのご相談",
    本文: "サンプル本文",
    下書きID: "draft123",
    シェアレジメモ: "",
  },
  {
    id: "l3",
    医療機関名: "板橋中央病院",
    種別: "病院",
    電話番号: "03-1111-2222",
    住所: "東京都板橋区大山1-1-1",
    地域: "東京都板橋区",
    地域特徴: "地域中核病院が複数あり競合はやや多いが、在宅医療の需要自体も大きい。",
    メールアドレス: "",
    担当者: "",
    事業内容メモ: "在宅医療部門を持つ地域中核病院。夜間当直体制は自前で運用。",
    適合度スコア: "3",
    規模スコア: "5",
    地域スコア: "3",
    総合スコア: "4",
    ステータス: "契約医療機関",
    送信日: "2026-08-03",
    架電日: "2026-08-03",
    架電者: "i.tomita@oncall-japan.com",
    情報ソースURL: "https://example.com",
    メモ: "",
    登録日: "2026-07-28T00:00:00.000Z",
    件名: "",
    本文: "",
    下書きID: "",
    シェアレジメモ: "",
  },
];

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            プレビュー（サンプルデータ・ログイン不要）
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-amber-600">
AI機能（自動リサーチ）は未設定です。手動追加で動作しています。
          </p>
          <div className="flex items-center gap-3">
            <BulkImportModal />
            <ManualLeadModal />
          </div>
        </div>
        <KpiCards leads={LEADS} />
        <TodayCallSummary leads={LEADS} />
        <LeadsBoard leads={LEADS} assigneeOptions={deriveAssigneeOptions(LEADS)} />

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:col-span-1">
            <h2 className="mb-3 font-bold">スコア（詳細ページ イメージ）</h2>
            <div className="flex flex-col gap-2">
              <ScoreBadge label="適合度" score={5} />
              <ScoreBadge label="規模" score={3} />
              <ScoreBadge label="地域" score={5} />
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <EnrichButton leadId={LEADS[0].id} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
