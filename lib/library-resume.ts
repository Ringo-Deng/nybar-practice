import {chapterById} from './chapters';
import {sourceById} from './question-sources';
import {subjectById} from './subjects';
import type {Question,Session,StudyData} from './study-types';

export type LibraryResume={
 session:Session;
 question:Question;
 position:number;
 total:number;
 answered:number;
 subjectLabel:string;
 chapterLabel:string;
 sourceLabel:string;
 finished:boolean;
};

/** Prefer the explicitly selected session, then the newest usable history item. */
export function getLibraryResume(data:StudyData):LibraryResume|null{
 const questions=new Map(data.questions.map(question=>[question.id,question]));
 const describe=(session:Session|null|undefined):LibraryResume|null=>{
  if(!session||typeof session.id!=='string'||!session.id.trim()||!['practice','exam','wrong'].includes(session.mode)||!['active','finished'].includes(session.status))return null;
  const ids=session.questionIds;
  if(!Array.isArray(ids)||!ids.length||!Number.isSafeInteger(session.position)||session.position<0||session.position>=ids.length)return null;
  if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!questions.has(id)))return null;
  const question=questions.get(ids[session.position]);
  if(!question)return null;
  const chapter=chapterById(question.chapterId);
  const answered=ids.filter(id=>{const selected=session.answers?.[id]?.selected;return typeof selected==='string'&&selected.trim().length>0;}).length;
  return {
   session,question,position:session.position,total:ids.length,answered,
   subjectLabel:subjectById(question.subjectId)?.zh??'未分类',
   chapterLabel:chapter?`第 ${chapter.number} 章 · ${chapter.zh}`:'',
   sourceLabel:sourceById(question.sourceId)?.name??question.sourceId,
   finished:session.status==='finished',
  };
 };
 const current=describe(data.session);
 if(current)return current;
 const timestamp=(session:Session)=>typeof session.finishedAt==='number'&&Number.isFinite(session.finishedAt)?session.finishedAt:Number.isFinite(session.startedAt)?session.startedAt:0;
 const candidates=data.sessions.map(describe).filter((candidate):candidate is LibraryResume=>candidate!==null);
 candidates.sort((a,b)=>timestamp(b.session)-timestamp(a.session));
 return candidates[0]??null;
}
