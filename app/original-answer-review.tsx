'use client';
import {useState} from 'react';
import {BookOpen,Languages} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Question,SourceImage} from '@/lib/study-types';
import {linkedTextbooks,textbookById,type LinkedTextbookReference} from '@/lib/textbooks';
import {preloadTextbookPage} from '@/lib/textbook-pdf';
import {newglawNotesForQuestion} from '@/lib/newglaw-notes';
import {NewglawKnowledgeNotes} from './newglaw-knowledge-notes';
import {normalizeExplanationText} from '@/lib/question-text';
import {sourceById} from '@/lib/question-sources';
import {subjectById} from '@/lib/subjects';
import {useTranslation} from './use-translation';
import {TranslationStatus} from './translation-status';

export function SourceImages({images,label}:{images:SourceImage[];label:string}){
 const assetUrl=(src:string)=>typeof document==='undefined'?src:new URL(src.replace(/^\/+/,''),new URL(import.meta.env.BASE_URL,document.baseURI)).toString();
 return <section className="source-images" aria-label={label}><h3>{label}</h3>{images.map((image,index)=><figure className="source-image" key={`${image.src}-${index}`}><a href={assetUrl(image.src)} target="_blank" rel="noreferrer" aria-label={`${image.alt}，打开原图`}><img src={assetUrl(image.src)} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async"/></a><figcaption>PDF 第 {image.sourcePage} 页 · <span>点击查看原图</span></figcaption></figure>)}</section>;
}

export function OriginalAnswerReview({question:q,onOpenTextbook}:{question:Question;onOpenTextbook:(ref:LinkedTextbookReference)=>void}){
 const e=q.explanation!;
 const refs=linkedTextbooks(e.textbookReferences);
 const newglawNotes=newglawNotesForQuestion(q);
 const[zhQuestionId,setZhQuestionId]=useState<string|null>(null);
 const showZh=zhQuestionId===q.id;
 const english=normalizeExplanationText(e.en);
 const subject=subjectById(q.subjectId);
 const translation=useTranslation(`${q.id}:explanation`,{
  body:{en:english,zh:normalizeExplanationText(e.zh)},
  topic:{en:e.topic,zh:e.topic===subject?.en?subject.zh:undefined},
 });
 const storedZh=normalizeExplanationText(translation.values.body??'');
 function toggleLanguage(){if(showZh){translation.cancel();setZhQuestionId(null);}else{setZhQuestionId(q.id);void translation.load();}}
 return <article id="answer-review" className="answer-review publisher-review" aria-label="原书答案与解析">
  <h2 className="sr-only">原书答案与解析</h2>
  <div className="review-body">
   {e.warning&&<p className="source-review-note">{e.warning}</p>}
   {(!!english||!!storedZh)&&<div className="review-language-control"><Button variant="ghost" size="sm" aria-pressed={showZh} onClick={toggleLanguage}><Languages size={16}/> {showZh?'显示英文':'显示中文'}</Button></div>}
   {showZh&&<TranslationStatus translation={translation}/>}
   {showZh&&storedZh?<section className="analysis-section original-analysis" lang="zh-CN"><div className="tested-topic">本题考查：{translation.values.topic||e.topic}</div>{storedZh.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>:<section className="analysis-section original-analysis" lang="en"><div className="tested-topic">Area of law assessed: {e.topic}</div>{english.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>}
   {!!e.images?.length&&<SourceImages images={e.images} label="原文图表"/>}
   <NewglawKnowledgeNotes notes={newglawNotes}/>
  </div>
  <footer className="review-footer">
   {!!refs.length&&<section className="textbook-access" aria-label="查阅对应教材">{refs.map(ref=><Button key={ref.bookId} variant="outline" size="sm" className="textbook-link" title={`${ref.chapter} · PDF 第 ${ref.pageNumbers[0]} 页起`} onPointerEnter={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onFocus={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onClick={()=>onOpenTextbook(ref)}><BookOpen size={16}/>查阅 {textbookById(ref.bookId)!.shortTitle}</Button>)}</section>}
   <p className="review-source">答案与解析：{q.sourceTitle??e.source??sourceById(q.sourceId)?.name}{!!e.originalPdfPages?.length&&` · PDF 第 ${e.originalPdfPages.join('、')} 页`}</p>
  </footer>
 </article>;
}
