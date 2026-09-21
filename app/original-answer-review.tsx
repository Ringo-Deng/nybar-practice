'use client';
import {useState} from 'react';
import {BookOpen,Languages} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Question,SourceImage} from '@/lib/study-types';
import {linkedTextbooks,textbookById,type LinkedTextbookReference} from '@/lib/textbooks';
import {preloadTextbookPage} from '@/lib/textbook-pdf';
import {newglawNotesForQuestion} from '@/lib/newglaw-notes';
import {NewglawKnowledgeNotes} from './newglaw-knowledge-notes';
import {sourceById} from '@/lib/question-sources';
import {subjectById} from '@/lib/subjects';
import {staticTranslation} from './static-translation';
import {TranslationStatus} from './translation-status';
import {PublisherExplanation} from './publisher-explanation';

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
 const english=e.en.trim();
 const subject=subjectById(q.subjectId);
 const translation=staticTranslation({
  body:{en:english,zh:e.zh},
  topic:{en:e.topic,zh:e.topicZh??(e.topic===subject?.en?subject.zh:undefined)},
 });
 const storedZh=(translation.values.body??'').trim();
 const layoutImages=(e.images??[]).filter(image=>image.src.includes('-original-layout.'));
 const figureImages=(e.images??[]).filter(image=>!image.src.includes('-original-layout.'));
 function toggleLanguage(){setZhQuestionId(showZh?null:q.id);}
 return <article id="answer-review" className="answer-review publisher-review" aria-label="原书答案与解析">
  <h2 className="sr-only">原书答案与解析</h2>
  <div className="review-body">
   {e.warning&&<p className="source-review-note">{e.warning}</p>}
   {(!!english||!!storedZh)&&<div className="review-language-control"><Button variant="ghost" size="sm" aria-pressed={showZh} onClick={toggleLanguage}><Languages size={16}/> {showZh?'显示英文':'显示中文'}</Button></div>}
   {showZh&&<TranslationStatus translation={translation}/>}
   {!!layoutImages.length&&<div className="publisher-layout"><SourceImages images={layoutImages} label="原书图表与版面"/><p>图表、列表的布局以原书页面为准；下方文字从 PDF 提取。</p></div>}
   {!!figureImages.length&&<SourceImages images={figureImages} label="原书图示"/>}
   {showZh&&storedZh?<section className="analysis-section original-analysis" lang="zh-CN"><div className="tested-topic">本题考查：{translation.values.topic||e.topic}</div><PublisherExplanation text={storedZh} hasLayout={!!layoutImages.length}/></section>:<section className="analysis-section original-analysis" lang="en"><div className="tested-topic">Area of law assessed: {e.topic}</div><PublisherExplanation text={english} hasLayout={!!layoutImages.length}/></section>}
   <NewglawKnowledgeNotes notes={newglawNotes}/>
  </div>
  <footer className="review-footer">
   {!!refs.length&&<section className="textbook-access" aria-label="查阅对应教材">{refs.map(ref=><Button key={ref.bookId} variant="outline" size="sm" className="textbook-link" title={`${ref.chapter} · PDF 第 ${ref.pageNumbers[0]} 页起`} onPointerEnter={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onFocus={()=>preloadTextbookPage(textbookById(ref.bookId)!,ref.pageNumbers[0])} onClick={()=>onOpenTextbook(ref)}><BookOpen size={16}/>查阅 {textbookById(ref.bookId)!.shortTitle}</Button>)}</section>}
   <p className="review-source">答案与解析：{q.sourceTitle??e.source??sourceById(q.sourceId)?.name}{!!e.originalPdfPages?.length&&` · PDF 第 ${e.originalPdfPages.join('、')} 页`}</p>
  </footer>
 </article>;
}
