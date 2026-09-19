import type {PDFDocumentLoadingTask,PDFWorker} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {createPdfPageCache} from './pdf-page-cache';
import {readSavedTextbook} from './textbook-local-cache';
import {textbookPageSource,type Textbook} from './textbooks';

let engine:Promise<typeof import('pdfjs-dist')>|undefined;
let worker:PDFWorker|undefined;
export function loadPdfEngine(){
 if(!engine)engine=import('pdfjs-dist').then(lib=>{
  lib.GlobalWorkerOptions.workerSrc=workerUrl;return lib;
 }).catch(error=>{engine=undefined;throw error;});
 return engine;
}

const cache=createPdfPageCache(source=>{
 let task:PDFDocumentLoadingTask|undefined;
 const promise=loadPdfEngine().then(async lib=>{
  const saved=await readSavedTextbook(source.url);
  if(!worker||worker.destroyed)worker=new lib.PDFWorker();
  const currentWorker=worker;
  return currentWorker.promise.then(()=>{
   const standardFontDataUrl=typeof document==='undefined'?'/pdfjs/standard_fonts/':new URL('pdfjs/standard_fonts/',document.baseURI).toString();
   task=lib.getDocument(saved?{data:saved,worker:currentWorker,standardFontDataUrl,useWasm:false}:{url:source.url,worker:currentWorker,withCredentials:true,standardFontDataUrl,useWasm:false});
   return task.promise;
  },error=>{currentWorker.destroy();if(worker===currentWorker)worker=undefined;throw error;});
 });
 return {promise,destroy:async()=>{await promise.catch(()=>{});await task?.destroy();}};
});

export function acquireTextbookPage(book:Textbook,page:number){return cache.acquire(textbookPageSource(book,page));}
export function preloadTextbookPage(book:Textbook,page:number){
 if(typeof window==='undefined'||page<1||page>book.pageCount)return;
 const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
 if(connection?.saveData||connection?.effectiveType==='slow-2g'||connection?.effectiveType==='2g')return;
 const held=acquireTextbookPage(book,page);
 void held.promise.catch(()=>{}).finally(held.release);
}
