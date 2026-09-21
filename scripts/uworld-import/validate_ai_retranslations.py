#!/usr/bin/env python3
"""Check independent AI translations against source facts before applying them."""

import argparse
import hashlib
import json
import re
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "lib/question-bank.json"
TRANSLATIONS = ROOT / "data/uworld-2025/ai-retranslated.jsonl"
REPORT = ROOT / "data/uworld-2025/ai-retranslation-validation.json"
CORRECTIONS = ROOT / "data/uworld-2025/translation-reviewed-corrections.json"

MONEY_EN = re.compile(r"\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?", re.I)
MONEY_ZH = re.compile(r"([\d,]+(?:\.\d+)?|[一二三四五六七八九十百千万亿两]+)\s*([亿万千]?)\s*(?:美元|美金|元|块)")
PLAIN_NUMBER = re.compile(r"(?<![A-Za-z0-9$])\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9])")
LEGAL_TERM_FLAGS = (
    (r"\bdiversity (?:action|jurisdiction|case|suit)\b", r"多样性|多元化|不同属人管辖权", "diversity-term"),
    (r"\bfirst-class mail\b", r"特快|快递|优先邮件", "first-class-mail"),
    (r"\bdefault judgment\b", r"默认判决", "default-judgment"),
    (r"\bsummary judgment\b", r"总结判决|摘要判决", "summary-judgment"),
    (r"\bfee simple\b", r"简单费用|收费简单|简单收费", "fee-simple"),
    (r"\bstatute of frauds\b", r"欺诈法规|欺诈法令", "statute-of-frauds"),
    (r"\bdevis(?:e|ed|ing)\b", r"设计", "devise"),
    (r"\bproffer\b", r"要约", "proffer"),
)
DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9}
SMALL_UNITS = {"十": 10, "百": 100, "千": 1000}


