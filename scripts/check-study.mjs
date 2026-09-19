#!/usr/bin/env node
// The real study engine is compiled into a temporary directory; fixtures never enter the published bank.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const temporaryRoot=await mkdtemp(resolve(tmpdir(),'nybar-study-check-'));
const publishedBankPath=resolve(projectRoot,'lib/question-bank.json');
const originalBank=await readFile(publishedBankPath,'utf8');
const originalNow=Date.now;
let clock=originalNow();

function fixture(id,subjectId,answer){
 return {id,number:1,sourceId:'personal',subjectId,stem:'Isolated engine fixture.',stemZh:'',ask:'Choose the fixture answer.',askZh:'',options:['A','B','C','D'].map(id=>({id,en:`Fixture option ${id}`,zh:''})),explanation:{answer,topic:'Fixture',en:'This is a test fixture, not study material.',zh:'',ruleEn:'',ruleZh:'',warning:'',options:{},source:'Fixture',sourceUrl:''}};
}

async function loadEngine(name,bank){
 const directory=resolve(temporaryRoot,name);
 const emitted=new Set();
 async function compile(sourcePath){
  const outputPath=resolve(directory,relative(projectRoot,sourcePath).replace(/\.(ts|json)$/,'.mjs'));
  if(emitted.has(sourcePath))return outputPath;
  emitted.add(sourcePath);
  await mkdir(dirname(outputPath),{recursive:true});
  if(sourcePath.endsWith('.json')){
   const data=sourcePath===publishedBankPath?bank:JSON.parse(await readFile(sourcePath,'utf8'));
   await writeFile(outputPath,`export default ${JSON.stringify(data)};\n`);
   return outputPath;
  }
  const source=await readFile(sourcePath,'utf8');
  const result=ts.transpileModule(source,{fileName:sourcePath,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  const errors=(result.diagnostics??[]).filter(item=>item.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,`Could not transpile ${sourcePath}`);
  let output=result.outputText;
  const imports=[...output.matchAll(/\bfrom\s+(['"])(\.[^'"]+)\1/g)];
  for(const match of imports){
   const specifier=match[2];
   const dependency=resolve(dirname(sourcePath),/\.(ts|json)$/.test(specifier)?specifier:`${specifier}.ts`);
   const dependencyOutput=await compile(dependency);
   const rewritten=`./${relative(dirname(outputPath),dependencyOutput).split('\\').join('/')}`;
   output=output.replace(match[0],`from ${JSON.stringify(rewritten)}`);
  }
  await writeFile(outputPath,output);
  return outputPath;
 }
 return import(pathToFileURL(await compile(resolve(projectRoot,'lib/guest-study.ts'))).href);
}

async function verifyBrowserStorage(nybarState){
 const appPath=resolve(projectRoot,'app/study-app.tsx');
 const source=await readFile(appPath,'utf8');
 const syntax=ts.createSourceFile(appPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const selected=syntax.statements.filter(statement=>
  ts.isFunctionDeclaration(statement)&&['readGuestStudy','saveGuestStudy'].includes(statement.name?.text)||
  ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(item=>item.name.getText(syntax)==='GUEST_STUDY_KEY'));
 assert.equal(selected.length,3,'The actual storage adapter could not be located.');
 const adapter=ts.transpileModule(selected.map(statement=>statement.getText(syntax)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const sqeKey='sqe-practice:guest-study:v1';
 const preserved=JSON.stringify({project:'sqe',sessions:['preserve this data']});
 const entries=new Map([[sqeKey,preserved]]);
 const localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
 const {readGuestStudy,saveGuestStudy}=vm.runInNewContext(`${adapter}\n({readGuestStudy,saveGuestStudy});`,{localStorage});
 assert.equal(readGuestStudy(),null,'A fresh Nybar library must not read SQE data.');
 saveGuestStudy(nybarState);
 assert.equal(JSON.stringify(readGuestStudy()),JSON.stringify(nybarState));
 assert.equal(entries.get(sqeKey),preserved,'Saving Nybar progress must preserve SQE progress.');
 assert(entries.has('nybar-practice:guest-study:v1'));

 const namespaces=[
  ['app/study-app.tsx','GUEST_STUDY_KEY'],
  ['app/vocabulary-panel.tsx','GUEST_VOCABULARY_KEY'],
  ['app/use-textbook-annotations.ts','GUEST_ANNOTATIONS_KEY'],
  ['app/use-textbook-catalog.ts','GUEST_TITLES_KEY'],
  ['app/use-textbook-catalog.ts','GUEST_DB'],
  ['app/textbook-library.tsx','LAST_TEXTBOOK_POSITION_KEY'],
  ['lib/textbook-local-cache.ts','CACHE_NAME'],
  ['lib/textbook-local-cache.ts','MANIFEST_KEY'],
 ];
 for(const [file,name] of namespaces){
  const content=await readFile(resolve(projectRoot,file),'utf8');
  const match=content.match(new RegExp(`\\b${name}\\s*=\\s*(['"])([^'"]+)\\1`));
  assert(match&&match[2].startsWith('nybar-practice'),`${file}: ${name} must use the Nybar namespace.`);
 }
}

async function verifyTextbookSources(){
 const path=resolve(projectRoot,'lib/textbooks.ts');
 const source=await readFile(path,'utf8');
 const syntax=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 const functions=syntax.statements.filter(statement=>ts.isFunctionDeclaration(statement)&&['browserAssetUrl','textbookPageSource'].includes(statement.name?.text));
 const compiled=ts.transpileModule(functions.map(statement=>statement.getText(syntax).replace(/^export /,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const pageSource=vm.runInNewContext(`${compiled}\ntextbookPageSource;`,{URL,document:{baseURI:'https://ringo-deng.github.io/nybar-practice/'}});
 const imported={pageCount:3,url:'blob:https://ringo-deng.github.io/example',pageUrlTemplate:'',imported:true};
 assert.equal(pageSource(imported,2).url,imported.url,'An imported PDF with an empty page template must use its blob URL.');
 assert.equal(pageSource(imported,2).pageNumber,2);
 assert.equal(pageSource({pageCount:3,url:'/textbooks/book.pdf'},1).url,'https://ringo-deng.github.io/nybar-practice/textbooks/book.pdf');
 assert.equal(pageSource({pageCount:3,pageUrlTemplate:'/textbooks/page-{page}.pdf'},2).pageNumber,1);
 assert.throws(()=>pageSource(imported,4),/无效/);
}

try{
 Date.now=()=>clock;
 const first=fixture('check-nybar-evidence','evidence','B');
 const second=fixture('check-nybar-contracts','contracts','D');
 const engine=await loadEngine('nybar',[first,second]);
 const run=(state,action)=>{clock+=1000;return engine.applyGuestStudyAction(state,action);};
 const sessionId=randomUUID();
 let current=run(null,{action:'start',id:sessionId,mode:'practice'});
 assert.equal(current.data.questions.length,2);
 assert.equal(current.data.questions[0].explanation,undefined,'Unanswered questions must not disclose answers.');
 assert.throws(()=>run(current.state,{action:'answer',sessionId,questionId:first.id,selected:'E'}),/有效答案/);
 current=run(current.state,{action:'answer',sessionId,questionId:first.id,selected:'A'});
 assert.equal(current.data.session.answers[first.id].correct,false);
 assert.equal(current.data.stats.wrongCount,1);
 assert.equal(current.data.questions[0].explanation.answer,'B');
 const firstAnswer=JSON.stringify(current.state.sessions[0].answers[first.id]);
 current=run(current.state,{action:'answer',sessionId,questionId:first.id,selected:'B'});
 assert.equal(JSON.stringify(current.state.sessions[0].answers[first.id]),firstAnswer,'An existing practice answer must not be overwritten.');
 current=run(current.state,{action:'navigate',sessionId,position:1});
 current=run(JSON.parse(JSON.stringify(current.state)),{action:'hydrate'});
 assert.equal(current.data.session.position,1,'Refresh must retain the current question.');
 assert.equal(current.data.session.answers[first.id].selected,'A','Refresh must retain answers.');
 current=run(current.state,{action:'answer',sessionId,questionId:second.id,selected:'D'});
 current=run(current.state,{action:'finish',sessionId});
 assert.equal(current.data.session.status,'finished');
 assert.equal(current.data.session.score,1);
 assert.equal(current.data.stats.accuracy,50);
 const wrongSessionId=randomUUID();
 current=run(current.state,{action:'start',id:wrongSessionId,mode:'wrong'});
 assert.deepEqual(current.data.session.questionIds,[first.id],'Wrong-answer practice must contain only unresolved mistakes.');
 current=run(current.state,{action:'answer',sessionId:wrongSessionId,questionId:first.id,selected:'B'});
 current=run(current.state,{action:'finish',sessionId:wrongSessionId});
 current=run(JSON.parse(JSON.stringify(current.state)),{action:'hydrate'});
 assert.equal(current.data.stats.wrongCount,0);
 assert.equal(current.data.mistakes[0].lastCorrect,true,'A corrected mistake must remain in history.');
 assert.equal(current.data.mistakes[0].wrongCount,1);
 assert.equal(current.data.stats.answered,3);
 assert.equal(current.data.stats.correct,2);
 assert.equal(current.data.stats.subjects.find(item=>item.subjectId==='evidence').answered,2);
 assert.throws(()=>run(current.state,{action:'start',id:randomUUID(),mode:'wrong'}),/没有需要重练/);
 await verifyBrowserStorage(current.state);
 await verifyTextbookSources();
 const foreignEngine=await loadEngine('foreign',[fixture('foreign-question','evidence','A')]);
 assert.equal(foreignEngine.applyGuestStudyAction(current.state,{action:'hydrate'}).data.sessions.length,0,'Unknown question IDs must not create sessions in another library.');
 const emptyEngine=await loadEngine('empty',[]);
 const empty=emptyEngine.applyGuestStudyAction(null,{action:'hydrate'});
 assert.equal(empty.data.questions.length,0);
 assert.equal(empty.data.stats.answered,0);
 assert.equal(empty.data.session,null);
 assert.throws(()=>emptyEngine.applyGuestStudyAction(null,{action:'start',id:randomUUID(),mode:'practice'}),/尚未导入/);
 console.log('Study checks passed: answer grading, correction, refresh, empty library, isolated browser storage, and imported PDF paths.');
}finally{
 Date.now=originalNow;
 await rm(temporaryRoot,{recursive:true,force:true});
 assert.equal(await readFile(publishedBankPath,'utf8'),originalBank,'The published question bank must remain unchanged.');
}
