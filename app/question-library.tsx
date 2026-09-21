'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,BookOpen,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {subjects,subjectById} from '@/lib/subjects';
import {questionSources,sourceById} from '@/lib/question-sources';
import {chapters,filterQuestions} from '@/lib/chapters';
import {defaultLibrarySelection,readLibrarySelection,writeLibrarySelection,type LibrarySelection} from '@/lib/library-selection';
import {getLibraryResume} from '@/lib/library-resume';
import type {StudyData,Session} from '@/lib/study-types';

export function QuestionLibrary({data,busy,onStart,onResume}:{data:StudyData;busy:boolean;onStart:(subjectId?:string,sourceId?:string,chapterId?:string)=>void;onResume:(session:Session)=>void}){
 const[{source,chosen},setSelection]=useState(defaultLibrarySelection);
 useEffect(()=>{
  // Restore after hydration so initial browser and server markup stay aligned.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setSelection(readLibrarySelection());
 },[]);
 const choose=(selection:LibrarySelection)=>{setSelection(selection);writeLibrarySelection(selection);};
 const lastPractice=getLibraryResume(data);
 const sourceQs=data.questions.filter(question=>source==='all'||question.sourceId===source);
 const subject=subjectById(chosen??undefined);
 const qs=sourceQs.filter(question=>question.subjectId===chosen);
 const sourceName=sourceById(source)?.name??'全部来源';
 const practiced=new Set(data.sessions.filter(session=>session.mode!=='exam'||session.status==='finished').flatMap(session=>Object.entries(session.answers).filter(([,answer])=>answer.selected).map(([id])=>id)));
 const exactSession=(items:typeof sourceQs)=>{const ids=new Set(items.map(item=>item.id));return data.sessions.find(session=>session.status==='active'&&session.mode==='practice'&&session.questionIds.length===ids.size&&session.questionIds.every(id=>ids.has(id)));};
 const resume=exactSession(qs);
 const count=(id:string)=>sourceQs.filter(question=>question.subjectId===id).length;
 const subjectChapters=chapters.filter(chapter=>chapter.subjectId===subject?.id);
 const chapterGroups=subjectChapters.reduce<{bookId:string;bookZh:string;bookEn:string;items:typeof subjectChapters}[]>((groups,chapter)=>{
  const existing=groups.find(group=>group.bookId===chapter.bookId);
  if(existing)existing.items.push(chapter);
  else groups.push({bookId:chapter.bookId,bookZh:chapter.bookZh,bookEn:chapter.bookEn,items:[chapter]});
  return groups;
 },[]);

 return <div className="library-page">
  <header className="library-heading"><h1>题库分类</h1></header>
  {lastPractice&&<section className="library-resume" aria-label="上次练习">
   <div className="library-resume-icon"><BookOpen size={22}/></div>
   <div className="library-resume-copy"><span className="library-resume-label">{lastPractice.finished?'上次练习已完成':'上次练习'}</span><h2>{lastPractice.subjectLabel}{lastPractice.chapterLabel&&<span> · {lastPractice.chapterLabel}</span>}</h2><p>{lastPractice.sourceLabel}<span>第 {lastPractice.position+1} / {lastPractice.total} 题</span><span>已作答 {lastPractice.answered} 题</span></p></div>
   <Button disabled={busy} onClick={()=>onResume(lastPractice.session)}>{lastPractice.finished?'查看上次结果':'继续上次练习'}<ArrowRight size={16}/></Button>
  </section>}
  <section className="source-section" aria-label="题目来源">
   <h2>题目来源</h2>
   <div className="source-grid">{[{id:'all',name:'全部来源',description:'跨来源练习'},...questionSources].map(item=>{const total=data.questions.filter(question=>item.id==='all'||question.sourceId===item.id).length;return <button key={item.id} type="button" aria-pressed={source===item.id} className={`source-card ${source===item.id?'active':''}`} onClick={()=>choose({source:item.id,chosen:null})}><span>{item.name}{source===item.id&&<Check size={16}/>}</span><small>{total?`${total} 题`:'待导入'}</small></button>;})}</div>
   {!sourceQs.length&&<p className="source-empty">上传这套题库后，题目会按来源和 MBE 科目归入这里。</p>}
  </section>
  <div className="library-toolbar"><h2>MBE · 七个科目</h2><span className="library-hint">当前来源：{sourceName}</span></div>
  <div className="subject-grid">{subjects.map(item=><button type="button" key={item.id} className={`subject-card ${item.id===chosen?'active':''}`} aria-pressed={item.id===chosen} onClick={()=>{choose({source,chosen:item.id});requestAnimationFrame(()=>document.getElementById('subject-detail')?.scrollIntoView({block:'start'}));}}><div className="subject-top"><h3>{item.zh}</h3>{count(item.id)>0?<span className="subject-available">{sourceQs.filter(question=>question.subjectId===item.id&&practiced.has(question.id)).length} / {count(item.id)} 题已练</span>:<span className="subject-empty">待导入</span>}</div><p className="subject-en" lang="en">{item.en}</p></button>)}</div>
  {subject&&<section id="subject-detail" className="subject-detail" aria-live="polite"><div className="subject-detail-heading"><div><div className="eyebrow">{subject.group} / {sourceName}</div><h2>{subject.zh}<span>{qs.length} 题</span></h2></div>{qs.length>0&&<div className="subject-actions">{resume&&<Button disabled={busy} variant="outline" onClick={()=>onResume(resume)}>继续上次练习</Button>}<Button disabled={busy} onClick={()=>onStart(subject.id,source)}>开始本科练习<ArrowRight size={16}/></Button></div>}</div>
   {!qs.length&&<div className="subject-empty-state"><div><h3>本科题目待导入</h3><p>{subject.scope}</p></div></div>}
   {qs.some(question=>question.chapterId)&&!!chapterGroups.length&&<div className="chapter-section compact-chapter-section">{chapterGroups.map(group=><section className="chapter-book" key={group.bookId} aria-label={group.bookZh}>{chapterGroups.length>1&&<div className="chapter-book-heading"><h4>{group.bookZh}</h4></div>}<div className="chapter-grid">{group.items.map(chapter=>{const items=filterQuestions(qs,{chapterId:chapter.id});const previous=exactSession(items);return <div className={`chapter-card ${items.length?'':'chapter-empty'}`} key={chapter.id}><div className="chapter-info"><span className="chapter-number">{String(chapter.number).padStart(2,'0')}</span><div className="chapter-copy"><h4>{chapter.zh}</h4><p lang="en">{chapter.en}</p></div></div><div className="chapter-actions"><div className="chapter-action-buttons">{previous&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>onResume(previous)}>继续</Button>}<Button size="sm" variant="outline" disabled={busy||!items.length} onClick={()=>onStart(subject.id,source,chapter.id)} aria-label={`练习${group.bookZh}第${chapter.number}章${chapter.zh}`}>{items.length?'开始练习':'待导入'}</Button></div><small className="chapter-progress">{items.length?`${items.filter(question=>practiced.has(question.id)).length} / ${items.length} 题已练`:'暂无题目'}</small></div></div>;})}</div></section>)}</div>}
  </section>}
  <p className="library-footnote">当前范围为传统 UBE 的 MBE 选择题。题目与解析按上传版本保留，未做现行法更新。<br/><a href="https://www.ncbex.org/exams/mbe/preparing-mbe" target="_blank" rel="noreferrer">NCBE 考试范围与官方样题</a></p>
 </div>;
}
