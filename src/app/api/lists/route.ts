import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { listSavedLists, createSavedList } from "@/lib/google/sheets";

export async function GET() {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const lists = await listSavedLists(accessToken);
    return NextResponse.json({ lists });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    region?: string;
    status?: string;
    assignee?: string;
    keyword?: string;
    call?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "リスト名を入力してください" }, { status: 400 });
  }

  try {
    const list = await createSavedList(accessToken, {
      name,
      region: body.region?.trim() ?? "",
      status: body.status ?? "all",
      assignee: body.assignee?.trim() ?? "",
      keyword: body.keyword?.trim() ?? "",
      call: body.call ?? "all",
    });
    return NextResponse.json({ list });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}
