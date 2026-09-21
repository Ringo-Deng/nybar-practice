import type {Question} from './study-types';
import {questionNumberLabel,sourceById} from './question-sources';
import {normalizeExplanationText,normalizeInlineQuestionText} from './question-text';

export function formatQuestionForCopy(question:Question,{selected,includeAnswer}:{selected?:string;includeAnswer:boolean}):string{
 const inline=normalizeInlineQuestionText;
 const blocks=[
  '请帮我理解这道 New York Bar MBE 题目。',
  [
   `来源：${sourceById(question.sourceId)?.name??question.sourceId}`,
   question.sourceTitle?`题集：${inline(question.sourceTitle)}`:'',
   question.sourceSet?`题集 ID：${question.sourceSet}`:'',
   `题号：${questionNumberLabel(question)} · ID：${question.id}`,
   question.sourcePages?.length?`题目 PDF 页码：${question.sourcePages.join('、')}`:'',
  ].filter(Boolean).join('\n'),
  `题干（英文原文）：\n${normalizeExplanationText(question.stem)}`,
  `问题：${inline(question.ask)}`,
  `选项（英文原文）：\n${question.options.map(option=>`${option.id}. ${inline(option.en)}`).join('\n')}`,
  `我的选择：${selected?.trim()||'未作答'}`,
 ];

 // Do not touch answer-bearing fields until the review is visible.
 const explanation=includeAnswer?question.explanation:undefined;
 if(explanation){
  const publisherOriginal=explanation.kind==='publisher-original';
  blocks.push(`标准答案：${explanation.answer.trim()||'未提供'}`);
  if(explanation.source.trim())blocks.push(`解析来源标注：${inline(explanation.source)}`);
  if(explanation.originalPdfPages?.length)blocks.push(`原书解析 PDF 页码：${explanation.originalPdfPages.join('、')}`);
  const addText=(label:string,text:string)=>{
   const value=normalizeExplanationText(text);
   if(value)blocks.push(`${label}：\n${value}`);
  };
  addText(publisherOriginal?'出版方原文解析（英文）':'补充解析（英文）',explanation.en);
  addText(publisherOriginal?'原文解析的中文译文（非出版方原文）':'补充解析（中文）',explanation.zh);
  const supplementary=[
   explanation.ruleEn.trim()?`规则（英文）：${normalizeExplanationText(explanation.ruleEn)}`:'',
   explanation.ruleZh.trim()?`规则（中文）：${normalizeExplanationText(explanation.ruleZh)}`:'',
   ...(explanation.reasoningSteps??[]).map(step=>`${inline(step.title)}：${normalizeExplanationText(step.detail)}`),
   ...question.options.flatMap(option=>{
    const analysis=explanation.options[option.id];
    if(!analysis)return [];
    return [
     analysis.en.trim()?`${option.id}（英文）：${normalizeExplanationText(analysis.en)}`:'',
     analysis.zh.trim()?`${option.id}（中文）：${normalizeExplanationText(analysis.zh)}`:'',
    ];
   }),
  ].filter(Boolean);
  if(supplementary.length)blocks.push(`补充规则与选项分析：\n${supplementary.join('\n')}`);
  const publisherReference=explanation.publisherReference;
  if(publisherReference){
   const reference=[publisherReference.book,publisherReference.chapters.length?`Chapter ${publisherReference.chapters.join(', ')}`:''].filter(Boolean).join(' · ');
   if(reference)blocks.push(`原书推荐教材：${inline(reference)}`);
  }
  const references=(explanation.textbookReferences??[]).map(reference=>[
   reference.book,reference.chapter,reference.pages?`页码：${reference.pages}`:reference.pageNumbers?.length?`PDF 页码：${reference.pageNumbers.join('、')}`:'',reference.section,
  ].filter(Boolean).map(inline).join(' · ')).filter(Boolean);
  if(references.length)blocks.push(`关联教材（仅书目与定位）：\n${references.map(reference=>`- ${reference}`).join('\n')}`);
  if(explanation.sourceUrl.trim())blocks.push(`来源链接：${explanation.sourceUrl.trim()}`);
 }
 blocks.push('我的疑问：');
 return blocks.join('\n\n');
}
