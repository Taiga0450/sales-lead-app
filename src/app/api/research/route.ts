import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { researchLeads } from "@/lib/anthropic/research";
import { appendLeads, listLeads, type LeadRow } from "@/lib/google/sheets";

export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    region?: string;
    keywords?: string;
  };

  const region = body.region?.trim();
  if (!region) {
    return NextResponse.json({ error: "地域を入力してください" }, { status: 400 });
  }

  try {
    const [candidates, existingLeads] = await Promise.all([
      researchLeads({ region, keywords: body.keywords }),
      listLeads(accessToken),
    ]);

    const existingKeys = new Set(
      existingLeads.map((lead) => `${lead.医療機関名}|${lead.電話番号}`.trim()),
    );

    const now = new Date().toISOString();
    const newRows: LeadRow[] = candidates
      .filter((candidate) => !existingKeys.has(`${candidate.name}|${candidate.phone}`.trim()))
      .map((candidate) => {
        const total = Math.round(
          (candidate.fit_score + candidate.size_score + candidate.region_score) / 3,
        );
        return {
          id: crypto.randomUUID(),
          医療機関名: candidate.name,
          種別: candidate.facility_type,
          電話番号: candidate.phone,
          住所: candidate.address,
          地域: candidate.region,
          地域特徴: candidate.region_notes,
          メールアドレス: candidate.email,
          担当者: "",
          事業内容メモ: candidate.summary,
          適合度スコア: String(candidate.fit_score),
          規模スコア: String(candidate.size_score),
          地域スコア: String(candidate.region_score),
          総合スコア: String(total),
          ステータス: "未活動",
          送信日: "",
          架電日: "",
          架電者: "",
          情報ソースURL: candidate.source_url,
          メモ: "",
          登録日: now,
          件名: "",
          本文: "",
          下書きID: "",
          シェアレジメモ: "",
        } satisfies LeadRow;
      });

    await appendLeads(accessToken, newRows);

    return NextResponse.json({ added: newRows.length, total: candidates.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "リサーチ中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
