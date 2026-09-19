import {chapterById,filterQuestions} from './chapters';
import {questions,publicQuestions} from './questions';
import {sourceById} from './question-sources';
import {buildSubjectStudyStats} from './study-statistics';
import {examDurationMs} from './study-timing';
import {subjectById} from './subjects';
import type {Session,StudyData} from './study-types';

type GuestAnswerState={selected:string;answeredAt:number};
type GuestSessionState={
 id:string;mode:Session['mode'];status:Session['status'];questionIds:string[];position:number;
 startedAt:number;finishedAt:number|null;answers:Record<string,GuestAnswerState>;
};
export type GuestStudyState={version:1;currentSessionId:string|null;sessions:GuestSessionState[]};
export type GuestStudyResult={state:GuestStudyState;data:StudyData};

const UUID=/^[0-9a-f-]{36}$/i;
const MAX_SESSIONS=100;
const questionById=new Map(questions.map(question=>[question.id,question]));

export function emptyGuestStudyState():GuestStudyState{return {version:1,currentSessionId:null,sessions:[]};}

function finiteTime(value:unknown,fallback:number){return typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):fallback;}
function sanitizeState(value:unknown):GuestStudyState{
 if(!value||typeof value!=='object'||Array.isArray(value))return emptyGuestStudyState();
 const input=value as Partial<GuestStudyState>;
 const sessions:Array<GuestSessionState>=[];
 const seen=new Set<string>();
 for(const raw of Array.isArray(input.sessions)?input.sessions.slice(0,MAX_SESSIONS):[]){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const item=raw as Partial<GuestSessionState>;
  if(typeof item.id!=='string'||!UUID.test(item.id)||seen.has(item.id)||!['practice','exam','wrong'].includes(String(item.mode)))continue;
  const questionIds=Array.isArray(item.questionIds)?[...new Set(item.questionIds.filter((id):id is string=>typeof id==='string'&&questionById.has(id)))]:[];
  if(!questionIds.length)continue;
  const startedAt=finiteTime(item.startedAt,Date.now()),answers:Record<string,GuestAnswerState>={};
  if(item.answers&&typeof item.answers==='object'&&!Array.isArray(item.answers))for(const id of questionIds){
   const answer=(item.answers as Record<string,unknown>)[id];
   if(!answer||typeof answer!=='object'||Array.isArray(answer))continue;
   const selected=(answer as Partial<GuestAnswerState>).selected;
   const question=questionById.get(id);
   if(typeof selected!=='string'||(selected!==''&&!question?.options.some(option=>option.id===selected)))continue;
   answers[id]={selected,answeredAt:finiteTime((answer as Partial<GuestAnswerState>).answeredAt,startedAt)};
  }
  const normalizedStatus:Session['status']=item.status==='finished'?'finished':'active';
  const position=Number.isInteger(item.position)?Math.max(0,Math.min(questionIds.length-1,Number(item.position))):0;
  const finishedAt=normalizedStatus==='finished'?finiteTime(item.finishedAt,startedAt):null;
  sessions.push({id:item.id,mode:item.mode as Session['mode'],status:normalizedStatus,questionIds,position,startedAt,finishedAt,answers});
  seen.add(item.id);
 }
 sessions.sort((a,b)=>b.startedAt-a.startedAt||a.id.localeCompare(b.id));
 const currentSessionId=typeof input.currentSessionId==='string'&&sessions.some(session=>session.id===input.currentSessionId)?input.currentSessionId:sessions[0]?.id??null;
 return {version:1,currentSessionId,sessions};
}

function finishSession(session:GuestSessionState,now=Date.now()){
 if(session.status==='finished')return;
 if(session.mode==='exam')for(const id of session.questionIds)if(!session.answers[id])session.answers[id]={selected:'',answeredAt:now};
 session.status='finished';session.finishedAt=now;
}

function expireSessions(state:GuestStudyState){
 const now=Date.now();
 for(const session of state.sessions)if(session.mode==='exam'&&session.status==='active'&&now>=session.startedAt+examDurationMs(session.questionIds))finishSession(session,now);
}

function serialize(session:GuestSessionState):Session{
 const visible=session.mode!=='exam'||session.status==='finished';
 const answers=Object.fromEntries(Object.entries(session.answers).map(([id,answer])=>{
  const correct=answer.selected!==''&&answer.selected===questionById.get(id)?.explanation.answer;
  return [id,{selected:answer.selected,...(visible?{correct}:{})}];
 }));
 return {id:session.id,mode:session.mode,status:session.status,questionIds:session.questionIds,position:session.position,startedAt:session.startedAt,finishedAt:session.finishedAt,answers,...(visible?{score:Object.values(answers).filter(answer=>answer.correct).length}:{})};
}

