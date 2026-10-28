"use client";

import { ReorderModal } from "@/components/ListTabs";

/** リストの並び替え画面の見た目・ドラッグ操作の確認用（ログイン不要・サンプルデータのみ。保存はできない）。 */
const SAMPLE = [
  { name: "【墨田エリア】", category: "往診代行" },
  { name: "【兵庫新拠点】", category: "往診代行" },
  { name: "【横浜市①】", category: "往診代行" },
  { name: "【千葉県】", category: "往診代行" },
  { name: "シェアレジ : 東京", category: "シェアレジ" },
  { name: "シェアレジ : 東京2", category: "シェアレジ" },
].map((l, i) => ({ ...l, id: `s${i}`, region: "", status: "all", keyword: "", call: "all", assignee: "", sortOrder: String(i + 1) }));

export default function ListsPreviewPage() {
  return <ReorderModal lists={SAMPLE} onClose={() => {}} onSaved={() => {}} />;
}
