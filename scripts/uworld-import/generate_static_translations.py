"""Generate a complete static Chinese layer with an offline CTranslate2 model.

The English PDF text stays unchanged. Translation chunks and their checkpoints
remain on the local machine. Run with ctranslate2 and sentencepiece installed:

  python generate_static_translations.py --model-dir /path/to/argos/model/package

The model directory contains model/ and sentencepiece.model. This importer was
tested with the Argos en→zh 1.9 package. It does not send source text online.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

import ctranslate2
import sentencepiece


ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "lib/question-bank.json"
MANIFEST = ROOT / "data/uworld-2025/static-translation-manifest.json"
REVIEWED_CORRECTIONS = ROOT / "data/uworld-2025/translation-reviewed-corrections.json"
REVIEWED_TOPICS = ROOT / "data/uworld-2025/translation-reviewed-topics.json"
PROOFREAD_AUDIT = ROOT / "data/uworld-2025/translation-proofread-audit.json"
TOPICS = {
    "Civil Procedure": "民事诉讼法",
    "Constitutional Law": "宪法",
    "Contracts": "合同法",
    "Criminal Law": "刑法",
    "Criminal Procedure": "刑事诉讼法",
    "Evidence": "证据法",
    "Real Property": "不动产法",
    "Torts": "侵权法",
}
OVERRIDES = {
    "A national cosmetics retailer incorporated and headquartered in State A bought makeup manufactured by a company incorporated and headquartered in State B.":
        "一家在 A 州注册成立且设有总部的全国性化妆品零售商，购买了一家在 B 州注册成立且设有总部的公司生产的化妆品。",
    "No, because the parties are diverse and the amount in controversy exceeds $75,000.":
        "否，因为双方具有不同州籍，且争议金额超过 75,000 美元。",
    "The next consideration is which of these courts is also a proper venue where the case can be heard. Venue is proper in any district where:":
        "下一步要判断哪些法院所在的司法区也是本案的适当审判地。下列司法区的审判地适当：",
    "So long as a company complies with this requirement, it is free to charge whatever rate the market will bear for its burglary insurance policies.":
        "只要公司符合这一要求，就可以按市场能够接受的费率收取入室盗窃保险保费。",
    "• Negligence against Δ1 – $40K": "• 对被告 1 的过失侵权请求：4 万美元",
    "∆ may move to dismiss suit if π failed to:": "若原告未履行下列事项，被告可申请驳回诉讼：",
}


def split_long(text: str, maximum: int = 270) -> list[str]:
    if len(text) <= maximum:
        return [text]
    result = []
    rest = text
    while len(rest) > maximum:
        window = rest[: maximum + 1]
        sentences = [
            match.end() for match in re.finditer(r"[.!?;:]\s+", window)
            if maximum * 0.4 <= match.end() <= maximum
        ]
        space = window.rfind(" ", 0, maximum + 1)
        cut = sentences[-1] if sentences else space if space >= maximum * 0.4 else maximum
        result.append(rest[:cut].strip())
        rest = rest[cut:].lstrip()
    if rest:
        result.append(rest)
    return result


def pieces(text: str) -> list[tuple[str, str]]:
    out = []
    for part in re.split(r"(\n\s*\n)", text.replace("\r\n", "\n")):
        if not part:
            continue
        if not part.strip():
            out.append(("literal", part))
        elif part.strip() in ("References", "Educational objective:"):
            out.append(("literal", "参考资料" if part.strip() == "References" else "学习要点："))
        else:
            for segment in split_long(part):
                out.append(("translate", segment))
    return out


def text_fields(question: dict) -> dict[str, str]:
    return {
        "stem": question["stem"],
        "ask": question["ask"],
        **{f"option-{option['id']}": option["en"] for option in question["options"]},
        "explanation": question["explanation"]["en"],
        "rule": question["explanation"]["ruleEn"],
        "topic": question["explanation"]["topic"],
    }


def postprocess(source: str, translated: str) -> str:
    text = translated.replace("▁", " ").strip()
    # The generic model often treats the fictional U.S. state labels as
    # countries. Only relabel letters explicitly called "State X" in source.
    state_labels = set(re.findall(r"\bState ([A-D])\b", source))
    for pair in re.findall(r"\bStates ([A-D]) and ([A-D])\b", source):
        state_labels.update(pair)
    for letter in state_labels:
        text = re.sub(rf"(?<![A-Za-z]){letter}(?:国|国家)", f"{letter}州", text)
    lower = source.lower()
    if "notice of removal" in lower:
        for value in ("清除通知", "移除通知", "撤职通知", "除名通知", "迁移通知"):
            text = text.replace(value, "移送通知")
    if "diversity jurisdiction" in lower:
        for value in ("多样性管辖权", "多元化管辖权", "多元性管辖权", "多样管辖权"):
            text = text.replace(value, "异籍管辖权")
    if "subject-matter jurisdiction" in lower:
        for value in ("主题管辖权", "主体事项管辖权", "主题事项管辖权", "原属事管辖权"):
            text = text.replace(value, "事项管辖权")
    if "motion to remand" in lower and "state court" in lower:
        for value in ("还押请求", "还押动议", "发回请求", "发回动议"):
            text = text.replace(value, "发回州法院动议")
    if "remand" in lower and "state court" in lower:
        text = text.replace("复置全案", "将全案发回州法院").replace("还押", "发回州法院")
    if "forum-defendant rule" in lower:
        text = text.replace("法院-被告规则", "本州被告规则").replace("论坛被告规则", "本州被告规则")
    if "probable cause" in lower:
        for value in ("正当理由", "可能原因", "可能的理由", "可能理由"):
            text = text.replace(value, "合理根据")
    if "requirements contract" in lower:
        text = text.replace("要求合同", "需求合同")
    if "restitutionary theory" in lower:
        text = text.replace("还原理论", "返还利益理论")
    if "nonmovant" in lower:
        text = text.replace("非流动人员", "非动议方")
    return text


def proofread_chunk(subject: str, source: str, translated: str) -> tuple[str, list[str]]:
    """Correct source-confirmed terminology without touching unrelated fields."""
    text = translated
    rules = []
    lower = source.lower()

    def replace(old: str, new: str, rule: str) -> None:
        nonlocal text
        if old in text:
            text = text.replace(old, new)
            rules.append(rule)

    labels = set(re.findall(r"\bState ([A-D])\b", source))
    for pair in re.findall(r"\bStates ([A-D]) and ([A-D])\b", source):
        labels.update(pair)
    for letter in labels:
        replace(f"国家{letter}", f"{letter}州", "fictional-state")
        replace(f"州{letter}", f"{letter}州", "fictional-state")
        replace(f"{letter}国", f"{letter}州", "fictional-state")
    if re.search(r"\bFRCP\b", source):
        replace("森林资源方案", "FRCP", "frcp-acronym")
    if re.search(r"\bFRE\b", source):
        replace("法国法郎", "FRE", "fre-acronym")
    if "$" in source:
        amended = re.sub(r"(\d[\d, ]*|[一二两三四五六七八九十百千万亿]+)元", r"\1美元", text)
        if amended != text:
            text = amended
            rules.append("dollar-unit")
    if re.search(r"\bstate court\b", lower):
        replace("国家法院", "州法院", "state-court")
    if re.search(r"\bstate law\b", lower):
        replace("国家法律", "州法律", "state-law")
    if re.search(r"\bstate statute\b", lower):
        replace("国家法规", "州法规", "state-statute")
    if re.search(r"\bstate tax\b", lower):
        replace("国家税", "州税", "state-tax")
    if "long-arm statute" in lower:
        replace("长枪法规", "长臂法规", "long-arm-statute")
    if "specific performance" in lower:
        replace("具体业绩", "强制履行", "specific-performance")
    if "service of process" in lower:
        replace("诉讼服务", "诉讼文书送达", "service-of-process")
        replace("服务程序", "送达程序", "service-of-process")
    if "process server" in lower:
        replace("流程服务器", "送达人", "process-server")
    if "proper venue" in lower:
        replace("适当地点", "适当审判地", "proper-venue")
    if "adverse possession" in lower:
        replace("不利占有", "逆权占有", "adverse-possession")
    if "deficiency judgment" in lower:
        replace("缺陷判决", "不足额判决", "deficiency-judgment")
        replace("缺陷判断", "不足额判决", "deficiency-judgment")
    if "statute of frauds" in lower:
        replace("欺诈法规", "防止欺诈法", "statute-of-frauds")
    if "promissory estoppel" in lower:
        replace("本票禁止反悔", "允诺禁反言", "promissory-estoppel")
        replace("承诺禁止反悔", "允诺禁反言", "promissory-estoppel")
    if "dismissal with prejudice" in lower or "dismissed with prejudice" in lower:
        replace("有偏见的驳回", "不得再诉的驳回", "dismissal-with-prejudice")
        replace("带有偏见的驳回", "不得再诉的驳回", "dismissal-with-prejudice")
    if "dismissal without prejudice" in lower or "dismissed without prejudice" in lower:
        replace("没有偏见的驳回", "不妨碍再诉的驳回", "dismissal-without-prejudice")
        replace("无偏见的驳回", "不妨碍再诉的驳回", "dismissal-without-prejudice")
    if "fee simple" in lower:
        replace("收费很简单", "完全所有权", "fee-simple")
    if "peremptory challenge" in lower:
        replace("强制性质疑", "无因回避", "peremptory-challenge")
    if "diversity action" in lower:
        replace("多元化诉讼", "基于不同州籍管辖权的诉讼", "diversity-action")
    if subject == "real-property" and "second lot" in lower:
        replace("第二批", "第二块土地", "second-lot")
    if subject == "real-property" and re.search(r"\bbluff\b", lower):
        replace("虚张声势", "悬崖", "bluff-landform")
    if subject == "civil-procedure":
        if re.search(r"\bdismiss(?:al|ed)?\b", lower) and not re.search(
            r"\b(?:employee|employer|employment|job|workplace|fired)\b", lower
        ):
            replace("解雇", "驳回", "procedural-dismissal")
        if re.search(r"\bdiscovery\b", lower):
            replace("发现", "证据开示", "discovery")
        if re.search(r"\bcomplaint\b", lower):
            replace("申诉", "起诉状", "complaint")
            replace("投诉", "起诉状", "complaint")
        if "motion to dismiss" in lower:
            for old, new in (("解雇动议", "驳回动议"), ("解雇申请", "驳回申请"),
                             ("解雇请求", "驳回请求"), ("解雇的动议", "驳回动议")):
                replace(old, new, "motion-to-dismiss")
        if re.search(r"\bvoluntary dismissal\b", lower):
            replace("自愿解雇", "自愿撤诉", "voluntary-dismissal")
        if re.search(r"\binvoluntary dismissal\b", lower):
            replace("非自愿解雇", "非自愿驳回", "involuntary-dismissal")
        if "notice of dismissal" in lower:
            replace("解雇通知", "撤诉通知", "notice-of-dismissal")
    if subject == "contracts":
        if re.search(r"\bconsideration\b", lower) and not re.search(r"\b(?:next|further) consideration\b", lower):
            amended = re.sub(r"(?<!未)(?<!不)考虑(?!到|了|的是|因素|这些|是否|哪|其|将|如何|应|本)", "对价", text)
            if amended != text:
                text = amended
                rules.append("contract-consideration")
        if re.search(r"\boffer\b", lower):
            replace("报价", "要约", "contract-offer")
            replace("提议", "要约", "contract-offer")
    if subject == "evidence" and re.search(r"\bhearsay\b", lower):
        replace("道听途说", "传闻证据", "hearsay")
    if re.search(r"\bbattery\b", lower):
        if not re.search(r"\b(?:car|phone|vehicle|electrical) battery\b", lower):
            replace("电池", "不法身体接触", "battery")
    if re.search(r"\bcross-examination\b", lower):
        replace("对面审讯", "交叉询问", "cross-examination")
        replace("反审", "交叉询问", "cross-examination")
    return text, sorted(set(rules))


def legal_polish(subject: str, source: str, translated: str) -> str:
    """Apply only source-supported corrections after the full field is assembled."""
    amount_only = re.fullmatch(r"\$([\d,]+)(\.)?", source.strip())
    if amount_only:
        return f"{amount_only.group(1)} 美元。" if amount_only.group(2) else f"{amount_only.group(1)} 美元"
    text = postprocess(source, translated)
    lower = source.lower()
    if subject == "contracts" and re.search(r"\boffer\b", lower) and re.search(r"\bacceptance\b", lower):
        text = text.replace("提议", "要约").replace("报价", "要约")
        text = text.replace("接受", "承诺").replace("验收", "承诺")
    return text


def protect_question_qualifier(source: str, translated: str) -> str:
    if re.search(r"\bLEAST\b", source):
        translated = translated.replace("LEAST", "最不").replace("最不有可能", "最不可能")
        if not re.search(r"最不|最少|最低|最无|最弱", translated):
            translated = "请选择程度最低的一项。" + translated
    return translated


def broken(source: str, translated: str) -> bool:
    if not translated or len(translated) > max(90, len(source) * 2.2):
        return True
    if len(source) > 80 and len(translated) < len(source) * 0.12:
        return True
    if re.search(r"(.)\1{12}|(.{3,25})\2{4}", translated):
        return True
    return False


def sparse(source: str, translated: str) -> bool:
    return len(source) > 80 and len(translated) < len(source) * 0.20


def numeric_flags(source: str, translated: str) -> bool:
    numbers = lambda value: Counter(
        re.sub(r"[, .]", "", token)
        for token in re.findall(r"(?<!\d)\d[\d,. ]*\d|(?<!\d)\d", value)
    )
    return numbers(source) != numbers(translated)


def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument("--model-dir", type=Path, required=True)
    cli.add_argument("--checkpoint", type=Path, default=Path("/private/tmp/nybar-static-translation-chunks.jsonl"))
    args = cli.parse_args()
    model_root = args.model_dir.resolve()
    bank = json.loads(BANK.read_text())
    corrections = json.loads(REVIEWED_CORRECTIONS.read_text())
    reviewed_topics = json.loads(REVIEWED_TOPICS.read_text())
    unknown_topics = set(reviewed_topics) - {q["explanation"]["topic"] for q in bank}
    if unknown_topics:
        raise ValueError(f"Reviewed topic labels are not in the bank: {sorted(unknown_topics)}")
    TOPICS.update(reviewed_topics)
    valid_ids = {question["id"] for question in bank}
    if any(key.split(":", 1)[0] not in valid_ids for key in corrections):
        raise ValueError("Reviewed correction refers to an unknown question ID")
    field_parts = {}
    unique = {}
    for question in bank:
        for field, value in text_fields(question).items():
            parts = pieces(value)
            field_parts[(question["id"], field)] = parts
            for kind, segment in parts:
                if kind == "translate" and segment not in unique:
                    unique[segment] = len(unique)
    cached = {}
    reviewed_sparse = set()
    try:
        for line in args.checkpoint.read_text().splitlines():
            entry = json.loads(line)
            cached[entry["source"]] = entry["zh"]
            if entry.get("reviewedSparseV2"):
                reviewed_sparse.add(entry["source"])
    except FileNotFoundError:
        pass
    cached.update(OVERRIDES)
    remaining = [source for source in unique if cached.get(source) is None or (
        source not in OVERRIDES and source not in reviewed_sparse and sparse(source, cached[source])
    )]
    print(f"{len(unique)} unique text chunks; {len(remaining)} remain to translate.", flush=True)
    if remaining:
        sp = sentencepiece.SentencePieceProcessor(model_file=str(model_root / "sentencepiece.model"))
        model = ctranslate2.Translator(str(model_root / "model"), device="cpu", compute_type="int8", inter_threads=2, intra_threads=4)
        def translate_safe(source: str, depth: int = 0) -> str | None:
            for beam in (4, 1):
                output = model.translate_batch(
                    [sp.encode(source, out_type=str)], beam_size=beam,
                    max_decoding_length=128, replace_unknowns=True,
                    length_penalty=1.0,
                )[0].hypotheses[0]
                zh = postprocess(source, sp.decode_pieces(output))
                if not broken(source, zh):
                    return zh
            rewritten = source.replace("∆", "the defendant").replace("Δ", "the defendant").replace("π", "the plaintiff")
            if rewritten != source:
                value = translate_safe(rewritten, depth + 1)
                if value:
                    return value
            if len(source) < 48 or depth >= 4:
                return None
            parts = split_long(source, max(30, len(source) // 2))
            if len(parts) < 2:
                return None
            values = [translate_safe(part, depth + 1) for part in parts]
            return "".join(values) if all(values) else None
        batch_size = 64
        for start in range(0, len(remaining), batch_size):
            group = remaining[start : start + batch_size]
            outputs = model.translate_batch(
                [sp.encode(source, out_type=str) for source in group],
                beam_size=4,
                max_decoding_length=256,
                replace_unknowns=True,
                length_penalty=1.0,
                max_batch_size=batch_size,
            )
            additions = []
            for source, output in zip(group, outputs, strict=True):
                zh = postprocess(source, sp.decode_pieces(output.hypotheses[0]))
                prior = cached.get(source)
                needs_review = sparse(source, zh) or (prior is not None and sparse(source, prior))
                if needs_review:
                    split = split_long(source, 80)
                    if len(split) > 1:
                        parts = [translate_safe(part) for part in split]
                        if all(parts):
                            joined = "".join(parts)
                            if len(joined) > len(zh):
                                zh = joined
                if broken(source, zh):
                    zh = translate_safe(source)
                if prior is not None and (zh is None or len(prior) > len(zh)):
                    zh = prior
                if zh is None:
                    print(f"Flagged failed chunk: {source[:100]!r}", flush=True)
                cached[source] = zh
                additions.append(json.dumps({"source": source, "zh": zh, "reviewedSparseV2": needs_review}, ensure_ascii=False))
            with args.checkpoint.open("a") as checkpoint:
                checkpoint.write("\n".join(additions) + "\n")
            if (start // batch_size) % 15 == 0 or start + batch_size >= len(remaining):
                print(f"Translated {min(start + batch_size, len(remaining))}/{len(remaining)} remaining chunks.", flush=True)
    unresolved = [source for source in unique if cached[source] is None]
    if unresolved:
        print(f"{len(unresolved)} chunks need a source-based manual override before publication:", flush=True)
        for source in unresolved[:30]:
            print(repr(source[:180]), flush=True)
        raise RuntimeError("Unresolved offline translation chunks")
    flags = []
    sparse_flags = []
    glossary_audit = []
    reviewed_audit = []
    topic_audit = []
    for question in bank:
        fields = text_fields(question)
        result = {}
        for field, source in fields.items():
            if field == "topic" and source in TOPICS:
                zh = TOPICS[source]
                if source in reviewed_topics:
                    topic_audit.append({"id": question["id"], "source": source})
            else:
                used_rules = set()
                translated_parts = []
                for kind, part in field_parts[(question["id"], field)]:
                    if kind == "literal":
                        translated_parts.append(part)
                    else:
                        checked, rules = proofread_chunk(question["subjectId"], part, cached[part])
                        translated_parts.append(checked)
                        used_rules.update(rules)
                zh = "".join(translated_parts)
                zh = legal_polish(question["subjectId"], source, zh)
                if used_rules:
                    glossary_audit.append({"id": question["id"], "field": field, "rules": sorted(used_rules)})
            if field == "ask":
                zh = protect_question_qualifier(source, zh)
            correction_key = f"{question['id']}:{field}"
            if correction_key in corrections:
                zh = corrections[correction_key]
                reviewed_audit.append({"id": question["id"], "field": field})
            result[field] = zh
            if source.strip() and (not zh.strip() or numeric_flags(source, zh)):
                flags.append({"id": question["id"], "field": field, "reason": "number tokens differ; verify value and unit"})
            if sparse(source, zh) and correction_key not in corrections:
                sparse_flags.append({"id": question["id"], "field": field})
        question["stemZh"] = result["stem"]
        question["askZh"] = result["ask"]
        for option in question["options"]:
            option["zh"] = result[f"option-{option['id']}"]
        question["explanation"]["zh"] = result["explanation"]
        question["explanation"]["ruleZh"] = result["rule"]
        question["explanation"]["topicZh"] = result["topic"]
    staged_bank = BANK.with_suffix(".json.tmp")
    staged_bank.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    staged_bank.replace(BANK)
    staged_manifest = MANIFEST.with_suffix(".json.tmp")
    staged_manifest.write_text(json.dumps({
        "sourcePdfSha256": hashlib.sha256((ROOT / "public/uworld-2025/source.pdf").read_bytes()).hexdigest(),
        "model": "Argos Translate English-to-Chinese 1.9 (offline CTranslate2)",
        "targetLocale": "zh-Hans",
        "modelSha256": hashlib.sha256((model_root / "model/model.bin").read_bytes()).hexdigest(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "questions": len(bank),
        "uniqueChunks": len(unique),
        "sourceReviewedOverrides": len(OVERRIDES),
        "numericReviewFlags": flags,
        "sparseTranslationReviewFlags": sparse_flags,
    }, ensure_ascii=False, indent=2) + "\n")
    staged_manifest.replace(MANIFEST)
    staged_audit = PROOFREAD_AUDIT.with_suffix(".json.tmp")
    staged_audit.write_text(json.dumps({
        "method": "Source-conditioned legal terminology corrections and individually reviewed field rewrites",
        "glossaryFields": glossary_audit,
        "reviewedFields": reviewed_audit,
        "reviewedTopicLabels": len(reviewed_topics),
        "topicFieldsUsingReviewedLabels": len(topic_audit),
        "numericFieldsStillFlagged": len(flags),
        "sparseFieldsStillFlagged": len(sparse_flags),
        "scopeNote": "Other fields retain offline machine translations and have not been individually semantically reviewed.",
    }, ensure_ascii=False, indent=2) + "\n")
    staged_audit.replace(PROOFREAD_AUDIT)
    print(f"Wrote {len(bank)} static question translations; {len(flags)} numeric review flags.", flush=True)


if __name__ == "__main__":
    main()
