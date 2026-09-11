"use client";

import { useMemo, useState } from "react";
import type { HearingListItem } from "@/lib/dealHearing";
import {
  rangeSummaryFor,
  defaultWeekRange,
  monthBreakdownFor,
  quarterBreakdownFor,
  halfBreakdownFor,
  PHASE_COUNT_COLUMNS,
  type PeriodBreakdown,
  type RangeMeetingGroup,
} from "@/lib/salesMeetingStats";
import DealStageBar from "./DealStageBar";
import Gauge from "./Gauge";
import { KpiCard } from "./KpiCards";
import PeriodNavigator from "./PeriodNavigator";
import SectionTabs from "./SectionTabs";

function num(v: number | null): string {
  return v === null ? "—" : String(v);
}

function yen(v: number): string {
  return `¥${v.toLocaleString()}`;
}

const DEAL_ROW_GRID = "grid-cols-[64px_1.6fr_1fr_0.9fr_64px_64px_1fr_140px]";

/**
 * 確定売上（クローズ済み）・口頭受注（合意済みだが未契約締結の見込み）・見込み売上（確度A・未クローズ）
 * の3つを、関東全体と担当者別で並べる金額サマリー。件数の内訳（BreakdownTable）とは別に、
 * 「金額」だけをひと目で追えるようにするための表示。
 */
