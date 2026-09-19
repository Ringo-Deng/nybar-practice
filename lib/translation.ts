import type {TranslationProgress,TranslationWorkerResponse} from './translation-types';
export type {TranslationProgress} from './translation-types';

type TranslationOptions={signal?:AbortSignal;onProgress?:(progress:TranslationProgress)=>void};
type NativeTranslator={translate:(text:string,options?:{signal?:AbortSignal})=>Promise<string>;destroy?:()=>void};
type NativeTranslatorFactory={create:(options:{sourceLanguage:string;targetLanguage:string;monitor:(monitor:{addEventListener:(name:string,callback:(event:{loaded:number;total?:number})=>void)=>void})=>void})=>Promise<NativeTranslator>};
type CacheEntry={source:string;text:string;engine:string};
export type TranslationPart={text:string;translate:boolean};

const CACHE_KEY='nybar-practice:translation:en-zh:v1';
const NATIVE_ENGINE='browser-en-zh-v1';
const WORKER_ENGINE='opus-mt-en-zh-transformers-3.8-q8-v1';
const MAX_CACHE_ENTRIES=120;
const MAX_CACHE_CHARACTERS=600_000;
const ENGINE_TIMEOUT=180_000;
const MODEL_TIMEOUT=600_000;
let cache:CacheEntry[]|undefined;
let nativePromise:Promise<NativeTranslator>|undefined;
let worker:Worker|undefined;
let requestId=0;
let queue:Promise<unknown>=Promise.resolve();
const nativeProgress=new Set<(progress:TranslationProgress)=>void>();

function aborted(){return new DOMException('翻译已取消。','AbortError');}
function checkSignal(signal?:AbortSignal){if(signal?.aborted)throw aborted();}
function validTranslation(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0;}

/** Keep every source character so paragraphs and long explanations cannot disappear. */
export function splitTranslationText(source:string,maxCharacters=320):TranslationPart[]{
 if(!Number.isInteger(maxCharacters)||maxCharacters<32)throw new Error('翻译分段长度必须至少为 32。');
 const parts:TranslationPart[]=[];
 for(const line of source.split(/(\r\n|\r|\n)/)){
  if(!line)continue;
  if(!line.trim()){parts.push({text:line,translate:false});continue;}
  const leading=line.match(/^\s+/)?.[0]??'';
  const trailing=line.match(/\s+$/)?.[0]??'';
  if(leading)parts.push({text:leading,translate:false});
  let remaining=line.slice(leading.length,line.length-trailing.length);
  while(remaining.length>maxCharacters){
   const window=remaining.slice(0,maxCharacters+1);
   const sentenceEnds=[...window.matchAll(/[.!?;:]\s+/g)].map(match=>match.index+1);
   const sentenceEnd=sentenceEnds.filter(index=>index>=maxCharacters/3&&index<=maxCharacters).at(-1);
   const space=window.lastIndexOf(' ',maxCharacters);
   let boundary=sentenceEnd??(space>=maxCharacters/3?space:maxCharacters);
   // Do not split a UTF-16 surrogate pair in unusual source text.
   if(/[\uD800-\uDBFF]/.test(remaining[boundary-1])&&/[\uDC00-\uDFFF]/.test(remaining[boundary]))boundary--;
   parts.push({text:remaining.slice(0,boundary),translate:true});
   remaining=remaining.slice(boundary);
   const gap=remaining.match(/^\s+/)?.[0];
   if(gap){parts.push({text:gap,translate:false});remaining=remaining.slice(gap.length);}
  }
  if(remaining)parts.push({text:remaining,translate:true});
  if(trailing)parts.push({text:trailing,translate:false});
 }
 return parts;
}

export function joinTranslationParts(parts:TranslationPart[],translations:string[]):string{
 let index=0;
 const result=parts.map(part=>{
  if(!part.translate)return part.text;
  const text=translations[index++];
  if(!validTranslation(text))throw new Error('翻译结果不完整，请重试。');
  return text.trim();
 }).join('');
 if(index!==translations.length)throw new Error('翻译分段数量不匹配，请重试。');
 return result;
}

