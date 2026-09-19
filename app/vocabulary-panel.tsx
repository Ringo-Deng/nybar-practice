'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Brain,Plus,BookOpen,RotateCcw,Check,Search,Pencil,Trash2,Loader2,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {toast} from 'sonner';
import {dueCards,REVIEW_INTERVALS,nextReview,reviewDate,wordKey} from '@/lib/vocabulary';
import type {VocabularyCard,VocabularyData,VocabularyDraft,Rating} from '@/lib/vocabulary';
import type {Question} from '@/lib/study-types';
import {sourceById,questionNumberLabel} from '@/lib/question-sources';
import {subjectById} from '@/lib/subjects';

function browserZone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Shanghai';}
const GUEST_VOCABULARY_KEY='nybar-practice:guest-vocabulary:v1';
function readGuestCards(){
 try{const value=JSON.parse(localStorage.getItem(GUEST_VOCABULARY_KEY)??'[]');return Array.isArray(value)?value as VocabularyCard[]:[];}catch{return [];}
}
function writeGuestCards(cards:VocabularyCard[]){try{localStorage.setItem(GUEST_VOCABULARY_KEY,JSON.stringify(cards));}catch{throw new Error('浏览器无法保存生词表，请检查是否允许本站使用本机存储。');}}
function guestVocabulary(body?:Record<string,unknown>):VocabularyData{
 const timeZone=browserZone(),today=reviewDate(timeZone),cards=readGuestCards().sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 if(!body)return {cards,today,timeZone};
 if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new Error('生词编号无效。');
 const index=cards.findIndex(card=>card.id===body.id),existing=index>=0?cards[index]:undefined,now=Date.now();
 if(body.action==='add'||body.action==='edit'){
  if(typeof body.word!=='string'||!body.word.trim()||body.word.length>200||typeof body.meaning!=='string'||body.meaning.length>4000||typeof body.example!=='string'||body.example.length>6000||!['word','term'].includes(String(body.kind)))throw new Error('请填写词语（最多 200 字）；释义最多 4,000 字，原句最多 6,000 字。');
  const word=body.word.trim().replace(/\s+/g,' '),duplicate=cards.find(card=>wordKey(card.word)===wordKey(word)&&card.id!==body.id);
  if(duplicate)return {cards,today,timeZone,savedId:duplicate.id,duplicate:true};
  if(body.action==='edit'){
   if(!existing)throw new Error('这个词已被删除，请刷新生词表。');
   if(body.revision!==existing.revision)throw new Error('这个词已更新，请刷新生词表后重试。');
   cards[index]={...existing,word,kind:body.kind as 'word'|'term',meaning:body.meaning.trim(),example:body.example.trim(),updatedAt:now,revision:existing.revision+1};
  }else{
   if(existing)return {cards,today,timeZone,savedId:existing.id,duplicate:true};
   cards.unshift({id:body.id,word,kind:body.kind as 'word'|'term',meaning:body.meaning.trim(),example:body.example.trim(),questionId:typeof body.questionId==='string'?body.questionId:null,sessionId:typeof body.sessionId==='string'?body.sessionId:null,subjectId:typeof body.subjectId==='string'?body.subjectId:null,sourceLabel:typeof body.sourceLabel==='string'?body.sourceLabel:'来源题目',stage:0,nextReview:today,reviewCount:0,lastReviewedAt:null,lastReviewedDate:null,queueDate:null,queueOrder:0,createdAt:now,updatedAt:now,revision:0});
  }
  writeGuestCards(cards);return {cards,today,timeZone,savedId:body.id};
 }
 if(body.action==='delete'&&!existing)return {cards,today,timeZone};
 if(!existing)throw new Error('找不到这个词，请刷新生词表。');
 if(body.revision!==existing.revision)throw new Error('这个词已更新，请刷新生词表后重试。');
 if(body.action==='delete')cards.splice(index,1);
 else if(body.action==='rate'){
  if(!['again','hard','good'].includes(String(body.rating)))throw new Error('请选择复习结果。');
  if(existing.nextReview>today)throw new Error('这个词尚未到复习时间，请刷新生词表。');
  const schedule=nextReview(existing,body.rating as Rating,today,now);
  cards[index]={...existing,...schedule,reviewCount:existing.reviewCount+1,updatedAt:now,revision:existing.revision+1};
 }else throw new Error('未知操作。');
 writeGuestCards(cards);return {cards,today,timeZone};
}
export function useVocabulary(guest=false){
 const[data,setData]=useState<VocabularyData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const locked=useRef(false),generation=useRef(0),dataRef=useRef(data);dataRef.current=data;
 const request=useCallback(async(body?:Record<string,unknown>)=>{
  if(guest)return guestVocabulary(body);
  const timeZone=browserZone();
  const response=await fetch('/api/vocabulary'+(body?'':'?timeZone='+encodeURIComponent(timeZone)),body?{method:'POST',headers:{'Content-Type':'application/json','X-Study-Action':'1'},body:JSON.stringify({...body,timeZone})}:{cache:'no-store'});
  const value=await response.json() as VocabularyData&{error?:string};
  if(!response.ok)throw new Error(value.error||'暂时无法读取生词表，请重试。');return value;
 },[guest]);
 const load=useCallback(async()=>{
  if(locked.current)return;const run=++generation.current;setLoading(true);
  try{const value=await request();if(run===generation.current){setData(value);setError('');}}
  catch(e){if(run===generation.current)setError((e as Error).message);}
  finally{if(run===generation.current)setLoading(false);}
 },[request]);
 const mutate=useCallback(async(body:Record<string,unknown>)=>{
  if(locked.current)return;locked.current=true;++generation.current;setLoading(false);setBusy(true);setError('');
  try{const value=await request(body);setData(value);return value;}
  catch(e){setError((e as Error).message);toast.error((e as Error).message);return undefined;}
  finally{locked.current=false;setBusy(false);}
 },[request]);
 useEffect(()=>{void load();const focus=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  const timer=setInterval(()=>{if(dataRef.current&&dataRef.current.today!==reviewDate(browserZone()))void load();},60000);
  return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);clearInterval(timer);};
 },[load]);
 return {data,loading,busy,error,load,mutate};
}
export type VocabularyController=ReturnType<typeof useVocabulary>;
export function cardDraft(card:VocabularyCard):VocabularyDraft{return {id:card.id,revision:card.revision,word:card.word,kind:'word',meaning:card.meaning,example:card.example,questionId:card.questionId,sessionId:card.sessionId,subjectId:card.subjectId,sourceLabel:card.sourceLabel};}
export function newWordDraft(question?:Question,sessionId?:string,word='',example=''):VocabularyDraft{
 const concept=word?question?.explanation?.concepts?.find(c=>c.term.toLowerCase()===word.toLowerCase()):undefined;
 return {id:crypto.randomUUID(),word,kind:'word',meaning:concept?.detail??'',example,questionId:question?.id??null,sessionId:sessionId??null,subjectId:question?.subjectId??null,sourceLabel:question?`${sourceById(question.sourceId)?.name??question.sourceId} · ${questionNumberLabel(question)}`:''};
}
export function VocabularyEditor({draft,onClose,onChange,controller,question}:{draft:VocabularyDraft|null;onClose:()=>void;onChange:(draft:VocabularyDraft)=>void;controller:VocabularyController;question?:Question}){
 const[duplicate,setDuplicate]=useState<string|null>(null);useEffect(()=>setDuplicate(null),[draft?.id]);
 if(!draft)return null;
 const change=(key:'word'|'meaning'|'example',value:string)=>{setDuplicate(null);onChange({...draft,[key]:value});};
 async function save(event:React.FormEvent){
  event.preventDefault();if(!draft)return;
  const result=await controller.mutate({...draft,action:draft.revision===undefined?'add':'edit'});if(!result)return;
  if(result.duplicate){setDuplicate(result.savedId??null);return;}
  toast.success(draft.revision===undefined?'已加入生词表，今天开始复习':'生词已更新');onClose();
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!controller.busy)onClose();}}><DialogContent className="vocab-editor" showCloseButton={!controller.busy}><DialogHeader><DialogTitle>{draft.revision===undefined?'加入生词表':'编辑生词'}</DialogTitle><DialogDescription>记下词义和题目语境，复习时先回忆，再看释义。</DialogDescription></DialogHeader><form onSubmit={save}>
 <div className="vocab-field"><Label htmlFor="vocab-word">生词</Label><Input autoFocus id="vocab-word" value={draft.word} maxLength={200} required onChange={e=>change('word',e.target.value)} placeholder="例如：consideration"/></div>
 <div className="vocab-field"><Label htmlFor="vocab-meaning">释义 / 我的理解 <span>可稍后补充</span></Label><Textarea id="vocab-meaning" value={draft.meaning} maxLength={4000} rows={3} onChange={e=>change('meaning',e.target.value)} placeholder="用自己的话记下含义或容易混淆的地方"/></div>
 <div className="vocab-field"><Label htmlFor="vocab-example">题目原句 / 例句</Label><Textarea id="vocab-example" value={draft.example} maxLength={6000} rows={3} onChange={e=>change('example',e.target.value)} placeholder="选词时自动带入原句，也可以手动补充"/></div>
 {question&&<p className="vocab-source-note"><BookOpen size={14}/>{sourceById(question.sourceId)?.name} · {questionNumberLabel(question)} · {subjectById(question.subjectId)?.zh}</p>}
 {controller.error&&<p role="alert" className="vocab-error">{controller.error}</p>}
 {duplicate&&<div className="vocab-duplicate" role="status">这个词已在生词表中，原有释义和复习进度已保留。<Button type="button" variant="outline" size="sm" onClick={()=>{const card=controller.data?.cards.find(c=>c.id===duplicate);if(card){onChange(cardDraft(card));setDuplicate(null);}}}>查看已有词</Button></div>}
 <DialogFooter><Button type="button" variant="outline" disabled={controller.busy} onClick={onClose}>取消</Button><Button type="submit" disabled={controller.busy||!draft.word.trim()}>{controller.busy?<Loader2 size={16} className="animate-spin"/>:<Plus size={16}/>}保存{draft.revision===undefined?'到生词表':''}</Button></DialogFooter>
 </form></DialogContent></Dialog>;
}

