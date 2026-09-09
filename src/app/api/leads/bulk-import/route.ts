import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { appendLeads, listLeads, type LeadRow } from "@/lib/google/sheets";

interface BulkImportItem {
  name?: string;
  facilityType?: string;
  phone?: string;
  region?: string;
  regionNotes?: string;
  address?: string;
  email?: string;
  assignee?: string;
  summary?: string;
  fitScore?: number | string;
  sizeScore?: number | string;
  regionScore?: number | string;
  sourceUrl?: string;
}

/**
 * Named-field JSON import, server-validated — replaces asking users to paste
 * tab-separated text directly into Sheets. A positional format is one dropped
 * tab away from silently shifting every column after it (including `id`, which
 * breaks navigation with no visible error). Named fields can't shift: a typo'd
 * or missing key is just ignored/defaulted, never corrupts a sibling field.
 */
export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await requireAccessToken();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { leads?: unknown } | null;
  if (!body || !Array.isArray(body.leads)) {
    return NextResponse.json(
      { error: "leads は配列で指定してください" },
      { status: 400 },
    );
  }

  const items = body.leads as BulkImportItem[];
  const errors: string[] = [];
  const now = new Date().toISOString();

  const parsed: LeadRow[] = [];
  items.forEach((item, index) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      errors.push(`${index + 1}件目: name（医療機関名）が空です`);
      return;
    }

    const fit = Number(item.fitScore) || 0;
    const size = Number(item.sizeScore) || 0;
    const region = Number(item.regionScore) || 0;
    const hasScores = fit > 0 || size > 0 || region > 0;
    const total = hasScores ? Math.round((fit + size + region) / 3) : 0;

    parsed.push({
      id: crypto.randomUUID(),
      医療機関名: name,
      種別: item.facilityType === "病院" ? "病院" : "クリニック",
      電話番号: typeof item.phone === "string" ? item.phone.trim() : "",
      地域: typeof item.region === "string" ? item.region.trim() : "",
      地域特徴: typeof item.regionNotes === "string" ? item.regionNotes.trim() : "",
      住所: typeof item.address === "string" ? item.address.trim() : "",
      メールアドレス: typeof item.email === "string" ? item.email.trim() : "",
      担当者: typeof item.assignee === "string" ? item.assignee.trim() : "",
      ステータス: "未活動",
      総合スコア: total ? String(total) : "",
      適合度スコア: fit ? String(fit) : "",
      規模スコア: size ? String(size) : "",
      地域スコア: region ? String(region) : "",
      事業内容メモ: typeof item.summary === "string" ? item.summary.trim() : "",
      メモ: "",
      送信日: "",
      架電日: "",
      架電者: "",
      登録日: now,
      情報ソースURL: typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : "",
      件名: "",
      本文: "",
      下書きID: "",
      シェアレジメモ: "",
    });
  });

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "有効なリードがありませんでした", details: errors },
      { status: 400 },
    );
  }

  try {
    // Dedupe against existing leads by name+phone, same rule as the AI research flow.
    const existingLeads = await listLeads(accessToken);
    const existingKeys = new Set(
      existingLeads.map((lead) => `${lead.医療機関名}|${lead.電話番号}`.trim()),
    );
    const newRows = parsed.filter(
      (lead) => !existingKeys.has(`${lead.医療機関名}|${lead.電話番号}`.trim()),
    );
    const skipped = parsed.length - newRows.length;

    await appendLeads(accessToken, newRows);

    return NextResponse.json({
      added: newRows.length,
      skipped,
      errors,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "インポート中にエラーが発生しました" }, { status: 500 });
  }
}
