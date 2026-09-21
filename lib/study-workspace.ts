import type {StudyData} from './study-types';

export const STUDY_VIEWS=['library','practice','materials','wrong','memory','history'] as const;
export type StudyView=typeof STUDY_VIEWS[number];
export type WorkspaceSnapshot={
 version:1;
 view:StudyView;
 sessionId:string|null;
 sessionStatus:'active'|'finished'|null;
 summary:boolean;
 localPosition:number;
 showZh:boolean;
 selection:{questionId:string;value:string}|null;
};
type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'>;
export const workspaceKey=(guest:boolean)=>`nybar-practice:workspace:v1:${guest?'guest':'account'}`;

export function readWorkspace(storage:StorageReader,key:string):WorkspaceSnapshot|null{
 try{
  const value=JSON.parse(storage.getItem(key)??'null');
  if(!value||value.version!==1||!STUDY_VIEWS.includes(value.view))return null;
  return {
   version:1,
   view:value.view,
   sessionId:typeof value.sessionId==='string'?value.sessionId:null,
   sessionStatus:value.sessionStatus==='finished'?'finished':value.sessionStatus==='active'?'active':null,
   summary:value.summary===true,
   localPosition:Number.isInteger(value.localPosition)&&value.localPosition>=0?value.localPosition:0,
   showZh:value.showZh===true,
   selection:typeof value.selection?.questionId==='string'&&typeof value.selection?.value==='string'?value.selection:null,
  };
 }catch{return null;}
}

export function writeWorkspace(storage:StorageWriter,key:string,value:WorkspaceSnapshot){
 try{storage.setItem(key,JSON.stringify(value));}catch{/* Page restoration must not interrupt answer saving. */}
}

export function restoreWorkspace(saved:WorkspaceSnapshot|null,data:StudyData){
 const session=data.session;
 const sameSession=!!saved&&saved.sessionId===(session?.id??null);
 const view:StudyView=saved?(saved.view==='practice'&&!sameSession?'library':saved.view):(session?'practice':'library');
 const ids=session?.questionIds??data.questions.map(question=>question.id);
 const localPosition=Math.min(saved?.localPosition??0,Math.max(0,ids.length-1));
 const question=data.questions.find(item=>item.id===ids[session?.position??localPosition]);
 const answer=question?session?.answers[question.id]:undefined;
 const draft=saved?.selection;
 const selected=answer?.selected||(session?.status!=='finished'&&sameSession&&draft?.questionId===question?.id&&question?.options.some(option=>option.id===draft?.value)?draft?.value:'')||'';
 const summary=view==='practice'&&session?.status==='finished'&&(!sameSession||saved?.sessionStatus!=='finished'||saved.summary);
 return {view,summary,localPosition,selected,showZh:view==='practice'&&!!saved?.showZh};
}

export async function hydrateWorkspace(saved:WorkspaceSnapshot|null,request:(sessionId?:string)=>Promise<StudyData>){
 let data=await request();
 if(saved?.sessionId&&data.session?.id!==saved.sessionId&&data.sessions.some(session=>session.id===saved.sessionId))data=await request(saved.sessionId);
 return {data,workspace:restoreWorkspace(saved,data)};
}
