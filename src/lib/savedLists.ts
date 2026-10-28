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

/** 地域の市区町村→都道府県。リストの地域条件には県名が入らないことが多いため、主な市町村で判定する。 */
const PREF_MUNICIPALITIES: Record<string, string[]> = {
  東京都: ["八王子市", "立川市", "武蔵野市", "三鷹市", "府中市", "昭島市", "調布市", "町田市", "小金井市", "小平市", "日野市", "東村山市", "国分寺市", "国立市", "福生市", "狛江市", "東大和市", "清瀬市", "東久留米市", "武蔵村山市", "多摩市", "稲城市", "羽村市", "西東京市", "青梅市", "あきる野市"],
  神奈川県: ["横浜市", "川崎市", "相模原市", "横須賀市", "鎌倉市", "逗子市", "葉山町", "葉山市", "藤沢市", "茅ヶ崎市", "平塚市", "小田原市", "秦野市", "厚木市", "伊勢原市", "海老名市", "座間市", "大和市", "綾瀬市", "寒川町", "大磯町", "二宮町", "中井町", "愛川町", "清川村", "三浦市", "南足柄市"],
  千葉県: ["千葉市", "市川市", "松戸市", "船橋市", "柏市", "浦安市", "流山市", "鎌ヶ谷市", "習志野市", "八千代市", "我孫子市", "野田市", "市原市"],
  埼玉県: ["さいたま市", "川口市", "川越市", "所沢市", "越谷市", "草加市", "春日部市", "上尾市", "戸田市", "蕨市", "和光市", "朝霞市", "新座市", "志木市", "富士見市", "ふじみ野市", "狭山市", "入間市", "久喜市", "熊谷市"],
  兵庫県: ["神戸市", "芦屋市", "西宮市", "尼崎市", "伊丹市", "川西市", "宝塚市", "明石市", "姫路市"],
  大阪府: ["大阪市", "堺市", "豊中市", "吹田市", "高槻市", "枚方市", "東大阪市"],
};

/**
 * リストの都道府県（プルダウンで県ごとに区切り線を入れるため）。名前か地域に県名があればそれ、
 * 無ければ地域の先頭の市区町村から判定し、「〇〇区」だけなら東京23区とみなす。判定できなければ空文字。
 */
export function prefectureOf(list: { name: string; region?: string }): string {
  const explicit = `${list.name} ${list.region ?? ""}`.match(/(東京都|北海道|(?:京都|大阪)府|[^\s,、【】:：]{2,3}県)/);
  if (explicit) return explicit[1];
  const terms = (list.region ?? "").split(/[,、\s]+/).filter(Boolean);
  for (const term of terms) {
    const hit = Object.entries(PREF_MUNICIPALITIES).find(([, cities]) => cities.includes(term));
    if (hit) return hit[0];
    if (/^.+区$/.test(term)) return "東京都";
  }
  return "";
}
