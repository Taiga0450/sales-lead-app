import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listMonthlyApo, upsertMonthlyApo } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

export async function GET() {
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

  try {
    const rows = await listMonthlyApo(accessToken);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

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
    callerIdentity?: string;
    month?: string;
    apoCount?: string;
  };
  const callerIdentity = body.callerIdentity?.trim();
  const month = body.month?.trim();
  const apoCount = body.apoCount?.trim() ?? "";
  if (!callerIdentity || !/^\d{4}-\d{2}$/.test(month ?? "")) {
    return NextResponse.json({ error: "callerIdentityとmonth（YYYY-MM）が必要です" }, { status: 400 });
  }
  if (apoCount && Number.isNaN(Number(apoCount))) {
    return NextResponse.json({ error: "アポ数は数値で入力してください" }, { status: 400 });
  }

  try {
    const row = await upsertMonthlyApo(accessToken, callerIdentity, month!, apoCount);
    return NextResponse.json({ row });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
