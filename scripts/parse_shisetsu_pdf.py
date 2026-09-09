import re
import sys
import json
from pypdf import PdfReader

TARGET_CODES = {
    "支援診１": ("在宅療養支援診療所", False),
    "支援診２ア": ("在宅療養支援診療所（機能強化型・単独）", True),
    "支援診２イ": ("在宅療養支援診療所（機能強化型・連携）", True),
    "支援診３": ("在宅療養支援診療所（機能強化型）", True),
    "支援病１": ("在宅療養支援病院", False),
    "支援病２": ("在宅療養支援病院（機能強化型・単独）", True),
    "支援病３": ("在宅療養支援病院（機能強化型・連携）", True),
    "在充診": ("在宅医療充実体制加算（診療所）", True),
    "在充病": ("在宅医療充実体制加算（病院）", True),
}

INST_NUM_RE = re.compile(r'(\d{2}[,\-.]\d{1,5}[,\-.]\d|\d{2}-\d{5})')
CODE_RE = re.compile(r'（([^（）]+)）第(\S+?)号\s+(\S.*)$')
PHONE_RE = re.compile(r'(0\d{1,4}-\d{1,4}-\d{3,4})')
ZIP_RE = re.compile(r'〒\d{3}[－\-]\d{4}')
BED_NOISE_RE = re.compile(r'(一般|療養|精神|結核|感染症)\s*\d+')


def split_code(line):
    """Strip the trailing (code)第id号 date pair; return (left_line, code_or_None)."""
    cm = CODE_RE.search(line)
    if cm:
        return line[: cm.start()], cm.group(1)
    return line, None


def parse_page(text):
    """Yield dicts: {name_col: [...], addr_col: [...], codes: [...]} per institution block."""
    lines = text.split("\n")
    institutions = []
    current = None
    split_pos = None

    for raw_line in lines:
        m = INST_NUM_RE.search(raw_line)
        # A new institution starts when we find the机関番号 pattern within the first ~20 chars
        # of the line (guards against the same pattern coincidentally appearing elsewhere).
        is_start = bool(m and m.start() <= 20)

        left_part, code = split_code(raw_line)

        if is_start:
            if current:
                institutions.append(current)
            zip_m = ZIP_RE.search(left_part)
            split_pos = zip_m.start() if zip_m else None
            current = {"num": m.group(1), "name_col": [], "addr_col": [], "codes": []}
            # left_part before the institution number is junk (leading spaces); name starts after it.
            after_num = left_part[m.end():]
            if split_pos is not None:
                # split_pos was computed against left_part (post code-strip) which still
                # has the same absolute offsets as raw_line up to the code removal point.
                rel_zip = split_pos - m.end()
                if rel_zip < 0:
                    rel_zip = 0
                current["name_col"].append(after_num[:rel_zip])
                current["addr_col"].append(after_num[rel_zip:])
            else:
                current["name_col"].append(after_num)
        else:
            if current is None:
                continue
            if split_pos is not None:
                current["name_col"].append(left_part[:split_pos] if len(left_part) > split_pos else left_part)
                current["addr_col"].append(left_part[split_pos:] if len(left_part) > split_pos else "")
            else:
                current["name_col"].append(left_part)

        if code:
            current["codes"].append(code)

    if current:
        institutions.append(current)
    return institutions


def extract_fields(inst):
    # Kanagawa's PDF embeds a "{ward-kanji}医{ref-number}" cross-reference footnote
    # inline within the name column on continuation lines (unrelated to this record's
    # own institution number — the two only coincidentally matched in early samples).
    # There's no reliable delimiter between where a legitimate name ends and this
    # footnote begins, so any regex strip risks silently eating real trailing name
    # characters (e.g. "外科" -> "外"). Left in place: it's vispible noise a caller
    # will immediately recognize and ignore, which is safer than silent corruption.
    name = re.sub(r"\s+", "", "".join(inst["name_col"])).strip()
    addr_raw = "".join(inst["addr_col"])

    phone_m = PHONE_RE.search(addr_raw)
    phone = phone_m.group(1) if phone_m else ""
    if phone:
        addr_raw = addr_raw.split(phone)[0]

    address = re.sub(r"\s+", "", addr_raw).strip()
    address = BED_NOISE_RE.sub("", address)

    return {
        "num": inst["num"],
        "name": name,
        "address": address,
        "phone": phone,
        "codes": inst.get("codes", []),
    }


def main():
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]
    reader = PdfReader(pdf_path)
    results = []
    n = len(reader.pages)
    for i in range(n):
        text = reader.pages[i].extract_text(extraction_mode="layout")
        for inst in parse_page(text):
            codes = inst.get("codes", [])
            matched = [c for c in codes if c in TARGET_CODES]
            if not matched:
                continue
            fields = extract_fields(inst)
            fields["matched_codes"] = matched
            fields["enhanced"] = any(TARGET_CODES[c][1] for c in matched)
            results.append(fields)
        if i % 500 == 0:
            print(f"progress {i}/{n}", file=sys.stderr)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Done. {len(results)} matching institutions written to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