function RevenueSummary({ breakdown }: { breakdown: PeriodBreakdown }) {
  const rows = [{ label: "関東全体", row: breakdown.overall, highlight: true }, ...breakdown.byOwner.map((r) => ({ label: r.owner, row: r, highlight: false }))];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-brand-light/40 px-5 py-3">
        <h3 className="font-bold">売上サマリー（金額）</h3>
        <p className="text-xs text-foreground/50">{breakdown.label}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-brand-light/10 text-xs font-medium text-foreground/50">
              <th className="px-5 py-2 text-left">担当者</th>
              <th className="px-3 py-2 text-right">確定売上（クローズ済み）</th>
              <th className="px-3 py-2 text-right">口頭受注（見込み）</th>
              <th className="px-3 py-2 text-right">見込み売上（確度A・未クローズ）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, row, highlight }) => (
              <tr
                key={label}
                className={`border-b border-border last:border-0 ${highlight ? "bg-brand-light/20 font-semibold" : ""}`}
              >
                <td className={`px-5 py-2.5 ${highlight ? "" : "text-foreground/70"}`}>{label}</td>
                <td className="px-3 py-2.5 text-right text-emerald-600">{yen(row.confirmedRevenue)}</td>
                <td className="px-3 py-2.5 text-right text-sky-600">{yen(row.verbalOrderRevenue)}</td>
                <td className="px-3 py-2.5 text-right text-amber-600">{yen(row.pipelineRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 現時点の会計半期（上半期/下半期は自動判定、targetsシートの関東目標も自動でその半期の値に
 * 切り替わる）の確定売上が、目標に対してどこまで進んでいるかを示すダッシュボード。
 * カレンダーでの期間選択とは独立して、常に「今」の半期実績を表示する（ホーム画面・
 * 商談報告×Hubspotの「今期の状況」と同じ考え方）。実績側は halfBreakdownFor が持つ
 * 2026年度上半期の移行措置（日付を問わず全件を今期扱いにする）をそのまま反映する。
 */
function HalfTargetProgress({ breakdown, target }: { breakdown: PeriodBreakdown; target: number }) {
  return (
    <div className="rounded-2xl border border-border bg-brand-light/20 p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-foreground/70">目標達成状況（{breakdown.label}・関東全体）</h3>
      <div className="grid grid-cols-2 items-center gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-foreground/50">確定売上（クローズ済み）</p>
          <p className="text-2xl font-bold text-emerald-600">{yen(breakdown.overall.confirmedRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">口頭受注（見込み）</p>
          <p className="text-2xl font-bold text-sky-600">{yen(breakdown.overall.verbalOrderRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">見込み売上（確度A・未クローズ）</p>
          <p className="text-2xl font-bold text-amber-600">{yen(breakdown.overall.pipelineRevenue)}</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-xs text-foreground/50">目標までの進捗</p>
          {target > 0 ? (
            <Gauge value={breakdown.overall.confirmedRevenue} target={target} label="対目標（確定売上）" valueFormatter={yen} />
          ) : (
            <p className="mt-2 text-sm text-foreground/40">
              目標未設定
              <span className="ml-1 text-xs">（実績 {yen(breakdown.overall.confirmedRevenue)}）</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 商談の一覧をカレンダー期間で絞ったもの。定例ミーティングで1件ずつ確認・報告できるよう、
 * 選択期間・月次・四半期・半期のどのタブでも同じ形式で使う（BreakdownTable/RangeSectionで共用）。
 */
function DealItemList({ items }: { items: HearingListItem[] }) {
  if (items.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-foreground/40">この期間の商談はありません</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div
        className={`grid ${DEAL_ROW_GRID} gap-3 border-b border-border bg-brand-light/10 px-5 py-2 text-xs font-medium text-foreground/50`}
      >
        <span>商談日</span>
        <span>病院名</span>
        <span>検討プラン</span>
        <span>カルテ</span>
        <span>患者数/月</span>
        <span>往診/月</span>
        <span>エリア</span>
        <span>フェーズ</span>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <details key={item.id} className="group border-b border-border last:border-0">
            <summary
              className={`grid ${DEAL_ROW_GRID} cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm hover:bg-brand-light/20`}
            >
              <span className="text-foreground/60">{item.firstMeetingDate || "—"}</span>
              <span className="truncate font-medium">
                {item.dealname}
                <span className="ml-2 text-xs font-normal text-foreground/40">{item.ownerName}</span>
              </span>
              <span className="truncate text-foreground/70">{item.plan || "—"}</span>
              <span className="truncate text-foreground/70">{item.chart || "—"}</span>
              <span className="text-foreground/70">{num(item.callsPerMonth)}</span>
              <span className="text-foreground/70">{num(item.visitsPerMonth)}</span>
              <span className="truncate text-foreground/70">{item.area || "—"}</span>
              <DealStageBar stage={item.dealStage} compact />
            </summary>
            <div className="border-t border-border bg-brand-light/10 px-5 py-3">
              <p className="mb-1 text-xs font-semibold text-foreground/50">ヒアリングメモ</p>
              <p className="whitespace-pre-wrap text-sm text-foreground/80">{item.hearingNotes || "（記録なし）"}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function RangeSection({ range }: { range: RangeMeetingGroup }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-brand-light/40 px-5 py-3">
          <h3 className="font-bold">{range.label}</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {range.breakdown.byOwner.map((row) => (
              <span key={row.owner} className="text-foreground/60">
                {row.owner}: <span className="font-semibold text-foreground">{row.total}件</span>
              </span>
            ))}
            <span className="font-semibold text-brand">合計 {range.breakdown.overall.total}件</span>
          </div>
        </div>

        <DealItemList items={range.items} />
      </div>

      <RevenueSummary breakdown={range.breakdown} />
    </div>
  );
}

/**
 * 関東全体（合計）行を太字で強調し、その下に担当者（森・富田）ごとの内訳行を並べるテーブル。
 * その下に、この期間の対象商談を1件ずつ確認できる一覧（DealItemList）を続けて表示する——
 * 定例ミーティングで件数・売上を見るだけでなく、案件ごとにフィードバックしていく流れのため。
 */
function BreakdownTable({ breakdown }: { breakdown: PeriodBreakdown }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-brand-light/40 px-5 py-3">
          <h3 className="font-bold">商談数（件数）</h3>
          <p className="text-xs text-foreground/50">{breakdown.label}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-brand-light/10 text-xs font-medium text-foreground/50">
                <th className="px-5 py-2 text-left">担当者</th>
                {PHASE_COUNT_COLUMNS.map((s) => (
                  <th key={s} className="px-3 py-2 text-right">
                    {s}
                  </th>
                ))}
                <th className="px-5 py-2 text-right">合計</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-brand-light/20 font-semibold">
                <td className="px-5 py-2.5">関東全体</td>
                {PHASE_COUNT_COLUMNS.map((s) => (
                  <td key={s} className="px-3 py-2.5 text-right">
                    {breakdown.overall.counts[s]}件
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right text-brand">{breakdown.overall.total}件</td>
              </tr>
              {breakdown.byOwner.map((row) => (
                <tr key={row.owner} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 text-foreground/70">{row.owner}</td>
                  {PHASE_COUNT_COLUMNS.map((s) => (
                    <td key={s} className="px-3 py-2.5 text-right">
                      {row.counts[s]}件
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right font-semibold">{row.total}件</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-brand-light/40 px-5 py-3">
          <h3 className="font-bold">対象商談一覧</h3>
          <p className="text-xs text-foreground/50">1件ずつ確認・フィードバックする際にお使いください</p>
        </div>
        <DealItemList items={breakdown.items} />
      </div>

      <RevenueSummary breakdown={breakdown} />
    </div>
  );
}

export default function SalesMeetingBoard({
  items,
  currentHalfTarget = 0,
}: {
  items: HearingListItem[];
  currentHalfTarget?: number;
}) {
  const [range, setRange] = useState(defaultWeekRange);
  // カレンダーで別の期間を見ていても、目標達成ダッシュボードは常に「今」の半期実績を示す。
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  const selection = useMemo(
    () => rangeSummaryFor(items, range.start, range.end),
    [items, range.start, range.end],
  );
  // 月次/四半期/半期は、選択期間の開始日が属する暦月・会計四半期・会計半期を基準に集計する
  // （こちらは「選んだ期間ちょうど」ではなく、その期間を含む一般的な区切りでの全体感を見るため）。
  const month = useMemo(() => monthBreakdownFor(items, range.start), [items, range.start]);
  const quarter = useMemo(() => quarterBreakdownFor(items, range.start), [items, range.start]);
  const half = useMemo(() => halfBreakdownFor(items, range.start), [items, range.start]);
  const currentHalf = useMemo(() => halfBreakdownFor(items, todayStr), [items, todayStr]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label={`対象件数（${currentHalf.label}）`} value={currentHalf.overall.total} tone="brand" />
        <KpiCard label="初回商談" value={currentHalf.overall.counts.初回商談} />
        <KpiCard label="見積提出" value={currentHalf.overall.counts.見積提出} />
        <KpiCard label="口頭受注" value={currentHalf.overall.counts.口頭受注} tone="success" />
        <KpiCard label="クローズ済み" value={currentHalf.overall.counts.クローズ済み} tone="success" />
        <KpiCard label="失注" value={currentHalf.overall.counts.失注} tone="danger" />
      </div>

      <HalfTargetProgress breakdown={currentHalf} target={currentHalfTarget} />

      <PeriodNavigator startDate={range.start} endDate={range.end} onChange={setRange} />

      <SectionTabs
        sections={[
          { key: "range", label: "選択期間の商談数", content: <RangeSection range={selection} /> },
          { key: "monthly", label: "月間の進捗状況（商談数・売上）", content: <BreakdownTable breakdown={month} /> },
          { key: "quarterly", label: "四半期ごとの商談数・売上", content: <BreakdownTable breakdown={quarter} /> },
          { key: "half", label: "半期ごとの商談数・売上", content: <BreakdownTable breakdown={half} /> },
        ]}
      />
    </div>
  );
}
