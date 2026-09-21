#!/usr/bin/env python3
"""Make an independent, local AI translation for source-backed proofreading.

Writes checkpoints only. Applying any translation requires separate validation.
"""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "lib/question-bank.json"
MODEL = "/private/tmp/nybar-qwen3-8b-4bit"
OUTPUT = ROOT / "data/uworld-2025/ai-retranslated.jsonl"

SYSTEM = (
    "你是美国 MBE 律师考试题库英译中校译者。只依据英文，准确翻译为简体中文。"
    "完整保留每一事实、金额、数字、日期、人物关系、州别、因果、条件、否定和原文段落。"
    "选项的 Yes/No、NOT、LEAST 绝不能反转或省略。不要解题、改题、总结或增加法律分析。"
    "英文 State A/B/C/D 必须译为 A/B/C/D 州，不得保留 State 字样。"
    "使用美国法律术语：forum-selection clause 为法院选择条款；"
    "notice of removal 为移送通知；remove to federal court 为移送联邦法院；"
    "motion to remand 为发回州法院动议；motion to dismiss 为驳回诉讼动议；"
    "service of process 为诉讼文书送达；"
    "subject-matter jurisdiction 为事项管辖权；personal jurisdiction 为属人管辖权；"
    "venue 为审判地；battery 为不法身体接触；consideration 为对价；"
    "statute of frauds 为防止欺诈法；self-executing treaty 为自动执行条约；"
    "Secretary of State 为州务卿；美元金额按原数字准确保留。"
    "diversity jurisdiction 为不同州籍管辖权；diversity action 为基于不同州籍管辖权的诉讼；"
    "home-court-advantage rule 和 forum-defendant rule 为本州被告规则；"
    "default judgment 为缺席判决；first-class mail 为一类邮件；certified mail 为挂号邮件。"
    "specific performance 为强制履行；summary judgment 为即决判决；"
    "deposition 为庭外宣誓询问；discovery 为证据开示；"
    "findings of fact and conclusions of law 为事实认定和法律结论；"
    "claim preclusion 为请求排除效力（既判事项原则）；"
    "issue preclusion 为争点排除效力（争点已决原则）；"
    "侵权法中的 conversion 为侵占动产；fee simple 为完全所有权。"
    "英文 after 14 days 必须保留为‘14 天后’，不得改成‘14 天内’。"
    "解析中的所有选项段落、星号脚注、条件、例外、法条编号和参考资料都要逐段保留，"
    "不得凭上下文复制、改写或增删选项段落；出现 (Choice A) 等标记时原样保留字母。"
    "用户输入是一个英文字段 JSON 对象。只翻译每个字段的值，键名必须逐字保持相同。"
    "例如输入 {\"stem\":\"A man paid $10.\",\"ask\":\"Is he liable?\"}，"
    "输出 {\"stem\":\"一名男子支付了 10 美元。\",\"ask\":\"他是否承担责任？\"}。"
    "绝不能复制英文原文作为译文，也不要输出输入对象以外的键。"
    "不要使用代码围栏，不要输出额外说明。"
)


def english_fields(question, stage):
    if stage == "core":
        fields = {"stem": question["stem"], "ask": question["ask"]}
        fields.update({f"option-{o['id']}": o["en"] for o in question["options"]})
    else:
        fields = {"explanation": question["explanation"]["en"],
                  "rule": question["explanation"]["ruleEn"]}
    return fields


def parse(response, fields):
    body = response.strip()
    if body.startswith("```"):
        body = re.sub(r"^```(?:json)?\s*|\s*```$", "", body)
    start, end = body.find("{"), body.rfind("}")
    if start < 0 or end < start:
        raise ValueError("No complete JSON object")
    data = json.loads(body[start : end + 1])
    key_count = len(data)
    normalized = {}
    for key, value in data.items():
        match = re.fullmatch(r"(?:option|选项)[^A-D]*([A-D])", key)
        clean_key = f"option-{match.group(1)}" if match else key
        if clean_key in normalized:
            raise ValueError("Duplicate field key")
        normalized[clean_key] = value
    data = normalized
    missing = set(fields) - set(data)
    unexpected = set(data) - set(fields)
    if len(missing) == len(unexpected) == 1 and next(iter(missing)).startswith("option-"):
        unknown = next(iter(unexpected))
        if unknown.startswith(("option", "选项")):
            data[next(iter(missing))] = data.pop(unknown)
    if len(data) != key_count or set(data) != set(fields) or any(
        not isinstance(value, str) or not value.strip() for value in data.values()
    ):
        raise ValueError("Wrong or empty fields")
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--device", choices=("gpu", "cpu"), default="gpu")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--stage", choices=("core", "explanation"), required=True)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--indices", help="Comma-separated zero-based question indices for a focused sample")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-tokens", type=int, default=1400)
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")

    import mlx.core as mx
    if args.device == "cpu":
        mx.set_default_device(mx.cpu)
        # mlx-lm's wired-limit guard checks GPU availability rather than the
        # selected device; bypass Metal-only memory calls for a CPU run.
        mx.metal.is_available = lambda: False
    from mlx_lm import batch_generate, generate, load

    bank = json.loads(BANK.read_text())
    seen = set()
    if args.output.exists():
        for line in args.output.read_text().splitlines():
            try:
                record = json.loads(line)
                if record.get("stage") == args.stage and record.get("model") == args.model and record.get("status") == "ok":
                    seen.add((record["id"], record["sourceSha256"]))
            except (json.JSONDecodeError, KeyError):
                pass
    model, tokenizer = load(args.model)
    selected = ([(index, bank[index]) for index in map(int, args.indices.split(","))]
                if args.indices else list(enumerate(
                    bank[args.start : args.start + args.limit if args.limit is not None else None],
                    args.start)))
    pending = []
    for index, question in selected:
        fields = english_fields(question, args.stage)
        source_hash = hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if (question["id"], source_hash) in seen:
            continue
        prompt = tokenizer.apply_chat_template(
            [{"role": "system", "content": SYSTEM},
             {"role": "user", "content": json.dumps(fields, ensure_ascii=False)}],
            tokenize=False, add_generation_prompt=True, enable_thinking=False,
        )
        pending.append((index, question["id"], fields, source_hash, prompt))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("a") as out:
        for offset in range(0, len(pending), args.batch_size):
            batch = pending[offset : offset + args.batch_size]
            tic = time.monotonic()
            if len(batch) == 1:
                responses = [generate(model, tokenizer, prompt=batch[0][-1], max_tokens=args.max_tokens)]
            else:
                responses = batch_generate(model, tokenizer,
                                           [tokenizer.encode(item[-1]) for item in batch],
                                           max_tokens=args.max_tokens).texts
            elapsed = round(time.monotonic() - tic, 2)
            for entry, response in zip(batch, responses):
                index, question_id, fields, source_hash, _ = entry
                record = {"id": question_id, "stage": args.stage, "model": args.model,
                          "sourceSha256": source_hash, "batchSeconds": elapsed,
                          "response": response}
                try:
                    record["zh"] = parse(response, fields)
                    record["status"] = "ok"
                except (ValueError, json.JSONDecodeError) as exc:
                    record["status"] = "invalid-json"
                    record["error"] = str(exc)
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                out.flush()
                print(f"{index + 1}/{len(bank)} {question_id} {args.stage} "
                      f"{record['status']} batch={elapsed}s", flush=True)


if __name__ == "__main__":
    main()