function readCache(){
 if(cache)return cache;
 cache=[];
 try{
  const raw=localStorage.getItem(CACHE_KEY);
  if(!raw||raw.length>MAX_CACHE_CHARACTERS*2)return cache;
  const parsed:unknown=JSON.parse(raw);
  if(Array.isArray(parsed))cache=parsed.filter((entry):entry is CacheEntry=>{
   if(!entry||typeof entry!=='object')return false;
   const value=entry as Partial<CacheEntry>;
   return typeof value.source==='string'&&validTranslation(value.text)&&[NATIVE_ENGINE,WORKER_ENGINE].includes(value.engine??'');
  }).slice(-MAX_CACHE_ENTRIES);
 }catch{/* A disabled or full browser store must not prevent translation. */}
 return cache;
}

function cached(source:string){return readCache().findLast(entry=>entry.source===source)?.text;}
function saveCache(entries:CacheEntry[]){
 const values=readCache();
 for(const entry of entries){
  const previous=values.findIndex(value=>value.source===entry.source&&value.engine===entry.engine);
  if(previous>=0)values.splice(previous,1);
  values.push(entry);
 }
 let size=values.reduce((total,entry)=>total+entry.source.length+entry.text.length+entry.engine.length,0);
 while(values.length>MAX_CACHE_ENTRIES||size>MAX_CACHE_CHARACTERS){
  const first=values.shift();
  if(!first)break;
  size-=first.source.length+first.text.length+first.engine.length;
 }
 try{localStorage.setItem(CACHE_KEY,JSON.stringify(values));}catch{/* Keep the bounded memory cache only. */}
}

function waitFor<T>(promise:Promise<T>,signal?:AbortSignal,timeout:number|null=ENGINE_TIMEOUT,onTimeout?:()=>void):Promise<T>{
 checkSignal(signal);
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(action:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);action();};
  const cancel=()=>finish(()=>reject(aborted()));
  const timer=timeout===null?undefined:setTimeout(()=>finish(()=>{onTimeout?.();reject(new Error('翻译等待超时，请重试。'));}),timeout);
  signal?.addEventListener('abort',cancel,{once:true});
  promise.then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
 });
}

function prepareNative():Promise<NativeTranslator>|undefined{
 if(nativePromise)return nativePromise;
 const factory=(globalThis as typeof globalThis&{Translator?:NativeTranslatorFactory}).Translator;
 if(!factory)return;
 try{
  // Call create synchronously in the click handler's call chain, before any await.
  // Calling availability() first can consume the activation needed for download.
  const creation=factory.create({sourceLanguage:'en',targetLanguage:'zh-Hans',monitor(monitor){
   monitor.addEventListener('downloadprogress',event=>{
    const ratio=event.total?event.loaded/event.total:event.loaded;
    const completed=Math.max(0,Math.min(100,Math.round(ratio*100)));
    for(const callback of nativeProgress)callback({message:`正在准备浏览器翻译 · ${completed}%`,completed,total:100});
   });
  }});
  const pending=waitFor(creation,undefined,MODEL_TIMEOUT).catch(error=>{if(nativePromise===pending)nativePromise=undefined;throw error;});
  nativePromise=pending;
  // A queued/cancelled caller may stop waiting before model creation completes.
  void pending.catch(()=>{});
  return pending;
 }catch{return;}
}

function resetWorker(){worker?.terminate();worker=undefined;}

