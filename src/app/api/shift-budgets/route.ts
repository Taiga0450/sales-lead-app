import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { upsertShiftBudget } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

/** シフト管理表の月ごとのIS販管費設定を保存する（管理者のみ）。 */
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
    budget?: string;
    includeTraining?: boolean;
    weekAllocations?: Record<string, number>;
  };
  const month = body.month?.trim() ?? "";
  const budget = body.budget?.trim() ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month（YYYY-MM）が必要です" }, { status: 400 });
  }
  if (budget && !(Number(budget) >= 0)) {
    return NextResponse.json({ error: "販管費は0以上の数値で入力してください" }, { status: 400 });
  }
  const weekAllocations: Record<string, number> = {};
  for (const [weekStart, amount] of Object.entries(body.weekAllocations ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !(Number(amount) >= 0)) {
      return NextResponse.json({ error: "週の割り振りが不正です" }, { status: 400 });
    }
    weekAllocations[weekStart] = Number(amount);
  }

  try {
    const row = await upsertShiftBudget(accessToken, month, {
      budget,
      includeTraining: body.includeTraining === true,
      weekAllocations,
    });
    return NextResponse.json({ row });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
