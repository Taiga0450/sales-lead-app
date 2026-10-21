import type { CallShiftRow } from "@/lib/callShifts";
import { callerIdentityOf, isHourlyStaffShift, shiftHours } from "@/lib/callShifts";
import type { LeadRow } from "@/lib/leads";

/**
 * ホーム画面の「架電状況」の集計。数字の出どころは次のとおり（2026-10 ユーザー決定）。
 * - 架電数・稼働時間：稼働報告（callShifts）の手入力値
 * - 架電した医療機関・アポ獲得：リード一覧の架電日・フェーズ（アポ獲得＝その期間に架電日がある「商談獲得」）
 *   稼働報告の「アポ」欄は入力漏れがあるため使わない。委託（架電者=movement）はIS実績から除く。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */

export const OUTSOURCE_CALLER = "movement";

export type PeriodKind = "month" | "quarter";

export interface Period {
  kind: PeriodKind;
  start: string;
  end: string;
  label: string;
  /** 「10/1〜10/31」 */
  rangeLabel: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

/** 日本時間の今日（YYYY-MM-DD）。サーバー（UTC）でも月初0〜9時に前月扱いにならないように。 */
export function jstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

/** 4月始まりの会計年度。offset=-1で一つ前の期間。 */
export function periodOf(kind: PeriodKind, today: string, offset = 0): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (kind === "month") {
    const first = new Date(Date.UTC(y, m - 1 + offset, 1));
    const fy = first.getUTCFullYear();
    const fm = first.getUTCMonth() + 1;
    const start = ymd(fy, fm, 1);
    const end = ymd(fy, fm + 1, 0);
    return { kind, start, end, label: `${fy}年${fm}月`, rangeLabel: `${md(start)}〜${md(end)}` };
  }
  const fiscalMonth = (m + 8) % 12; // 4月=0
  const qIndex = Math.floor(fiscalMonth / 3) + offset; // 0始まり（年度をまたいでもよい）
  const fiscalYearBase = m >= 4 ? y : y - 1;
  const fy = fiscalYearBase + Math.floor(qIndex / 4);
  const q = ((qIndex % 4) + 4) % 4;
  const startMonth = 4 + q * 3; // 4,7,10,13
  const start = ymd(fy, startMonth, 1);
  const end = ymd(fy, startMonth + 3, 0);
  return { kind, start, end, label: `${fy}年度 Q${q + 1}`, rangeLabel: `${md(start)}〜${md(end)}` };
}

const inPeriod = (date: string, p: Period) => !!date && date >= p.start && date <= p.end;

/** 同じ人・同じ日・同じ時間・同じ架電数の稼働報告が二重に入っている場合は1件として数える。 */
export function dedupeShifts(shifts: CallShiftRow[]): CallShiftRow[] {
  const seen = new Set<string>();
  return shifts.filter((s) => {
    const key = [callerIdentityOf(s), s.date, s.startTime, s.endTime, s.calls, s.apo].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface PersonRow {
  name: string;
  type: "バイト" | "社員";
  hours: number;
  calls: number;
  calledLeads: number;
  apo: number;
}

export interface PeriodSummary {
  period: Period;
  calls: number;
  hours: number;
  calledLeads: number;
  apo: number;
  receptionNg: number;
  keymanNg: number;
  people: PersonRow[];
}

/**
 * リード一覧の「架電者」は、バイト（共有アカウント）なら氏名、社員なら本人のメールアドレスが入る。
 * 稼働報告の氏名と結びつけるため、稼働報告からメール→氏名の対応を作る。
 */
function emailToNameMap(shifts: CallShiftRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of shifts) if (s.callerEmail.includes("@") && s.callerName) map[s.callerEmail] = s.callerName;
  return map;
}

export function summarizePeriod(period: Period, rawShifts: CallShiftRow[], leads: LeadRow[]): PeriodSummary {
  const shifts = dedupeShifts(rawShifts);
  const emailName = emailToNameMap(shifts);
  const people = new Map<string, PersonRow>();
  const typeOf = new Map<string, "バイト" | "社員">();
  for (const s of shifts) {
    const name = callerIdentityOf(s);
    if (name && !typeOf.has(name)) typeOf.set(name, isHourlyStaffShift(s) ? "バイト" : "社員");
  }
  const person = (name: string) => {
    let p = people.get(name);
    if (!p) {
      p = { name, type: typeOf.get(name) ?? (name.includes("@") ? "社員" : "バイト"), hours: 0, calls: 0, calledLeads: 0, apo: 0 };
      people.set(name, p);
    }
    return p;
  };

  let calls = 0;
  let hours = 0;
  for (const s of shifts) {
    if (!inPeriod(s.date, period)) continue;
    const h = shiftHours(s.startTime, s.endTime);
    const c = Number(s.calls) || 0;
    calls += c;
    hours += h;
    const p = person(callerIdentityOf(s));
    p.calls += c;
    p.hours += h;
  }

  let calledLeads = 0;
  let apo = 0;
  let receptionNg = 0;
  let keymanNg = 0;
  for (const l of leads) {
    if (!inPeriod(l.架電日, period) || l.架電者 === OUTSOURCE_CALLER) continue;
    calledLeads++;
    const isApo = l.ステータス === "商談獲得";
    if (isApo) apo++;
    if (l.ステータス === "受付NG") receptionNg++;
    if (l.ステータス === "キーマンNG") keymanNg++;
    const caller = emailName[l.架電者] ?? l.架電者;
    if (!caller) continue;
    const p = person(caller);
    p.calledLeads++;
    if (isApo) p.apo++;
  }

  const order = { バイト: 0, 社員: 1 };
  return {
    period,
    calls,
    hours,
    calledLeads,
    apo,
    receptionNg,
    keymanNg,
    people: [...people.values()]
      .filter((p) => p.calls + p.calledLeads + p.hours > 0)
      .sort((a, b) => order[a.type] - order[b.type] || b.calledLeads - a.calledLeads),
  };
}
