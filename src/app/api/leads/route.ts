import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { appendLeads, type LeadRow } from "@/lib/google/sheets";

export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    facilityType?: string;
    phone?: string;
    address?: string;
    region?: string;
    regionNotes?: string;
    email?: string;
    assignee?: string;
    summary?: string;
    fitScore?: string;
    sizeScore?: string;
    regionScore?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "医療機関名を入力してください" }, { status: 400 });
  }

  const fit = Number(body.fitScore) || 0;
  const size = Number(body.sizeScore) || 0;
  const region = Number(body.regionScore) || 0;
  const hasScores = fit > 0 || size > 0 || region > 0;
  const total = hasScores ? Math.round((fit + size + region) / 3) : 0;

  const lead: LeadRow = {
    id: crypto.randomUUID(),
    医療機関名: name,
    種別: body.facilityType === "病院" ? "病院" : "クリニック",
    電話番号: body.phone?.trim() ?? "",
    地域: body.region?.trim() ?? "",
    地域特徴: body.regionNotes?.trim() ?? "",
    住所: body.address?.trim() ?? "",
    メールアドレス: body.email?.trim() ?? "",
    担当者: body.assignee?.trim() ?? "",
    ステータス: "未活動",
    総合スコア: total ? String(total) : "",
    適合度スコア: fit ? String(fit) : "",
    規模スコア: size ? String(size) : "",
    地域スコア: region ? String(region) : "",
    事業内容メモ: body.summary?.trim() ?? "",
    メモ: "",
    送信日: "",
    架電日: "",
    架電者: "",
    登録日: new Date().toISOString(),
    情報ソースURL: "",
    件名: "",
    本文: "",
    下書きID: "",
    シェアレジメモ: "",
  };

  try {
    await appendLeads(accessToken, [lead]);
    return NextResponse.json({ lead });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 });
  }
}
