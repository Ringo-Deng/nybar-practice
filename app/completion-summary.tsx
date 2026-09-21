'use client';

import {ArrowRight,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Session} from '@/lib/study-types';

export function CompletionSummary({session,label,busy,hasPendingMistakes,onNavigate,onRetry,onReturn}: {
 session:Session;
 label:string;
 busy:boolean;
 hasPendingMistakes:boolean;
 onNavigate:(index:number)=>void;
 onRetry:()=>void;
 onReturn:()=>void;
}){
 const ids=session.questionIds;
 const correct=session.score??0;
 const answered=ids.filter(id=>session.answers[id]?.selected).length;
 const wrong=answered-correct;
 const unanswered=ids.length-answered;
 const accuracy=ids.length?Math.round(correct/ids.length*100):0;

 return <section className="completion-summary" aria-labelledby="completion-title">
  <header className="completion-header">
   <div><h1 id="completion-title">{correct===ids.length&&ids.length?'这一组，全部答对':'本组练习完成'}</h1><p>{label} · 共 {ids.length} 题</p></div>
   <div className="completion-accuracy"><strong>{accuracy}<span>%</span></strong><span>本次正确率</span></div>
  </header>
  <section className="completion-results" aria-labelledby="completion-results-title">
   <div className="completion-results-head">
    <h2 id="completion-results-title">答题结果</h2>
    <div className="completion-counts"><span className="right"><i/>{correct} 答对</span><span className="wrong"><i/>{wrong} 答错</span>{unanswered>0&&<span><i/>{unanswered} 未答</span>}</div>
   </div>
   <div className="completion-question-grid">
    {ids.map((id,index)=>{
     const result=session.answers[id];
     const state=result?.selected?(result.correct?'right':'wrong'):'';
     const status=result?.selected?(result.correct?'答对':'答错'):'未答';
     return <button key={id} type="button" className={`q-chip ${state}`} disabled={busy} aria-label={`回顾第${index+1}题，${status}`} title={`第 ${index+1} 题 · ${status}`} onClick={()=>onNavigate(index)}>{String(index+1).padStart(2,'0')}</button>;
    })}
   </div>
  </section>
  <footer className="completion-actions">
   {hasPendingMistakes&&<Button onClick={onRetry} disabled={busy}><RotateCcw size={16}/>重练错题</Button>}
   <Button variant={hasPendingMistakes?'outline':'default'} disabled={busy} onClick={onReturn}>返回题库<ArrowRight size={16}/></Button>
  </footer>
 </section>;
}
