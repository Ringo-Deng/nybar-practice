import type {PDFDocumentProxy} from 'pdfjs-dist';

type Source={url:string;documentPages:number};
type Handle={promise:Promise<PDFDocumentProxy>;destroy:()=>Promise<void>};
type Entry=Handle&{users:number;used:number;settled:boolean};

// Keep decoded pages across reader mounts. Active renders hold a lease, so
// eviction cannot destroy a page while PDF.js is drawing it.
export function createPdfPageCache(load:(source:Source)=>Handle,limit=8){
 const entries=new Map<string,Entry>();let clock=0;
 const dispose=(entry:Entry)=>{void entry.destroy().catch(()=>{});};
 const trim=()=>{
  const idle=[...entries].filter(([,entry])=>!entry.users&&entry.settled).sort((a,b)=>a[1].used-b[1].used);
  while(entries.size>limit&&idle.length){const [url,entry]=idle.shift()!;entries.delete(url);dispose(entry);}
 };
 const acquire=(source:Source)=>{
  let entry=entries.get(source.url);
  if(!entry){
   const handle=load(source);
   const created:Entry={...handle,users:0,used:++clock,settled:false};
   created.promise=handle.promise.then(document=>{
    if(document.numPages!==source.documentPages)throw Error('教材版本与页码不一致');
    created.settled=true;trim();return document;
   }).catch(error=>{
    if(entries.get(source.url)===created)entries.delete(source.url);
    dispose(created);throw error;
   });
   entry=created;entries.set(source.url,entry);
  }
  const held=entry;held.users++;held.used=++clock;let released=false;
  return {promise:held.promise,release:()=>{if(released)return;released=true;held.users--;trim();}};
 };
 return {acquire};
}
