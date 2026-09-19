import {textbookPageSource,type Textbook} from './textbooks';

const CACHE_NAME='nybar-practice-textbooks-v2';
const MANIFEST_KEY='nybar-practice:textbook-downloads:v2';
type Manifest=Record<string,{savedAt:number;size:number}>;

export function canSaveTextbookLocally(book:Textbook){
 return !book.imported&&!book.pageUrlTemplate&&!!book.url;
}

function cacheAvailable(){return typeof window!=='undefined'&&'caches' in window;}
function sourceUrl(book:Textbook){return textbookPageSource(book,1).url;}
function readManifest():Manifest{
 if(typeof localStorage==='undefined')return {};
 try{const value=JSON.parse(localStorage.getItem(MANIFEST_KEY)??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value as Manifest:{};}catch{return {};}
}
function writeManifest(value:Manifest){localStorage.setItem(MANIFEST_KEY,JSON.stringify(value));}
function validPdf(bytes:Uint8Array){return bytes.length>5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;}
function removeFromManifest(url:string){try{const manifest=readManifest();if(manifest[url]){delete manifest[url];writeManifest(manifest);}}catch{/* A missing manifest is treated as not downloaded. */}}

export async function isTextbookSavedLocally(book:Textbook){
 if(!canSaveTextbookLocally(book)||!cacheAvailable())return false;
 const url=sourceUrl(book);
 if(!readManifest()[url])return false;
 try{
  const found=!!(await caches.open(CACHE_NAME)).match(url);
  if(!found)removeFromManifest(url);
  return found;
 }catch{return false;}
}

export async function saveTextbookLocally(book:Textbook){
 if(!canSaveTextbookLocally(book))throw new Error('这本教材已经保存在当前浏览器，或暂不支持离线保存。');
 if(!cacheAvailable())throw new Error('当前浏览器不支持保存教材，请使用最新版 Chrome、Edge 或 Safari。');
 const url=sourceUrl(book),response=await fetch(url,{credentials:'same-origin'});
 if(!response.ok)throw new Error(`教材下载失败（${response.status}），请检查网络后重试。`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(!validPdf(bytes))throw new Error('下载内容不是有效的 PDF，请刷新页面后重试。');
 const cache=await caches.open(CACHE_NAME),headers=new Headers(response.headers);
 headers.set('Content-Type','application/pdf');headers.set('Content-Length',String(bytes.byteLength));
 try{
  await cache.put(url,new Response(bytes,{status:200,headers}));
  const manifest=readManifest();manifest[url]={savedAt:Date.now(),size:bytes.byteLength};writeManifest(manifest);
 }catch{
  await cache.delete(url).catch(()=>false);removeFromManifest(url);
  throw new Error('浏览器无法保存这本教材，请检查可用空间或网站存储权限。');
 }
 try{await navigator.storage?.persist?.();}catch{/* Browser persistence is best-effort. */}
}

export async function readSavedTextbook(url:string){
 if(!cacheAvailable()||!/^https?:/i.test(url)||!readManifest()[url])return undefined;
 try{
  const cache=await caches.open(CACHE_NAME),response=await cache.match(url);
  if(!response){removeFromManifest(url);return undefined;}
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(validPdf(bytes))return bytes;
  await cache.delete(url);removeFromManifest(url);return undefined;
 }catch{return undefined;}
}
