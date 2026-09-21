const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
for(const extension of ['.ts','.tsx'])require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const nativeLoad=Module._load;
Module._load=function(request,parent,isMain){if(request.startsWith('@/'))request=path.join(root,request.slice(2));return nativeLoad.call(this,request,parent,isMain);};

const {readLibrarySelection,writeLibrarySelection,librarySelectionKey,defaultLibrarySelection}=require('../lib/library-selection.ts');
const {getLibraryResume}=require('../lib/library-resume.ts');
const values=new Map();
const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
assert.deepEqual(readLibrarySelection(storage),defaultLibrarySelection);
writeLibrarySelection({source:'uworld',chosen:'contracts'},storage);
assert.deepEqual(readLibrarySelection(storage),{source:'uworld',chosen:'contracts'});
storage.setItem(librarySelectionKey,JSON.stringify({source:'removed',chosen:'contracts'}));
assert.deepEqual(readLibrarySelection(storage),defaultLibrarySelection);

const question={id:'q1',number:1,sourceId:'uworld',subjectId:'contracts',stem:'Fixture',stemZh:'',ask:'?',askZh:'',options:[]};
const session={id:'session',mode:'practice',status:'active',questionIds:['q1'],position:0,startedAt:10,finishedAt:null,answers:{q1:{selected:'A',correct:true}}};
const data={questions:[question],session,sessions:[session],stats:{answered:1,correct:1,accuracy:100,wrongCount:0,subjects:[]},questionStats:{q1:{correct:1,wrong:0}},mistakes:[]};
const resume=getLibraryResume(data);
assert.equal(resume.subjectLabel,'合同法');assert.equal(resume.sourceLabel,'UWorld');assert.equal(resume.position,0);assert.equal(resume.answered,1);

const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QuestionLibrary}=require('../app/question-library.tsx');
const markup=renderToStaticMarkup(React.createElement(QuestionLibrary,{data,busy:false,onStart(){},onResume(){}}));
assert.ok(markup.includes('题库分类'));assert.ok(markup.includes('上次练习'));assert.ok(markup.includes('继续上次练习'));assert.ok(markup.includes('MBE · 七个科目'));
console.log('Library checks passed: namespaced selection, invalid-state fallback, recent-session summary, and server rendering.');
