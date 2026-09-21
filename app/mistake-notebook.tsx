'use client';
import {ArrowRight,CheckCheck,ChevronRight,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {subjects,subjectById} from '@/lib/subjects';
import {normalizeInlineQuestionText} from '@/lib/question-text';
import {questionNumberLabel,sourceById} from '@/lib/question-sources';
import type {Question,StudyData} from '@/lib/study-types';

type MistakeEntry={mistake:StudyData['mistakes'][number];question:Question|undefined};
type Props={data:StudyData;busy:boolean;onRetry:(questionId?:string,subjectId?:string)=>void;onPractice:()=>void};

export function MistakeNotebook({data,busy,onRetry,onPractice}:Props){
 const visible=data.mistakes.filter(mistake=>!mistake.lastCorrect);
 const questionById=new Map(data.questions.map(question=>[question.id,question]));
 const bySubject=new Map<string,MistakeEntry[]>();
 for(const mistake of visible){
  const question=questionById.get(mistake.questionId);
  const subjectId=subjectById(question?.subjectId)?.id??'other';
  const entries=bySubject.get(subjectId)??[];
  entries.push({mistake,question});
  bySubject.set(subjectId,entries);
 }
 const categories=[...subjects,{id:'other',zh:'其他科目'}].filter(subject=>bySubject.has(subject.id));
 return <div className="mistake-notebook">
  <div className="mistake-top"><Button disabled={!visible.length||busy} onClick={()=>onRetry()}><RotateCcw size={15}/>重练全部</Button></div>
  {!visible.length?<div className="empty">
   <CheckCheck size={34}/><h2>{data.stats.answered?'暂时没有错题':'你的错题会出现在这里'}</h2><p>答错的题目会自动收录，答对后自动移出。</p><Button onClick={onPractice}>回到练习<ArrowRight size={16}/></Button>
  </div>:<div className="mistake-subject-list">
   {categories.map(subject=>{
    const entries=bySubject.get(subject.id)!;
    return <details key={subject.id} className="mistake-subject">
     <summary><h2>{subject.zh}</h2><span>{entries.length} 题</span>{subject.id!=='other'&&<Button type="button" className="mistake-subject-retry" variant="outline" size="sm" disabled={busy} aria-label={`重练${subject.zh}的 ${entries.length} 道错题`} onClick={event=>{event.preventDefault();event.stopPropagation();onRetry(undefined,subject.id);}}><RotateCcw size={14}/>重练本科目</Button>}<ChevronRight size={18} className="mistake-subject-chevron"/></summary>
     <div className="mistake-subject-body">{entries.map(({mistake,question})=><article className="mistake-item" key={mistake.questionId}>
      <div className="mistake-item-meta"><span>{question?`${sourceById(question.sourceId)?.name??question.sourceId} · ${questionNumberLabel(question)} · `:''}错过 {mistake.wrongCount} 次</span></div>
      <p>{question?normalizeInlineQuestionText(question.stem):'题目暂不可用'}</p>
      <Button variant="outline" size="sm" disabled={busy||!question} onClick={()=>onRetry(mistake.questionId)}>重做这道题<ArrowRight size={15}/></Button>
     </article>)}</div>
    </details>;
   })}
  </div>}
 </div>;
}
