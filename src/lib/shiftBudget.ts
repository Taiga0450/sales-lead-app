import { shiftHours } from "@/lib/callShifts";

/**
 * シフト管理表の「IS販管費」まわりの計算。月ごとに管理者が販管費（予算）を手入力し、Googleカレンダーの
 * 【IS/氏名】予定から出した予定人件費（時間×時給）＋確定したアポのインセンティブと比べる。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */

export const INCENTIVE_PER_APO = 800;

export const SHIFT_BUDGET_HEADERS = ["id", "month", "budget", "includeTraining", "weekAllocations", "updatedAt"] as const;
export type ShiftBudgetRow = Record<(typeof SHIFT_BUDGET_HEADERS)[number], string>;

export interface MonthBudgetSetting {
  budget: number | null;
  includeTraining: boolean;
  /** 週の開始日（月曜、YYYY-MM-DD）→ その週に割り振った金額。手で調整した週だけ入る。 */
  weekAllocations: Record<string, number>;
}

export function monthBudgetOf(rows: ShiftBudgetRow[], month: string): MonthBudgetSetting {
  const row = rows.find((r) => r.month === month);
  let weekAllocations: Record<string, number> = {};
  try {
    weekAllocations = row?.weekAllocations ? JSON.parse(row.weekAllocations) : {};
  } catch {
    weekAllocations = {};
  }
  const budget = row?.budget ? Number(row.budget) : NaN;
  return {
    budget: Number.isFinite(budget) ? budget : null,
    includeTraining: row?.includeTraining === "TRUE",
    weekAllocations,
  };
}

/** 販管費の対象外（時給のバイトではない管理者）。カレンダーには姓だけで書かれることもある。 */
const ADMIN_NAMES = new Set(["森", "森太雅"]);

export function isAdminStaff(name: string): boolean {
  return ADMIN_NAMES.has(name);
}

/** 末尾の敬称と、スペース以降（名）を外す。「磯崎様」「磯崎 愁斗」→「磯崎」。 */
function baseName(raw: string): string {
  const noHonorific = raw.trim().replace(/(様|さん|くん|ちゃん)$/, "").trim();
  return noHonorific.split(/[\s　]+/)[0] || raw.trim();
}

/**
 * 同じ苗字の表記ゆれ（磯崎／磯崎様／磯崎愁斗）を1人にまとめるための対応を作る。カレンダーには姓だけの
 * こともフルネームのこともあるため、敬称・スペース以降を外したうえで、他の名前で始まる名前
 * （「磯崎愁斗」は「磯崎」で始まる）を短い方（苗字）に寄せる。同じ苗字の別人が入った場合は
 * カレンダー側でフルネーム表記にし、苗字だけの表記を使わないようにする。
 */
export function buildNameMerger(names: Iterable<string>): (raw: string) => string {
  const bases = [...new Set([...names].map(baseName).filter(Boolean))].sort((a, b) => a.length - b.length);
  const canonical = new Map<string, string>();
  for (const b of bases) {
    const prefix = bases.find((other) => other.length >= 2 && other.length < b.length && b.startsWith(other));
    canonical.set(b, prefix ? (canonical.get(prefix) ?? prefix) : b);
  }
  return (raw: string) => {
    const b = baseName(raw);
    return canonical.get(b) ?? b;
  };
}

/**
 * 表記ゆれを寄せた後の時給表。まとめ先の名前で登録された時給を優先し、無ければまとめられた
 * 表記のどれかに登録された時給（0より大きいもの）を使う。
 */
export function mergedWagesOf(wages: Record<string, number>, merge: (raw: string) => string): Record<string, number> {
  const result: Record<string, number> = {};
  // まとめ先の名前そのものの時給 → まとめられた表記の時給、の優先順で、0より大きいものを採用する
  const entries = Object.entries(wages).sort(([a], [b]) => Number(merge(b) === b) - Number(merge(a) === a));
  for (const [name, wage] of entries) {
    const key = merge(name);
    if (!(key in result) || (result[key] <= 0 && wage > 0)) result[key] = wage;
  }
  return result;
}