function studyPayload(state:GuestStudyState,requestedSessionId?:string|null):StudyData{
 expireSessions(state);
 const currentState=state.sessions.find(session=>session.id===(requestedSessionId??state.currentSessionId))??null;
 const current=currentState?serialize(currentState):null;
 const graded=state.sessions.flatMap(session=>{
  if(session.mode==='exam'&&session.status!=='finished')return [];
  return Object.entries(session.answers).map(([questionId,answer])=>({questionId,selected:answer.selected,correct:answer.selected!==''&&answer.selected===questionById.get(questionId)?.explanation.answer,answeredAt:answer.answeredAt,sessionId:session.id}));
 }).sort((a,b)=>b.answeredAt-a.answeredAt||b.sessionId.localeCompare(a.sessionId));
 const mistakes:StudyData['mistakes']=[];
 for(const question of questions){
  const related=graded.filter(answer=>answer.questionId===question.id),wrongCount=related.filter(answer=>!answer.correct).length;
  if(wrongCount)mistakes.push({questionId:question.id,wrongCount,selected:related[0].selected,lastCorrect:related[0].correct,topic:question.explanation.topic});
 }
 const completedAnswers=graded.filter(answer=>answer.selected),correct=completedAnswers.filter(answer=>answer.correct).length,unseen=publicQuestions();
 return {
  questions:questions.map((question,index)=>{
   const visible=current?.answers[question.id]&&(current.mode!=='exam'||current.status==='finished');
   return visible?question:unseen[index];
  }),
  session:current,
  sessions:state.sessions.map(serialize),
  stats:{answered:completedAnswers.length,correct,accuracy:completedAnswers.length?Math.round(correct/completedAnswers.length*100):null,wrongCount:mistakes.filter(item=>!item.lastCorrect).length,subjects:buildSubjectStudyStats(completedAnswers,questions)},
  mistakes,
 };
}

function activeSession(state:GuestStudyState,id:unknown){return typeof id==='string'?state.sessions.find(session=>session.id===id):undefined;}
function invalid(message:string,status=400):never{throw Object.assign(new Error(message),{status});}

export function applyGuestStudyAction(rawState:unknown,body:Record<string,unknown>):GuestStudyResult{
 const state=sanitizeState(rawState);expireSessions(state);
 const action=body.action;
 if(action==='hydrate'){
  const requested=typeof body.sessionId==='string'?body.sessionId:null;
  if(requested&&!state.sessions.some(session=>session.id===requested))invalid('找不到这次本机练习。',404);
  if(requested)state.currentSessionId=requested;
  return {state,data:studyPayload(state,requested)};
 }
 if(action==='start'){
  if(typeof body.id!=='string'||!UUID.test(body.id)||state.sessions.some(session=>session.id===body.id)||!['practice','wrong'].includes(String(body.mode)))invalid('练习设置无效。');
  if(body.subjectId!==undefined&&(typeof body.subjectId!=='string'||!subjectById(body.subjectId)))invalid('请选择有效科目。');
  if(body.sourceId!==undefined&&(typeof body.sourceId!=='string'||!sourceById(body.sourceId)))invalid('请选择有效题目来源。');
  if(body.sourceSet!==undefined&&(typeof body.sourceSet!=='string'||!questions.some(question=>question.sourceSet===body.sourceSet)))invalid('请选择有效的试卷场次。');
  if(body.chapterId!==undefined&&(typeof body.chapterId!=='string'||!chapterById(body.chapterId)||!body.subjectId||chapterById(body.chapterId)?.subjectId!==body.subjectId))invalid('请选择有效的科目与章节。');
  const filtered=filterQuestions(questions,{subjectId:body.subjectId as string|undefined,sourceId:body.sourceId as string|undefined,chapterId:body.chapterId as string|undefined,sourceSet:body.sourceSet as string|undefined});
  let ids=filtered.map(question=>question.id);
  if(!ids.length)invalid('所选来源、科目或章节尚未导入题目。');
  if(body.mode==='wrong'){
   const data=studyPayload(state);
   ids=data.mistakes.filter(item=>!item.lastCorrect).map(item=>item.questionId);
   if(body.subjectId)ids=ids.filter(id=>questionById.get(id)?.subjectId===body.subjectId);
   if(body.sourceId)ids=ids.filter(id=>questionById.get(id)?.sourceId===body.sourceId);
   if(body.chapterId||body.sourceSet)ids=ids.filter(id=>filtered.some(question=>question.id===id));
   if(typeof body.questionId==='string')ids=ids.filter(id=>id===body.questionId);
   if(!ids.length)invalid('暂时没有需要重练的错题。');
  }
  const session:GuestSessionState={id:body.id,mode:body.mode as Session['mode'],status:'active',questionIds:ids,position:0,startedAt:Date.now(),finishedAt:null,answers:{}};
  state.sessions=[session,...state.sessions].slice(0,MAX_SESSIONS);state.currentSessionId=session.id;
  return {state,data:studyPayload(state,session.id)};
 }
 const session=activeSession(state,body.sessionId);
 if(!session)invalid('找不到这次本机练习。',404);
 state.currentSessionId=session.id;
 if(action==='navigate'){
  if(!Number.isInteger(body.position)||Number(body.position)<0||Number(body.position)>=session.questionIds.length)invalid('题号无效。');
  session.position=Number(body.position);
  return {state,data:studyPayload(state,session.id)};
 }
 if(session.status==='finished')return {state,data:studyPayload(state,session.id)};
 if(action==='answer'){
  const question=typeof body.questionId==='string'?questionById.get(body.questionId):undefined;
  if(!question||!session.questionIds.includes(question.id)||!question.options.some(option=>option.id===body.selected))invalid('请选择有效答案。');
  if(session.mode!=='exam'&&session.answers[question.id])return {state,data:studyPayload(state,session.id)};
  session.answers[question.id]={selected:String(body.selected),answeredAt:Date.now()};
  return {state,data:studyPayload(state,session.id)};
 }
 if(action==='finish'){
  if(session.mode!=='exam'&&session.questionIds.some(id=>!session.answers[id]))invalid('请先完成本组题目。');
  finishSession(session);
  return {state,data:studyPayload(state,session.id)};
 }
 invalid('未知操作。');
}
