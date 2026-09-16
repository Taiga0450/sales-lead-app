import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listStaffWages, upsertStaffWage } from "@/lib/google/sheets";
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
    const wages = await listStaffWages(accessToken);
    return NextResponse.json({ wages });
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
  // シフト管理表は管理者（統括担当者）専用機能のため、時給の閲覧・変更も同じ権限で守る。
  if (!isSupervisorEmail(email)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    callerIdentity?: string;
    hourlyWage?: string;
  };
  const callerIdentity = body.callerIdentity?.trim();
  const hourlyWage = body.hourlyWage?.trim() ?? "";
  if (!callerIdentity) {
    return NextResponse.json({ error: "callerIdentityが必要です" }, { status: 400 });
  }
  if (hourlyWage && Number.isNaN(Number(hourlyWage))) {
    return NextResponse.json({ error: "時給は数値で入力してください" }, { status: 400 });
  }

  try {
    const wage = await upsertStaffWage(accessToken, callerIdentity, hourlyWage);
    return NextResponse.json({ wage });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