def small_chinese_number(value):
    if not 0 <= value <= 9999:
        return ""
    names = "零一二三四五六七八九"
    if value < 10:
        return names[value]
    if value < 20:
        return "十" + (names[value % 10] if value % 10 else "")
    if value < 100:
        return names[value // 10] + "十" + (names[value % 10] if value % 10 else "")
    if value < 1000 and value % 100 == 0:
        return names[value // 100] + "百"
    if value < 10000 and value % 1000 == 0:
        return names[value // 1000] + "千"
    return ""


def chinese_number(value):
    total = section = digit = 0
    for char in value:
        if char in DIGITS:
            digit = DIGITS[char]
        elif char in SMALL_UNITS:
            section += (digit or 1) * SMALL_UNITS[char]
            digit = 0
        elif char in "万亿":
            section += digit
            total += section * (10000 if char == "万" else 100000000)
            section = digit = 0
        else:
            raise ValueError(value)
    return Decimal(total + section + digit)


def source_money(text):
    scale = {None: 1, "thousand": 1000, "million": 1000000, "billion": 1000000000}
    return Counter(Decimal(match[1].replace(",", "")) * scale[match[2].lower() if match[2] else None]
                   for match in MONEY_EN.finditer(text))


def translated_money(text):
    scale = {"": 1, "千": 1000, "万": 10000, "亿": 100000000}
    result = Counter()
    for match in MONEY_ZH.finditer(text):
        value = (Decimal(match[1].replace(",", "")) if match[1][0].isdigit()
                 else chinese_number(match[1]))
        result[value * scale[match[2]]] += 1
    for match in re.finditer(r"([\d,]+(?:\.\d+)?)\s*(?:到|至|－|–|—|~)\s*[\d,]+(?:\.\d+)?\s*(?:美元|美金)", text):
        result[Decimal(match[1].replace(",", ""))] += 1
    for match in re.finditer(r"((?:\d[\d,]*\s*(?:、|和|及|或)\s*)+\d[\d,]*)\s*(?:美元|美金)", text):
        for number in re.findall(r"\d[\d,]*", match[1])[:-1]:
            result[Decimal(number.replace(",", ""))] += 1
    return result


def source_fields(question, stage):
    if stage == "core":
        return {"stem": question["stem"], "ask": question["ask"],
                **{f"option-{o['id']}": o["en"] for o in question["options"]}}
    return {"explanation": question["explanation"]["en"],
            "rule": question["explanation"]["ruleEn"]}


def check_field(question_id, field, source, zh):
    flags = []
    for amount, source_count in source_money(source).items():
        if translated_money(zh)[amount] < source_count:
            flags.append({"id": question_id, "field": field, "type": "money",
                          "value": str(amount), "sourceCount": source_count,
                          "translatedCount": translated_money(zh)[amount]})
    for letter in set(re.findall(r"\bState ([A-D])\b", source)):
        if not re.search(fr"(?<![A-Za-z]){letter}\s*州|州\s*{letter}(?![A-Za-z])", zh):
            flags.append({"id": question_id, "field": field, "type": "state", "value": letter})
    if re.search(r"(?<![A-Za-z])State\s+[A-D](?![A-Za-z])", zh):
        flags.append({"id": question_id, "field": field, "type": "untranslated-state"})
    if field == "ask" and re.search(r"\bLEAST\b", source) and not re.search(r"最不|最无|最少|最低|最弱|最缺乏", zh):
        flags.append({"id": question_id, "field": field, "type": "lost-least"})
    if field.startswith("option-") and re.match(r"^No(?:[,.:]| as to )", source) and not re.match(r"^(?:不|否|无|没|不能|不会|不应|未)", zh.strip()) and not re.match(r"^No as to ", source):
        flags.append({"id": question_id, "field": field, "type": "lost-no"})
    if field.startswith("option-") and re.match(r"^Yes(?:[,.:]| as to )", source) and not re.match(r"^(?:是|会|应|能|可以|对|正确|仅应)", zh.strip()) and not re.match(r"^Yes as to ", source):
        flags.append({"id": question_id, "field": field, "type": "lost-yes"})
    source_without_money = MONEY_EN.sub("", source)
    translated_digits = Counter(token.replace(",", "") for token in PLAIN_NUMBER.findall(zh))
    for numeric, source_count in Counter(token.replace(",", "") for token in PLAIN_NUMBER.findall(source_without_money)).items():
        chinese = small_chinese_number(int(numeric)) if numeric.isdigit() else ""
        translated_count = translated_digits[numeric] + (zh.count(chinese) if chinese else 0)
        if translated_count < source_count:
            flags.append({"id": question_id, "field": field, "type": "number",
                          "value": numeric, "sourceCount": source_count,
                          "translatedCount": translated_count})
    if re.search(r"\btwice a week\b", source, re.I) and not re.search(r"每周.{0,8}(?:两|二|2)次", zh):
        flags.append({"id": question_id, "field": field, "type": "twice-a-week"})
    for match in re.finditer(r"(?<!within )(?<![A-Za-z0-9])(\d+) days after\b", source, re.I):
        if re.search(r"(?:for|more than|at least|no later than)\s*$", source[max(0, match.start() - 20):match.start()], re.I):
            continue
        days = match[1]
        if re.search(fr"{days}\s*(?:天|日)内", zh) and not re.search(
            fr"{days}\s*(?:天|日)后|第\s*{days}\s*(?:天|日)", zh
        ):
            flags.append({"id": question_id, "field": field,
                          "type": "after-changed-to-within", "value": days})
    if field == "explanation":
        for letter in set(re.findall(r"\(Choice ([A-D])\)", source)):
            if not re.search(fr"[（(]\s*(?:Choice|选项|选择)\s*{letter}\s*[）)]", zh, re.I):
                flags.append({"id": question_id, "field": field,
                              "type": "missing-choice-discussion", "value": letter})
        source_footnotes = len(re.findall(r"(?m)^\*{1,2}\s*\w", source))
        translated_footnotes = len(re.findall(r"(?m)^\*{1,2}\s*[^\s*]", zh))
        if translated_footnotes < source_footnotes:
            flags.append({"id": question_id, "field": field, "type": "missing-footnote",
                          "sourceCount": source_footnotes,
                          "translatedCount": translated_footnotes})
        if re.search(r"\bEducational objective\b", source) and not re.search(r"学习要点|教育目标|学习目标|Educational objective", zh, re.I):
            flags.append({"id": question_id, "field": field, "type": "missing-objective"})
    if len(source) > 150 and len(zh) < len(source) * 0.12:
        flags.append({"id": question_id, "field": field, "type": "short-translation",
                      "sourceLength": len(source), "translatedLength": len(zh)})
    for source_pattern, wrong_pattern, issue_type in LEGAL_TERM_FLAGS:
        if re.search(source_pattern, source, re.I) and re.search(wrong_pattern, zh):
            flags.append({"id": question_id, "field": field, "type": issue_type})
    return flags


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--translations", type=Path, default=TRANSLATIONS)
    parser.add_argument("--output", type=Path, default=REPORT)
    parser.add_argument("--effective", action="store_true",
                        help="Validate normalized fields after source-reviewed overrides")
    args = parser.parse_args()
    corrections = json.loads(CORRECTIONS.read_text()) if args.effective else {}
    if args.effective:
        from apply_ai_retranslations import normalize
    bank = {q["id"]: q for q in json.loads(BANK.read_text())}
    records = {}
    for line in args.translations.read_text().splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        records[(record["id"], record["stage"])] = record
    flags = []
    counts = Counter()
    for (question_id, stage), record in records.items():
        if record.get("status") != "ok":
            counts["invalid-json"] += 1
            continue
        question = bank[question_id]
        fields = source_fields(question, stage)
        source_hash = hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if record.get("sourceSha256") != source_hash:
            counts["stale-source"] += 1
            continue
        counts["checked-" + stage] += 1
        for field, source in fields.items():
            translated = record["zh"][field]
            if args.effective:
                translated = corrections.get(f"{question_id}:{field}", normalize(source, translated))
            flags.extend(check_field(question_id, field, source, translated))
    counts["flags"] = len(flags)
    args.output.write_text(json.dumps({"counts": dict(counts), "flags": flags}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
