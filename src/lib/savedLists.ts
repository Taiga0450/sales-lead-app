/**
 * リード一覧の保存済みリストの区分と並び順。往診代行（ON CALL）とシェアレジの2事業のリストが
 * 混在するため、区分ごとに分けて、管理者が決めた順に並べる。
 * server/clientどちらからもimportされるため、サーバー専用コードは持ち込まない。
 */
export const LIST_CATEGORIES = ["往診代行", "シェアレジ"] as const;
export type ListCategory = (typeof LIST_CATEGORIES)[number];

/** 区分が未設定の古いリストは、名前に「シェアレジ」が入っていればシェアレジ、それ以外は往診代行とみなす。 */
export function categoryOf(list: { name: string; category?: string }): ListCategory {
  if (list.category === "往診代行" || list.category === "シェアレジ") return list.category;
  return list.name.includes("シェアレジ") ? "シェアレジ" : "往診代行";
}

/** 区分ごとに、並び順（未設定なら作成日時順）でそろえる。 */
export function groupLists<T extends { name: string; category?: string; sortOrder?: string; createdAt?: string }>(
  lists: T[],
): { category: ListCategory; lists: T[] }[] {
  const order = (l: T) => (l.sortOrder ? Number(l.sortOrder) : Number.MAX_SAFE_INTEGER);
  const sorted = [...lists].sort((a, b) => order(a) - order(b) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return LIST_CATEGORIES.map((category) => ({ category, lists: sorted.filter((l) => categoryOf(l) === category) }));
}
