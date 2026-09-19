#!/usr/bin/env node
// Exercise the actual browser service with isolated storage and simulated engines.
// These checks never download a model or write to the published question bank.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const serviceUrl=new URL('../lib/translation.ts',import.meta.url);
const source=await readFile(serviceUrl,'utf8');
const compiled=ts.transpileModule(source.replaceAll('import.meta.url',JSON.stringify(serviceUrl.href)),{
 fileName:serviceUrl.pathname,
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 reportDiagnostics:true,
});
assert.equal((compiled.diagnostics??[]).filter(item=>item.category===ts.DiagnosticCategory.Error).length,0);

const preservedEntries=new Map([
 ['nybar-practice:guest-study:v1',JSON.stringify({sessions:[{id:'saved-session',position:23,answers:{question:{selected:'B'}}}]})],
 ['nybar-practice:guest-vocabulary:v1','preserve vocabulary'],
 ['sqe-practice:guest-study:v1','preserve SQE progress'],
]);
const harnesses=[];
const chinese=text=>`中文译文〔${text}〕`;

function deferred(){
 let resolve,reject;
 const promise=new Promise((accept,decline)=>{resolve=accept;reject=decline;});
 return {promise,resolve,reject};
}

async function within(promise,message='Translation check did not settle.'){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),3000);})]);}
 finally{clearTimeout(timer);}
}

function harness(options={}){
 const entries=new Map(options.entries??preservedEntries);
 const storageCalls=[];
 const calls=[];
 const workers=[];
 const timers=new Set();
 const stats={created:0,destroyed:0};
 const exported={};
 const config={translate:chinese,...options};
 class FakeWorker{
  listeners=new Map();
  terminated=false;
  constructor(){workers.push(this);}
  addEventListener(name,listener){const listeners=this.listeners.get(name)??new Set();listeners.add(listener);this.listeners.set(name,listeners);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  terminate(){this.terminated=true;}
  postMessage({id,text}){
   calls.push({engine:'worker',text});
   Promise.resolve().then(()=>config.workerTranslate?config.workerTranslate(text):Promise.reject(new Error('Simulated unavailable worker.'))).then(
    text=>this.emit({id,type:'result',text}),
    error=>this.emit({id,type:'error',message:error.message}),
   );
  }
  emit(data){if(!this.terminated)for(const listener of this.listeners.get('message')??[])listener({data});}
 }
 const context={
  exports:exported,URL,DOMException,AbortController,console,
  setTimeout:(callback,delay)=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},delay);timers.add(timer);return timer;},
  clearTimeout:timer=>{timers.delete(timer);clearTimeout(timer);},
  localStorage:{
   getItem:key=>{storageCalls.push({action:'read',key});if(config.storageUnavailable)throw new Error('Storage unavailable.');return entries.get(key)??null;},
   setItem:(key,value)=>{storageCalls.push({action:'write',key});if(config.storageUnavailable)throw new Error('Storage unavailable.');entries.set(key,value);},
  },
  Worker:FakeWorker,
 };
 if(config.native!==false)context.Translator={create(settings){
  stats.created++;
  assert.equal(settings.sourceLanguage,'en');
  assert.equal(settings.targetLanguage,'zh-Hans');
  return Promise.resolve({
   translate:async(text,settings)=>{calls.push({engine:'native',text});return config.translate(text,settings);},
   destroy:()=>stats.destroyed++,
  });
 }};
 vm.runInNewContext(compiled.outputText,context,{filename:serviceUrl.pathname});
 const instance={api:exported,entries,storageCalls,calls,workers,stats,config,dispose:()=>{for(const timer of timers)clearTimeout(timer);}};
 harnesses.push(instance);
 return instance;
}

function assertIndependentStorage(instance){
 for(const [key,value] of preservedEntries)assert.equal(instance.entries.get(key),value,`${key} must remain unchanged.`);
 for(const {key} of instance.storageCalls){
  assert(key.startsWith('nybar-practice:translation:'),`Translation must not read or write learning records: ${key}`);
 }
}

