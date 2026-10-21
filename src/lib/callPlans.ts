import type { LeadRow } from "@/lib/leads";
import { OUTSOURCE_CALLER } from "@/lib/homeStats";

/**
 * 月ごとの架電計画（担当×エリア×件数）。ホームの「エリア別の進み具合」で、計画件数に対して
 * その月に何件の医療機関へ架電したかを出す。エリアは都道府県だけ（例: 兵庫県＝新拠点）か、
 * 都道府県＋市区（例: 東京都 台東区）で指定する——「中央区」「北区」は他県にもあるため県名とセットにする。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */

export const CALL_PLAN_HEADERS = ["id", "month", "owner", "pref", "city", "target", "note", "updatedAt"] as const;
export type CallPlanRow = Record<(typeof CALL_PLAN_HEADERS)[number], string>;

export type PlanOwner = "IS" | "movement";

export interface CallPlan {
  id: string;
  month: string;
  owner: PlanOwner;
  pref: string;
  city: string;
  target: number;
  note: string;
}

export function plansOf(rows: CallPlanRow[], month: string): CallPlan[] {
  return rows
    .filter((r) => r.month === month)
    .map((r) => ({
      id: r.id,
      month: r.month,
      owner: (r.owner === "movement" ? "movement" : "IS") as PlanOwner,
      pref: r.pref,
      city: r.city,
      target: Number(r.target) || 0,
      note: r.note,
    }));
}

const ZIP_PREF: [number, number, string][] = [
  [100, 208, "東京都"],
  [210, 259, "神奈川県"],
  [260, 299, "千葉県"],
  [330, 369, "埼玉県"],
  [530, 599, "大阪府"],
  [650, 679, "兵庫県"],
];

/** リードの都道府県。住所・地域に県名が無い場合（「〒123－0851足立区…」など）は郵便番号から判定する。 */
export function prefOfLead(lead: Pick<LeadRow, "住所" | "地域">): string {
  const text = `${lead.住所} ${lead.地域}`;
  const m = text.match(/(東京都|北海道|(?:京都|大阪)府|[^\s〒0-9０-９－-]{2,3}県)/);
  if (m) return m[1];
  const z = text.match(/〒?\s*(\d{3})[－-]/);
  if (z) {
    const n = Number(z[1]);
    const hit = ZIP_PREF.find(([a, b]) => n >= a && n <= b);
    if (hit) return hit[2];
  }
  return "";
}

export function leadMatchesPlan(lead: LeadRow, plan: Pick<CallPlan, "pref" | "city">): boolean {
  if (plan.pref && prefOfLead(lead) !== plan.pref) return false;
  if (!plan.city) return true;
  return `${lead.住所} ${lead.地域}`.includes(plan.city);
}

export interface PlanProgress extends CallPlan {
  called: number;
  apo: number;
}

/** 計画ごとの実績。その月に架電日が入った医療機関を、架電者がmovementなら委託、それ以外ならISとして数える。 */
export function planProgress(plans: CallPlan[], leads: LeadRow[], month: string): PlanProgress[] {
  const monthLeads = leads.filter((l) => (l.架電日 || "").startsWith(month));
  return plans.map((plan) => {
    const hits = monthLeads.filter(
      (l) => (plan.owner === "movement") === (l.架電者 === OUTSOURCE_CALLER) && leadMatchesPlan(l, plan),
    );
    return { ...plan, called: hits.length, apo: hits.filter((l) => l.ステータス === "商談獲得").length };
  });
}
