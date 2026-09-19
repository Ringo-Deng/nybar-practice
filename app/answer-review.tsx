'use client';
import {ArrowUp,BookOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Question} from '@/lib/study-types';
import {chapterById} from '@/lib/chapters';
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
 if(e.kind==='publisher-original')return <OriginalAnswerReview question={q} answer={answer} onOpenTextbook={onOpenTextbook}/>;
 const warning=e.textbookReferences?e.warning:q.sourceId==='demo'&&k?k.warning.zh:e.warning;
 const newglawNotes=newglawNotesForQuestion(q);
 const hasQuickNotes=!!(k?.points.length||warning.trim());
 const chapter=chapterById(q.chapterId);
 const bookRefs=linkedTextbooks(e.textbookReferences);
 return <article id="answer-review" className="answer-review" aria-label="答案解析与知识点回顾">
  <h2 className="sr-only">答案与解析</h2>
  <div className="review-body">
   <nav className="review-jumps" aria-label="解析章节"><a href="#reasoning">为什么选 {e.answer}</a>{e.concepts?.length&&<a href="#related-concepts">概念与区别</a>}<a href="#option-review">逐项分析</a>{hasQuickNotes&&<a href="#knowledge-review"><BookOpen size={14}/>考点回顾</a>}{!!newglawNotes.length&&<a href="#newglaw-knowledge"><BookOpen size={14}/>补充要点</a>}</nav>
   {chapter&&<div className="review-chapter"><span>第 {chapter.number} 章 · {chapter.zh}</span>{q.relatedChapterIds?.map(id=>{const c=chapterById(id);return c?<span key={id}>关联：第 {c.number} 章 {c.zh}</span>:null;})}</div>}
   {!!q.topicTags?.length&&<div className="review-topic-tags">{q.topicTags.map(tag=><span key={tag}><Terms text={tag} label/></span>)}</div>}
   <section id="reasoning" className="analysis-section answer-rationale"><div className="tested-topic">本题考查 · <Terms text={e.topic} label/></div><h3>为什么选 {e.answer}</h3><p><Terms text={e.zh||e.en}/></p>{e.reasoningSteps&&<ol className="reasoning-steps">{e.reasoningSteps.map(step=><li key={step.title}><h4><Terms text={step.title}/></h4><p><Terms text={step.detail}/></p></li>)}</ol>}</section>
   {e.textbookExample&&<details className="textbook-example"><summary>用教材例子理解 · {e.textbookExample.title}</summary><div><p><b>教材情境</b><Terms text={e.textbookExample.facts}/></p><p><b>为什么</b><Terms text={e.textbookExample.lesson}/></p><p><b>回到本题</b><Terms text={e.textbookExample.connection}/></p><small>根据所列教材归纳，非原文引用。</small></div></details>}
   {!!e.concepts?.length&&<section id="related-concepts" className="analysis-section related-concepts"><h3>相关概念与区别</h3><div className="concepts-table"><table><thead><tr><th scope="col">概念</th><th scope="col">规则与本题应用</th></tr></thead><tbody>{e.concepts.map(c=><tr key={c.term}><th scope="row"><Terms text={c.term} label/></th><td><Terms text={c.detail}/></td></tr>)}</tbody></table></div></section>}
   <section id="option-review" className="analysis-section"><h3>逐项分析</h3>{q.options.map(o=><div key={o.id} className={`option-analysis ${e.answer===o.id?'answer-option-correct':''}`}><strong className={e.answer===o.id?'option-key':''}>{o.id}</strong><div><span className="option-verdict">{e.answer===o.id?'正确':'不选'}{answer.selected===o.id?' · 你的选择':''}</span><p><Terms text={e.options[o.id].zh||e.options[o.id].en}/></p></div></div>)}</section>
   {hasQuickNotes&&<section id="knowledge-review" className="quick-review" aria-labelledby="knowledge-heading"><h3 id="knowledge-heading"><BookOpen size={17}/>考点回顾</h3>{!!k?.points.length&&<ul>{k.points.map(p=><li key={p.term}><strong><Terms text={p.term} label/></strong><span><Terms text={p.zh}/></span></li>)}</ul>}{!!warning.trim()&&<p className="quick-warning"><b>易错点</b><Terms text={warning}/></p>}</section>}
   <NewglawKnowledgeNotes notes={newglawNotes}/>
   {!!e.textbookReferences?.length&&<details className="textbook-references"><summary>教材依据 · 章节与页码</summary><p>页码均为上传文件的 PDF 页序（从封面起算），不一定等于书内印刷页码。以所标注的教材版本为准。</p><ul>{e.textbookReferences.map((ref,i)=><li key={i}><strong>{ref.book}</strong><span>{ref.chapter} · {ref.pages.includes('PDF')?ref.pages:`PDF 第 ${ref.pages} 页`}</span><span>{ref.section}</span></li>)}</ul></details>}
  </div>
  <footer className="review-footer">
   {!!bookRefs.length&&<section className="textbook-access" aria-label="查阅本题对应教材">{bookRefs.map(ref=><Button key={ref.bookId} variant="outline" size="sm" className="textbook-link" title={`${ref.chapter} · PDF 第 ${ref.pageNumbers[0]} 页起`} onPointerEnter={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onFocus={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onClick={()=>onOpenTextbook(ref)}><BookOpen size={16}/>查阅 {textbookById(ref.bookId)!.shortTitle}</Button>)}</section>}
   <Button variant="ghost" size="sm" className="back-to-question" onClick={()=>document.getElementById('current-question')?.scrollIntoView({block:'start'})}><ArrowUp size={14}/>回到题目</Button>
   <p className="review-source">{e.source || "题目解析"}</p>
  </footer>
 </article>;
}
