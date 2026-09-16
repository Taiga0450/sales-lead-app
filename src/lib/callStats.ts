import type { LeadRow } from "./leads";
import type { CallShiftRow } from "./callShifts";
import { shiftHours, callerIdentityOf } from "./callShifts";

export interface CallerStats {
  email: string;
  today: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  apoToday: number;
  apoThisWeek: number;
  apoThisMonth: number;
}

export interface DailyCallCount {
  date: string;
  count: number;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  return r;
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

/**
 * 架電日・架電者は各リードにつき「直近の架電」1件分しか保持しない（架電ログではない）ため、
 * ここでの件数は「その人が最後に架電した状態のリード数」の近似値。厳密な架電ログ集計ではない点に注意。
 */
export function computeCallerStats(leads: LeadRow[], now: Date): CallerStats[] {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const byEmail = new Map<string, CallerStats>();
  for (const lead of leads) {
    if (!lead.架電日 || !lead.架電者) continue;
    const date = new Date(`${lead.架電日}T00:00:00`);
    if (Number.isNaN(date.getTime())) continue;

    if (!byEmail.has(lead.架電者)) {
      byEmail.set(lead.架電者, {
        email: lead.架電者,
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        total: 0,
        apoToday: 0,
        apoThisWeek: 0,
        apoThisMonth: 0,
      });
    }
    const stats = byEmail.get(lead.架電者)!;
    stats.total++;
    if (date >= monthStart) stats.thisMonth++;
    if (date >= weekStart) stats.thisWeek++;
    if (date >= todayStart) stats.today++;

    if (lead.ステータス === "商談獲得" || lead.ステータス === "契約医療機関") {
      if (date >= monthStart) stats.apoThisMonth++;
      if (date >= weekStart) stats.apoThisWeek++;
      if (date >= todayStart) stats.apoToday++;
    }
  }

  return [...byEmail.values()].sort((a, b) => b.thisMonth - a.thisMonth);
}

/** 直近N日分の全体架電件数の日次推移（棒グラフ用） */
export function computeDailyTrend(leads: LeadRow[], now: Date, days: number): DailyCallCount[] {
  const counts = new Map<string, number>();
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }

