import { listLeads, appendLeads, bulkUpdateLeads, readExternalSheetRows } from "./google/sheets";
import type { LeadRow } from "./leads";

/**
 * 「他社利用医療機関リスト_MOVEMENT対応リストより抽出」スプレッドシート（t.mori所有）を
 * このアプリのリード一覧に取り込むための一時的な社内データ移行処理。
 * 列構成: A=医療機関名, B=電話番号, C=MOVEMENT架電めも, D=架電担当者, E=架電日
 */
const COMPETITOR_SHEET_ID = "1Rj0-v7nH6fSn878P5nyKwXyFTSkuRPi4-K4Rcmrc8CU";
const COMPETITOR_RANGE = "A2:E1000";

/** メモへの追記だと分かるように付ける目印。何度実行しても重複追記しないための判定にも使う。 */
const MEMO_MARKER = "【他社利用リストより】";

function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

function normalizeName(name: string): string {
  return (name || "").replace(/\s+/g, " ").trim();
}

interface CompetitorEntry {
  name: string;
  phone: string;
  note: string;
}

/** 同じ電話番号の行（架電のやり直し等で複数行に分かれているもの）を1件にまとめる。 */
function dedupeByPhone(rawRows: string[][]): CompetitorEntry[] {
  const byPhone = new Map<string, CompetitorEntry>();
  for (const row of rawRows) {
    const name = normalizeName(row[0] ?? "");
    const phoneKey = normalizePhone(row[1] ?? "");
    const note = (row[2] ?? "").trim();
    if (!phoneKey) continue;

    const existing = byPhone.get(phoneKey);
    if (!existing) {
      byPhone.set(phoneKey, { name, phone: (row[1] ?? "").trim(), note });
      continue;
    }
    if (name.length > existing.name.length) existing.name = name;
    if (note && !existing.note.includes(note)) {
      existing.note = existing.note ? `${existing.note} / ${note}` : note;
    }
  }
  return [...byPhone.values()];
}

async function loadCompetitorEntries(accessToken: string): Promise<{ totalRows: number; entries: CompetitorEntry[] }> {
  const rawRows = await readExternalSheetRows(accessToken, COMPETITOR_SHEET_ID, COMPETITOR_RANGE);
  const meaningfulRows = rawRows.filter((row) => row.some((cell) => cell));
  return { totalRows: meaningfulRows.length, entries: dedupeByPhone(meaningfulRows) };
}

function appendMemo(currentMemo: string, note: string): string {
  if (!note) return currentMemo;
  const addition = `${MEMO_MARKER}${note}`;
  if (currentMemo.includes(addition)) return currentMemo; // 再実行しても二重追記しない
  return currentMemo ? `${currentMemo}\n${addition}` : addition;
}

export interface CompetitorMergeMatch {
  leadId: string;
  existingName: string;
  newName: string;
  phone: string;
  note: string;
}

export interface CompetitorMergePlan {
  totalSourceRows: number;
  dedupedSourceRows: number;
  matched: CompetitorMergeMatch[];
  newEntries: CompetitorEntry[];
}

export async function buildCompetitorMergePlan(accessToken: string): Promise<CompetitorMergePlan> {
  const [{ totalRows, entries }, leads] = await Promise.all([
    loadCompetitorEntries(accessToken),
    listLeads(accessToken),
  ]);

  const leadsByPhone = new Map<string, LeadRow>();
  for (const lead of leads) {
    const key = normalizePhone(lead.電話番号);
    if (key && !leadsByPhone.has(key)) leadsByPhone.set(key, lead);
  }

  const matched: CompetitorMergeMatch[] = [];
  const newEntries: CompetitorEntry[] = [];
  for (const entry of entries) {
    const lead = leadsByPhone.get(normalizePhone(entry.phone));
    if (lead) {
      matched.push({ leadId: lead.id, existingName: lead.医療機関名, newName: entry.name, phone: entry.phone, note: entry.note });
    } else {
      newEntries.push(entry);
    }
  }

  return { totalSourceRows: totalRows, dedupedSourceRows: entries.length, matched, newEntries };
}

export interface CompetitorMergeResult {
  updatedIds: string[];
  createdIds: string[];
}

/** buildCompetitorMergePlan()の結果を実際に反映する（既存リードの上書き・メモ追記、新規リードの作成）。 */
export async function executeCompetitorMerge(
  accessToken: string,
  plan: CompetitorMergePlan,
): Promise<CompetitorMergeResult> {
  const leads = await listLeads(accessToken);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const now = new Date().toISOString();

  const patches = plan.matched.map((m) => {
    const current = leadById.get(m.leadId);
    return {
      id: m.leadId,
      patch: {
        医療機関名: m.newName || m.existingName,
        メモ: appendMemo(current?.メモ ?? "", m.note),
      },
    };
  });
  await bulkUpdateLeads(accessToken, patches);

  const newRows: LeadRow[] = plan.newEntries.map((entry) => ({
    id: crypto.randomUUID(),
    医療機関名: entry.name,
    種別: "クリニック",
    電話番号: entry.phone,
    地域: "",
    地域特徴: "",
    住所: "",
    メールアドレス: "",
    担当者: "",
    ステータス: "未活動",
    総合スコア: "",
    適合度スコア: "",
    規模スコア: "",
    地域スコア: "",
    事業内容メモ: "",
    メモ: appendMemo("", entry.note),
    送信日: "",
    架電日: "",
    架電者: "",
    登録日: now,
    情報ソースURL: "",
    件名: "",
    本文: "",
    下書きID: "",
    シェアレジメモ: "",
  }));
  await appendLeads(accessToken, newRows);

  return { updatedIds: patches.map((p) => p.id), createdIds: newRows.map((r) => r.id) };
}
