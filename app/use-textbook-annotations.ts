'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {validAnnotationRects,type TextbookAnnotation,type TextbookAnnotationData} from '@/lib/textbook-annotations';

const GUEST_ANNOTATIONS_KEY='nybar-practice:guest-textbook-annotations:v1';
function readGuestAnnotations(){
 try{const value=JSON.parse(localStorage.getItem(GUEST_ANNOTATIONS_KEY)??'[]');return Array.isArray(value)?value as TextbookAnnotation[]:[];}catch{return [];}
}
function writeGuestAnnotations(annotations:TextbookAnnotation[]){try{localStorage.setItem(GUEST_ANNOTATIONS_KEY,JSON.stringify(annotations));}catch{throw new Error('浏览器无法保存教材批注，请检查是否允许本站使用本机存储。');}}
function guestAnnotations(body?:Record<string,unknown>):TextbookAnnotationData{
 const annotations=readGuestAnnotations().sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 if(!body)return {annotations};
 if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new Error('教材笔记编号无效。');
 const index=annotations.findIndex(item=>item.id===body.id),existing=index>=0?annotations[index]:undefined,now=Date.now();
 if(body.action==='add'||body.action==='edit'){
  if(typeof body.bookId!=='string'||!Number.isInteger(body.page)||Number(body.page)<1)throw new Error('请选择有效的教材与页码。');
  if(typeof body.quote!=='string'||!body.quote.trim()||body.quote.length>8000||typeof body.note!=='string'||body.note.length>10000||body.color!=='yellow'||!validAnnotationRects(body.rects))throw new Error('请选择教材文字；高亮原文最多8,000字，笔记最多10,000字。');
  if(body.action==='edit'){
   if(!existing)throw new Error('这条教材笔记已被删除，请刷新后重试。');
   if(body.revision!==existing.revision)throw new Error('这条教材笔记已更新，请刷新后重新编辑。');
   annotations[index]={...existing,bookId:body.bookId,page:Number(body.page),quote:body.quote.trim().replace(/\s+/g,' '),note:body.note.trim(),rects:body.rects,sourceQuestionId:typeof body.sourceQuestionId==='string'?body.sourceQuestionId:null,updatedAt:now,revision:existing.revision+1};
  }else if(!existing)annotations.unshift({id:body.id,bookId:body.bookId,page:Number(body.page),quote:body.quote.trim().replace(/\s+/g,' '),note:body.note.trim(),color:'yellow',rects:body.rects,sourceQuestionId:typeof body.sourceQuestionId==='string'?body.sourceQuestionId:null,createdAt:now,updatedAt:now,revision:0});
 }else if(body.action==='delete'){
  if(!existing)return {annotations};
  if(body.revision!==existing.revision)throw new Error('这条教材笔记已更新，请刷新后重试。');
  annotations.splice(index,1);
 }else throw new Error('未知操作。');
 writeGuestAnnotations(annotations);return {annotations};
}
export function useTextbookAnnotations(guest=false){
 const[data,setData]=useState<TextbookAnnotationData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const locked=useRef(false),generation=useRef(0);
 const request=useCallback(async(body?:Record<string,unknown>)=>{
  if(guest)return guestAnnotations(body);
  const response=await fetch('/api/textbook-annotations',body?{method:'POST',headers:{'Content-Type':'application/json','X-Study-Action':'1'},body:JSON.stringify(body)}:{cache:'no-store'});
  const value=await response.json() as TextbookAnnotationData&{error?:string};
  if(!response.ok)throw new Error(value.error||'暂时无法读取教材笔记，请重试。');
  return value;
 },[guest]);
 const load=useCallback(async()=>{
  if(locked.current)return;const run=++generation.current;setLoading(true);
  try{const value=await request();if(run===generation.current){setData(value);setError('');}}
  catch(e){if(run===generation.current)setError((e as Error).message);}
  finally{if(run===generation.current)setLoading(false);}
 },[request]);
 const mutate=useCallback(async(body:Record<string,unknown>)=>{
  if(locked.current)return;locked.current=true;++generation.current;setLoading(false);setBusy(true);setError('');
  try{const value=await request(body);setData(value);return value;}
  catch(e){setError((e as Error).message);toast.error((e as Error).message);return undefined;}
  finally{locked.current=false;setBusy(false);}
 },[request]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[load]);
 return {data,loading,busy,error,load,mutate};
}
export type TextbookAnnotationsController=ReturnType<typeof useTextbookAnnotations>;
