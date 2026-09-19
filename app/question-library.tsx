'use client';
import {useState} from 'react';
import {ArrowRight,Check,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {subjects,subjectById} from '@/lib/subjects';
import {questionSources,sourceById} from '@/lib/question-sources';
import {chapters,filterQuestions} from '@/lib/chapters';
import type {StudyData,Session} from '@/lib/study-types';

export function QuestionLibrary({data,busy,onStart,onResume}:{data:StudyData;busy:boolean;onStart:(subjectId?:string,sourceId?:string,chapterId?:string,sourceSet?:string)=>void;onResume:(session:Session)=>void}){
 const[source,setSource]=useState('all');
 const[chosen,setChosen]=useState<string|null>(null);
 const sourceQs=data.questions.filter(q=>source==='all'||q.sourceId===source);
 const subject=subjectById(chosen??undefined);
 const qs=sourceQs.filter(q=>q.subjectId===chosen);
 const sourceName=sourceById(source)?.name??'全部来源';
 const practiced=new Set(data.sessions.filter(s=>s.mode!=='exam'||s.status==='finished').flatMap(s=>Object.entries(s.answers).filter(([,a])=>a.selected).map(([id])=>id)));
 const exactSession=(items:typeof sourceQs)=>data.sessions.find(s=>s.status==='active'&&s.mode==='practice'&&s.questionIds.length===items.length&&s.questionIds.every(id=>items.some(q=>q.id===id)));
 const resume=exactSession(qs);
 const count=(id:string)=>sourceQs.filter(q=>q.subjectId===id).length;
 const sourceArg=source;
 const subjectChapters=chapters.filter(c=>c.subjectId===subject?.id);
 const chapterGroups=subjectChapters.reduce<{bookId:string;bookZh:string;bookEn:string;items:typeof subjectChapters}[]>((groups,chapter)=>{
  const existing=groups.find(group=>group.bookId===chapter.bookId);
  if(existing)existing.items.push(chapter);
  else groups.push({bookId:chapter.bookId,bookZh:chapter.bookZh,bookEn:chapter.bookEn,items:[chapter]});
  return groups;
 },[]);
 return <div className="library-page">
  <div className="library-title"><div className="eyebrow">NEW YORK BAR · MBE</div><h1>题库分类</h1><p>按来源和科目，开始今天的练习。</p></div>
  <section className="source-section" aria-label="题目来源">
   <h2>题目来源</h2>
   <div className="source-grid">{[{id:'all',name:'全部来源',description:'跨来源练习'},...questionSources].map(s=>{const total=data.questions.filter(q=>s.id==='all'||q.sourceId===s.id).length;return <button key={s.id} type="button" aria-pressed={source===s.id} className={`source-card ${source===s.id?'active':''}`} onClick={()=>{setSource(s.id);setChosen(null);}}><span>{s.name}{source===s.id&&<Check size={16}/>}</span><small>{total?`${total} 题`:'待导入'}</small></button>;})}</div>
   {!sourceQs.length&&<p className="source-empty">题库尚未导入。后续加入题目后，会按来源和 MBE 科目显示在这里。</p>}
  </section>
  <div className="library-toolbar"><h2>MBE · 七个科目</h2><span className="library-hint">当前来源：{sourceName}</span></div>
  <div className="subject-grid">{subjects.map(s=><button type="button" key={s.id} className={`subject-card ${s.id===chosen?'active':''}`} aria-pressed={s.id===chosen} onClick={()=>{setChosen(s.id);requestAnimationFrame(()=>document.getElementById('subject-detail')?.scrollIntoView({block:'start'}));}}><div className="subject-top"><h3>{s.zh}</h3>{count(s.id)>0?<span className="subject-available">{count(s.id)} 题可练</span>:<span className="subject-empty">待导入</span>}</div><p className="subject-en" lang="en">{s.en}</p><div className="subject-bottom"><span>{count(s.id)>0?`${sourceQs.filter(q=>q.subjectId===s.id&&practiced.has(q.id)).length} / ${count(s.id)} 题已练`:'0 题'}</span>{s.id===chosen?<Check size={16}/>:<ChevronRight size={16}/>}</div></button>)}</div>
  {subject&&<section id="subject-detail" className="subject-detail" aria-live="polite"><div className="subject-detail-heading"><div><div className="eyebrow">{subject.group} / {sourceName}</div><h2>{subject.zh}<span>{qs.length} 题</span></h2></div>{qs.length>0&&<div className="subject-actions">{resume&&<Button disabled={busy} variant="outline" onClick={()=>onResume(resume)}>继续上次练习</Button>}<Button disabled={busy} onClick={()=>onStart(subject.id,sourceArg)}>开始本科练习<ArrowRight size={16}/></Button></div>}</div>
   {!qs.length&&<div className="subject-empty-state"><div><h3>本科题目待导入</h3><p>{subject.scope}</p></div></div>}
   {qs.some(q=>q.chapterId)&&!!chapterGroups.length&&<div className="chapter-section compact-chapter-section">{chapterGroups.map(group=><section className="chapter-book" key={group.bookId} aria-label={group.bookZh}><div className="chapter-grid">{group.items.map(c=>{const items=filterQuestions(qs,{chapterId:c.id});const previous=exactSession(items);return <div className={`chapter-card ${items.length?'':'chapter-empty'}`} key={c.id}><span className="chapter-number">{String(c.number).padStart(2,'0')}</span><div className="chapter-copy"><h4>{c.zh}</h4><p lang="en">{c.en}</p><small>{items.length?`${items.filter(q=>practiced.has(q.id)).length} / ${items.length} 题已练`:'暂无题目'}</small></div><div className="chapter-actions">{previous&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>onResume(previous)}>继续</Button>}<Button size="sm" variant="outline" disabled={busy||!items.length} onClick={()=>onStart(subject.id,sourceArg,c.id)} aria-label={`练习${group.bookZh}第${c.number}章${c.zh}`}>{items.length?`练习 ${items.length} 题`:'待导入'}</Button></div></div>;})}</div></section>)}</div>}
  </section>}
  <p className="library-footnote">当前练习范围：传统 UBE 的 MBE 选择题。题目来源分类不代表已收录题目。<br/><a href="https://www.ncbex.org/exams/mbe/preparing-mbe" target="_blank" rel="noreferrer">NCBE 考试范围与官方样题</a></p>
 </div>;
}
