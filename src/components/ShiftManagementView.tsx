"use client";

import { useEffect, useMemo, useState } from "react";
import { shiftHours } from "@/lib/callShifts";
import type { StaffWageRow } from "@/lib/staffWages";
import { wageMapOf } from "@/lib/staffWages";
import type { MonthlyApoRow } from "@/lib/monthlyApo";
import { monthlyApoMapOf } from "@/lib/monthlyApo";
import type { ShiftCalendarEntry } from "@/lib/callStats";
import ShiftCalendarGrid from "./ShiftCalendarGrid";
import ShiftSlotPanel from "./ShiftSlotPanel";
import type { ShiftSlotRow } from "@/lib/shiftSlots";
import {
  INCENTIVE_PER_APO,
  buildNameMerger,
  isAdminStaff,
  mergedWagesOf,
  monthBudgetOf,
  weeklyBudgetRows,
  weeksOfMonth,
  type ShiftBudgetRow,
} from "@/lib/shiftBudget";

export interface ShiftCalendarApiEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  category: "IS" | "IS研修";
  /** 表示用に結合済み（例: "藤川, 大坪"）。 */
  name: string;
  /** 1つの予定に複数人（カンマ区切り）が入っている場合、稼働時間は人ごとに分けて集計する。 */
  names: string[];
}

function currentMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/**
 * シフト予定はGoogleカレンダー（【IS/氏名】【IS研修/氏名】）が一次情報源のため、稼働時間は
 * ここでカレンダーAPIから月ごとに取得する。アポ獲得数（インセンティブ計算用）は、架電実績の
 * 自動集計ではなく管理者がここで月×人ごとに手入力する（時給と同じ扱い）。
 */
