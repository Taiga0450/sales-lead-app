"use client";

import { useMemo, useState } from "react";
import type { MonthWeek, ShiftEventLike } from "@/lib/shiftBudget";
import {
  WEEKDAY_LABELS,
  effectiveSlotsForWeek,
  slotKey,
  slotsOf,
  weekSlotReport,
  type ShiftSlot,
  type ShiftSlotRow,
} from "@/lib/shiftSlots";

/** 月曜始まりで並べる（0=日は最後）。 */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

async function postSlots(weekStart: string, slots: ShiftSlot[]): Promise<ShiftSlotRow[]> {
  const res = await fetch("/api/shift-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStart, slots }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
  return data.rows as ShiftSlotRow[];
}

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const weekdayOf = (date: string) => WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 毎週の基本の型の編集。行を足したり消したりして、最後にまとめて保存する。 */
function TemplateEditor({
  rows,
  onSaved,
}: {
  rows: ShiftSlotRow[];
  onSaved: (rows: ShiftSlotRow[]) => void;
}) {
  const saved = useMemo(() => slotsOf(rows, ""), [rows]);
  const [draft, setDraft] = useState<ShiftSlot[] | null>(null);
  const slots = draft ?? saved;
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [newStart, setNewStart] = useState("10:00");
  const [newEnd, setNewEnd] = useState("13:00");
  const [newCapacity, setNewCapacity] = useState("2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(next: ShiftSlot[]) {
    setDraft([...next].sort((a, b) => WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime)));
  }

  function addSlots() {
    setError(null);
    if (newDays.length === 0) return setError("曜日を選んでください");
    if (!newStart || !newEnd || newStart >= newEnd) return setError("終了は開始より後の時刻にしてください");
    const capacity = Number(newCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) return setError("人数は1以上の整数で入力してください");
    const added = newDays.map((weekday) => ({ weekday, startTime: newStart, endTime: newEnd, capacity }));
    const keys = new Set(added.map(slotKey));
    update([...slots.filter((s) => !keys.has(slotKey(s))), ...added]);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await postSlots("", draft));
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-3">
        <div>
          <p className="mb-1 text-xs text-foreground/50">曜日（複数選べます）</p>
          <div className="flex gap-1">
            {WEEKDAY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setNewDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]))}
                className={`h-8 w-8 rounded-md border text-sm ${
                  newDays.includes(d) ? "border-brand bg-brand text-white" : "border-border text-foreground/60"
                }`}
              >
                {WEEKDAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs text-foreground/50">
          開始
          <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="mt-1 block rounded-md border border-border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-foreground/50">
          終了
          <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="mt-1 block rounded-md border border-border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-foreground/50">
          人数
          <input
            type="number"
            min="1"
            value={newCapacity}
            onChange={(e) => setNewCapacity(e.target.value)}
            className="mt-1 block w-16 rounded-md border border-border px-2 py-1 text-sm"
          />
        </label>
        <button type="button" onClick={addSlots} className="rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light">
          ＋ 枠を追加
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="text-center text-sm text-foreground/40">まだ枠がありません。上のフォームから追加してください。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-foreground/50">
              <th className="py-1.5 text-left">曜日</th>
              <th className="py-1.5 text-left">時間帯</th>
              <th className="py-1.5 text-left">人数</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={slotKey(s)} className="border-b border-border last:border-0">
                <td className="py-1.5 font-medium">{WEEKDAY_LABELS[s.weekday]}</td>
                <td className="py-1.5">
                  {s.startTime}〜{s.endTime}
                </td>
                <td className="py-1.5">
                  <input
                    type="number"
                    min="1"
                    value={s.capacity}
                    onChange={(e) => update(slots.map((x) => (slotKey(x) === slotKey(s) ? { ...x, capacity: Number(e.target.value) || 0 } : x)))}
                    className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                  />
                  <span className="ml-1 text-xs text-foreground/40">名</span>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => update(slots.filter((x) => slotKey(x) !== slotKey(s)))}
                    className="text-xs text-foreground/40 hover:text-red-500"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {draft && (
          <>
            <button type="button" onClick={() => setDraft(null)} className="text-xs text-foreground/50 hover:text-foreground">
              変更を取り消す
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "保存中..." : "基本の型を保存"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 1週間分の枠の埋まり具合と、その週だけの人数の調整。 */
function WeekView({
  week,
  rows,
  events,
  merge,
  onSaved,
}: {
  week: MonthWeek;
  rows: ShiftSlotRow[];
  events: ShiftEventLike[];
  merge: (raw: string) => string;
  onSaved: (rows: ShiftSlotRow[]) => void;
}) {
  const report = useMemo(
    () => weekSlotReport({ weekStart: week.weekStart, from: week.from, to: week.to, rows, events, merge }),
    [week, rows, events, merge],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasTemplate = slotsOf(rows, "").length > 0 || slotsOf(rows, week.weekStart).length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // 基本の型と人数が違う枠だけを、その週の上書きとして保存する
      const template = new Map(slotsOf(rows, "").map((s) => [slotKey(s), s.capacity]));
      const effective = effectiveSlotsForWeek(rows, week.weekStart);
      const overrides = effective
        .map((s) => ({ ...s, capacity: drafts[slotKey(s)] !== undefined ? Number(drafts[slotKey(s)]) || 0 : s.capacity }))
        .filter((s) => template.get(slotKey(s)) !== s.capacity)
        .map(({ weekday, startTime, endTime, capacity }) => ({ weekday, startTime, endTime, capacity }));
      onSaved(await postSlots(week.weekStart, overrides));
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (!hasTemplate) {
    return <p className="px-5 py-6 text-center text-sm text-foreground/40">先に「基本の型」タブで人数枠を設定してください。</p>;
  }

  const byDate = new Map<string, typeof report.fills>();
  for (const f of report.fills) byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {byDate.size === 0 && <p className="text-center text-sm text-foreground/40">この週に設定された枠はありません。</p>}
      {[...byDate.entries()].map(([date, fills]) => (
        <div key={date} className="rounded-xl border border-border">
          <p className="border-b border-border bg-brand-light/20 px-3 py-1.5 text-sm font-semibold">
            {md(date)}（{weekdayOf(date)}）
          </p>
          {fills.map((f) => {
            const key = slotKey(f.slot);
            const capacity = drafts[key] !== undefined ? Number(drafts[key]) || 0 : f.slot.capacity;
            const count = f.names.length;
            const status = count > capacity ? "over" : count < capacity ? "short" : "ok";
            return (
              <div key={key} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${status === "over" ? "bg-red-50" : ""}`}>
                <span className="w-28 font-medium">
                  {f.slot.startTime}〜{f.slot.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={drafts[key] ?? f.slot.capacity}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    title="この週だけ人数を変える"
                    className="w-14 rounded-md border border-border px-1.5 py-0.5 text-sm"
                  />
                  <span className="text-xs text-foreground/40">名枠{f.slot.overridden ? "（この週だけ変更）" : ""}</span>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    status === "over"
                      ? "bg-red-100 text-red-700"
                      : status === "short"
                        ? "bg-amber-100 text-amber-700"
                        : capacity === 0
                          ? "bg-border text-foreground/50"
                          : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {capacity === 0 && count === 0
                    ? "この週はなし"
                    : `${count}/${capacity}名${status === "over" ? `・${count - capacity}名超過` : status === "short" ? `・あと${capacity - count}名` : "・OK"}`}
                </span>
                <span className="text-xs text-foreground/60">{f.names.join("、") || "（まだ誰も入っていません）"}</span>
              </div>
            );
          })}
        </div>
      ))}

      {report.outside.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">どの枠にも入っていないシフト</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {report.outside.map((o, i) => (
              <li key={i}>
                {md(o.date)}（{weekdayOf(o.date)}）{o.startTime}〜{o.endTime} {o.names.join("、")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {Object.keys(drafts).length > 0 && (
          <>
            <button type="button" onClick={() => setDrafts({})} className="text-xs text-foreground/50 hover:text-foreground">
              変更を取り消す
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "保存中..." : "この週の人数を保存"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 人数枠の設定と、カレンダーのシフトとの照合。基本の型（毎週）＋週ごとの人数調整で、
 * 超過（赤）・不足（黄）・枠外のシフトを表示する。
 */
export default function ShiftSlotPanel({
  weeks,
  initialRows,
  events,
  merge,
}: {
  weeks: MonthWeek[];
  initialRows: ShiftSlotRow[];
  events: ShiftEventLike[];
  merge: (raw: string) => string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<string>("template");

  const summary = useMemo(() => {
    let over = 0;
    let short = 0;
    let outside = 0;
    for (const w of weeks) {
      const r = weekSlotReport({ weekStart: w.weekStart, from: w.from, to: w.to, rows, events, merge });
      over += r.fills.filter((f) => f.status === "over").length;
      short += r.fills.filter((f) => f.status === "short").length;
      outside += r.outside.length;
    }
    return { over, short, outside };
  }, [weeks, rows, events, merge]);

  const hasTemplate = slotsOf(rows, "").length > 0;
  const activeWeek = weeks.find((w) => w.weekStart === tab);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-brand-light/40 px-5 py-3">
        <h2 className="font-bold">人数枠</h2>
        {hasTemplate && (
          <span className="text-xs text-foreground/60">
            この月：
            <span className={summary.over > 0 ? "font-semibold text-red-600" : ""}>超過 {summary.over}枠</span>・
            <span className={summary.short > 0 ? "font-semibold text-amber-600" : ""}>不足 {summary.short}枠</span>・
            <span className={summary.outside > 0 ? "font-semibold text-amber-600" : ""}>枠外のシフト {summary.outside}件</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border px-5 py-2">
        <button
          type="button"
          onClick={() => setTab("template")}
          className={`rounded-md px-3 py-1 text-sm ${tab === "template" ? "bg-brand text-white" : "text-foreground/60 hover:bg-brand-light"}`}
        >
          基本の型（毎週）
        </button>
        {weeks.map((w) => (
          <button
            key={w.weekStart}
            type="button"
            onClick={() => setTab(w.weekStart)}
            className={`rounded-md px-3 py-1 text-sm ${tab === w.weekStart ? "bg-brand text-white" : "text-foreground/60 hover:bg-brand-light"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {activeWeek ? (
        <WeekView key={activeWeek.weekStart} week={activeWeek} rows={rows} events={events} merge={merge} onSaved={setRows} />
      ) : (
        <TemplateEditor rows={rows} onSaved={setRows} />
      )}
    </div>
  );
}