async function checkEmptyAndParagraphs(){
 const instance=harness();
 const {translateTexts,splitTranslationText,joinTranslationParts}=instance.api;
 assert.equal(JSON.stringify(await translateTexts({stem:'',ask:'  \n '})),JSON.stringify({stem:'',ask:''}));
 assert.equal(instance.stats.created,0,'Empty question fields must not initialize a translation engine.');
 assert.equal(instance.workers.length,0);
 const explanation=`  First paragraph: ${'The court applies the stated rule. '.repeat(45)}\n\nSecond paragraph with a different issue.\r\n\r\n${'LongUnbrokenWord'.repeat(40)} 🙂  `;
 const parts=splitTranslationText(explanation);
 assert.equal(parts.map(part=>part.text).join(''),explanation,'Splitting a long explanation must preserve every source character.');
 assert(parts.filter(part=>part.translate).every(part=>part.text.length<=320));
 assert.equal(joinTranslationParts(parts,parts.filter(part=>part.translate).map(part=>part.text)),explanation);
 assert.throws(()=>joinTranslationParts(parts,[]),/不完整/);
 assert.throws(()=>joinTranslationParts([],['多余译文']),/数量不匹配/);
 const progress=[];
 const translated=await within(translateTexts({stem:'',explanation},{onProgress:value=>progress.push(value)}));
 assert.equal(translated.stem,'');
 assert.equal(translated.explanation,parts.map(part=>part.translate?chinese(part.text):part.text).join(''));
 assert.deepEqual(translated.explanation.match(/\r\n|\r|\n/g),explanation.match(/\r\n|\r|\n/g),'Translation must retain paragraph boundaries.');
 assert.equal(progress.at(-1).completed,parts.filter(part=>part.translate).length);
 assert.equal(progress.at(-1).completed,progress.at(-1).total);
 assertIndependentStorage(instance);
}

async function checkCacheAndSourceChanges(){
 const instance=harness();
 const first=await within(instance.api.translateTexts({stem:'The first source text.'}));
 assert.equal(first.stem,chinese('The first source text.'));
 assert.equal(instance.calls.length,1);
 const reloaded=harness({entries:instance.entries,translate:()=>{throw new Error('A cache hit must not invoke an engine.');}});
 assert.equal((await reloaded.api.translateTexts({renamedField:'The first source text.'})).renamedField,first.stem);
 assert.equal(reloaded.stats.created,0,'A persisted Chinese cache hit must not start a model.');
 assert.equal(reloaded.workers.length,0);
 const changed=await within(instance.api.translateTexts({stem:'The edited source text.'}));
 assert.equal(changed.stem,chinese('The edited source text.'));
 assert.equal(instance.calls.length,2,'Changing the English under the same field key must retranslate it.');
 assert.notEqual(changed.stem,first.stem);
 assertIndependentStorage(instance);
 assertIndependentStorage(reloaded);
}

async function checkRetryAndStorageFailure(){
 const instance=harness({translate:()=>{throw new Error('Simulated native translation failure.');}});
 await assert.rejects(within(instance.api.translateTexts({stem:'Retry this question.'})),/unavailable worker/);
 assert.equal(instance.storageCalls.filter(call=>call.action==='write').length,0,'Failed translations must not enter the cache.');
 instance.config.translate=chinese;
 const retried=await within(instance.api.translateTexts({stem:'Retry this question.'}));
 assert.equal(retried.stem,chinese('Retry this question.'));
 assert.equal(instance.stats.created,2,'A failed engine must be recreated for retry.');
 assertIndependentStorage(instance);
 const storageDisabled=harness({storageUnavailable:true});
 assert.equal((await within(storageDisabled.api.translateTexts({stem:'Storage may be unavailable.'}))).stem,chinese('Storage may be unavailable.'));
 await storageDisabled.api.translateTexts({stem:'Storage may be unavailable.'});
 assert.equal(storageDisabled.calls.length,1,'Memory caching should still work when browser storage is unavailable.');
}

