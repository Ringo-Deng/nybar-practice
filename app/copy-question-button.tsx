'use client';
import {useRef,useState} from 'react';
import {Copy,Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {formatQuestionForCopy} from '@/lib/question-copy';
import type {Question} from '@/lib/study-types';

export function CopyQuestionButton({question,selected,includeAnswer,disabled=false}:{question:Question;selected:string;includeAnswer:boolean;disabled?:boolean}){
 const[copying,setCopying]=useState(false);
 const[manualText,setManualText]=useState('');
 const textRef=useRef<HTMLTextAreaElement>(null);
 const buttonRef=useRef<HTMLButtonElement>(null);

 async function copyQuestion(){
  const text=formatQuestionForCopy(question,{selected,includeAnswer});
  setCopying(true);
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
   await navigator.clipboard.writeText(text);
   toast.success('已复制本题，可粘贴后补充你的疑问');
  }catch{
   setManualText(text);
  }finally{
   setCopying(false);
  }
 }

 return <>
  <Button ref={buttonRef} type="button" variant="ghost" size="sm" disabled={disabled||copying} onClick={()=>void copyQuestion()} title="复制本题及已显示的答案解析，用于提问">{copying?<Loader2 size={16} className="animate-spin"/>:<Copy size={16}/>}复制本题</Button>
  <Dialog open={!!manualText} onOpenChange={open=>{if(!open)setManualText('');}}>
   <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={event=>{event.preventDefault();textRef.current?.focus();textRef.current?.select();}} onCloseAutoFocus={event=>{event.preventDefault();buttonRef.current?.focus();}}>
    <DialogHeader><DialogTitle>复制本题</DialogTitle><DialogDescription>自动复制未完成，请选中下方文字后手动复制，再粘贴到提问窗口。</DialogDescription></DialogHeader>
    <Textarea ref={textRef} aria-label="本题提问材料" readOnly value={manualText} className="h-[50vh] resize-none overflow-y-auto [field-sizing:fixed]"/>
    <DialogFooter><Button variant="outline" onClick={()=>{textRef.current?.focus();textRef.current?.select();}}>全选文字</Button><Button onClick={()=>setManualText('')}>关闭</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </>;
}
