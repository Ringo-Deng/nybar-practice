'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {BookOpen,FileUp,Highlighter,Loader2,Pencil} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {subjectById} from '@/lib/subjects';
import {TextbookReader} from './textbook-reader';
import type {Textbook} from '@/lib/textbooks';
import type {TextbookAnnotationsController} from './use-textbook-annotations';
import type {TextbookCatalogController} from './use-textbook-catalog';

const LAST_TEXTBOOK_POSITION_KEY='nybar-practice:textbook-position:v1';
function savedPosition(books:Textbook[]){
 try{const value=JSON.parse(localStorage.getItem(LAST_TEXTBOOK_POSITION_KEY)??'null') as {bookId?:unknown;page?:unknown}|null;const book=books.find(item=>item.id===value?.bookId);if(!book)return null;const page=typeof value?.page==='number'&&Number.isInteger(value.page)?Math.max(1,Math.min(book.pageCount,value.page)):1;return {bookId:book.id,page};}catch{return null;}
}
function savePosition(bookId:string,page:number){try{localStorage.setItem(LAST_TEXTBOOK_POSITION_KEY,JSON.stringify({bookId,page}));}catch{/* Reading still works when browser storage is unavailable. */}}

export function TextbookLibrary({controller,catalog,guest=false}:{controller:TextbookAnnotationsController;catalog:TextbookCatalogController;guest?:boolean}){
 const[first]=catalog.books;const[selectedId,setSelectedId]=useState(first?.id??'');const[target,setTarget]=useState({bookId:first?.id??'',page:1});
 const[positionReady,setPositionReady]=useState(false);
 const[renameBook,setRenameBook]=useState<Textbook|null>(null),[renameValue,setRenameValue]=useState('');
 const[importOpen,setImportOpen]=useState(false),[importFile,setImportFile]=useState<File|null>(null),[importName,setImportName]=useState('');
 const book=catalog.books.find(item=>item.id===selectedId)??first;
 const annotations=controller.data?.annotations??[];
 const bookNotes=useMemo(()=>annotations.filter(item=>item.bookId===book?.id).sort((a,b)=>a.page-b.page||b.updatedAt-a.updatedAt),[annotations,book?.id]);
 const groups=useMemo(()=>{
  const ids=[...new Set(catalog.books.map(item=>item.subjectId))];ids.sort((a,b)=>a==='my-materials'?-1:b==='my-materials'?1:0);
  return ids.map(id=>({id,books:catalog.books.filter(item=>item.subjectId===id)}));
 },[catalog.books]);
 useEffect(()=>{if(positionReady||catalog.loading)return;const timer=window.setTimeout(()=>{const fallback=catalog.books[0];if(!fallback){setPositionReady(true);return;}const saved=savedPosition(catalog.books)??{bookId:fallback.id,page:1};setSelectedId(saved.bookId);setTarget(saved);setPositionReady(true);},0);return()=>window.clearTimeout(timer);},[catalog.books,catalog.loading,positionReady]);
 const selectBook=(id:string)=>{const firstNote=annotations.filter(item=>item.bookId===id).sort((a,b)=>a.page-b.page)[0];setSelectedId(id);setTarget({bookId:id,page:firstNote?.page??1});};
 const handlePosition=useCallback((bookId:string,page:number)=>{setTarget(current=>current.bookId===bookId&&current.page===page?current:{bookId,page});savePosition(bookId,page);},[]);
 const openRename=(item:Textbook)=>{setRenameBook(item);setRenameValue(item.shortTitle);};
 const submitRename=async(event:React.FormEvent)=>{event.preventDefault();if(!renameBook||!renameValue.trim())return;if(await catalog.rename(renameBook.id,renameValue.trim()))setRenameBook(null);};
 const chooseFile=(file?:File)=>{setImportFile(file??null);if(file&&!importName.trim())setImportName(file.name.replace(/\.pdf$/i,''));};
 const submitImport=async(event:React.FormEvent)=>{event.preventDefault();if(!importFile||!importName.trim())return;if(await catalog.importPdf(importFile,importName.trim())){setImportOpen(false);setImportFile(null);setImportName('');}};
 if(!positionReady)return <div className="empty"><Loader2 className="animate-spin" size={24}/><p>正在打开上次阅读位置…</p></div>;
 return <section className="textbook-library-page">
  {(controller.error||catalog.error)&&<div className="notice error" role="alert"><span>{controller.error||catalog.error}</span><Button variant="outline" disabled={controller.busy||controller.loading||catalog.busy||catalog.loading} onClick={()=>void Promise.all([controller.load(),catalog.load()])}>重新读取</Button></div>}
  {!book?<div className="empty"><BookOpen/><p>尚无教材。</p><Button onClick={()=>setImportOpen(true)} disabled={catalog.busy}><FileUp size={15}/>导入 PDF</Button></div>:<div className="textbook-library-layout">
   <aside className="textbook-catalog" aria-label="教材目录"><div className="textbook-catalog-heading"><div><h1><BookOpen size={21}/>教材</h1><span>{catalog.books.length} 本</span></div><Button size="sm" onClick={()=>setImportOpen(true)} disabled={catalog.busy}><FileUp size={15}/>导入</Button></div>{groups.map(group=><section key={group.id}><h2>{group.id==='my-materials'?'我的教材':subjectById(group.id)?.zh??group.id}</h2>{group.books.map(item=>{const count=annotations.filter(note=>note.bookId===item.id).length;return <div className={`textbook-catalog-row ${item.id===book.id?'active':''}`} key={item.id}><button className="textbook-catalog-select" onClick={()=>selectBook(item.id)} aria-current={item.id===book.id?'page':undefined}><span>{item.shortTitle}</span><small>{item.version}{count?` · ${count} 条高亮`:''}</small></button><Button size="icon" variant="ghost" aria-label={`重命名 ${item.shortTitle}`} onClick={()=>openRename(item)}><Pencil size={14}/></Button></div>;})}</section>)}</aside>
   <div className="textbook-library-reader"><TextbookReader references={[]} books={[book]} initial={target} annotations={controller} standalone onPositionChange={handlePosition}/></div>
   <aside className="textbook-note-index" aria-label="教材高亮笔记"><div className="textbook-note-index-heading"><div><h2><Highlighter size={18}/>高亮笔记</h2><p>{book.shortTitle}</p></div><span>{bookNotes.length}</span></div>{controller.loading&&!controller.data?<div className="textbook-notes-loading"><Loader2 className="animate-spin" size={18}/>正在读取…</div>:!bookNotes.length?<div className="textbook-notes-empty"><p>还没有高亮。</p><small>在中间教材页选中文字，即可高亮或补充笔记。</small></div>:<div className="textbook-note-list">{bookNotes.map(item=><button key={item.id} onClick={()=>setTarget({bookId:item.bookId,page:item.page})}><span>第 {item.page} 页</span><blockquote>{item.quote}</blockquote>{item.note&&<p>{item.note}</p>}</button>)}</div>}</aside>
  </div>}
  <Dialog open={!!renameBook} onOpenChange={open=>{if(!open&&!catalog.busy)setRenameBook(null);}}><DialogContent className="textbook-manage-dialog"><DialogHeader><DialogTitle>重命名教材</DialogTitle><DialogDescription>只改变你在刷题室看到的名称，不会修改 PDF 文件。</DialogDescription></DialogHeader><form onSubmit={submitRename}><div className="textbook-manage-field"><Label htmlFor="textbook-rename">教材名称</Label><Input id="textbook-rename" autoFocus maxLength={120} value={renameValue} onChange={event=>setRenameValue(event.target.value)}/></div><DialogFooter><Button type="button" variant="outline" disabled={catalog.busy} onClick={()=>setRenameBook(null)}>取消</Button><Button type="submit" disabled={catalog.busy||!renameValue.trim()}>{catalog.busy?<Loader2 size={15} className="animate-spin"/>:<Pencil size={15}/>}保存名称</Button></DialogFooter></form></DialogContent></Dialog>
  <Dialog open={importOpen} onOpenChange={open=>{if(!catalog.busy)setImportOpen(open);}}><DialogContent className="textbook-manage-dialog"><DialogHeader><DialogTitle>导入教材 PDF</DialogTitle><DialogDescription>{guest?'PDF 只保存在当前浏览器中，清除网站数据或更换设备后需要重新导入。单份不超过 80 MB。':'PDF 会保存到你的账号中，导入后可连续阅读、高亮并记录笔记。单份不超过 80 MB。'}</DialogDescription></DialogHeader><form onSubmit={submitImport}><div className="textbook-manage-field"><Label htmlFor="textbook-file">PDF 文件</Label><Input id="textbook-file" type="file" accept="application/pdf,.pdf" onChange={event=>chooseFile(event.target.files?.[0])}/></div><div className="textbook-manage-field"><Label htmlFor="textbook-import-name">教材名称</Label><Input id="textbook-import-name" maxLength={120} value={importName} onChange={event=>setImportName(event.target.value)} placeholder="例如：MBE Evidence Notes"/></div><DialogFooter><Button type="button" variant="outline" disabled={catalog.busy} onClick={()=>setImportOpen(false)}>取消</Button><Button type="submit" disabled={catalog.busy||!importFile||!importName.trim()}>{catalog.busy?<Loader2 size={15} className="animate-spin"/>:<FileUp size={15}/>}导入教材</Button></DialogFooter></form></DialogContent></Dialog>
 </section>;
}
