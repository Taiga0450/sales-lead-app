import json
import re
import sys

PREF_MAP = {
    "tokyo": "東京都",
    "saitama": "埼玉県",
    "chiba": "千葉県",
    "kanagawa": "神奈川県",
    "osaka": "大阪府",
    "hyogo": "兵庫県",
}

CITY_RE = re.compile(r"^(.*?[市区町村])")
ZIP_RE = re.compile(r"〒\d{3}[－\-]\d{4}")

TIER_LABELS = {
    "支援診１": "在宅療養支援診療所（基本型）",
    "支援診２ア": "在宅療養支援診療所（機能強化型・単独）",
    "支援診２イ": "在宅療養支援診療所（機能強化型・連携）",
    "支援診３": "在宅療養支援診療所（機能強化型）",
    "支援病１": "在宅療養支援病院（基本型）",
    "支援病２": "在宅療養支援病院（機能強化型・単独）",
    "支援病３": "在宅療養支援病院（機能強化型・連携）",
    "在充診": "在宅医療充実体制加算（診療所）",
    "在充病": "在宅医療充実体制加算（病院）",
}

REGION_NOTES = {
    "東京都": "厚生局届出データに基づく在宅療養支援診療所・病院。",
    "埼玉県": "厚生局届出データに基づく在宅療養支援診療所・病院。",
    "千葉県": "厚生局届出データに基づく在宅療養支援診療所・病院。",
    "神奈川県": "厚生局届出データに基づく在宅療養支援診療所・病院。",
    "大阪府": "厚生局届出データに基づく在宅療養支援診療所・病院。",
    "兵庫県": "厚生局届出データに基づく在宅療養支援診療所・病院。",
}


def to_region(pref, address):
    addr = ZIP_RE.sub("", address)
    m = CITY_RE.match(addr)
    city = m.group(1) if m else ""
    return f"{pref}{city}"


def convert(pref_key, in_path):
    pref = PREF_MAP[pref_key]
    data = json.load(open(in_path, encoding="utf-8"))
    items = []
    for d in data:
        is_hospital = any(c.startswith("支援病") for c in d["matched_codes"])
        is_basic = any(c in ("支援診１", "支援病１") for c in d["matched_codes"])
        is_enhanced = d["enhanced"]

        fit = 4 if is_basic else (2 if is_enhanced else 3)
        size = 5 if is_hospital else 2

        tier_desc = "、".join(TIER_LABELS.get(c, c) for c in d["matched_codes"])

        items.append({
            "name": d["name"],
            "facilityType": "病院" if is_hospital else "クリニック",
            "phone": d["phone"],
            "region": to_region(pref, d["address"]),
            "regionNotes": REGION_NOTES[pref],
            "address": d["address"],
            "email": "",
            "summary": tier_desc,
            "fitScore": fit,
            "sizeScore": size,
            "regionScore": 3,
            "sourceUrl": "",
        })
    return items


def main():
    out_path = sys.argv[1]
    # Remaining args are "prefkey:path" pairs, e.g. osaka:/tmp/osaka_zaitaku.json
    sources = dict(arg.split(":", 1) for arg in sys.argv[2:])
    all_items = []
    for pref_key, path in sources.items():
        items = convert(pref_key, path)
        print(f"{pref_key}: {len(items)} items", file=sys.stderr)
        all_items.extend(items)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_items, f, ensure_ascii=False, indent=2)
    print(f"Total: {len(all_items)} items written to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
