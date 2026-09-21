import {chapterById} from './chapters';
import {subjects} from './subjects';
import type {Question,QuestionStudyStat,StudyStat,SubjectStudyStat} from './study-types';

type Attempt={questionId:string;correct:boolean};
type Count={answered:number;correct:number};

function result({answered,correct}:Count):StudyStat{
 return {answered,correct,accuracy:answered?Math.round(correct/answered*100):null};
}

export function buildSubjectStudyStats(attempts:Attempt[],questions:Pick<Question,'id'|'subjectId'|'chapterId'>[]):SubjectStudyStat[]{
 const questionById=new Map(questions.map(question=>[question.id,question]));
 const totals=new Map<string,Count>();
 const chapterTotals=new Map<string,Map<string|null,Count>>();
 for(const attempt of attempts){
  const question=questionById.get(attempt.questionId);
  if(!question)continue;
  const subject=subjects.find(item=>item.id===question.subjectId);
  if(!subject)continue;
  const total=totals.get(subject.id)??{answered:0,correct:0};
  total.answered+=1;if(attempt.correct)total.correct+=1;totals.set(subject.id,total);
  const knownChapter=chapterById(question.chapterId);
  const chapterId=knownChapter?.subjectId===subject.id?knownChapter.id:null;
  const subjectChapters=chapterTotals.get(subject.id)??new Map<string|null,Count>();
  const chapter=subjectChapters.get(chapterId)??{answered:0,correct:0};
  chapter.answered+=1;if(attempt.correct)chapter.correct+=1;subjectChapters.set(chapterId,chapter);chapterTotals.set(subject.id,subjectChapters);
 }
 return subjects.map(subject=>{
  const chapters=[...(chapterTotals.get(subject.id)?.entries()??[])].map(([chapterId,count])=>({chapterId,...result(count)}));
  return {subjectId:subject.id,...result(totals.get(subject.id)??{answered:0,correct:0}),chapters};
 });
}

export function buildQuestionStudyStats(attempts:(Attempt&{selected:string})[]):Record<string,QuestionStudyStat>{
 const stats:Record<string,QuestionStudyStat>={};
 for(const attempt of attempts){
  if(!attempt.selected)continue;
  const count=stats[attempt.questionId]??{correct:0,wrong:0};
  if(attempt.correct)count.correct+=1;else count.wrong+=1;
  stats[attempt.questionId]=count;
 }
 return stats;
}
