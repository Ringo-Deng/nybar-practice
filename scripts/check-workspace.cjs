const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {readWorkspace,writeWorkspace,restoreWorkspace,hydrateWorkspace,workspaceKey}=require('../lib/study-workspace.ts');

const questions=[0,1,2].map(index=>({id:`q${index}`,sourceId:'uworld',options:[{id:'A'},{id:'B'}]}));
const active={id:'current',mode:'practice',status:'active',questionIds:questions.map(question=>question.id),position:1,answers:{q0:{selected:'A',correct:true}},startedAt:1,finishedAt:null};
const finished={...active,status:'finished',finishedAt:2,score:1};
const data=session=>({questions,session,sessions:session?[session]:[],stats:{},questionStats:{},mistakes:[]});
const snapshot=changes=>({version:1,view:'practice',sessionId:'current',sessionStatus:'active',summary:false,localPosition:0,showZh:false,selection:null,...changes});

(async()=>{
 const memory=new Map();
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
 const saved=snapshot({selection:{questionId:'q1',value:'B'},showZh:true});
 writeWorkspace(storage,workspaceKey(true),saved);
 assert.deepEqual(readWorkspace(storage,workspaceKey(true)),saved);
 assert.equal(readWorkspace(storage,workspaceKey(false)),null,'Guest and account workspaces must remain isolated.');
 const restored=restoreWorkspace(saved,data(active));
 assert.equal(restored.view,'practice');assert.equal(restored.selected,'B');assert.equal(restored.showZh,true);
 assert.equal(restoreWorkspace(snapshot({sessionStatus:'finished',summary:true}),data(finished)).summary,true);
 assert.equal(restoreWorkspace(snapshot({view:'library'}),data(active)).view,'library');
 const calls=[];
 const older={...finished,id:'older',position:2};
 const result=await hydrateWorkspace(snapshot({sessionId:'older',sessionStatus:'finished'}),async id=>{calls.push(id);return {...data(id==='older'?older:active),sessions:[active,older]};});
 assert.deepEqual(calls,[undefined,'older']);assert.equal(result.data.session.id,'older');assert.equal(result.data.session.position,2);
 console.log('Workspace checks passed: namespaced storage, draft selection, page state, completion state, and explicit session hydration.');
})().catch(error=>{console.error(error);process.exitCode=1;});
