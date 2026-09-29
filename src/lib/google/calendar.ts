import { google } from "googleapis";
import {
  parseShiftEventTitle,
  type ListShiftCalendarEventsResult,
  type ShiftCalendarEvent,
} from "@/lib/google/serviceCalendar";

/**
 * シフトは森さん（管理者）自身のGoogleカレンダーに【IS/氏名】【IS研修/氏名】で入る運用。
 * サービスアカウントへの共有は組織の外部共有ポリシーで「時間枠のみ」に制限されタイトルが読めないため、
 * シフト管理表を開いた本人（=カレンダーの持ち主）のログイントークン（calendar.readonly）で読む。
 */
const CALENDAR_ID = process.env.SHIFT_CALENDAR_ID ?? "t.mori@oncall-japan.com";

/** Googleの権限不足（calendar.readonlyを許可する前のログインのまま）を画面側で見分けるためのエラー。 */
export class CalendarScopeError extends Error {}

/** RFC3339の日時を、実行環境のタイムゾーン（VercelはUTC）に関係なく日本時間の日付・時刻にする。 */
function toJst(dateTime: string): { date: string; time: string } {
  const jst = new Date(new Date(dateTime).getTime() + 9 * 3600000).toISOString();
  return { date: jst.slice(0, 10), time: jst.slice(11, 16) };
}

/** 指定した年月（日本時間）の【IS/氏名】【IS研修/氏名】形式の予定だけを返す（終日の予定は対象外）。 */
export async function listShiftCalendarEvents(
  accessToken: string,
  year: number,
  month: number,
): Promise<ListShiftCalendarEventsResult> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const timeMin = `${year}-${pad(month)}-01T00:00:00+09:00`;
  const timeMax = `${next.y}-${pad(next.m)}-01T00:00:00+09:00`;

  let rawItems;
  try {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      maxResults: 2500,
    });
    rawItems = res.data.items ?? [];
  } catch (error) {
    const code = (error as { code?: number }).code;
    const message = error instanceof Error ? error.message : "";
    if (code === 403 && /insufficient|scope/i.test(message)) {
      throw new CalendarScopeError("カレンダーを読む権限がまだありません。一度ログアウトして、ログインし直してください。");
    }
    throw error;
  }

  const events: ShiftCalendarEvent[] = [];
  const unmatchedTitles: string[] = [];
  const noDateTimeTitles: string[] = [];
  for (const e of rawItems) {
    if (!e.id || !e.start?.dateTime || !e.end?.dateTime) {
      if (e.summary && noDateTimeTitles.length < 20) noDateTimeTitles.push(e.summary);
      continue;
    }
    const parsed = e.summary ? parseShiftEventTitle(e.summary) : null;
    if (!parsed) {
      // シフトらしい（IS を含む）のに読めなかったものだけを、形式違いの確認用に集める
      if (e.summary && /IS/i.test(e.summary) && unmatchedTitles.length < 50) unmatchedTitles.push(e.summary);
      continue;
    }
    const start = toJst(e.start.dateTime);
    const end = toJst(e.end.dateTime);
    events.push({
      id: e.id,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      category: parsed.category,
      name: parsed.names.join(", "),
      names: parsed.names,
    });
  }
  const parsedSample = events.slice(0, 30).map((e) => ({ date: e.date, names: e.names }));
  return {
    events,
    debug: { calendarId: CALENDAR_ID, timeMin, timeMax, rawCount: rawItems.length, noDateTimeTitles, unmatchedTitles, parsedSample },
  };
}
