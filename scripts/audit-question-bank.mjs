#!/usr/bin/env node
// Run with Node >=22.13: node --experimental-strip-types scripts/audit-question-bank.mjs [bank.json]
import {readFile} from 'node:fs/promises';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {subjects} from '../lib/subjects.ts';
import {questionSources} from '../lib/question-sources.ts';
import {chapters} from '../lib/chapters.ts';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hasText=value=>typeof value==='string'&&value.trim().length>0;

export function auditQuestionBank(bank){
 const errors=[];
 let sourcePageCount;
 try{
  const manifest=JSON.parse(readFileSync(resolve(projectRoot,'data/uworld-2025/source-manifest.json'),'utf8'));
  if(Number.isInteger(manifest.pageCount)&&manifest.pageCount>0)sourcePageCount=manifest.pageCount;
  else errors.push('UWorld 来源清单的 pageCount 必须是正整数。');
 }catch(error){if(error.code!=='ENOENT')errors.push(`无法读取 UWorld 来源清单：${error.message}`);}
 const imageRoot=resolve(projectRoot,'public/uworld-2025/images');
 const imageChecks=new Map();
 const checkImageFile=src=>{
  if(imageChecks.has(src))return imageChecks.get(src);
  let error;
  if(!/^uworld-2025\/images\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(src)||src.split('/').some(part=>part==='.'||part==='..'||!part))error='src 必须为 uworld-2025/images/ 下的站内图片路径，不得包含远程地址、转义路径或 ../。';
  else try{
   const file=resolve(projectRoot,'public',src),realRoot=realpathSync(imageRoot),realFile=realpathSync(file);
   if(!realFile.startsWith(realRoot+sep)||!statSync(realFile).isFile())error='src 必须指向 public/uworld-2025/images/ 内的有效图片文件。';
  }catch{error=`图片文件不存在或不可读取：${src}`;}
  imageChecks.set(src,error);return error;
 };
 const sourceSets=new Map();
 const subjectIds=new Set(subjects.map(subject=>subject.id));
 const sourceIds=new Set(questionSources.map(source=>source.id));
 const chapterMap=new Map(chapters.map(chapter=>[chapter.id,chapter]));
 if(subjects.length!==7||subjectIds.size!==7)errors.push('科目目录必须包含 7 个不重复的 MBE 科目。');
 if(sourceIds.size!==questionSources.length)errors.push('题目来源目录存在重复 ID。');
 if(chapterMap.size!==chapters.length)errors.push('章节目录存在重复 ID。');
 for(const chapter of chapters)if(!subjectIds.has(chapter.subjectId))errors.push(`章节 ${chapter.id} 引用了无效科目 ${chapter.subjectId}。`);
 if(!Array.isArray(bank))return [...errors,'题库顶层必须是 JSON 数组。'];
 const seen=new Set();
 for(const [index,question] of bank.entries()){
  const label=`第 ${index+1} 题${hasText(question?.id)?` (${question.id})`:''}`;
  const fail=message=>errors.push(`${label}：${message}`);
  if(!isRecord(question)){fail('题目必须是对象。');continue;}
  const checkPage=(page,field)=>{if(!Number.isInteger(page)||page<1)fail(`${field} 必须是正整数 PDF 页码。`);else if(question.sourceId==='uworld'&&sourcePageCount&&page>sourcePageCount)fail(`${field} 超出源 PDF 的 ${sourcePageCount} 页范围。`);};
  const checkPages=(pages,field)=>{if(pages===undefined)return;if(!Array.isArray(pages)||!pages.length){fail(`${field} 必须是非空 PDF 页码数组。`);return;}for(const page of pages)checkPage(page,field);};
  const checkImages=(images,field)=>{
   if(images===undefined)return;
   if(!Array.isArray(images)){fail(`${field} 必须为图片数组。`);return;}
   for(const [imageIndex,image] of images.entries()){
    const label=`${field}[${imageIndex}]`;
    if(!isRecord(image)){fail(`${label} 必须为图片对象。`);continue;}
    if(!hasText(image.src))fail(`${label}.src 缺少有效图片路径。`);
    else{const error=checkImageFile(image.src);if(error)fail(`${label}：${error}`);}
    if(!hasText(image.alt))fail(`${label}.alt 缺少图片说明。`);
    checkPage(image.sourcePage,`${label}.sourcePage`);
    for(const dimension of ['width','height'])if(image[dimension]!==undefined&&(!Number.isInteger(image[dimension])||image[dimension]<1))fail(`${label}.${dimension} 必须是正整数。`);
   }
  };
  if(question.sourceSet!==undefined){
   if(!hasText(question.sourceSet))fail('sourceSet 必须是非空批次 ID。');
   else{const group=sourceSets.get(question.sourceSet);if(group){group.count+=1;if(group.subjectId!==question.subjectId||group.sourceId!==question.sourceId)fail(`批次 ${question.sourceSet} 不得混用不同科目或题目来源。`);}else sourceSets.set(question.sourceSet,{count:1,subjectId:question.subjectId,sourceId:question.sourceId});}
  }
  checkPages(question.sourcePages,'sourcePages');
  checkImages(question.images,'images');
  if(!hasText(question.id))fail('缺少有效 ID。');
  else if(seen.has(question.id))fail('ID 重复。');
  else seen.add(question.id);
  if(!Number.isInteger(question.number)||question.number<1)fail('number 必须是正整数。');
  if(!subjectIds.has(question.subjectId))fail(`无效科目 ${String(question.subjectId)}。`);
  if(!sourceIds.has(question.sourceId))fail(`无效来源 ${String(question.sourceId)}。`);
  if(typeof question.stem!=='string')fail('stem 必须为字符串；无事实背景的原题可留空。');
  if(!hasText(question.ask))fail('缺少英文提问 ask。');
  for(const field of ['stemZh','askZh'])if(typeof question[field]!=='string')fail(`${field} 必须为字符串，可留空。`);
  if(!Array.isArray(question.options)||question.options.length!==4)fail('必须有四个 A–D 选项。');
  const options=Array.isArray(question.options)?question.options:[];
  const optionIds=options.map(option=>option?.id);
  if(optionIds.length!==4||new Set(optionIds).size!==4||!['A','B','C','D'].every(id=>optionIds.includes(id)))fail('选项 ID 必须恰为 A、B、C、D，不能重复。');
  for(const [optionIndex,option] of options.entries()){
   if(!isRecord(option)||!hasText(option.en))fail(`第 ${optionIndex+1} 个选项缺少英文内容 en。`);
   if(typeof option?.zh!=='string')fail(`第 ${optionIndex+1} 个选项的 zh 必须为字符串，可留空。`);
  }
  if(!isRecord(question.explanation))fail('缺少解析 explanation。');
  else{
   if(typeof question.explanation.answer!=='string'||!['A','B','C','D'].includes(question.explanation.answer)||optionIds.filter(id=>id===question.explanation.answer).length!==1)fail('answer 必须是恰好匹配一个选项的 A–D 单选答案。');
   if(!hasText(question.explanation.en))fail('缺少英文解析 explanation.en。');
   if(!hasText(question.explanation.topic))fail('缺少解析考点 explanation.topic。');
   for(const field of ['zh','ruleEn','ruleZh','warning','source','sourceUrl'])if(typeof question.explanation[field]!=='string')fail(`explanation.${field} 必须为字符串，可留空。`);
   if(!isRecord(question.explanation.options))fail('缺少逐项解析 explanation.options。');
   else if(!(question.explanation.kind==='publisher-original'&&Object.keys(question.explanation.options).length===0))for(const id of ['A','B','C','D']){
    const detail=question.explanation.options[id];
    if(!isRecord(detail)||!hasText(detail.en)||typeof detail.zh!=='string')fail(`选项 ${id} 的解析需包含英文 en 和字符串 zh。`);
   }
  }
  if(isRecord(question.explanation)){
   checkPages(question.explanation.originalPdfPages,'explanation.originalPdfPages');
   checkImages(question.explanation.images,'explanation.images');
   if(Array.isArray(question.explanation.textbookReferences))for(const [referenceIndex,reference] of question.explanation.textbookReferences.entries()){
    if(reference?.bookId==='uworld-2025-source')checkPages(reference.pageNumbers,`explanation.textbookReferences[${referenceIndex}].pageNumbers`);
   }
  }
  if(question.chapterId!==undefined){
   const chapter=chapterMap.get(question.chapterId);
   if(!chapter)fail(`主章节 ${String(question.chapterId)} 不在章节目录中。`);
   else if(chapter.subjectId!==question.subjectId)fail('主章节所属科目与题目科目不一致。');
  }
  if(question.relatedChapterIds!==undefined){
   if(!Array.isArray(question.relatedChapterIds))fail('relatedChapterIds 必须是章节 ID 数组。');
   else{
    if(new Set(question.relatedChapterIds).size!==question.relatedChapterIds.length)fail('相关章节 ID 重复。');
    for(const id of question.relatedChapterIds)if(!chapterMap.has(id))fail(`相关章节 ${String(id)} 不在章节目录中。`);
   }
  }
 }
 for(const [id,group] of sourceSets)if(group.count>50)errors.push(`批次 ${id} 包含 ${group.count} 题，每批最多 50 题。`);
 return errors;
}

async function main(){
 if(process.argv.length>3)throw new Error('用法：node --experimental-strip-types scripts/audit-question-bank.mjs [bank.json]');
 const filename=process.argv[2]?resolve(process.argv[2]):resolve(projectRoot,'lib/question-bank.json');
 const bank=JSON.parse(await readFile(filename,'utf8'));
 const errors=auditQuestionBank(bank);
 if(errors.length){
  console.error(`题库审查失败：${errors.length} 项问题\n${errors.map(error=>`- ${error}`).join('\n')}`);
  process.exitCode=1;
 }else console.log(`题库审查通过：${bank.length} 道题，7 个 MBE 科目${bank.length?'':'；初始空题库合法'}。`);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 await main().catch(error=>{console.error(`题库审查失败：${error.message}`);process.exitCode=1;});
}
