import HomeCallStats from "@/components/HomeCallStats";
import AreaProgressCard from "@/components/AreaProgressCard";
import BudgetMiniCard from "@/components/BudgetMiniCard";
import CurrentPeriodStatus from "@/components/CurrentPeriodStatus";
import Sidebar from "@/components/Sidebar";
import NeedsCheckCard from "@/components/NeedsCheckCard";
import TargetEditor from "@/components/TargetEditor";
import type { PeriodSummary } from "@/lib/homeStats";
import type { PlanProgress } from "@/lib/callPlans";

/**
 * ホーム画面の見た目確認用（ログイン不要・サンプルデータのみ。実データは出さない）。
 */
const person = (name: string, type: "バイト" | "社員", hours: number, calls: number, calledLeads: number, apo: number) => ({
  name,
  type,
  hours,
  calls,
  calledLeads,
  apo,
});

const summary = (label: string, rangeLabel: string, scale: number): PeriodSummary => ({
  period: { kind: "month", start: "", end: "", label, rangeLabel },
  calls: Math.round(360 * scale),
  hours: 41.5 * scale,
  calledLeads: Math.round(350 * scale),
  apo: Math.round(17 * scale),
  receptionNg: Math.round(90 * scale),
  keymanNg: Math.round(95 * scale),
  people: [
    person("サンプル A", "バイト", 13 * scale, Math.round(120 * scale), Math.round(94 * scale), 4),
    person("サンプル B", "バイト", 14 * scale, Math.round(94 * scale), Math.round(90 * scale), 5),
    person("サンプル C", "バイト", 7 * scale, Math.round(79 * scale), Math.round(75 * scale), 0),
    person("サンプル D", "社員", 7 * scale, Math.round(64 * scale), Math.round(80 * scale), 2),
    person("サンプル E", "社員", 0.7 * scale, Math.round(8 * scale), Math.round(11 * scale), 6),
  ],
});

const plan = (id: string, owner: "IS" | "movement", pref: string, city: string, target: number, called: number, apo = 0, note = ""): PlanProgress => ({
  id,
  month: "2026-10",
  owner,
  pref,
  city,
  target,
  note,
  called,
  apo,
});

const PROGRESS: PlanProgress[] = [
  plan("1", "IS", "東京都", "台東区", 29, 18),
  plan("2", "IS", "東京都", "中央区", 21, 3),
  plan("3", "IS", "神奈川県", "川崎市", 54, 0, 0, "再架電"),
  plan("4", "IS", "兵庫県", "", 100, 120, 3, "新拠点"),
  plan("5", "IS", "千葉県", "船橋市", 50, 39, 1),
  plan("6", "movement", "神奈川県", "川崎市", 80, 40, 2),
  plan("7", "movement", "神奈川県", "横浜市", 30, 0),
];

export default function HomePreviewPage() {
  return (
    <div className="flex min-h-full flex-1">
      <Sidebar isSupervisor showUpsell />
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ホーム（プレビュー）</h1>
        <p className="mt-1 text-sm text-foreground/60">サンプルデータでの見た目確認用ページです</p>
      </div>
      <HomeCallStats
        data={{
          month: { current: summary("2026年10月", "10/1〜10/31", 1), previous: summary("2026年9月", "9/1〜9/30", 0.9) },
          quarter: { current: summary("2026年度 Q3", "10/1〜12/31", 1), previous: summary("2026年度 Q2", "7/1〜9/30", 2.4) },
        }}
      />
      <NeedsCheckCard phaseNotUpdated={12} />
      <AreaProgressCard month="2026-10" monthLabel="2026年10月" progress={PROGRESS} canEdit />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <CurrentPeriodStatus
          items={[]}
          currentHalfTarget={0}
          targetEditor={<TargetEditor fiscalYear={2026} half="下半期" kanto={0} osaka={0} />}
        />
        <BudgetMiniCard monthLabel="2026年10月" budget={300000} spent={182000} />
      </div>
    </div>
    </div>
  );
}
