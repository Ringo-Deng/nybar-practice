#!/usr/bin/env python3
"""Overlay a validated, source-matched AI translation batch on the static bank.

The remaining questions keep their earlier offline translations. This batch is
incremental: core and explanation coverage are recorded separately.
"""

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from apply_ai_retranslations import normalize, source_fields, source_hash
from validate_ai_retranslations import check_field

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "lib/question-bank.json"
CHECKPOINT = ROOT / "data/uworld-2025/ai-retranslated-reviewed-batch.jsonl"
CORRECTIONS = ROOT / "data/uworld-2025/translation-reviewed-corrections.json"
TOPICS = ROOT / "data/uworld-2025/translation-reviewed-topics.json"
MANIFEST = ROOT / "data/uworld-2025/static-translation-manifest.json"
AUDIT = ROOT / "data/uworld-2025/translation-proofread-audit.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-core", type=int, required=True)
    parser.add_argument("--expected-explanation", type=int, required=True)
    args = parser.parse_args()

    bank = json.loads(BANK.read_text())
    corrections = json.loads(CORRECTIONS.read_text())
    topics = json.loads(TOPICS.read_text())
    by_id = {question["id"]: question for question in bank}
    if len(by_id) != len(bank):
        raise ValueError("Duplicate question IDs")
    records = {}
    for line in CHECKPOINT.read_text().splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        key = (record["id"], record["stage"])
        if key in records or record.get("status") != "ok" or key[1] not in ("core", "explanation"):
            raise ValueError(f"Invalid or duplicate reviewed record: {key}")
        if key[0] not in by_id:
            raise ValueError(f"Unknown question: {key[0]}")
        fields = source_fields(by_id[key[0]], key[1])
        if record["sourceSha256"] != source_hash(fields) or set(record["zh"]) != set(fields):
            raise ValueError(f"Stale or incomplete translation: {key}")
        records[key] = record

    counts = Counter(stage for _, stage in records)
    if counts["core"] != args.expected_core or counts["explanation"] != args.expected_explanation:
        raise ValueError(f"Unexpected batch size: {counts}")
    if any(key.split(":", 1)[0] not in by_id for key in corrections):
        raise ValueError("Reviewed correction has an unknown question ID")

    applied_overrides = set()
    for question in bank:
        translated = {
            "stem": question["stemZh"], "ask": question["askZh"],
            **{f"option-{option['id']}": option["zh"] for option in question["options"]},
            "explanation": question["explanation"]["zh"],
            "rule": question["explanation"]["ruleZh"],
        }
        for stage in ("core", "explanation"):
            record = records.get((question["id"], stage))
            if record is None:
                continue
            for field, source in source_fields(question, stage).items():
                translated[field] = normalize(source, record["zh"][field])
        for field, source in {**source_fields(question, "core"), **source_fields(question, "explanation")}.items():
            key = f"{question['id']}:{field}"
            if key in corrections:
                translated[field] = corrections[key]
                applied_overrides.add(key)
            if source.strip() and not translated[field].strip():
                raise ValueError(f"Empty translation: {key}")
            if (question["id"], "core" if field not in ("explanation", "rule") else "explanation") in records:
                flags = check_field(question["id"], field, source, translated[field])
                if flags:
                    raise ValueError(f"Translation flags: {flags[:3]}")
        question["stemZh"] = translated["stem"]
        question["askZh"] = translated["ask"]
        for option in question["options"]:
            option["zh"] = translated[f"option-{option['id']}"]
        question["explanation"]["zh"] = translated["explanation"]
        question["explanation"]["ruleZh"] = translated["rule"]
        topic = question["explanation"]["topic"]
        if topic not in topics:
            raise ValueError(f"Topic has no reviewed label: {topic}")
        question["explanation"]["topicZh"] = topics[topic]

    if applied_overrides != set(corrections):
        raise ValueError("Not every reviewed correction was applied")
    BANK.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")

    now = datetime.now(timezone.utc).isoformat()
    original_manifest = json.loads(MANIFEST.read_text())
    manifest = {
        "sourcePdfSha256": original_manifest["sourcePdfSha256"],
        "targetLocale": "zh-Hans",
        "questions": len(bank),
        "initialDraftModel": original_manifest.get("initialDraftModel", original_manifest.get("model")),
        "initialDraftModelSha256": original_manifest.get("initialDraftModelSha256", original_manifest.get("modelSha256")),
        "initialDraftGeneratedAt": original_manifest.get("generatedAt"),
        "initialDraftNumericReviewFlags": len(original_manifest.get("numericReviewFlags", [])),
        "aiBatchModel": "Qwen3-8B-4bit via MLX (local)",
        "aiBatchCheckpoint": str(CHECKPOINT.relative_to(ROOT)),
        "aiCoreQuestions": counts["core"],
        "aiExplanationQuestions": counts["explanation"],
        "sourceReviewedOverrideFields": len(applied_overrides),
        "sourceReviewedTopicLabels": len(topics),
        "batchAppliedAt": now,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    audit = {
        "method": "Incremental local AI retranslation with source hash checks, automated fact checks and source-reviewed field overrides",
        "aiCoreQuestionIds": sorted(question_id for question_id, stage in records if stage == "core"),
        "aiExplanationQuestionIds": sorted(question_id for question_id, stage in records if stage == "explanation"),
        "reviewedOverrideFields": sorted(applied_overrides),
        "reviewedTopicLabels": len(topics),
        "remainingCoreQuestionsOnInitialDraft": len(bank) - counts["core"],
        "remainingExplanationsOnInitialDraft": len(bank) - counts["explanation"],
        "scopeNote": "The AI batch passed automated source checks and targeted field correction. It is not a claim that every Chinese sentence has been manually proofread. Other fields retain the initial offline translation.",
    }
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    print(f"Applied AI core for {counts['core']} questions and explanations for {counts['explanation']}; {len(applied_overrides)} reviewed field overrides.")


if __name__ == "__main__":
    main()
