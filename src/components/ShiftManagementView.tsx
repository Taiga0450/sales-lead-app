"use client";

import { useEffect, useMemo, useState } from "react";
import type { CallShiftRow } from "@/lib/callShifts";
import { shiftHours } from "@/lib/callShifts";
import type { StaffWageRow } from "@/lib/staffWages";
import { wageMapOf } from "@/lib/staffWages";
import { computeMonthlyIdentityTotals } from "@/lib/callStats";
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
 * ここでカレンダーAPIから月ごとに取得する（callShiftsシートのdate/startTime/endTimeは使わない）。
 * アポ獲得数（インセンティブ計算用）は引き続きシートの架電実績（isHourlyStaffShiftで絞り込み済み）
 * から集計し、氏名で突き合わせる。
 */
export default function ShiftManagementView({
  shifts,
  initialWages,
}: {
  shifts: CallShiftRow[];
  initialWages: StaffWageRow[];
}) {
  const [month, setMonth] = useState(currentMonthStr());
  const [wages, setWages] = useState(() => wageMapOf(initialWages));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const apoTotals = useMemo(() => computeMonthlyIdentityTotals(shifts, year, monthNum), [shifts, year, monthNum]);

  const monthTotals = useMemo(() => {
    const map = new Map<string, { identity: string; name: string; hours: number; apo: number }>();
    const apoByIdentity = new Map(apoTotals.map((t) => [t.identity, t.apo]));
    for (const e of calendarEvents) {
      const cur = map.get(e.name) ?? { identity: e.name, name: e.name, hours: 0, apo: apoByIdentity.get(e.name) ?? 0 };
      cur.hours += shiftHours(e.startTime, e.endTime);
      map.set(e.name, cur);
    }
    // カレンダーに予定は無いがアポ実績はある人（インセンティブのみ発生）も一覧に出す。
    for (const t of apoTotals) {
      if (!map.has(t.identity)) map.set(t.identity, { identity: t.identity, name: t.name, hours: 0, apo: t.apo });
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [calendarEvents, apoTotals]);

  const grandTotalHours = monthTotals.reduce((sum, p) => sum + p.hours, 0);
  const grandTotalWageCost = monthTotals.reduce((sum, p) => sum + p.hours * (wages[p.identity] ?? 0), 0);
  const grandTotalIncentive = monthTotals.reduce((sum, p) => sum + p.apo * INCENTIVE_PER_APO, 0);
  const grandTotalCost = grandTotalWageCost + grandTotalIncentive;

  async function saveWage(identity: string) {
    const draft = drafts[identity];
    if (draft === undefined) return;
    setSavingId(identity);
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
      setDrafts((d) => {
        const next = { ...d };
        delete next[identity];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingId(null);
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
          <p className="text-xs font-medium text-foreground/50">今月のアポ獲得数（インセンティブ対象）</p>
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
        <div className="grid grid-cols-7 gap-3 border-b border-border px-5 py-2.5 text-xs font-medium text-foreground/50">
          <span>氏名</span>
          <span>稼働時間</span>
          <span>時給</span>
          <span>アポ獲得</span>
          <span>インセンティブ</span>
          <span>合計人件費</span>
          <span></span>
        </div>
        <div className="flex flex-col">
          {monthTotals.map((p) => {
            const wage = wages[p.identity] ?? 0;
            const draft = drafts[p.identity];
            const hasDraft = draft !== undefined && Number(draft) !== wage;
            const incentive = p.apo * INCENTIVE_PER_APO;
            const total = p.hours * wage + incentive;
            return (
              <div key={p.identity} className="grid grid-cols-7 items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
                <span className="font-medium">{p.name}</span>
                <span>{p.hours.toFixed(1)}h</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={draft ?? wage}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.identity]: e.target.value }))}
                    className="w-20 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-brand"
                  />
                  <span className="text-xs text-foreground/40">円/h</span>
                </div>
                <span>{p.apo}件</span>
                <span className="text-amber-600">{yen.format(incentive)}</span>
                <span className="font-semibold text-emerald-600">{yen.format(total)}</span>
                <div>
                  {hasDraft && (
                    <button
                      type="button"
                      onClick={() => saveWage(p.identity)}
                      disabled={savingId === p.identity}
                      className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === p.identity ? "保存中" : "保存"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {monthTotals.length === 0 && !calendarLoading && (
            <p className="px-5 py-8 text-center text-sm text-foreground/40">この月のシフト予定・稼働報告はまだありません</p>
          )}
        </div>
        {error && <p className="border-t border-border px-5 py-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
