import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listActingAsRoster, createActingAsRosterEntry } from "@/lib/google/sheets";
import { getSharedAccountKey } from "@/lib/actingAs";

export async function GET() {
  let accessToken: string;
  let email: string | undefined;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    email = session.user?.email ?? undefined;
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const account = getSharedAccountKey(email ?? "") ?? "sales";

  try {
    const roster = await listActingAsRoster(accessToken, account);
    return NextResponse.json({ roster });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let accessToken: string;
  let email: string | undefined;
  try {
    const session = await requireSession();
    accessToken = session.accessToken!;
    email = session.user?.email ?? undefined;
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const account = getSharedAccountKey(email ?? "") ?? "sales";

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "名前を入力してください" }, { status: 400 });
  }

  try {
    const entry = await createActingAsRosterEntry(accessToken, name, account);
    return NextResponse.json({ entry });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 });
  }
}
