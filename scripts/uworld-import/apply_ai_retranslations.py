#!/usr/bin/env python3
"""Apply complete, source-matched local AI translations to the static bank.

The independent generation checkpoint is kept separate from the question bank
until both translation stages cover every question. Source-reviewed field
corrections take precedence over generated text.
"""

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "lib/question-bank.json"
CHECKPOINT = ROOT / "data/uworld-2025/ai-retranslated.jsonl"
CORRECTIONS = ROOT / "data/uworld-2025/translation-reviewed-corrections.json"
TOPICS = ROOT / "data/uworld-2025/translation-reviewed-topics.json"
MANIFEST = ROOT / "data/uworld-2025/static-translation-manifest.json"
AUDIT = ROOT / "data/uworld-2025/translation-proofread-audit.json"


def source_fields(question, stage):
    if stage == "core":
        return {"stem": question["stem"], "ask": question["ask"],
                **{f"option-{option['id']}": option["en"] for option in question["options"]}}
    return {"explanation": question["explanation"]["en"],
            "rule": question["explanation"]["ruleEn"]}


def source_hash(fields):
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def normalize(source, translation):
    """Fix only unambiguous notation, leaving legal wording for review."""
    result = translation.strip()
    if re.match(r"^Yes(?:[,.:]|$)", source):
        result = re.sub(r"^Yes(?=[,.:，。：]|$)", "是", result)
    if re.match(r"^No(?:[,.:]|$)", source):
        result = re.sub(r"^No(?=[,.:，。：]|$)", "否", result)
    for letter in set(re.findall(r"\bState ([A-D])\b", source)):
        result = re.sub(rf"(?<![A-Za-z])State\s*{letter}(?![A-Za-z])", f"{letter} 州", result)
        result = re.sub(rf"(?<![A-Za-z])州\s*{letter}(?![A-Za-z])", f"{letter} 州", result)
        result = re.sub(rf"(?<![A-Za-z]){letter}\s*国", f"{letter} 州", result)
    lower = source.lower()
    if re.search(r"\bdiversity (?:action|jurisdiction|case|suit)\b", lower):
        for wrong in ("多元化管辖权", "多样性管辖权", "不同属人管辖权"):
            result = result.replace(wrong, "不同州籍管辖权")
        for wrong in ("多元化诉讼", "多元化的诉讼", "多样性诉讼", "多样性的诉讼"):
            result = result.replace(wrong, "基于不同州籍管辖权的诉讼")
    if "default judgment" in lower:
        result = result.replace("默认判决", "缺席判决")
    if "summary judgment" in lower:
        result = result.replace("总结判决", "即决判决").replace("摘要判决", "即决判决")
    if "specific performance" in lower:
        result = result.replace("特定履行", "强制履行").replace("具体履行", "强制履行")
    if "first-class mail" in lower:
        result = result.replace("特快邮件", "一类邮件（first-class mail）")
    if "certified mail" in lower:
        result = result.replace("认证邮件", "挂号邮件")
    return result


def main():
    bank = json.loads(BANK.read_text())
    corrections = json.loads(CORRECTIONS.read_text())
    topics = json.loads(TOPICS.read_text())
    records = {}
    for line in CHECKPOINT.read_text().splitlines():
        if line.strip():
            record = json.loads(line)
            if record.get("status") == "ok":
                records[(record["id"], record["stage"], record["sourceSha256"])] = record
    missing = []
    for question in bank:
        for stage in ("core", "explanation"):
            fields = source_fields(question, stage)
            if (question["id"], stage, source_hash(fields)) not in records:
                missing.append((question["id"], stage))
    if missing:
        raise RuntimeError(f"AI translations incomplete: {len(missing)} missing, first {missing[:10]}")
    valid_ids = {question["id"] for question in bank}
    if any(key.split(":", 1)[0] not in valid_ids for key in corrections):
        raise ValueError("Reviewed correction has an unknown question ID")
    manual_fields = []
    model_counts = Counter()
    for question in bank:
        merged = {}
        for stage in ("core", "explanation"):
            fields = source_fields(question, stage)
            record = records[(question["id"], stage, source_hash(fields))]
            if set(record["zh"]) != set(fields):
                raise ValueError(f"Incomplete fields: {question['id']} {stage}")
            model_counts[record["model"]] += 1
            for field, source in fields.items():
                key = f"{question['id']}:{field}"
                translated = normalize(source, record["zh"][field])
                if key in corrections:
                    translated = corrections[key]
                    manual_fields.append(key)
                if not translated.strip():
                    raise ValueError(f"Empty translation: {key}")
                merged[field] = translated
        question["stemZh"] = merged["stem"]
        question["askZh"] = merged["ask"]
        for option in question["options"]:
            option["zh"] = merged[f"option-{option['id']}"]
        question["explanation"]["zh"] = merged["explanation"]
        question["explanation"]["ruleZh"] = merged["rule"]
        topic = question["explanation"]["topic"]
        if topic not in topics:
            raise ValueError(f"Topic has no source-reviewed translation: {topic}")
        question["explanation"]["topicZh"] = topics[topic]
    tmp = BANK.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(BANK)
    manifest = json.loads(MANIFEST.read_text())
    if str(manifest.get("model", "")).startswith("Argos"):
        manifest["initialDraftModel"] = manifest.pop("model")
        manifest["initialDraftModelSha256"] = manifest.pop("modelSha256", None)
    manifest.pop("numericReviewFlags", None)
    manifest.pop("sparseTranslationReviewFlags", None)
    manifest.update({
        "translationMethod": "Local AI independent retranslation with source-matched field validation and reviewed overrides",
        "model": "Qwen3-8B-4bit via MLX (local)",
        "aiModelCounts": dict(model_counts),
        "aiAppliedAt": datetime.now(timezone.utc).isoformat(),
        "aiCheckpoint": str(CHECKPOINT.relative_to(ROOT)),
        "reviewedOverrideFields": len(manual_fields),
        "reviewedTopicLabels": len(topics),
    })
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    audit = json.loads(AUDIT.read_text())
    if "glossaryFields" in audit:
        audit["initialDraftGlossaryFields"] = audit.pop("glossaryFields")
    audit.pop("numericFieldsStillFlagged", None)
    audit.pop("sparseFieldsStillFlagged", None)
    audit.update({
        "method": "Independent local AI retranslation of every source field, source-aligned validation, and manual correction of reviewed issues",
        "aiTranslatedQuestions": len(bank),
        "aiTranslatedStages": dict(Counter(stage for _, stage, _ in records)),
        "reviewedOverrideFields": manual_fields,
        "reviewedFields": [{"id": key.split(":", 1)[0], "field": key.split(":", 1)[1]}
                           for key in manual_fields],
        "scopeNote": "Every Chinese field has an independent AI translation; source comparison and manual review are risk focused and do not certify that every sentence is error free.",
    })
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    print(f"Applied both AI stages to {len(bank)} questions; {len(manual_fields)} source-reviewed overrides.")


if __name__ == "__main__":
    main()
