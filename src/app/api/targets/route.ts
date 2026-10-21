import { NextResponse } from "next/server";
import { requireAccessToken, requireSession } from "@/lib/session";
import { listSalesTargets, createSalesTarget, upsertSalesTarget } from "@/lib/google/sheets";
import { isSupervisorEmail } from "@/lib/callShifts";

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

/** ホームの「目標を設定」から、今期（上半期/下半期）の地域別目標額を上書きする（管理者のみ）。 */
export async function PATCH(request: Request) {
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
    fiscalYear?: string;
    periodLabel?: string;
    targets?: { region?: string; targetAmount?: string }[];
  };
  const fiscalYear = body.fiscalYear ?? "";
  const periodLabel = body.periodLabel;
  if (!/^\d{4}$/.test(fiscalYear) || (periodLabel !== "上半期" && periodLabel !== "下半期")) {
    return NextResponse.json({ error: "年度と期間が不正です" }, { status: 400 });
  }
  for (const t of body.targets ?? []) {
    if (t.region !== "関東" && t.region !== "大阪") {
      return NextResponse.json({ error: "地域が不正です" }, { status: 400 });
    }
    const amount = (t.targetAmount ?? "").trim();
    if (amount && !(Number(amount) >= 0)) {
      return NextResponse.json({ error: "目標額は0以上の数値で入力してください" }, { status: 400 });
    }
  }

  try {
    for (const t of body.targets ?? []) {
      await upsertSalesTarget(accessToken, {
        fiscalYear,
        periodLabel,
        region: t.region!,
        targetAmount: (t.targetAmount ?? "").trim() || "0",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
