import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, OWN_COMPANY_CONTEXT } from "./client";
import type { LeadRow } from "@/lib/leads";

export interface EnrichmentResult {
  region_notes: string;
  summary: string;
  email: string;
  source_url: string;
  fit_score: number;
  size_score: number;
  region_score: number;
}

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    region_notes: {
      type: "string",
      description:
        "この医療機関がある地域の特徴（高齢化率、在宅医療ニーズの傾向、競合の往診代行サービスの有無など）を50文字程度で。分からない場合は空文字",
    },
    summary: {
      type: "string",
      description: "この医療機関の診療内容・往診体制についての要約(100文字程度)。分からない場合は空文字",
    },
    email: { type: "string", description: "問い合わせ用メールアドレス。見つからない場合は空文字" },
    source_url: { type: "string", description: "情報の取得元URL。見つからない場合は空文字" },
    fit_score: {
      type: "integer",
      description: "自社サービス(平日夜間・休日の往診代行)との業種・事業内容の適合度。1(低い)〜5(高い)",
    },
    size_score: { type: "integer", description: "組織規模から見た営業対象としての妥当性。1〜5" },
    region_score: { type: "integer", description: "地域的な営業のしやすさ。1〜5" },
  },
  required: [
    "region_notes",
    "summary",
    "email",
    "source_url",
    "fit_score",
    "size_score",
    "region_score",
  ],
  additionalProperties: false,
} as const;

/**
 * Researches a single, already-known lead by name/address (as opposed to research.ts,
 * which discovers new candidates for a whole region). Used by the per-lead "調べる" button.
 */
export async function enrichLead(lead: LeadRow): Promise<EnrichmentResult> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 6000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: ENRICHMENT_SCHEMA },
    },
    system: OWN_COMPANY_CONTEXT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `以下の医療機関についてWeb検索で調べ、詳細情報を埋めてください。

医療機関名: ${lead.医療機関名}
種別: ${lead.種別 || "不明"}
住所: ${lead.住所 || "不明"}
電話番号: ${lead.電話番号 || "不明"}
地域: ${lead.地域 || "不明"}

- 実在する情報のみを反映し、分からない項目は空文字にしてください（推測で埋めないでください）
- 自社サービスとの適合度・規模・地域の3つの観点でスコア(1〜5)を付けてください`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    return {
      region_notes: "",
      summary: "",
      email: "",
      source_url: "",
      fit_score: 0,
      size_score: 0,
      region_score: 0,
    };
  }

  return JSON.parse(textBlock.text) as EnrichmentResult;
}
