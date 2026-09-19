'use client';
import {useEffect,useRef,useState} from 'react';
import {translateTexts,type TranslationProgress} from '@/lib/translation';

export type TranslationFields=Record<string,{en:string;zh?:string}>;
type TranslationState={key:string;values:Record<string,string>;status:'idle'|'loading'|'ready'|'error';message:string};

export function useTranslation(id:string,fields:TranslationFields,enabled=true){
 const key=JSON.stringify([id,fields]);
 const currentKey=useRef(key);currentKey.current=key;
 const request=useRef<AbortController|null>(null);
 const [state,setState]=useState<TranslationState|null>(null);
 const existing=Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.zh?.trim()??'']));
 const current=state?.key===key?state:null;
 const values={...existing,...current?.values};
 const needsTranslation=Object.values(fields).some(field=>field.en.trim()&&!field.zh?.trim());

 useEffect(()=>{
  if(!enabled)setState(value=>value?.status==='loading'?null:value);
  return()=>{request.current?.abort();request.current=null;};
 },[key,enabled]);

 function cancel(){
  request.current?.abort();request.current=null;
  setState(value=>value?.key===key&&value.status==='loading'?null:value);
 }

 async function load(){
  if(!enabled)return;
  if(current?.status==='ready')return;
  request.current?.abort();
  const controller=new AbortController();request.current=controller;
  const missing=Object.fromEntries(Object.entries(fields).filter(([,field])=>field.en.trim()&&!field.zh?.trim()).map(([name,field])=>[name,field.en]));
  const valid=()=>!controller.signal.aborted&&request.current===controller&&currentKey.current===key;
  const progress=(value:TranslationProgress)=>{if(valid())setState({key,values:existing,status:'loading',message:value.message});};
  setState({key,values:existing,status:'loading',message:'正在准备中文翻译…'});
  try{
   // Start immediately in the click handler so native translation can request its language pack.
   const translated=await translateTexts(missing,{signal:controller.signal,onProgress:progress});
   if(valid())setState({key,values:{...existing,...translated},status:'ready',message:''});
  }catch(error){
   if(valid())setState({key,values:existing,status:'error',message:error instanceof Error?error.message:'翻译暂时不可用，请重试。'});
  }
 }

 return {values,status:current?.status??'idle',message:current?.message??'',needsTranslation,load,cancel};
}