export interface MonthWeek {
  /** その週の月曜日（YYYY-MM-DD）。月をまたぐ週でもキーは月曜日で固定。 */
  weekStart: string;
  /** 月の中に入っている範囲（月初・月末で切る）。 */
  from: string;
  to: string;
  days: number;
  label: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

/** 月曜〜日曜で区切った、その月の週一覧。月をまたぐ週は、その月に入る日だけを数える。 */
export function weeksOfMonth(month: string): MonthWeek[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const weeks: MonthWeek[] = [];
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  while (cursor <= last) {
    const weekStart = ymd(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const from = cursor < first ? ymd(first) : weekStart;
    const to = weekEnd > last ? ymd(last) : ymd(weekEnd);
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    weeks.push({ weekStart, from, to, days, label: `${md(from)}〜${md(to)}` });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

/**
 * 月の販管費を週に割り振る。手で調整した週はその額を使い、残りの額を他の週へ日数で按分する
 * （端数は最後の週に寄せ、合計が必ず販管費と一致するようにする）。
 */
export function allocateWeeks(budget: number, weeks: MonthWeek[], overrides: Record<string, number>): Record<string, number> {
  const fixed = weeks.filter((w) => overrides[w.weekStart] !== undefined);
  const free = weeks.filter((w) => overrides[w.weekStart] === undefined);
  const fixedTotal = fixed.reduce((s, w) => s + overrides[w.weekStart], 0);
  const rest = budget - fixedTotal;
  const freeDays = free.reduce((s, w) => s + w.days, 0);
  const result: Record<string, number> = {};
  for (const w of fixed) result[w.weekStart] = overrides[w.weekStart];
  let assigned = 0;
  free.forEach((w, i) => {
    const amount = i === free.length - 1 ? rest - assigned : Math.floor((rest * w.days) / (freeDays || 1));
    result[w.weekStart] = amount;
    assigned += amount;
  });
  return result;
}

export interface ShiftEventLike {
  date: string;
  startTime: string;
  endTime: string;
  category: "IS" | "IS研修";
  names: string[];
}

export interface WeekBudgetRow extends MonthWeek {
  allocation: number;
  isOverride: boolean;
  hours: number;
  trainingHours: number;
  cost: number;
  remaining: number;
  /** 割り振り額 ÷ 平均時給。時給が1人も登録されていなければnull。 */
  hourCap: number | null;
}

/**
 * 週ごとの「割り振り額・予定人件費・残り・使える時間の目安」。予定人件費は時給分のみ
 * （インセンティブはアポ数が確定してから月の合計に加算する）。wagesはmergedWagesOfで寄せた後のもの。
 * 管理者は対象外、研修は月の設定で切り替え。
 */
export function weeklyBudgetRows(params: {
  month: string;
  events: ShiftEventLike[];
  wages: Record<string, number>;
  merge: (raw: string) => string;
  setting: MonthBudgetSetting;
}): WeekBudgetRow[] {
  const { month, events, wages, merge, setting } = params;
  const weeks = weeksOfMonth(month);
  const allocation = setting.budget === null ? null : allocateWeeks(setting.budget, weeks, setting.weekAllocations);
  const paidWages = Object.values(wages).filter((w) => w > 0);
  const avgWage = paidWages.length ? paidWages.reduce((s, w) => s + w, 0) / paidWages.length : null;

  return weeks.map((w) => {
    let hours = 0;
    let trainingHours = 0;
    let cost = 0;
    for (const e of events) {
      if (e.date < w.from || e.date > w.to) continue;
      const h = shiftHours(e.startTime, e.endTime);
      for (const raw of e.names) {
        const name = merge(raw);
        if (isAdminStaff(name)) continue;
        if (e.category === "IS研修") {
          trainingHours += h;
          if (!setting.includeTraining) continue;
        } else {
          hours += h;
        }
        cost += h * (wages[name] ?? 0);
      }
    }
    const amount = allocation ? allocation[w.weekStart] : 0;
    return {
      ...w,
      allocation: amount,
      isOverride: setting.weekAllocations[w.weekStart] !== undefined,
      hours,
      trainingHours,
      cost,
      remaining: amount - cost,
      hourCap: avgWage ? amount / avgWage : null,
    };
  });
}