async function checkCancellationIsolation(){
 const held=deferred();
 const started=deferred();
 const instance=harness({translate:text=>{
  if(text==='Question A.'){started.resolve();return held.promise;}
  return chinese(text);
 }});
 const controller=new AbortController();
 const progress=[];
 const cancelled=instance.api.translateTexts({stem:'Question A.'},{signal:controller.signal,onProgress:value=>progress.push(value)});
 const rejection=assert.rejects(cancelled,error=>error.name==='AbortError');
 await within(started.promise);
 const other=instance.api.translateTexts({stem:'Question B.'});
 controller.abort();
 await within(rejection);
 const progressAfterAbort=progress.length;
 assert.equal((await within(other)).stem,chinese('Question B.'),'Cancelling one question must not cancel another.');
 held.resolve(chinese('Question A.'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(progress.length,progressAfterAbort,'Cancelled work must not send late progress updates.');
 const replay=harness({entries:instance.entries});
 assert.equal((await within(replay.api.translateTexts({stem:'Question A.'}))).stem,chinese('Question A.'));
 assert.equal(replay.calls.length,1,'A late result from cancelled work must not populate the cache.');
 assert.equal((await replay.api.translateTexts({stem:'Question B.'})).stem,chinese('Question B.'));
 assert.equal(replay.calls.length,1,'The other question should retain its own successful cache entry.');
 const preAborted=new AbortController();preAborted.abort();
 await assert.rejects(instance.api.translateTexts({stem:'Never start this.'},{signal:preAborted.signal}),error=>error.name==='AbortError');
 assert(!instance.calls.some(call=>call.text==='Never start this.'));
 assertIndependentStorage(instance);
}

async function checkAtomicCacheWrites(){
 const failure=harness({translate:text=>{
  if(text==='The explanation fails.')throw new Error('Simulated second-field failure.');
  return chinese(text);
 }});
 await assert.rejects(within(failure.api.translateTexts({stem:'The first field finishes.',explanation:'The explanation fails.'})),/unavailable worker/);
 assert(failure.calls.some(call=>call.text==='The first field finishes.'));
 assert.equal(failure.storageCalls.filter(call=>call.action==='write').length,0,'A later field failure must not persist an incomplete request.');
 const retry=harness({entries:failure.entries});
 await within(retry.api.translateTexts({stem:'The first field finishes.'}));
 assert.equal(retry.calls.length,1);

 const held=deferred();const started=deferred();
 const cancellation=harness({translate:text=>{
  if(text==='Cancel the explanation.'){started.resolve();return held.promise;}
  return chinese(text);
 }});
 const controller=new AbortController();
 const task=cancellation.api.translateTexts({stem:'A completed first field.',explanation:'Cancel the explanation.'},{signal:controller.signal});
 const rejection=assert.rejects(task,error=>error.name==='AbortError');
 await within(started.promise);controller.abort();await within(rejection);
 held.resolve(chinese('Cancel the explanation.'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(cancellation.storageCalls.filter(call=>call.action==='write').length,0,'Cancelling a later field must not persist an incomplete request.');
 assertIndependentStorage(failure);
 assertIndependentStorage(cancellation);
}

async function checkWorkerFallback(){
 const instance=harness({native:false,workerTranslate:chinese});
 const result=await within(instance.api.translateTexts({explanation:'A browser without native translation still translates.'}));
 assert.equal(result.explanation,chinese('A browser without native translation still translates.'));
 assert.equal(instance.stats.created,0);
 assert.equal(instance.workers.length,1);
 await instance.api.translateTexts({explanation:'A browser without native translation still translates.'});
 assert.equal(instance.calls.length,1);
 assertIndependentStorage(instance);
 const held=deferred();const started=deferred();
 const cancelledWorker=harness({native:false,workerTranslate:text=>{
  if(text==='Cancel worker A.'){started.resolve();return held.promise;}
  return chinese(text);
 }});
 const controller=new AbortController();
 const cancelled=cancelledWorker.api.translateTexts({stem:'Cancel worker A.'},{signal:controller.signal});
 const rejection=assert.rejects(cancelled,error=>error.name==='AbortError');
 await within(started.promise);controller.abort();await within(rejection);
 assert(cancelledWorker.workers[0].terminated,'Cancelling a worker inference must release the worker.');
 const other=await within(cancelledWorker.api.translateTexts({stem:'Worker question B.'}));
 assert.equal(other.stem,chinese('Worker question B.'));
 assert.equal(cancelledWorker.workers.length,2,'A later question must receive a usable replacement worker.');
 held.resolve(chinese('Cancel worker A.'));
 assertIndependentStorage(cancelledWorker);
}

try{
 await checkEmptyAndParagraphs();
 await checkCacheAndSourceChanges();
 await checkRetryAndStorageFailure();
 await checkCancellationIsolation();
 await checkAtomicCacheWrites();
 await checkWorkerFallback();
 console.log('Translation checks passed: empty fields, complete long explanations, persistent cache, source edits, retry, native/worker cancellation, and isolated study data.');
}finally{
 for(const instance of harnesses)instance.dispose();
}
