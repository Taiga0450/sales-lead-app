import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { replaceCallPlans } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

/** 月の架電計画の保存（管理者のみ）。その月の計画を丸ごと置き換える。 */
export async function POST(request: Request) {
  let accessToken: string;
  let email: string;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    email = session.user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isSupervisorEmail(email)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    month?: string;
    plans?: { owner?: string; pref?: string; city?: string; target?: number; note?: string }[];
  };
  const month = body.month ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month（YYYY-MM）が必要です" }, { status: 400 });
  }
  const plans = [];
  for (const p of body.plans ?? []) {
    const owner = p.owner === "movement" ? "movement" : "IS";
    const pref = (p.pref ?? "").trim();
    const city = (p.city ?? "").trim();
    const target = Number(p.target);
    if (!pref) return NextResponse.json({ error: "都道府県を入力してください" }, { status: 400 });
    if (!Number.isInteger(target) || target < 0 || target > 10000) {
      return NextResponse.json({ error: "件数は0以上の整数で入力してください" }, { status: 400 });
    }
    plans.push({ owner, pref, city, target, note: (p.note ?? "").trim().slice(0, 100) });
  }

  try {
    const rows = await replaceCallPlans(accessToken, month, plans);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