function translateInWorker(text:string,options:TranslationOptions):Promise<string>{
 checkSignal(options.signal);
 if(typeof Worker==='undefined')return Promise.reject(new Error('此浏览器无法运行内置翻译，请使用支持 Web Worker 的浏览器。'));
 const current=worker??(worker=new Worker(new URL('./translation-worker.ts',import.meta.url),{type:'module'}));
 const id=++requestId;
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(action:()=>void)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   current.removeEventListener('message',message);
   current.removeEventListener('error',failure);
   current.removeEventListener('messageerror',failure);
   options.signal?.removeEventListener('abort',cancel);
   action();
  };
  const fail=(error:Error)=>finish(()=>{resetWorker();reject(error);});
  const cancel=()=>fail(aborted());
  const failure=()=>fail(new Error('内置翻译暂时无法运行，请重试。'));
  const message=(event:MessageEvent<TranslationWorkerResponse>)=>{
   const value=event.data;
   if(value.id!==id)return;
   if(value.type==='progress')options.onProgress?.(value.progress);
   else if(value.type==='error')fail(new Error(value.message));
   else if(value.type==='result'){
    if(!validTranslation(value.text)){fail(new Error('未取得完整译文，请重试。'));return;}
    finish(()=>resolve(value.text));
   }
  };
  const timer=setTimeout(()=>fail(new Error('内置翻译下载或运行超时，请检查网络后重试。')),MODEL_TIMEOUT);
  current.addEventListener('message',message);
  current.addEventListener('error',failure);
  current.addEventListener('messageerror',failure);
  options.signal?.addEventListener('abort',cancel,{once:true});
  current.postMessage({id,text});
 });
}

/** English-to-Simplified-Chinese translation; source text never leaves the browser. */
export async function translateTexts(texts:Record<string,string>,options:TranslationOptions={}):Promise<Record<string,string>>{
 checkSignal(options.signal);
 const result:Record<string,string>={};
 const pending:Array<{key:string;source:string;parts:TranslationPart[]}>=[];
 for(const [key,source] of Object.entries(texts)){
  if(typeof source!=='string')throw new Error('翻译内容必须是文本。');
  if(!source.trim()){result[key]='';continue;}
  const stored=cached(source);
  if(stored!==undefined)result[key]=stored;
  else pending.push({key,source,parts:splitTranslationText(source)});
 }
 if(!pending.length)return result;
 const onProgress=(progress:TranslationProgress)=>{if(!options.signal?.aborted)options.onProgress?.(progress);};
 nativeProgress.add(onProgress);
 const native=prepareNative();
 onProgress({message:native?'正在准备浏览器翻译…':'首次使用需下载内置翻译模型；下载后可在本机翻译。'});
 const run=async()=>{
  checkSignal(options.signal);
  let translator:NativeTranslator|undefined;
  if(native){
   try{translator=await waitFor(native,options.signal,MODEL_TIMEOUT);}
   catch(error){checkSignal(options.signal);onProgress({message:'正在启用内置翻译模型；首次使用需要下载。'});}
  }
  const entries:CacheEntry[]=[];
  const total=pending.reduce((count,entry)=>count+entry.parts.filter(part=>part.translate).length,0);
  let completed=0;
  for(const entry of pending){
   const translated:string[]=[];
   let engine=translator?NATIVE_ENGINE:WORKER_ENGINE;
   for(const part of entry.parts){
    if(!part.translate)continue;
    checkSignal(options.signal);
    onProgress({message:`正在翻译 · ${completed} / ${total}`,completed,total});
    let text:string;
    if(translator){
     try{
      text=await waitFor(translator.translate(part.text,{signal:options.signal}),options.signal,ENGINE_TIMEOUT,()=>translator?.destroy?.());
      if(!validTranslation(text))throw new Error('浏览器未返回译文。');
     }catch(error){
      checkSignal(options.signal);
      translator.destroy?.();translator=undefined;nativePromise=undefined;engine=WORKER_ENGINE;
      onProgress({message:'正在启用内置翻译模型；首次使用需要下载。'});
      text=await translateInWorker(part.text,{...options,onProgress});
     }
    }else text=await translateInWorker(part.text,{...options,onProgress});
    if(!validTranslation(text))throw new Error('未取得完整译文，请重试。');
    translated.push(text);completed++;
   }
   const text=joinTranslationParts(entry.parts,translated);
   result[entry.key]=text;
   entries.push({source:entry.source,text,engine});
  }
  checkSignal(options.signal);
  saveCache(entries);
  onProgress({message:'翻译完成',completed:total,total});
  return result;
 };
 // Native and WASM work are both serial: only one model inference runs at a time.
 const task=queue.then(run,run);
 queue=task.catch(()=>{});
 try{return await waitFor(task,options.signal,null);}
 finally{nativeProgress.delete(onProgress);}
}
