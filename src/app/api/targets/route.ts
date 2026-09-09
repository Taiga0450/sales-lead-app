import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { listSalesTargets, createSalesTarget } from "@/lib/google/sheets";

export async function GET() {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const targets = await listSalesTargets(accessToken);
    return NextResponse.json({ targets });
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
    fiscalYear?: string;
    periodLabel?: string;
    startDate?: string;
    endDate?: string;
    region?: string;
    targetAmount?: string;
  };

  const fiscalYear = body.fiscalYear?.trim();
  const periodLabel = body.periodLabel?.trim();
  const startDate = body.startDate?.trim();
  const endDate = body.endDate?.trim();
  const region = body.region?.trim();
  if (!fiscalYear || !periodLabel || !startDate || !endDate || !region) {
    return NextResponse.json({ error: "必須項目が入力されていません" }, { status: 400 });
  }

  try {
    const target = await createSalesTarget(accessToken, {
      fiscalYear,
      periodLabel,
      startDate,
      endDate,
      region,
      targetAmount: body.targetAmount?.trim() || "0",
    });
    return NextResponse.json({ target });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}