function dueLabel(card:VocabularyCard,today:string){return card.nextReview<today?'已到期':card.nextReview===today?'今天':card.nextReview;}
export function VocabularyPanel({controller,onAdd,onEdit,onSource,onPractice,activeExam}:{controller:VocabularyController;onAdd:()=>void;onEdit:(card:VocabularyCard)=>void;onSource:(id:string)=>void;onPractice:()=>void;activeExam:boolean}){
 const[revealed,setRevealed]=useState<string|null>(null),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[deleting,setDeleting]=useState<VocabularyCard|null>(null);
 const data=controller.data,today=data?.today??'',cards=data?.cards??[],due=dueCards(cards,today),current=due[0];
 const queryKey=query.toLocaleLowerCase();
 const filtered=cards.filter(c=>(filter!=='due'||c.nextReview<=today)&&(!queryKey||[c.word,c.meaning,c.example,c.sourceLabel].some(t=>t.toLocaleLowerCase().includes(queryKey))));
 const pages=Math.max(1,Math.ceil(filtered.length/25)),safePage=Math.min(page,pages-1);
 const token=current?`${current.id}:${current.revision}`:null,showMeaning=token!==null&&revealed===token;
 async function rate(rating:Rating){if(!current||!showMeaning)return;const result=await controller.mutate({action:'rate',id:current.id,revision:current.revision,rating});if(result){setRevealed(null);toast.success(rating==='again'?'已放回今天的复习队尾':rating==='hard'?'明天再巩固一次':'已记住，下次复习已安排');}}
 async function remove(){if(!deleting)return;const result=await controller.mutate({action:'delete',id:deleting.id,revision:deleting.revision});if(result){setDeleting(null);toast.success('已移出生词表');}}
 return <section className="vocab-page"><div className="vocab-heading"><div><h1><Brain size={23}/>艾宾浩斯记忆</h1></div><Button onClick={onAdd}><Plus size={16}/>添加生词</Button></div>
 {controller.error&&<div className="notice error" role="alert"><span>{controller.error}</span><Button variant="outline" disabled={controller.busy||controller.loading} onClick={()=>void controller.load()}>重新读取</Button></div>}
 {controller.loading&&!data?<div className="empty"><Loader2 className="animate-spin"/><p>正在读取生词表…</p></div>:data&&<>
 <div className="memory-layout">
 <section className="vocabulary-list" aria-labelledby="vocab-list-title"><div className="vocab-list-title"><h2 id="vocab-list-title">我的生词表 <span>{filtered.length}</span></h2><div className="vocab-search"><Search size={16}/><Input aria-label="搜索生词、释义或来源" placeholder="搜索生词、释义或来源" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div></div>
 <div className="memory-stats"><span>总词汇 <b>{cards.length}</b></span><span>今日已复习 <b>{cards.filter(c=>c.lastReviewedDate===today).length}</b></span><span>长期巩固 <b>{cards.filter(c=>c.stage===7).length}</b></span></div>
 <Tabs value={filter} onValueChange={v=>{setFilter(v);setPage(0);}}><TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="due">待复习 {due.length}</TabsTrigger></TabsList></Tabs>
 {!filtered.length?<p className="vocab-list-empty">{cards.length?'没有匹配的词。':'生词表还是空的。添加后，会自动加入今天的复习。'}</p>:<Table className="vocab-table"><TableHeader><TableRow><TableHead>生词与释义</TableHead><TableHead>下次复习</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{filtered.slice(safePage*25,(safePage+1)*25).map(card=><TableRow key={card.id}><TableCell><div className="vocab-row-word" lang="en">{card.word}</div><p className="vocab-row-meaning">{card.meaning||'待补充释义'}</p>{(card.example||card.questionId)&&<details className="vocab-row-context"><summary>原句与来源</summary>{card.example&&<p>{card.example}</p>}{card.questionId&&<button onClick={()=>onSource(card.questionId!)}>{card.sourceLabel} · 查看来源题</button>}</details>}</TableCell><TableCell><span className={card.nextReview<=today?'vocab-due':''}>{dueLabel(card,today)}</span><small className="vocab-row-stage">已复习 {card.reviewCount} 次</small></TableCell><TableCell><div className="vocab-row-actions"><Button variant="ghost" size="icon" disabled={controller.busy} onClick={()=>onEdit(card)} aria-label={`编辑 ${card.word}`}><Pencil size={15}/></Button><Button variant="ghost" size="icon" disabled={controller.busy} onClick={()=>setDeleting(card)} aria-label={`删除 ${card.word}`}><Trash2 size={15}/></Button></div></TableCell></TableRow>)}</TableBody></Table>}
 {pages>1&&<div className="vocab-pagination"><Button variant="outline" size="sm" disabled={safePage===0} onClick={()=>setPage(safePage-1)}><ChevronLeft size={14}/>上一页</Button><span>{safePage+1} / {pages}</span><Button variant="outline" size="sm" disabled={safePage>=pages-1} onClick={()=>setPage(safePage+1)}>下一页<ChevronRight size={14}/></Button></div>}
 </section>
 <aside className="memory-review-column"><section className="memory-review" aria-labelledby="memory-review-title"><div className="memory-review-top"><h2 id="memory-review-title">今日复习 <span>{due.length} 个待复习</span></h2>{current&&<span className="memory-stage">{current.reviewCount===0?'新词':`当前间隔 ${REVIEW_INTERVALS[current.stage]} 天`}</span>}</div>
 {activeExam?<div className="memory-empty"><ClockNotice/><p>当前练习尚未完成，完成后再复习生词。</p><Button variant="outline" onClick={onPractice}>返回答题</Button></div>:current?<div className="memory-card" key={token}>
 {current.subjectId&&<span className="memory-subject">{subjectById(current.subjectId)?.zh}</span>}<h3 lang="en">{current.word}</h3>
 {showMeaning?<div className="memory-answer"><p>{current.meaning||'这个词还没有释义，点击“补充释义”记下你的理解。'}</p>{!current.meaning&&<Button variant="outline" size="sm" onClick={()=>onEdit(current)}><Pencil size={14}/>补充释义</Button>}{current.example&&<blockquote>{current.example}</blockquote>}{current.questionId&&<Button variant="link" size="sm" onClick={()=>onSource(current.questionId!)}><BookOpen size={14}/>{current.sourceLabel} · 查看来源题</Button>}</div>:<><p className="memory-prompt">先在心里回忆它的含义和用法</p><Button variant="outline" className="reveal-word" onClick={()=>setRevealed(token)}>显示释义</Button></>}
 {showMeaning&&<div className="memory-ratings"><Button variant="outline" className="rating-again" disabled={controller.busy} onClick={()=>void rate('again')}><RotateCcw size={15}/><span>忘记<small>今天再来</small></span></Button><Button variant="outline" disabled={controller.busy} onClick={()=>void rate('hard')}><span>模糊<small>明天巩固</small></span></Button><Button disabled={controller.busy} onClick={()=>void rate('good')}><Check size={16}/><span>记住<small>{REVIEW_INTERVALS[Math.min(current.stage+1,7)]} 天后</small></span></Button></div>}
 </div>:<div className="memory-empty"><Check size={30}/><h3>{cards.length?'今天的复习完成了':'从刷题时遇到的第一个词开始'}</h3><p>{cards.length?'到期的词会自动出现在这里。':'在题干、选项或解析中选中词句，点击“加入生词表”。'}</p><Button variant="outline" onClick={onPractice}><BookOpen size={15}/>继续刷题</Button></div>}
 <details className="memory-schedule"><summary>复习间隔与规则</summary><p>新词当天开始；“记住”后依次间隔 1、2、4、7、15、30、60 天复习，之后每 60 天巩固。“忘记”保留当前阶段，排到今天队尾；“模糊”保留阶段，明天再复习。按当前设备的日期计算，逾期词会保留在待复习中。</p></details></section></aside>
 </div></>}
 <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!controller.busy)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>移出生词表？</AlertDialogTitle><AlertDialogDescription>“{deleting?.word}”的释义和复习进度会一起删除，来源题目仍会保留。</AlertDialogDescription></AlertDialogHeader>{controller.error&&<p className="vocab-error" role="alert">{controller.error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={controller.busy}>取消</AlertDialogCancel><Button variant="destructive" disabled={controller.busy} onClick={()=>void remove()}>{controller.busy?'正在删除…':'确认删除'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
function ClockNotice(){return <p className="memory-exam-label">练习进行中</p>;}

export function VocabularySelection({container,question,enabled,onAdd}:{container:React.RefObject<HTMLDivElement|null>;question:Question|undefined;enabled:boolean;onAdd:(word:string,example:string)=>void}){
 const[selection,setSelection]=useState<{word:string;example:string;left:number;top:number}|null>(null);
 useEffect(()=>{
  setSelection(null);if(!enabled||!question)return;
  let timer:ReturnType<typeof setTimeout>;
  const update=()=>{clearTimeout(timer);timer=setTimeout(()=>{
   const s=window.getSelection(),root=container.current;
   if(!s||s.isCollapsed||!s.rangeCount||!root||!root.contains(s.anchorNode)||!root.contains(s.focusNode)){setSelection(null);return;}
   const word=s.toString().trim().replace(/\s+/g,' ');
   if(!word||word.length>200||!/[a-zA-Z]/.test(word)){setSelection(null);return;}
   const range=s.getRangeAt(0),element=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer as Element:range.startContainer.parentElement;
   const context=element?.closest('p,li,td,th,.option-text')?.textContent??word;
   const rect=range.getBoundingClientRect();
   const top=rect.bottom+48<window.innerHeight?rect.bottom+8:Math.max(8,rect.top-46);
   setSelection({word,example:context.trim().slice(0,6000),left:Math.max(10,Math.min(window.innerWidth-166,rect.left+rect.width/2-76)),top});
  },100);};
  const clear=()=>setSelection(null);
  document.addEventListener('selectionchange',update);window.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
  return()=>{clearTimeout(timer);document.removeEventListener('selectionchange',update);window.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
 },[enabled,question?.id,container]);
 if(!selection)return null;
 return <Button size="sm" className="vocab-selection" style={{left:selection.left,top:selection.top}} onPointerDown={e=>e.preventDefault()} onClick={()=>{onAdd(selection.word,selection.example);setSelection(null);window.getSelection()?.removeAllRanges();}}><Plus size={15}/>加入生词表</Button>;
}

export function VocabularySource({question,onClose}:{question:Question|null;onClose:()=>void}){
 return <Dialog open={!!question} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="vocab-source-dialog"><DialogHeader><DialogTitle>来源题目</DialogTitle><DialogDescription>{question?`${sourceById(question.sourceId)?.name} · ${questionNumberLabel(question)} · ${subjectById(question.subjectId)?.zh}`:''}</DialogDescription></DialogHeader>{question&&<div className="vocab-source-body"><p className="question-stem" lang="en">{question.stem}</p><p className="question-ask" lang="en">{question.ask}</p><ol>{question.options.map(o=><li key={o.id}><b>{o.id}</b><span lang="en">{o.en}</span></li>)}</ol></div>}<DialogFooter><Button variant="outline" onClick={onClose}>返回生词表</Button></DialogFooter></DialogContent></Dialog>;
}
