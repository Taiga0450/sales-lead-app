import { isAdminStaff, type ShiftEventLike } from "@/lib/shiftBudget";

/**
 * シフト管理表の「人数枠」。どの曜日・時間帯に何人入れるかを、毎週の基本の型（weekStart空欄）として
 * 1回決めておき、特定の週だけ上書き（weekStart=その週の月曜）できる。カレンダーへの入力は森さんが
 * 直接行うため入力自体は止めず、枠に対する過不足をアプリ上で表示するだけにする。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */

export const SHIFT_SLOT_HEADERS = ["id", "weekStart", "weekday", "startTime", "endTime", "capacity", "updatedAt"] as const;
export type ShiftSlotRow = Record<(typeof SHIFT_SLOT_HEADERS)[number], string>;

/** 0=日〜6=土（DateのgetUTCDay()と同じ）。 */
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface ShiftSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
}

export function slotKey(s: Pick<ShiftSlot, "weekday" | "startTime" | "endTime">): string {
  return `${s.weekday}|${s.startTime}|${s.endTime}`;
}

export function slotsOf(rows: ShiftSlotRow[], weekStart: string): ShiftSlot[] {
  return rows
    .filter((r) => r.weekStart === weekStart)
    .map((r) => ({ weekday: Number(r.weekday), startTime: r.startTime, endTime: r.endTime, capacity: Number(r.capacity) || 0 }))
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

/**
 * その週に使う枠。基本の型をベースに、その週の上書きで同じ曜日・時間帯のものは人数を差し替え、
 * その週だけの枠は追加する（人数0に上書きすると、その週はその枠なし）。
 */
export function effectiveSlotsForWeek(rows: ShiftSlotRow[], weekStart: string): (ShiftSlot & { overridden: boolean })[] {
  const merged = new Map<string, ShiftSlot & { overridden: boolean }>();
  for (const s of slotsOf(rows, "")) merged.set(slotKey(s), { ...s, overridden: false });
  for (const s of slotsOf(rows, weekStart)) merged.set(slotKey(s), { ...s, overridden: true });
  return [...merged.values()]
    .filter((s) => s.capacity > 0 || s.overridden)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export interface SlotFill {
  date: string;
  slot: ShiftSlot & { overridden: boolean };
  names: string[];
  status: "over" | "short" | "ok";
}

export interface WeekSlotReport {
  fills: SlotFill[];
  /** どの枠にも重ならないシフト（枠の外に入れてしまったもの）。 */
  outside: { date: string; startTime: string; endTime: string; names: string[] }[];
}

/**
 * 週の日付ごとに、各枠の時間帯にシフトが重なっている人を数える（管理者は数えない）。
 * 1人が枠の途中だけ入っていても、その枠に入っている1人として数える。
 */
export function weekSlotReport(params: {
  weekStart: string;
  from: string;
  to: string;
  rows: ShiftSlotRow[];
  events: ShiftEventLike[];
  merge: (raw: string) => string;
}): WeekSlotReport {
  const { weekStart, from, to, rows, events, merge } = params;
  const slots = effectiveSlotsForWeek(rows, weekStart);
  const fills: SlotFill[] = [];
  const covered = new Set<ShiftEventLike>();

  const start = new Date(`${weekStart}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    if (date < from || date > to) continue;
    const dayEvents = events.filter((e) => e.date === date);
    for (const slot of slots.filter((s) => s.weekday === d.getUTCDay())) {
      const names = new Set<string>();
      for (const e of dayEvents) {
        if (toMin(e.startTime) < toMin(slot.endTime) && toMin(e.endTime) > toMin(slot.startTime)) {
          covered.add(e);
          for (const raw of e.names) {
            const name = merge(raw);
            if (!isAdminStaff(name)) names.add(name);
          }
        }
      }
      const count = names.size;
      fills.push({
        date,
        slot,
        names: [...names],
        status: count > slot.capacity ? "over" : count < slot.capacity ? "short" : "ok",
      });
    }
  }

  const outside = events
    .filter((e) => e.date >= from && e.date <= to && !covered.has(e))
    .map((e) => ({
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      names: e.names.map(merge).filter((n) => !isAdminStaff(n)),
    }))
    .filter((e) => e.names.length > 0);

  return { fills, outside };
}