export default function ShiftManagementView({
  initialWages,
  initialApoCounts,
  initialPublishedEventIds,
  initialBudgets,
  initialSlots,
  previewEvents,
}: {
  initialWages: StaffWageRow[];
  initialApoCounts: MonthlyApoRow[];
  initialPublishedEventIds: string[];
  initialBudgets: ShiftBudgetRow[];
  initialSlots: ShiftSlotRow[];
  /** /preview用：カレンダーAPI（ログイン必須）の代わりに使うサンプルのシフト予定。 */
  previewEvents?: ShiftCalendarApiEvent[];
}) {
  const [month, setMonth] = useState(currentMonthStr());
  const [wages, setWages] = useState(() => wageMapOf(initialWages));
  const [wageDrafts, setWageDrafts] = useState<Record<string, string>>({});
  const [savingWageId, setSavingWageId] = useState<string | null>(null);

  const [apoCounts, setApoCounts] = useState(() => monthlyApoMapOf(initialApoCounts));
  const [apoDrafts, setApoDrafts] = useState<Record<string, string>>({});
  const [savingApoId, setSavingApoId] = useState<string | null>(null);

  const [publishedEventIds, setPublishedEventIds] = useState(() => new Set(initialPublishedEventIds));
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishWarning, setPublishWarning] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [budgetRows, setBudgetRows] = useState(initialBudgets);
  const [budgetDraft, setBudgetDraft] = useState<{ month: string; value: string } | null>(null);
  const [weekDrafts, setWeekDrafts] = useState<Record<string, string>>({});
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<ShiftCalendarApiEvent[]>(previewEvents ?? []);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarDebug, setCalendarDebug] = useState<{
    calendarId: string;
    timeMin: string;
    timeMax: string;
    rawCount: number;
    noDateTimeTitles: string[];
    unmatchedTitles: string[];
    parsedSample: { date: string; names: string[] }[];
  } | null>(null);

  const [year, monthNum] = month.split("-").map(Number);

  useEffect(() => {
    if (previewEvents) return;
    let cancelled = false;
    (async () => {
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const res = await fetch(`/api/shift-schedule/calendar?year=${year}&month=${monthNum}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
        if (!cancelled) {
          setCalendarEvents(data.events ?? []);
          setCalendarDebug(data.debug ?? null);
        }
      } catch (err) {
        if (!cancelled) setCalendarError(err instanceof Error ? err.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, monthNum, previewEvents]);

  // 同じ苗字の表記ゆれ（磯崎／磯崎様／磯崎愁斗）を1人にまとめる。時給・アポもまとめた名前で持つ。
  const mergeName = useMemo(
    () =>
      buildNameMerger([
        ...calendarEvents.flatMap((e) => e.names),
        ...Object.keys(wages),
        ...Object.keys(apoCounts).map((k) => k.split("|")[0]),
      ]),
    [calendarEvents, wages, apoCounts],
  );
  const mergedWages = useMemo(() => mergedWagesOf(wages, mergeName), [wages, mergeName]);

  const calendarByDate = useMemo(() => {
    const byDate: Record<string, ShiftCalendarEntry[]> = {};
    for (const e of calendarEvents) {
      for (const raw of e.names) {
        const name = mergeName(raw);
        (byDate[e.date] ??= []).push({
          identity: name,
          name: e.category === "IS研修" ? `${name}（研修）` : name,
          startTime: e.startTime,
          endTime: e.endTime,
          hours: shiftHours(e.startTime, e.endTime),
        });
      }
    }
    return byDate;
  }, [calendarEvents, mergeName]);

  const monthTotals = useMemo(() => {
    const map = new Map<string, { identity: string; name: string; hours: number; trainingHours: number; apo: number }>();
    const ensure = (identity: string) => {
      const cur = map.get(identity) ?? {
        identity,
        name: identity,
        hours: 0,
        trainingHours: 0,
        apo: apoCounts[`${identity}|${month}`] ?? 0,
      };
      map.set(identity, cur);
      return cur;
    };
    for (const e of calendarEvents) {
      for (const raw of e.names) {
        const name = mergeName(raw);
        if (isAdminStaff(name)) continue;
        const cur = ensure(name);
        const h = shiftHours(e.startTime, e.endTime);
        if (e.category === "IS研修") cur.trainingHours += h;
        else cur.hours += h;
      }
    }
    // 今月に稼働予定は無いが時給・アポが設定済みの人（先月まで在籍していた等）も表に出す。
    for (const identity of Object.keys(mergedWages)) if (!isAdminStaff(identity)) ensure(identity);
    for (const key of Object.keys(apoCounts)) {
      const [identity, apoMonth] = key.split("|");
      if (apoMonth === month && !isAdminStaff(mergeName(identity))) ensure(mergeName(identity));
    }
    return [...map.values()].sort((a, b) => b.hours + b.trainingHours - (a.hours + a.trainingHours));
  }, [calendarEvents, mergedWages, apoCounts, month, mergeName]);

  const budgetSetting = useMemo(() => monthBudgetOf(budgetRows, month), [budgetRows, month]);
  const weekRows = useMemo(
    () => weeklyBudgetRows({ month, events: calendarEvents, wages: mergedWages, merge: mergeName, setting: budgetSetting }),
    [month, calendarEvents, mergedWages, mergeName, budgetSetting],
  );

  const grandTotalHours = monthTotals.reduce((sum, p) => sum + p.hours, 0);
  const grandTotalTrainingHours = monthTotals.reduce((sum, p) => sum + p.trainingHours, 0);
  const grandTotalWageCost = weekRows.reduce((sum, w) => sum + w.cost, 0);
  const grandTotalIncentive = monthTotals.reduce((sum, p) => sum + p.apo * INCENTIVE_PER_APO, 0);
  const grandTotalCost = grandTotalWageCost + grandTotalIncentive;
  const budgetRemaining = budgetSetting.budget === null ? null : budgetSetting.budget - grandTotalCost;
  const missingWageNames = monthTotals.filter((p) => p.hours + p.trainingHours > 0 && !(mergedWages[p.identity] > 0)).map((p) => p.name);

  async function saveBudget(next: { budget?: string; includeTraining?: boolean; weekAllocations?: Record<string, number> }) {
    setSavingBudget(true);
    setBudgetError(null);
    const payload = {
      month,
      budget: next.budget ?? (budgetSetting.budget === null ? "" : String(budgetSetting.budget)),
      includeTraining: next.includeTraining ?? budgetSetting.includeTraining,
      weekAllocations: next.weekAllocations ?? budgetSetting.weekAllocations,
    };
    try {
      const res = await fetch("/api/shift-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setBudgetRows((rows) => [...rows.filter((row) => row.month !== month), data.row]);
      setBudgetDraft(null);
      setWeekDrafts({});
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingBudget(false);
    }
  }

  function saveWeekAllocation(weekStart: string, value: string | null) {
    const next = { ...budgetSetting.weekAllocations };
    if (value === null || value.trim() === "") delete next[weekStart];
    else next[weekStart] = Number(value) || 0;
    void saveBudget({ weekAllocations: next });
  }

  const sortedEvents = useMemo(
    () => [...calendarEvents].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [calendarEvents],
  );

  async function saveWage(identity: string) {
    const draft = wageDrafts[identity];
    if (draft === undefined) return;
    setSavingWageId(identity);
    setError(null);
    try {
      const res = await fetch("/api/staff-wages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerIdentity: identity, hourlyWage: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setWages((w) => ({ ...w, [identity]: Number(draft) || 0 }));
      setWageDrafts((d) => {
        const next = { ...d };
        delete next[identity];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingWageId(null);
    }
  }

  async function saveApo(identity: string) {
    const key = `${identity}|${month}`;
    const draft = apoDrafts[key];
    if (draft === undefined) return;
    setSavingApoId(identity);
    setError(null);
    try {
      const res = await fetch("/api/monthly-apo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerIdentity: identity, month, apoCount: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setApoCounts((a) => ({ ...a, [key]: Number(draft) || 0 }));
      setApoDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingApoId(null);
    }
  }

  async function publishEvent(e: ShiftCalendarApiEvent) {
    setPublishingId(e.id);
    setPublishWarning(null);
    try {
      const res = await fetch("/api/shift-schedule/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: e.id, name: e.name, date: e.date, startTime: e.startTime, endTime: e.endTime, category: e.category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "公開に失敗しました");
      if (data.slackError) setPublishWarning(`Slack通知に失敗しました: ${data.slackError}`);
      setPublishedEventIds((prev) => new Set(prev).add(e.id));
    } catch (err) {
      setPublishWarning(err instanceof Error ? err.message : "公開に失敗しました");
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
        >
          ◀
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/50 hover:bg-brand-light hover:text-brand"
        >
          ▶
        </button>
        {calendarLoading && <span className="text-xs text-foreground/40">カレンダーを読み込み中...</span>}
      </div>

      {calendarError && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Googleカレンダーの取得に失敗しました: {calendarError}
        </div>
      )}

      {(calendarDebug?.unmatchedTitles.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">形式が違うため読み取れなかった予定があります（販管費に含まれていません）</p>
          <p className="mt-1 text-xs">カレンダーのタイトルを【IS/名前】または【IS/名前,名前】の形に直してください。</p>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {calendarDebug!.unmatchedTitles.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {missingWageNames.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          時給が未登録のため人件費が0円になっている人がいます：{missingWageNames.join("、")}
          （下の「スタッフ別」の表で時給を入力してください）
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-border bg-brand-light/40 px-5 py-3">
          <h2 className="font-bold">IS販管費（{year}年{monthNum}月）</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-foreground/60">販管費</span>
            <input
              type="number"
              min="0"
              value={budgetDraft?.month === month ? budgetDraft.value : (budgetSetting.budget ?? "")}
              onChange={(e) => setBudgetDraft({ month, value: e.target.value })}
              placeholder="金額を入力"
              className="w-36 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-brand"
            />
            <span className="text-xs text-foreground/40">円</span>
            {budgetDraft?.month === month && (
              <button
                type="button"
                onClick={() => void saveBudget({ budget: budgetDraft.value })}
                disabled={savingBudget}
                className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {savingBudget ? "保存中" : "保存"}
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground/70">
            <input
              type="checkbox"
              checked={budgetSetting.includeTraining}
              disabled={savingBudget}
              onChange={(e) => void saveBudget({ includeTraining: e.target.checked })}
            />
            研修時間を販管費に含める
          </label>
          {budgetError && <span className="text-xs text-red-600">{budgetError}</span>}
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-foreground/50">販管費</p>
            <p className="text-xl font-bold">{budgetSetting.budget === null ? "未設定" : yen.format(budgetSetting.budget)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">予定人件費（時給分）</p>
            <p className="text-xl font-bold">{yen.format(grandTotalWageCost)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">インセンティブ（確定分）</p>
            <p className="text-xl font-bold">{yen.format(grandTotalIncentive)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">残り</p>
            <p className={`text-xl font-bold ${budgetRemaining !== null && budgetRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {budgetRemaining === null ? "—" : yen.format(budgetRemaining)}
            </p>
          </div>
          {budgetSetting.budget !== null && budgetSetting.budget > 0 && (
            <div className="col-span-2 md:col-span-4">
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full ${grandTotalCost > budgetSetting.budget ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, (grandTotalCost / budgetSetting.budget) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-foreground/50">
                消化率 {((grandTotalCost / budgetSetting.budget) * 100).toFixed(1)}%（予定人件費＋インセンティブ）
              </p>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-foreground/50">
                <th className="px-5 py-2 text-left">週（月〜日）</th>
                <th className="px-3 py-2 text-left">割り振り</th>
                <th className="px-3 py-2 text-right">使える時間の目安</th>
                <th className="px-3 py-2 text-right">予定時間</th>
                <th className="px-3 py-2 text-right">予定人件費</th>
                <th className="px-5 py-2 text-right">残り</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((w) => {
                const draft = weekDrafts[w.weekStart];
                const over = budgetSetting.budget !== null && w.remaining < 0;
                return (
                  <tr key={w.weekStart} className={`border-b border-border last:border-0 ${over ? "bg-red-50" : ""}`}>
                    <td className="px-5 py-2 font-medium">
                      {w.label}
                      <span className="ml-1 text-[11px] text-foreground/40">（{w.days}日）</span>
                    </td>
                    <td className="px-3 py-2">
                      {budgetSetting.budget === null ? (
                        <span className="text-xs text-foreground/40">販管費を入力すると自動で割り振ります</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={draft ?? w.allocation}
                            onChange={(e) => setWeekDrafts((d) => ({ ...d, [w.weekStart]: e.target.value }))}
                            className="w-28 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-brand"
                          />
                          {draft !== undefined && Number(draft) !== w.allocation && (
                            <button
                              type="button"
                              onClick={() => saveWeekAllocation(w.weekStart, draft)}
                              disabled={savingBudget}
                              className="rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              保存
                            </button>
                          )}
                          {w.isOverride && draft === undefined && (
                            <button
                              type="button"
                              onClick={() => saveWeekAllocation(w.weekStart, null)}
                              disabled={savingBudget}
                              title="手動の調整をやめて、日数で自動に割り振る"
                              className="text-[11px] text-foreground/40 hover:text-brand"
                            >
                              自動に戻す
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground/60">
                      {budgetSetting.budget === null || w.hourCap === null ? "—" : `約${w.hourCap.toFixed(1)}h`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {w.hours.toFixed(1)}h
                      {w.trainingHours > 0 && (
                        <span className="ml-1 text-[11px] text-foreground/40">
                          ＋研修{w.trainingHours.toFixed(1)}h{budgetSetting.includeTraining ? "" : "（対象外）"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{yen.format(w.cost)}</td>
                    <td className={`px-5 py-2 text-right font-semibold ${over ? "text-red-600" : "text-emerald-600"}`}>
                      {budgetSetting.budget === null ? "—" : yen.format(w.remaining)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-5 py-2 text-[11px] text-foreground/50">
          予定人件費＝カレンダーのシフト時間×時給（森さんは対象外）。インセンティブはアポ数を入力した時点で月の合計に加算します。使える時間の目安は、割り振り額÷登録済み時給の平均です。
        </p>
      </div>

      <ShiftSlotPanel weeks={weeksOfMonth(month)} initialRows={initialSlots} events={calendarEvents} merge={mergeName} />

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月の総稼働時間（カレンダー予定ベース）</p>
          <p className="mt-2 text-3xl font-bold text-brand">{grandTotalHours.toFixed(1)}h</p>
          {grandTotalTrainingHours > 0 && (
            <p className="mt-1 text-[11px] text-foreground/40">ほかに研修 {grandTotalTrainingHours.toFixed(1)}h</p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月のバイト人件費（時給＋インセンティブ）</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{yen.format(grandTotalCost)}</p>
          <p className="mt-1 text-[11px] text-foreground/40">
            時給分 {yen.format(grandTotalWageCost)} ＋ インセンティブ {yen.format(grandTotalIncentive)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月のアポ獲得数（インセンティブ対象・手入力）</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {monthTotals.reduce((sum, p) => sum + p.apo, 0)}件
          </p>
          <p className="mt-1 text-[11px] text-foreground/40">1件あたり{yen.format(INCENTIVE_PER_APO)}</p>
        </div>
      </div>

      <ShiftCalendarGrid year={year} month={monthNum} calendar={calendarByDate} />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-brand-light/40 px-5 py-3">
          <h2 className="font-bold">スタッフ別 稼働時間・時給・アポ獲得数・人件費</h2>
        </div>
        <div className="grid grid-cols-8 gap-3 border-b border-border px-5 py-2.5 text-xs font-medium text-foreground/50">
          <span>氏名</span>
          <span>稼働時間</span>
          <span>時給</span>
          <span></span>
          <span>アポ獲得（手入力）</span>
          <span></span>
          <span>インセンティブ</span>
          <span>合計人件費</span>
        </div>
        <div className="flex flex-col">
          {monthTotals.map((p) => {
            const wage = mergedWages[p.identity] ?? 0;
            const wageDraft = wageDrafts[p.identity];
            const hasWageDraft = wageDraft !== undefined && Number(wageDraft) !== wage;

            const apoKey = `${p.identity}|${month}`;
            const apo = apoCounts[apoKey] ?? 0;
            const apoDraft = apoDrafts[apoKey];
            const hasApoDraft = apoDraft !== undefined && Number(apoDraft) !== apo;

            const incentive = apo * INCENTIVE_PER_APO;
            const paidHours = p.hours + (budgetSetting.includeTraining ? p.trainingHours : 0);
            const total = paidHours * wage + incentive;
            return (
              <div key={p.identity} className="grid grid-cols-8 items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
                <span className="font-medium">{p.name}</span>
                <span>
                  {p.hours.toFixed(1)}h
                  {p.trainingHours > 0 && (
                    <span className="ml-1 text-[11px] text-foreground/40">＋研修{p.trainingHours.toFixed(1)}h</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={wageDraft ?? wage}
                    onChange={(e) => setWageDrafts((d) => ({ ...d, [p.identity]: e.target.value }))}
                    className="w-20 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-brand"
                  />
                  <span className="text-xs text-foreground/40">円/h</span>
                </div>
                <div>
                  {hasWageDraft && (
                    <button
                      type="button"
                      onClick={() => saveWage(p.identity)}
                      disabled={savingWageId === p.identity}
                      className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {savingWageId === p.identity ? "保存中" : "保存"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={apoDraft ?? apo}
                    onChange={(e) => setApoDrafts((d) => ({ ...d, [apoKey]: e.target.value }))}
                    className="w-16 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-brand"
                  />
                  <span className="text-xs text-foreground/40">件</span>
                </div>
                <div>
                  {hasApoDraft && (
                    <button
                      type="button"
                      onClick={() => saveApo(p.identity)}
                      disabled={savingApoId === p.identity}
                      className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {savingApoId === p.identity ? "保存中" : "保存"}
                    </button>
                  )}
                </div>
                <span className="text-amber-600">{yen.format(incentive)}</span>
                <span className="font-semibold text-emerald-600">{yen.format(total)}</span>
              </div>
            );
          })}
          {monthTotals.length === 0 && !calendarLoading && (
            <p className="px-5 py-8 text-center text-sm text-foreground/40">この月のシフト予定・稼働報告はまだありません</p>
          )}
        </div>
        {error && <p className="border-t border-border px-5 py-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-brand-light/40 px-5 py-3">
          <h2 className="font-bold">この月のシフト予定一覧（公開管理）</h2>
          <p className="mt-1 text-xs text-foreground/60">
            「公開する」を押すと、Slackのインターン共有アカウントへその1件の予定が通知されます（1件につき1回のみ）
          </p>
        </div>
        <div className="grid grid-cols-5 gap-3 border-b border-border px-5 py-2.5 text-xs font-medium text-foreground/50">
          <span>日付</span>
          <span>時間</span>
          <span>氏名</span>
          <span>区分</span>
          <span></span>
        </div>
        <div className="flex flex-col">
          {sortedEvents.map((e) => {
            const published = publishedEventIds.has(e.id);
            return (
              <div key={e.id} className="grid grid-cols-5 items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
                <span>{e.date}</span>
                <span>
                  {e.startTime}〜{e.endTime}
                </span>
                <span className="font-medium">{e.name}</span>
                <span>{e.category}</span>
                <div>
                  {published ? (
                    <span className="text-xs font-semibold text-emerald-600">公開済み</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => publishEvent(e)}
                      disabled={publishingId === e.id}
                      className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {publishingId === e.id ? "公開中" : "公開する"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {sortedEvents.length === 0 && !calendarLoading && (
            <p className="px-5 py-8 text-center text-sm text-foreground/40">この月のシフト予定はまだありません</p>
          )}
        </div>
        {publishWarning && <p className="border-t border-border px-5 py-2 text-xs text-red-600">{publishWarning}</p>}
      </div>
    </div>
  );
}
