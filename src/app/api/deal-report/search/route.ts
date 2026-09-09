import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { searchDealsForImport, searchCompaniesForImport } from "@/lib/hubspot";

function normalizeForDedupe(name: string): string {
  return name.replace(/[\s　]+/g, "");
}

/**
 * 商談報告×Hubspot画面の「機関名で検索」用。dealHearingシートに登録済みの一覧とは別に、
 * HubSpotに存在する医療機関を（このアプリに未取り込みのものも含めて）名前で検索する。
 * 商談（Deal）とまだ商談化していない医療機関（Company）の両方を対象にする——Companyの結果は
 * 同名のDealが既に見つかっている場合、二重に出さないよう取り除く。
 */
export async function GET(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }

  try {
    const [deals, allCompanies] = await Promise.all([searchDealsForImport(q), searchCompaniesForImport(q)]);
    const dealNames = new Set(deals.map((d) => normalizeForDedupe(d.dealname)));
    const companies = allCompanies.filter((c) => !dealNames.has(normalizeForDedupe(c.name)));
    return NextResponse.json({ deals, companies });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
