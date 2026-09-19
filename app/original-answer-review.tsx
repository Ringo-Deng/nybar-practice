'use client';
import {useState} from 'react';
import {ArrowUp,BookOpen,Languages} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Question} from '@/lib/study-types';
import {linkedTextbooks,textbookById,type LinkedTextbookReference} from '@/lib/textbooks';
import {preloadTextbookPage} from '@/lib/textbook-pdf';
import {newglawNotesForQuestion} from '@/lib/newglaw-notes';
import {NewglawKnowledgeNotes} from './newglaw-knowledge-notes';
import {normalizeExplanationText} from '@/lib/question-text';
import {sourceById} from '@/lib/question-sources';

export function OriginalAnswerReview({question:q,onOpenTextbook}:{question:Question;onOpenTextbook:(ref:LinkedTextbookReference)=>void}){
 const e=q.explanation!;
 const refs=linkedTextbooks(e.textbookReferences);
 const newglawNotes=newglawNotesForQuestion(q);
 const[showZh,setShowZh]=useState(false);
 const english=normalizeExplanationText(e.en);
 const storedZh=normalizeExplanationText(e.zh);
 return <article id="answer-review" className="answer-review publisher-review" aria-label="原书答案与解析">
  <h2 className="sr-only">原书答案与解析</h2>
  <div className="review-body">
   {!!english&&!!storedZh&&<div className="review-language-control"><Button variant="ghost" size="sm" aria-pressed={showZh} onClick={()=>setShowZh(value=>!value)}><Languages size={16}/> {showZh?'显示英文':'显示中文'}</Button></div>}
   {showZh&&storedZh?<section className="analysis-section original-analysis" lang="zh-CN">{storedZh.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>:<section className="analysis-section original-analysis" lang="en"><div className="tested-topic">Area of law assessed: {e.topic}</div>{english.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>}
   <NewglawKnowledgeNotes notes={newglawNotes}/>
  </div>
  <footer className="review-footer">
   {!!refs.length&&<section className="textbook-access" aria-label="查阅对应教材">{refs.map(ref=><Button key={ref.bookId} variant="outline" size="sm" className="textbook-link" title={`${ref.chapter} · PDF 第 ${ref.pageNumbers[0]} 页起`} onPointerEnter={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onFocus={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onClick={()=>onOpenTextbook(ref)}><BookOpen size={16}/>查阅 {textbookById(ref.bookId)!.shortTitle}</Button>)}</section>}
   <Button variant="ghost" size="sm" className="back-to-question" onClick={()=>document.getElementById('current-question')?.scrollIntoView({block:'start'})}><ArrowUp size={14}/>回到题目</Button>
   <p className="review-source">答案与解析：{q.sourceTitle??e.source??sourceById(q.sourceId)?.name}{!!e.originalPdfPages?.length&&` · PDF 第 ${e.originalPdfPages.join('、')} 页`}</p>
  </footer>
 </article>;
}
