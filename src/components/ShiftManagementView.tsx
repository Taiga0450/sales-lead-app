"use client";

import { useEffect, useMemo, useState } from "react";
import { shiftHours } from "@/lib/callShifts";
import type { StaffWageRow } from "@/lib/staffWages";
import { wageMapOf } from "@/lib/staffWages";
import type { MonthlyApoRow } from "@/lib/monthlyApo";
import { monthlyApoMapOf } from "@/lib/monthlyApo";
import type { ShiftCalendarEntry } from "@/lib/callStats";
import ShiftCalendarGrid from "./ShiftCalendarGrid";

/** アポ獲得1件あたりのインセンティブ。時給とは別に人件費へ加算する。 */
const INCENTIVE_PER_APO = 800;

interface ShiftCalendarApiEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  category: "IS" | "IS研修";
  name: string;
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
}: {
  initialWages: StaffWageRow[];
  initialApoCounts: MonthlyApoRow[];
  initialPublishedEventIds: string[];
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

  const [calendarEvents, setCalendarEvents] = useState<ShiftCalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [year, monthNum] = month.split("-").map(Number);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const res = await fetch(`/api/shift-schedule/calendar?year=${year}&month=${monthNum}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
        if (!cancelled) setCalendarEvents(data.events ?? []);
      } catch (err) {
        if (!cancelled) setCalendarError(err instanceof Error ? err.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, monthNum]);

  const calendarByDate = useMemo(() => {
    const byDate: Record<string, ShiftCalendarEntry[]> = {};
    for (const e of calendarEvents) {
      (byDate[e.date] ??= []).push({
        identity: e.name,
        name: e.category === "IS研修" ? `${e.name}（研修）` : e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        hours: shiftHours(e.startTime, e.endTime),
      });
    }
    return byDate;
  }, [calendarEvents]);

  const monthTotals = useMemo(() => {
    const map = new Map<string, { identity: string; name: string; hours: number; apo: number }>();
    const ensure = (identity: string, name: string) => {
      const cur = map.get(identity) ?? { identity, name, hours: 0, apo: apoCounts[`${identity}|${month}`] ?? 0 };
      map.set(identity, cur);
      return cur;
    };
    for (const e of calendarEvents) {
      const cur = ensure(e.name, e.name);
      cur.hours += shiftHours(e.startTime, e.endTime);
    }
    // 今月に稼働予定は無いが時給・アポが設定済みの人（先月まで在籍していた等）も表に出す。
    for (const identity of Object.keys(wages)) ensure(identity, identity);
    for (const key of Object.keys(apoCounts)) {
      const [identity, apoMonth] = key.split("|");
      if (apoMonth === month) ensure(identity, identity);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [calendarEvents, wages, apoCounts, month]);

  const grandTotalHours = monthTotals.reduce((sum, p) => sum + p.hours, 0);
  const grandTotalWageCost = monthTotals.reduce((sum, p) => sum + p.hours * (wages[p.identity] ?? 0), 0);
  const grandTotalIncentive = monthTotals.reduce((sum, p) => sum + p.apo * INCENTIVE_PER_APO, 0);
  const grandTotalCost = grandTotalWageCost + grandTotalIncentive;

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
          <br />
          管理者のGoogleカレンダーを、サービスアカウント（sheets-writer@task-manager-504101.iam.gserviceaccount.com）に
          「予定の変更権限」で共有してください。
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-medium text-foreground/50">今月の総稼働時間（カレンダー予定ベース）</p>
          <p className="mt-2 text-3xl font-bold text-brand">{grandTotalHours.toFixed(1)}h</p>
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
            const wage = wages[p.identity] ?? 0;
            const wageDraft = wageDrafts[p.identity];
            const hasWageDraft = wageDraft !== undefined && Number(wageDraft) !== wage;

            const apoKey = `${p.identity}|${month}`;
            const apo = apoCounts[apoKey] ?? 0;
            const apoDraft = apoDrafts[apoKey];
            const hasApoDraft = apoDraft !== undefined && Number(apoDraft) !== apo;

            const incentive = apo * INCENTIVE_PER_APO;
            const total = p.hours * wage + incentive;
            return (
              <div key={p.identity} className="grid grid-cols-8 items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
                <span className="font-medium">{p.name}</span>
                <span>{p.hours.toFixed(1)}h</span>
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
