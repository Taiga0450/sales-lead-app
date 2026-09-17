import { readFileSync } from "node:fs";
import { join } from "node:path";
import { google, calendar_v3 } from "googleapis";

/**
 * シフト予定はt.mori（管理者）自身のGoogleカレンダーに「IS/氏名」または「IS研修/氏名」という
 * タイトルで入る運用（カレンダーが一次情報源）。ブラウザセッションを問わず読み書きできるよう、
 * lib/google/serviceSheets.tsと同じサービスアカウントを使う——このカレンダーをそのサービス
 * アカウント（credentials/service-account.jsonのclient_email）に「予定の変更権限」で
 * 共有しておいてもらう必要がある。
 */
const CALENDAR_ID = process.env.SHIFT_CALENDAR_ID ?? "t.mori@oncall-japan.com";

function loadServiceAccountCredentials(): Record<string, unknown> {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  const path = join(process.cwd(), "credentials", "service-account.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

let cachedCalendar: calendar_v3.Calendar | null = null;

function getServiceCalendar(): calendar_v3.Calendar {
  if (cachedCalendar) return cachedCalendar;
  const auth = new google.auth.GoogleAuth({
    credentials: loadServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  cachedCalendar = google.calendar({ version: "v3", auth });
  return cachedCalendar;
}

export type ShiftEventCategory = "IS" | "IS研修";

export interface ShiftCalendarEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  category: ShiftEventCategory;
  name: string;
}

const TITLE_PATTERN = /^(IS研修|IS)\s*\/\s*(.+)$/;

function parseEventTitle(summary: string): { category: ShiftEventCategory; name: string } | null {
  const match = TITLE_PATTERN.exec(summary.trim());
  if (!match) return null;
  return { category: match[1] as ShiftEventCategory, name: match[2].trim() };
}

function splitDateTime(dateTime: string): { date: string; time: string } {
  const d = new Date(dateTime);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

/** 指定した年月について、【IS/氏名】【IS研修/氏名】形式のイベントだけを抽出して返す（終日イベントは対象外）。 */
export async function listShiftCalendarEvents(year: number, month: number): Promise<ShiftCalendarEvent[]> {
  const calendar = getServiceCalendar();
  const timeMin = new Date(year, month - 1, 1).toISOString();
  const timeMax = new Date(year, month, 1).toISOString();
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    maxResults: 2500,
  });

  const events: ShiftCalendarEvent[] = [];
  for (const e of res.data.items ?? []) {
    if (!e.id || !e.summary || !e.start?.dateTime || !e.end?.dateTime) continue;
    const parsed = parseEventTitle(e.summary);
    if (!parsed) continue;
    const start = splitDateTime(e.start.dateTime);
    const end = splitDateTime(e.end.dateTime);
    events.push({ id: e.id, date: start.date, startTime: start.time, endTime: end.time, ...parsed });
  }
  return events;
}

/** アプリ上で追加したシフト予定を、同じ形式でt.moriのGoogleカレンダーにも反映する。 */
export async function createShiftCalendarEvent(params: {
  date: string;
  startTime: string;
  endTime: string;
  name: string;
  category?: ShiftEventCategory;
}): Promise<{ id: string }> {
  const calendar = getServiceCalendar();
  const category = params.category ?? "IS";
  const timeZone = "Asia/Tokyo";
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `${category}/${params.name}`,
      start: { dateTime: `${params.date}T${params.startTime}:00`, timeZone },
      end: { dateTime: `${params.date}T${params.endTime}:00`, timeZone },
    },
  });
  return { id: res.data.id! };
}
