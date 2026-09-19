import {env,pipeline,type PretrainedModelOptions} from '@huggingface/transformers';
import wasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import wasmModuleUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import type {TranslationWorkerRequest,TranslationWorkerResponse} from './translation-types';

// A single WASM thread also works on hosts without cross-origin isolation.
env.allowLocalModels=false;
if(env.backends.onnx.wasm){
 env.backends.onnx.wasm.numThreads=1;
 env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths={wasm:new URL(wasmUrl,self.location.href).href,mjs:new URL(wasmModuleUrl,self.location.href).href};
}

const scope=self as unknown as {
 postMessage:(message:TranslationWorkerResponse)=>void;
 addEventListener:(name:'message',callback:(event:MessageEvent<TranslationWorkerRequest>)=>void)=>void;
};
type ModelTranslator=(text:string,options:{max_new_tokens:number;num_beams:number;do_sample:boolean})=>Promise<Array<{translation_text:string}|Array<{translation_text:string}>>>;
// v3's generated types expose all task overloads and require the full generation
// config. This narrow adapter matches the documented translation pipeline API.
const createPipeline=pipeline as unknown as (task:'translation',model:string,options:PretrainedModelOptions)=>Promise<ModelTranslator>;
let translator:Promise<ModelTranslator>|undefined;
let queue:Promise<unknown>=Promise.resolve();

async function translate({id,text}:TranslationWorkerRequest){
 try{
  if(!translator){
   scope.postMessage({id,type:'progress',progress:{message:'正在下载内置翻译模型；首次使用可能需要几分钟。'}});
   translator=createPipeline('translation','Xenova/opus-mt-en-zh',{
    device:'wasm',dtype:'q8',
    progress_callback:(event)=>{
     if(event.status==='progress'){
      const percent=Math.max(0,Math.min(100,Math.round(event.progress)));
      scope.postMessage({id,type:'progress',progress:{message:`正在下载翻译模型文件 · ${percent}%`,completed:percent,total:100}});
     }else if(event.status==='ready')scope.postMessage({id,type:'progress',progress:{message:'翻译模型已就绪，正在生成中文…'}});
    },
   });
  }
  const translate=await translator;
  // Short, lossless source chunks keep input below Marian's context window.
  // OPUS English-to-Chinese requires a target-language token; select Mandarin
  // in Simplified Chinese explicitly instead of allowing mixed scripts.
  const output=await translate(`>>cmn_Hans<< ${text}`,{max_new_tokens:512,num_beams:1,do_sample:false});
  const first=output[0];
  const result=Array.isArray(first)?first[0]?.translation_text:first?.translation_text;
  if(typeof result!=='string'||!result.trim())throw new Error('翻译模型未返回完整译文，请重试。');
  scope.postMessage({id,type:'result',text:result.trim()});
 }catch{
  translator=undefined;
  scope.postMessage({id,type:'error',message:'内置翻译暂时不可用，请检查网络或浏览器存储空间后重试。'});
 }
}

scope.addEventListener('message',event=>{
 // Defensive serialization even if another caller sends several jobs at once.
 queue=queue.then(()=>translate(event.data),()=>translate(event.data));
});