  for (const lead of leads) {
    if (!lead.架電日) continue;
    if (counts.has(lead.架電日)) {
      counts.set(lead.架電日, (counts.get(lead.架電日) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

export interface MonthlyCallCount {
  month: string; // YYYY-MM
  count: number;
}

/** 直近Nヶ月分の架電件数推移 */
export function computeMonthlyTrend(leads: LeadRow[], now: Date, months: number): MonthlyCallCount[] {
  const counts = new Map<string, number>();
  const start = startOfMonth(now);
  start.setMonth(start.getMonth() - (months - 1));

  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    counts.set(d.toISOString().slice(0, 7), 0);
  }

  for (const lead of leads) {
    if (!lead.架電日) continue;
    const month = lead.架電日.slice(0, 7);
    if (counts.has(month)) {
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([month, count]) => ({ month, count }));
}

export interface MonthlyCallerSummary {
  month: string; // YYYY-MM
  email: string;
  calls: number;
  apo: number; // アポ獲得数
  apoRate: number; // アポ率
  receptionNg: number; // 受付NG
  receptionNgRate: number; // 受付NG率
  keymanConnected: number; // キーマン接続数（受付を突破し、キーマンまで話が届いた件数の近似値）
  connectRate: number; // 接続率
}

/**
 * IS架電の月次稼働報告（参照シート準拠）に必要な指標を、月×架電者で集計する。
 * 「キーマン接続数」は、フェーズが 資料送付・商談獲得・契約医療機関・キーマンNG のいずれか
 * （＝受付を突破しキーマンまで話が進んだと判断できる状態）になったリードの件数の近似値。
 */
export function computeMonthlyCallerSummary(leads: LeadRow[]): MonthlyCallerSummary[] {
  interface Acc {
    calls: number;
    apo: number;
    receptionNg: number;
    keymanConnected: number;
  }
  const byKey = new Map<string, Acc>();

  for (const lead of leads) {
    if (!lead.架電日 || !lead.架電者) continue;
    const month = lead.架電日.slice(0, 7);
    const key = `${month}|${lead.架電者}`;
    if (!byKey.has(key)) byKey.set(key, { calls: 0, apo: 0, receptionNg: 0, keymanConnected: 0 });
    const acc = byKey.get(key)!;
    acc.calls++;
    if (lead.ステータス === "商談獲得" || lead.ステータス === "契約医療機関") acc.apo++;
    if (lead.ステータス === "受付NG") acc.receptionNg++;
    if (["資料送付", "商談獲得", "契約医療機関", "キーマンNG"].includes(lead.ステータス)) acc.keymanConnected++;
  }

  return [...byKey.entries()].map(([key, acc]) => {
    const [month, email] = key.split("|");
    return {
      month,
      email,
      calls: acc.calls,
      apo: acc.apo,
      apoRate: acc.calls > 0 ? acc.apo / acc.calls : 0,
      receptionNg: acc.receptionNg,
      receptionNgRate: acc.calls > 0 ? acc.receptionNg / acc.calls : 0,
      keymanConnected: acc.keymanConnected,
      connectRate: acc.calls > 0 ? acc.keymanConnected / acc.calls : 0,
    };
  });
}

export interface FiscalQuarter {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
}

/**
 * 日本の企業会計年度（4月始まり）での四半期を返す。
 * 例: 2026-04〜2026-06 → {fiscalYear: 2026, quarter: 1}、2027-01〜2027-03 → {fiscalYear: 2026, quarter: 4}
 */
export function fiscalQuarterOf(dateStr: string): FiscalQuarter | null {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getMonth(); // 0-11
  const fiscalYear = month >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const quarter = (Math.floor((month - 3 + 12) % 12 / 3) + 1) as 1 | 2 | 3 | 4;
  return { fiscalYear, quarter };
}

export function fiscalQuarterLabel(q: FiscalQuarter): string {
  return `${q.fiscalYear}年度 Q${q.quarter}`;
}

export interface QuarterlyCallerSummary {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  email: string;
  calls: number;
  apo: number;
  receptionNg: number;
  keymanConnected: number;
  hours: number;
}

/** シフト記録から、識別キー（callerIdentityOf）→表示名の対応表を作る。 */
export function buildCallerNames(shifts: CallShiftRow[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const shift of shifts) {
    if (shift.callerName) names[callerIdentityOf(shift)] = shift.callerName;
  }
  return names;
}

export interface ShiftCallerTotals {
  /** 稼働者の識別キー（callerIdentityOf）。個別ログインなら実際のメール、代理入力なら入力名。 */
  email: string;
  today: number;
  thisMonth: number;
  callsTotal: number;
  apoToday: number;
  apoThisMonth: number;
  apoTotal: number;
  hoursThisMonth: number;
  receptionNgThisMonth: number;
  keymanConnectedThisMonth: number;
}

/** 稼働報告（シフト記録）の架電数・アポ獲得数・稼働時間等を、稼働者×本日/今月で集計する。 */
export function computeShiftCallerTotals(shifts: CallShiftRow[], now: Date): ShiftCallerTotals[] {
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);
  const byEmail = new Map<string, ShiftCallerTotals>();
  for (const shift of shifts) {
    if (!shift.date || !shift.callerEmail) continue;
    const key = callerIdentityOf(shift);
    if (!key) continue;
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: key,
        today: 0,
        thisMonth: 0,
        callsTotal: 0,
        apoToday: 0,
        apoThisMonth: 0,
        apoTotal: 0,
        hoursThisMonth: 0,
        receptionNgThisMonth: 0,
        keymanConnectedThisMonth: 0,
      });
    }
    const acc = byEmail.get(key)!;
    const calls = Number(shift.calls) || 0;
    const apo = Number(shift.apo) || 0;
    // 累計は日付を問わず全期間分を積み上げる（過去の架電件数も蓄積されるように）。
    acc.callsTotal += calls;
    acc.apoTotal += apo;
    if (shift.date === todayStr) {
      acc.today += calls;
      acc.apoToday += apo;
    }
    if (shift.date.slice(0, 7) === monthStr) {
      acc.thisMonth += calls;
      acc.apoThisMonth += apo;
      acc.hoursThisMonth += shiftHours(shift.startTime, shift.endTime);
      acc.receptionNgThisMonth += Number(shift.receptionNg) || 0;
      acc.keymanConnectedThisMonth += Number(shift.keymanConnected) || 0;
    }
  }
  return [...byEmail.values()].sort((a, b) => b.thisMonth - a.thisMonth);
}

/**
 * 架電数・アポ獲得数・受付NG・キーマン接続数・稼働時間を、稼働者×四半期で集計する。
 * すべて稼働報告（シフト記録）の手入力値ベース——旧・テレアポ稼働報告シートと同じ集計方針。
 */
export function computeQuarterlySummary(shifts: CallShiftRow[]): QuarterlyCallerSummary[] {
  const byKey = new Map<string, QuarterlyCallerSummary>();
  for (const shift of shifts) {
    if (!shift.date || !shift.callerEmail) continue;
    const fq = fiscalQuarterOf(shift.date);
    if (!fq) continue;
    const identity = callerIdentityOf(shift);
    if (!identity) continue;
    const key = `${fq.fiscalYear}|${fq.quarter}|${identity}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        fiscalYear: fq.fiscalYear,
        quarter: fq.quarter,
        email: identity,
        calls: 0,
        apo: 0,
        receptionNg: 0,
        keymanConnected: 0,
        hours: 0,
      });
    }
    const acc = byKey.get(key)!;
    acc.calls += Number(shift.calls) || 0;
    acc.apo += Number(shift.apo) || 0;
    acc.receptionNg += Number(shift.receptionNg) || 0;
    acc.keymanConnected += Number(shift.keymanConnected) || 0;
    acc.hours += shiftHours(shift.startTime, shift.endTime);
  }
  return [...byKey.values()];
}

export interface ShiftCalendarEntry {
  /** 稼働者の識別キー（callerIdentityOf）。 */
  identity: string;
  name: string;
  startTime: string;
  endTime: string;
  hours: number;
}

/** 指定した年月（例: year=2026, month=9）について、日付（"YYYY-MM-DD"）→その日にシフトに入っている人の一覧、を返す。 */
export function computeMonthlyShiftCalendar(
  shifts: CallShiftRow[],
  year: number,
  month: number,
): Record<string, ShiftCalendarEntry[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const byDate: Record<string, ShiftCalendarEntry[]> = {};
  for (const shift of shifts) {
    if (!shift.date || shift.date.slice(0, 7) !== monthStr) continue;
    const identity = callerIdentityOf(shift);
    if (!identity) continue;
    (byDate[shift.date] ??= []).push({
      identity,
      name: shift.callerName || shift.callerEmail,
      startTime: shift.startTime,
      endTime: shift.endTime,
      hours: shiftHours(shift.startTime, shift.endTime),
    });
  }
  return byDate;
}
