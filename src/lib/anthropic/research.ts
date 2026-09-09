import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, OWN_COMPANY_CONTEXT } from "./client";

export interface ResearchCandidate {
  name: string;
  facility_type: "病院" | "クリニック";
  phone: string;
  address: string;
  region: string;
  region_notes: string;
  email: string;
  summary: string;
  source_url: string;
  fit_score: number;
  size_score: number;
  region_score: number;
}

interface ResearchResult {
  candidates: ResearchCandidate[];
}

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "医療機関名" },
          facility_type: { type: "string", enum: ["病院", "クリニック"] },
          phone: { type: "string", description: "電話番号。不明な場合は空文字" },
          address: { type: "string", description: "住所。不明な場合は空文字" },
          region: { type: "string", description: "都道府県・市区町村" },
          region_notes: {
            type: "string",
            description:
              "その地域の特徴（高齢化率、在宅医療ニーズの傾向、競合の往診代行サービスの有無など）を50文字程度で。不明な場合は空文字",
          },
          email: { type: "string", description: "メールアドレス。不明な場合は空文字" },
          summary: {
            type: "string",
            description: "診療内容・往診体制についての要約(100文字程度)",
          },
          source_url: { type: "string", description: "情報の取得元URL" },
          fit_score: {
            type: "integer",
            description: "自社サービス(平日夜間・休日の往診代行)との業種・事業内容の適合度。1(低い)〜5(高い)",
          },
          size_score: {
            type: "integer",
            description: "組織規模から見た営業対象としての妥当性。1〜5",
          },
          region_score: {
            type: "integer",
            description: "地域的な営業のしやすさ。1〜5",
          },
        },
        required: [
          "name",
          "facility_type",
          "phone",
          "address",
          "region",
          "region_notes",
          "email",
          "summary",
          "source_url",
          "fit_score",
          "size_score",
          "region_score",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

export async function researchLeads(params: {
  region: string;
  keywords?: string;
}): Promise<ResearchCandidate[]> {
  const { region, keywords } = params;

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: CANDIDATE_SCHEMA },
    },
    system: OWN_COMPANY_CONTEXT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
    messages: [
      {
        role: "user",
        content: `「${region}」エリアで、往診(在宅医療・訪問診療)を行っている病院・クリニックをWeb検索で調べてください。${
          keywords ? `\n追加条件: ${keywords}` : ""
        }
- 実在が確認できる施設のみを最大10件挙げてください
- 電話番号・住所は、検索結果から分かる範囲で埋めてください（不明なら空文字）
- 各施設の地域について、高齢化率や在宅医療ニーズ、競合の往診代行サービスの有無など、営業トークに使える地域特徴も調べて簡潔にまとめてください
- 各候補について、自社サービスとの適合度・規模・地域の3つの観点でスコア(1〜5)を付けてください`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) return [];

  try {
    const parsed = JSON.parse(textBlock.text) as ResearchResult;
    return parsed.candidates ?? [];
  } catch {
    return [];
  }
}
