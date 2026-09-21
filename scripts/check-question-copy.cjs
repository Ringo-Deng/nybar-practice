const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {formatQuestionForCopy}=require('../lib/question-copy.ts');

const question={
 id:'uworld-fixture-7',number:7,sourceId:'uworld',sourceTitle:'Fixture Assessment',sourceSet:'fixture-set',sourceSession:2,sourcePages:[12],subjectId:'contracts',
 stem:'A client\n asks for advice.',stemZh:'QUESTION_TRANSLATION',ask:'Which option is correct?',askZh:'',
 options:[{id:'A',en:'The first option.',zh:''},{id:'B',en:'The second option.',zh:''}],
 explanation:{kind:'publisher-original',answer:'B',topic:'Contracts',en:'PUBLISHER_REASONING',zh:'TRANSLATED_REASONING',ruleEn:'',ruleZh:'RULE',warning:'',options:{A:{en:'',zh:'OPTION_REASONING'}},source:'UWorld Fixture',sourceUrl:'https://example.com/source',originalPdfPages:[98],textbookReferences:[]},
};

const hidden=formatQuestionForCopy(question,{selected:'A',includeAnswer:false});
for(const text of ['PUBLISHER_REASONING','TRANSLATED_REASONING','OPTION_REASONING','UWorld Fixture','标准答案','原书解析 PDF'])assert.ok(!hidden.includes(text),`Unrevealed review cannot leak ${text}`);
assert.ok(hidden.includes('请帮我理解这道 New York Bar MBE 题目。'));
assert.ok(hidden.includes('我的选择：A'));
assert.ok(hidden.includes('Set 2 · Q7'));
assert.ok(hidden.endsWith('我的疑问：'));
assert.doesNotThrow(()=>formatQuestionForCopy({...question,get explanation(){throw Error('The answer must not be accessed');}},{includeAnswer:false}));

const revealed=formatQuestionForCopy(question,{selected:'A',includeAnswer:true});
for(const text of ['标准答案：B','出版方原文解析（英文）：\nPUBLISHER_REASONING','原文解析的中文译文（非出版方原文）：\nTRANSLATED_REASONING','UWorld Fixture','原书解析 PDF 页码：98'])assert.ok(revealed.includes(text),`Revealed copy includes ${text}`);
console.log('Question copy checks passed: Nybar labels, selected answer, source provenance, and unrevealed-answer boundary.');
