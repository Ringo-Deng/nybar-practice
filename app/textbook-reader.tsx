'use client';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,Download,ExternalLink,HardDrive,Highlighter,Loader2,Pencil,RotateCcw,StickyNote,Trash2,X,ZoomIn,ZoomOut} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogHeader,DialogFooter} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {textbookById,textbookPageSource,type LinkedTextbookReference,type Textbook} from '@/lib/textbooks';
import {acquireTextbookPage,loadPdfEngine} from '@/lib/textbook-pdf';
import {canSaveTextbookLocally,isTextbookSavedLocally,saveTextbookLocally} from '@/lib/textbook-local-cache';
import type {AnnotationRect,TextbookAnnotation,TextbookAnnotationDraft} from '@/lib/textbook-annotations';
import type {TextbookAnnotationsController} from './use-textbook-annotations';
import type {RenderTask,TextLayer} from 'pdfjs-dist';
import {toast} from 'sonner';
import 'pdfjs-dist/web/pdf_viewer.css';

type SelectionDraft={quote:string;rects:AnnotationRect[];left:number;top:number;page:number};
type IdleWindow=Window&{requestIdleCallback?:(callback:()=>void,options?:{timeout:number})=>number;cancelIdleCallback?:(handle:number)=>void};
const DEFAULT_TEXTBOOK_ZOOM=1.25;
function annotationId(){
 if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=new Uint8Array(16);for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const value=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

function ContinuousPdfPage({book,page,zoom,width,active,annotations,onSelect,onOpen}:{book:Textbook;page:number;zoom:number;width:number;active:boolean;annotations:TextbookAnnotation[];onSelect:(draft:SelectionDraft)=>void;onOpen:(item:TextbookAnnotation)=>void}){
 const host=useRef<HTMLDivElement>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(active),[rendered,setRendered]=useState(false),[retry,setRetry]=useState(0),[aspect,setAspect]=useState(210/297);
 useEffect(()=>{
  if(active||!rendered)return;
  const timer=setTimeout(()=>{host.current?.replaceChildren();setRendered(false);setBusy(false);},1000);
  return()=>clearTimeout(timer);
 },[active,rendered]);
 useEffect(()=>{
  if(!active||!width)return;
  let cancelled=false,render:RenderTask|undefined,refine:RenderTask|undefined,textLayer:TextLayer|undefined,refineTimer:number|undefined,refineIdle:number|undefined;
  const held=acquireTextbookPage(book,page);setBusy(true);setError('');
  const timeout=window.setTimeout(()=>{if(!cancelled){setError('打开时间过长，请重试或使用右下角“单独打开 PDF”。');setBusy(false);}},18000);
  const work=(async()=>{
   const pdf=await held.promise;if(cancelled)return;
   const pdfPage=await pdf.getPage(textbookPageSource(book,page).pageNumber);if(cancelled)return;
   const base=pdfPage.getViewport({scale:1}),scale=width/base.width*zoom,viewport=pdfPage.getViewport({scale});setAspect(viewport.width/viewport.height);
   const deviceRatio=Math.min(window.devicePixelRatio||1,2),maxRasterPixels=5_000_000;
   const desiredRatio=Math.max(1,Math.min(deviceRatio,Math.sqrt(maxRasterPixels/(viewport.width*viewport.height))));
   const makeCanvas=(pixelRatio:number)=>{const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${book.shortTitle} · PDF 第 ${page} 页`);canvas.width=Math.floor(viewport.width*pixelRatio);canvas.height=Math.floor(viewport.height*pixelRatio);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;return canvas;};
   const canvas=makeCanvas(1);
   const wrapper=document.createElement('div');wrapper.className='textbook-page';wrapper.lang='en';wrapper.style.width=`${viewport.width}px`;wrapper.style.height=`${viewport.height}px`;wrapper.style.setProperty('--scale-factor',String(scale));wrapper.style.setProperty('--total-scale-factor',String(scale));wrapper.appendChild(canvas);
   render=pdfPage.render({canvas,viewport});await render.promise;if(cancelled)return;
   const highlights=document.createElement('div');highlights.className='textbook-highlight-layer';wrapper.appendChild(highlights);host.current?.replaceChildren(wrapper);setRendered(true);setBusy(false);
   if(desiredRatio>1.05)refineTimer=window.setTimeout(()=>{const idleWindow=window as IdleWindow;const sharpen=async()=>{if(cancelled)return;const sharpCanvas=makeCanvas(desiredRatio);try{refine=pdfPage.render({canvas:sharpCanvas,viewport,transform:[desiredRatio,0,0,desiredRatio,0,0]});await refine.promise;if(!cancelled)canvas.replaceWith(sharpCanvas);}catch(reason){if(!cancelled&&(!(reason instanceof Error)||reason.name!=='RenderingCancelledException'))console.warn('Textbook page refinement failed',reason);}};if(idleWindow.requestIdleCallback)refineIdle=idleWindow.requestIdleCallback(()=>void sharpen(),{timeout:1500});else void sharpen();},300);
   try{const lib=await loadPdfEngine();if(cancelled)return;const layer=document.createElement('div');layer.className='textLayer';wrapper.insertBefore(layer,highlights);textLayer=new lib.TextLayer({textContentSource:pdfPage.streamTextContent(),container:layer,viewport});await textLayer.render();}catch{/* The PDF canvas remains readable if selectable text is unavailable. */}
  })().catch(reason=>{if(!cancelled&&reason?.name!=='RenderingCancelledException'){setError('这一页未能显示，请重试。');setBusy(false);}});
  void work.finally(()=>window.clearTimeout(timeout));
  return()=>{cancelled=true;window.clearTimeout(timeout);if(refineTimer)window.clearTimeout(refineTimer);const idleWindow=window as IdleWindow;if(refineIdle!==undefined)idleWindow.cancelIdleCallback?.(refineIdle);render?.cancel();refine?.cancel();textLayer?.cancel();void work.finally(held.release);};
 },[active,book,page,width,zoom,retry]);
 useEffect(()=>{
  const layer=host.current?.querySelector<HTMLElement>('.textbook-highlight-layer');if(!layer)return;layer.replaceChildren();
  for(const item of annotations)item.rects.forEach((rect,index)=>{const button=document.createElement('button');button.type='button';button.className='textbook-highlight';button.style.left=`${rect.x*100}%`;button.style.top=`${rect.y*100}%`;button.style.width=`${rect.width*100}%`;button.style.height=`${rect.height*100}%`;button.title=item.note||item.quote;button.setAttribute('aria-label',index===0?`查看第 ${page} 页高亮笔记`:'同一条高亮');button.addEventListener('click',event=>{event.stopPropagation();onOpen(item);});layer.appendChild(button);});
 },[annotations,onOpen,page,rendered]);
 const capture=useCallback(()=>requestAnimationFrame(()=>{
  const selection=window.getSelection(),root=host.current;if(!selection||selection.isCollapsed||!selection.rangeCount||!root||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return;
  const quote=selection.toString().trim().replace(/\s+/g,' ');if(!quote||quote.length>8000)return;
  const wrapper=root.querySelector<HTMLElement>('.textbook-page');if(!wrapper)return;const pageRect=wrapper.getBoundingClientRect();
  const rects=Array.from(selection.getRangeAt(0).getClientRects()).filter(rect=>rect.width>1&&rect.height>1).map(rect=>({x:Math.max(0,(rect.left-pageRect.left)/pageRect.width),y:Math.max(0,(rect.top-pageRect.top)/pageRect.height),width:Math.min(1,rect.width/pageRect.width),height:Math.min(1,rect.height/pageRect.height)})).filter(rect=>rect.x+rect.width<=1.01&&rect.y+rect.height<=1.01);if(!rects.length)return;
  const rangeRect=selection.getRangeAt(0).getBoundingClientRect(),above=rangeRect.bottom+52>window.innerHeight;onSelect({quote,rects,page,left:Math.max(10,Math.min(window.innerWidth-230,rangeRect.left+rangeRect.width/2-105)),top:above?Math.max(8,rangeRect.top-48):rangeRect.bottom+8});
 }),[onSelect,page]);
 const placeholderStyle={width:width?`${Math.round(width*zoom)}px`:'calc(100% - 32px)',aspectRatio:String(aspect)};
 return <section className="textbook-page-slot" data-textbook-page={page} aria-label={`第 ${page} 页`} onPointerUp={capture} onKeyUp={capture}>
  <div ref={host} className="textbook-page-host"/>
  {!rendered&&<div className="textbook-page-placeholder" style={placeholderStyle}><div className="textbook-page-placeholder-status">{active&&busy?<><Loader2 size={18} className="animate-spin"/>正在打开第 {page} 页…</>:error?<><span>{error}</span><Button variant="outline" onClick={()=>setRetry(n=>n+1)}><RotateCcw size={15}/>重试</Button></>:<span>第 {page} 页</span>}</div></div>}
  {rendered&&busy&&<span className="textbook-page-refresh"><Loader2 size={14} className="animate-spin"/>正在调整页面</span>}
 </section>;
}

function annotationDraft(item:TextbookAnnotation):TextbookAnnotationDraft{return {id:item.id,bookId:item.bookId,page:item.page,quote:item.quote,note:item.note,color:item.color,rects:item.rects,sourceQuestionId:item.sourceQuestionId,revision:item.revision};}

function AnnotationEditor({draft,bookTitle,onChange,onClose,controller}:{draft:TextbookAnnotationDraft|null;bookTitle:string;onChange:(draft:TextbookAnnotationDraft)=>void;onClose:()=>void;controller:TextbookAnnotationsController}){
 const[confirmDelete,setConfirmDelete]=useState(false);if(!draft)return null;const saved=draft.revision!==undefined;
 const save=async(event:React.FormEvent)=>{event.preventDefault();const result=await controller.mutate({...draft,action:saved?'edit':'add'});if(result){toast.success(saved?'教材笔记已更新':'高亮与笔记已保存');onClose();}};
 const remove=async()=>{if(!saved)return;const result=await controller.mutate({action:'delete',id:draft.id,revision:draft.revision});if(result){toast.success('高亮已删除');setConfirmDelete(false);onClose();}};
 return <><Dialog open onOpenChange={open=>{if(!open&&!controller.busy)onClose();}}><DialogContent className="textbook-note-editor" showCloseButton={!controller.busy}><DialogHeader><DialogTitle>{saved?'编辑高亮笔记':'添加高亮笔记'}</DialogTitle><DialogDescription>{bookTitle} · 第 {draft.page} 页</DialogDescription></DialogHeader><form onSubmit={save}><blockquote>{draft.quote}</blockquote><div className="textbook-note-field"><Label htmlFor="textbook-note">我的笔记 <span>可留空，仅保留高亮</span></Label><Textarea autoFocus id="textbook-note" maxLength={10000} rows={5} value={draft.note} onChange={event=>onChange({...draft,note:event.target.value})} placeholder="记下规则、例外或容易混淆的地方"/></div>{controller.error&&<p className="vocab-error" role="alert">{controller.error}</p>}<DialogFooter className="textbook-note-actions">{saved&&<Button type="button" variant="ghost" className="text-[#aa4d5c] mr-auto" disabled={controller.busy} onClick={()=>setConfirmDelete(true)}><Trash2 size={15}/>删除高亮</Button>}<Button type="button" variant="outline" disabled={controller.busy} onClick={onClose}>取消</Button><Button type="submit" disabled={controller.busy}>{controller.busy?<Loader2 size={15} className="animate-spin"/>:<StickyNote size={15}/>}保存</Button></DialogFooter></form></DialogContent></Dialog><AlertDialog open={confirmDelete} onOpenChange={open=>{if(!controller.busy)setConfirmDelete(open);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条高亮？</AlertDialogTitle><AlertDialogDescription>高亮和填写的笔记会一起删除，教材原文不会受到影响。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={controller.busy}>取消</AlertDialogCancel><Button variant="destructive" disabled={controller.busy} onClick={()=>void remove()}>{controller.busy?'正在删除…':'确认删除'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

export function TextbookReader({references=[],initial,onClose,books,standalone=false,open=true,sourceQuestionId,annotations,onPositionChange}:{references?:LinkedTextbookReference[];initial:{bookId:string;page:number};onClose?:()=>void;books?:Textbook[];standalone?:boolean;open?:boolean;sourceQuestionId?:string;annotations:TextbookAnnotationsController;onPositionChange?:(bookId:string,page:number)=>void}){
 const availableBooks=useMemo(()=>{
  if(references.length){const source=books?.length?books:[];return [...new Set(references.map(ref=>ref.bookId))].map(id=>source.find(item=>item.id===id)??textbookById(id)).filter((item):item is Textbook=>!!item);}
  return books?.length?books:[];
 },[books,references]);
 const [bookId,setBookId]=useState(initial.bookId),[positions,setPositions]=useState<Record<string,number>>({[initial.bookId]:initial.page});
 const [pageInput,setPageInput]=useState(String(initial.page)),[zoom,setZoom]=useState(DEFAULT_TEXTBOOK_ZOOM),[overlay,setOverlay]=useState(false),[readerWidth,setReaderWidth]=useState(0);
 const [localBook,setLocalBook]=useState<{id:string;state:'remote'|'saving'|'saved'}|null>(null);
 const [selection,setSelection]=useState<SelectionDraft|null>(null),[editing,setEditing]=useState<TextbookAnnotationDraft|null>(null);
 const scrollRoot=useRef<HTMLDivElement>(null),scrollFrame=useRef<number|undefined>(undefined),lastReported=useRef(''),lastLayout=useRef('');
 const book=availableBooks.find(item=>item.id===bookId)??textbookById(bookId)??availableBooks[0];
 const localState=book&&localBook?.id===book.id?localBook.state:'checking';
 const refs=references.filter(ref=>ref.bookId===book?.id),related=[...new Set(refs.flatMap(ref=>ref.pageNumbers))];
 const page=book?positions[book.id]??related[0]??1:1;
 const annotationsByPage=useMemo(()=>{const map=new Map<number,TextbookAnnotation[]>();for(const item of annotations.data?.annotations??[])if(item.bookId===book?.id)map.set(item.page,[...(map.get(item.page)??[]),item]);return map;},[annotations.data?.annotations,book?.id]);
 const pageAnnotations=annotationsByPage.get(page)??[];
 const jumpToPage=useCallback((next:number,behavior:ScrollBehavior='smooth')=>requestAnimationFrame(()=>{const root=scrollRoot.current,node=root?.querySelector<HTMLElement>(`[data-textbook-page="${next}"]`);if(root&&node)root.scrollTo({top:Math.max(0,node.offsetTop-8),behavior});}),[]);
 const go=useCallback((next:number,behavior?:ScrollBehavior)=>{if(book&&Number.isInteger(next)&&next>=1&&next<=book.pageCount){setPositions(current=>({...current,[book.id]:next}));setPageInput(String(next));setSelection(null);window.getSelection()?.removeAllRanges();jumpToPage(next,behavior??(Math.abs(next-page)>3?'auto':'smooth'));}else setPageInput(String(page));},[book,jumpToPage,page]);
 useEffect(()=>{
  const key=`${initial.bookId}:${initial.page}`;if(key===lastReported.current)return;
  setBookId(initial.bookId);setPositions(current=>({...current,[initial.bookId]:initial.page}));setPageInput(String(initial.page));setSelection(null);requestAnimationFrame(()=>jumpToPage(initial.page,'auto'));
 },[initial.bookId,initial.page,jumpToPage]);
 useEffect(()=>{const root=scrollRoot.current;if(!root)return;const observer=new ResizeObserver(([entry])=>{const width=Math.floor(entry.contentRect.width-32);if(width>0)setReaderWidth(Math.max(240,width));});observer.observe(root);return()=>observer.disconnect();},[book?.id,overlay]);
 useLayoutEffect(()=>{if(!book||!readerWidth)return;const key=`${book.id}:${overlay?'overlay':'inline'}:${readerWidth}:${zoom}`;if(key===lastLayout.current)return;const root=scrollRoot.current,node=root?.querySelector<HTMLElement>(`[data-textbook-page="${page}"]`);if(!root||!node)return;lastLayout.current=key;root.scrollTo({top:Math.max(0,node.offsetTop-8),behavior:'auto'});},[book,overlay,page,readerWidth,zoom]);
 useEffect(()=>{if(standalone){setOverlay(false);return;}const mq=window.matchMedia('(max-width: 1250px)'),update=()=>setOverlay(mq.matches);update();mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update);},[standalone]);
 useEffect(()=>{if(!book)return;const key=`${book.id}:${page}`;lastReported.current=key;onPositionChange?.(book.id,page);setPageInput(String(page));},[book?.id,page,onPositionChange]);
 useEffect(()=>{let cancelled=false;if(!book||!canSaveTextbookLocally(book))return;void isTextbookSavedLocally(book).then(saved=>{if(!cancelled)setLocalBook({id:book.id,state:saved?'saved':'remote'});});return()=>{cancelled=true;};},[book]);
 useEffect(()=>()=>{if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);},[]);
 const syncVisiblePage=useCallback(()=>{
  if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{
   const root=scrollRoot.current;if(!root||!book)return;const rootRect=root.getBoundingClientRect(),probe=rootRect.top+Math.min(150,rootRect.height*.28);let chosen=page,best=Infinity;
   root.querySelectorAll<HTMLElement>('[data-textbook-page]').forEach(node=>{const rect=node.getBoundingClientRect(),number=Number(node.dataset.textbookPage),distance=probe<rect.top?rect.top-probe:probe>rect.bottom?probe-rect.bottom:0;if(distance<best){best=distance;chosen=number;}});
   if(chosen!==page){setPositions(current=>({...current,[book.id]:chosen}));setSelection(null);}
  });
 },[book,page]);
 const switchBook=(id:string)=>{const next=availableBooks.find(item=>item.id===id);if(!next)return;const nextPage=positions[id]??references.find(ref=>ref.bookId===id)?.pageNumbers[0]??1;setBookId(id);setZoom(DEFAULT_TEXTBOOK_ZOOM);setSelection(null);setPageInput(String(nextPage));requestAnimationFrame(()=>jumpToPage(nextPage,'auto'));};
 const openAnnotation=useCallback((item:TextbookAnnotation)=>setEditing(annotationDraft(item)),[]);
 if(!book)return null;
 const saveHighlight=async()=>{if(!selection)return;const item:TextbookAnnotationDraft={id:annotationId(),bookId:book.id,page:selection.page,quote:selection.quote,note:'',color:'yellow',rects:selection.rects,sourceQuestionId:sourceQuestionId??null};const result=await annotations.mutate({...item,action:'add'});if(result){toast.success('已高亮教材原文');setSelection(null);window.getSelection()?.removeAllRanges();}};
 const writeNote=()=>{if(!selection)return;setEditing({id:annotationId(),bookId:book.id,page:selection.page,quote:selection.quote,note:'',color:'yellow',rects:selection.rects,sourceQuestionId:sourceQuestionId??null});setSelection(null);window.getSelection()?.removeAllRanges();};
 const saveLocal=async()=>{if(localState==='saving'||localState==='saved')return;setLocalBook({id:book.id,state:'saving'});toast.loading(`正在保存 ${book.shortTitle}…`,{id:'textbook-local'});try{await saveTextbookLocally(book);setLocalBook({id:book.id,state:'saved'});toast.success('教材已保存到当前浏览器，之后会优先读取这份副本。',{id:'textbook-local'});}catch(error){setLocalBook({id:book.id,state:'remote'});toast.error((error as Error).message,{id:'textbook-local'});}};
 const content=<div className="textbook-reader-inner">
  <header className="textbook-reader-heading"><h2><BookOpen size={19}/>{standalone?book.shortTitle:'教材原文'}</h2>{onClose&&<Button variant="ghost" size="icon" aria-label="关闭教材，返回题目" onClick={onClose}><X size={18}/></Button>}</header>
  {availableBooks.length>1&&<Tabs value={book.id} onValueChange={switchBook} className="textbook-tabs"><TabsList aria-label="选择教材">{availableBooks.map(item=><TabsTrigger key={item.id} value={item.id}>{item.shortTitle}</TabsTrigger>)}</TabsList></Tabs>}
  {!!refs.length&&<div className="textbook-location"><p>{refs.map(ref=>ref.chapter).join('；')}</p><p>{refs.map(ref=>ref.section).join('；')}</p><div className="textbook-related"><span>本题相关页</span>{related.map(number=><Button key={number} size="sm" variant={page===number?'default':'outline'} onClick={()=>go(number)} aria-label={`定位 PDF 第 ${number} 页`} aria-pressed={page===number}>{number}</Button>)}</div>{refs.filter(ref=>ref.note).map(ref=><p key={ref.note} className="textbook-erratum"><b>笔记勘误：</b>{ref.note}</p>)}</div>}
  <div className="textbook-toolbar"><Button size="icon" variant="outline" aria-label="教材上一页" disabled={page<=1} onClick={()=>go(page-1)}><ChevronLeft size={17}/></Button><form onSubmit={event=>{event.preventDefault();go(Number(pageInput));}}><label htmlFor={`textbook-page-number-${standalone?'library':'question'}`}>PDF 页码</label><Input id={`textbook-page-number-${standalone?'library':'question'}`} aria-label="跳转教材页码，按回车确认" inputMode="numeric" value={pageInput} onChange={event=>setPageInput(event.target.value)} onBlur={()=>go(Number(pageInput))}/><span>/ {book.pageCount}</span></form><Button size="icon" variant="outline" aria-label="教材下一页" disabled={page>=book.pageCount} onClick={()=>go(page+1)}><ChevronRight size={17}/></Button><span className="textbook-scroll-hint">可在下方连续滚动</span><div className="textbook-zoom"><Button size="icon" variant="ghost" aria-label="缩小教材" disabled={zoom<=.75} onClick={()=>setZoom(value=>Math.max(.75,value-.25))}><ZoomOut size={16}/></Button><Button size="sm" variant="ghost" aria-label="适应阅读区宽度" onClick={()=>setZoom(1)}>{zoom===1?'适宽':`${Math.round(zoom*100)}%`}</Button><Button size="icon" variant="ghost" aria-label="放大教材" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,value+.25))}><ZoomIn size={16}/></Button></div></div>
  <div className="textbook-pages textbook-pages-continuous" ref={scrollRoot} onScroll={syncVisiblePage} onPointerDown={()=>setSelection(null)}><div className="textbook-page-stack">{Array.from({length:book.pageCount},(_,index)=>{const number=index+1;return <ContinuousPdfPage key={`${book.id}:${number}`} book={book} page={number} zoom={zoom} width={readerWidth} active={number===page} annotations={annotationsByPage.get(number)??[]} onSelect={setSelection} onOpen={openAnnotation}/>;})}</div></div>
  <footer className="textbook-reader-footer"><span>{book.shortTitle} · 第 {page} / {book.pageCount} 页</span><span className="textbook-page-note-count"><Highlighter size={14}/>{pageAnnotations.length?`本页 ${pageAnnotations.length} 条高亮`:'选中文字即可高亮'}</span><div className="textbook-reader-actions">{canSaveTextbookLocally(book)&&(localState==='saved'?<span className="textbook-local-status"><HardDrive size={14}/>已保存到此浏览器</span>:<Button type="button" size="sm" variant="ghost" disabled={localState==='checking'||localState==='saving'} onClick={()=>void saveLocal()}>{localState==='saving'?<Loader2 className="animate-spin" size={14}/>:<Download size={14}/>} {localState==='saving'?'正在保存…':'保存到此浏览器'}</Button>)}{book.url&&<a href={`${book.url}#page=${page}`} target="_blank" rel="noreferrer">单独打开 PDF<ExternalLink size={14}/></a>}</div></footer>
  {selection&&<div className="textbook-selection-menu" style={{left:selection.left,top:selection.top}} onPointerDown={event=>event.preventDefault()}><Button size="sm" disabled={annotations.busy} onClick={()=>void saveHighlight()}><Highlighter size={15}/>高亮</Button><Button size="sm" variant="outline" disabled={annotations.busy} onClick={writeNote}><Pencil size={15}/>写笔记</Button></div>}
  <AnnotationEditor draft={editing} bookTitle={book.shortTitle} onChange={setEditing} onClose={()=>setEditing(null)} controller={annotations}/>
 </div>;
 if(overlay)return <Dialog open={open} onOpenChange={next=>{if(!next)onClose?.();}}><DialogContent overlayClassName="textbook-dialog-overlay" className="textbook-dialog" showCloseButton={false}><DialogTitle className="sr-only">教材原文</DialogTitle><DialogDescription className="sr-only">在教材之间切换，连续滚动阅读，并对原文进行高亮或记录笔记。</DialogDescription>{content}</DialogContent></Dialog>;
 return standalone?<section className="textbook-reader textbook-reader-standalone" aria-label="教材原文阅读区">{content}</section>:<aside id="textbook-reader" className={`textbook-reader ${open?'':'textbook-reader-hidden'}`} aria-hidden={!open} aria-label="教材原文阅读区">{content}</aside>;
}
