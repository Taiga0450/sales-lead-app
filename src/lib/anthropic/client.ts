import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

/**
 * Lets routes fall back to non-AI behavior (manual entry, template emails)
 * when no key is configured yet, and switch back to AI automatically once one is added —
 * no separate feature flag to remember to flip.
 */
export const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);

export const OWN_COMPANY_CONTEXT = `自社は「平日夜間・休日の往診代行」サービスを提供している会社である。
病院・クリニックが自前ではカバーしきれない、平日夜間(18時〜翌9時頃)や土日祝日の往診(在宅医療・訪問診療)対応を、
提携医師のネットワークを使って代行する。

ターゲット顧客は、往診(在宅医療・訪問診療)を行っている病院・クリニックのうち、
平日夜間や休日の対応体制が手薄・不足していると推測される施設である。`;
