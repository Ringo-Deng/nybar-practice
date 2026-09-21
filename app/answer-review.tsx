'use client';
import {BookOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Question} from '@/lib/study-types';
import {explainLegalText,translateLegalLabel} from '@/lib/review-language';
import {linkedTextbooks,textbookById,type LinkedTextbookReference} from '@/lib/textbooks';
import {preloadTextbookPage} from '@/lib/textbook-pdf';
import {newglawNotesForQuestion} from '@/lib/newglaw-notes';
import {OriginalAnswerReview} from './original-answer-review';
import {NewglawKnowledgeNotes} from './newglaw-knowledge-notes';

function Terms({text,label=false}:{text:string;label?:boolean}){
 const readable=label?translateLegalLabel(text):explainLegalText(text);
 return <>{readable.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i} className="exam-term">{part.slice(2,-2)}</strong>:part)}</>;
}
export function AnswerReview({question:q,answer,onOpenTextbook}:{question:Question;answer:{selected:string;correct?:boolean};onOpenTextbook:(ref:LinkedTextbookReference)=>void}){
 const e=q.explanation,k=q.knowledge;
 if(!e)return null;
 if(e.kind==='publisher-original')return <OriginalAnswerReview question={q} onOpenTextbook={onOpenTextbook}/>;
 const warning=e.textbookReferences?e.warning:q.sourceId==='demo'&&k?k.warning.zh:e.warning;
 const newglawNotes=newglawNotesForQuestion(q);
 const hasQuickNotes=!!(k?.points.length||warning.trim());
 const bookRefs=linkedTextbooks(e.textbookReferences);
 return <article id="answer-review" className="answer-review compact-review" aria-label="答案解析与知识点回顾">
  <h2 className="sr-only">答案与解析</h2>
  <div className="review-body">
   <section id="reasoning" className="analysis-section answer-rationale"><h3>为什么选 {e.answer}</h3><p><Terms text={e.zh||e.en}/></p>{e.reasoningSteps&&<ol className="reasoning-steps">{e.reasoningSteps.map(step=><li key={step.title}><h4><Terms text={step.title}/></h4><p><Terms text={step.detail}/></p></li>)}</ol>}</section>
   {e.textbookExample&&<details className="textbook-example"><summary>用教材例子理解 · {e.textbookExample.title}</summary><div><p><b>教材情境</b><Terms text={e.textbookExample.facts}/></p><p><b>为什么</b><Terms text={e.textbookExample.lesson}/></p><p><b>回到本题</b><Terms text={e.textbookExample.connection}/></p></div></details>}
   {!!e.concepts?.length&&<section id="related-concepts" className="analysis-section related-concepts"><h3>相关概念与区别</h3><div className="concepts-table"><table><thead><tr><th scope="col">概念</th><th scope="col">规则与本题应用</th></tr></thead><tbody>{e.concepts.map(c=><tr key={c.term}><th scope="row"><Terms text={c.term} label/></th><td><Terms text={c.detail}/></td></tr>)}</tbody></table></div></section>}
   <section id="option-review" className="analysis-section"><h3>逐项分析</h3>{q.options.map(option=>{
    const correct=e.answer===option.id,selected=answer.selected===option.id;
    const status=`${correct?'正确选项':'错误选项'}${selected?'，你的选择':''}`;
    const analysis=e.options[option.id];
    return <div key={option.id} className={`option-analysis ${correct?'answer-option-correct':'answer-option-incorrect'}${selected?' answer-option-selected':''}`}><strong className="option-key" title={status}>{option.id}<span className="sr-only">，{status}</span></strong><p><Terms text={analysis?.zh||analysis?.en||option.en}/></p></div>;
   })}</section>
   {hasQuickNotes&&<section id="knowledge-review" className="quick-review" aria-labelledby="knowledge-heading"><h3 id="knowledge-heading"><BookOpen size={17}/>考点回顾</h3>{!!k?.points.length&&<ul>{k.points.map(p=><li key={p.term}><strong><Terms text={p.term} label/></strong><span><Terms text={p.zh}/></span></li>)}</ul>}{!!warning.trim()&&<p className="quick-warning"><b>易错点</b><Terms text={warning}/></p>}</section>}
   <NewglawKnowledgeNotes notes={newglawNotes}/>
  </div>
  <footer className="review-footer">
   {!!bookRefs.length&&<section className="textbook-access" aria-label="查阅本题对应教材">{bookRefs.map(ref=><Button key={ref.bookId} variant="outline" size="sm" className="textbook-link" title={`${ref.chapter} · PDF 第 ${ref.pageNumbers[0]} 页起`} onPointerEnter={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onFocus={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onClick={()=>onOpenTextbook(ref)}><BookOpen size={16}/>查阅 {textbookById(ref.bookId)!.shortTitle}</Button>)}</section>}
   <div className="review-topic-meta" aria-label="本题考点与标签"><div className="tested-topic">本题考查 · <Terms text={e.topic} label/></div>{!!q.topicTags?.length&&<div className="review-topic-tags">{q.topicTags.map(tag=><span key={tag}><Terms text={tag} label/></span>)}</div>}</div>
   <p className="review-source">{e.source||'题目解析'}</p>
  </footer>
 </article>;
}
