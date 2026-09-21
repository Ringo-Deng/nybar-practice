#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const bank=JSON.parse(await readFile(new URL('../lib/question-bank.json',import.meta.url),'utf8'));
assert.equal(bank.length,2003,'Every imported question must have a translation.');
const missing=[];
for(const question of bank){
 const fields=[
  ['stem',question.stem,question.stemZh],
  ['ask',question.ask,question.askZh],
  ...question.options.map(option=>[`option-${option.id}`,option.en,option.zh]),
  ['explanation',question.explanation.en,question.explanation.zh],
  ['rule',question.explanation.ruleEn,question.explanation.ruleZh],
  ['topic',question.explanation.topic,question.explanation.topicZh],
 ];
 for(const [name,source,translated] of fields){
  if(source.trim()&&!translated?.trim())missing.push(`${question.id}:${name}`);
 }
}
assert.deepEqual(missing,[],`${missing.length} static Chinese fields are missing: ${missing.slice(0,12).join(', ')}`);
const appFiles=['../app/static-translation.ts','../app/study-app.tsx','../app/original-answer-review.tsx'];
for(const path of appFiles){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 assert(!/new Worker\(|\bTranslator\.create\(|@huggingface\/transformers|translateInWorker/.test(source),`${path} still invokes browser translation.`);
}
console.log(`静态翻译检查通过：${bank.length} 道题的题干、问题、选项、解析、规则和考点均有中文。`);
