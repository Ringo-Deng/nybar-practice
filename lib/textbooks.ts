import catalog from './textbooks.json';
import type {TextbookReference} from './study-types';

export type Textbook={id:string;title:string;shortTitle:string;subjectId:string;version:string;pageCount:number;url?:string;sha256:string;pageUrlTemplate?:string;imported?:boolean;originalName?:string;sizeBytes?:number;createdAt?:number};
export type LinkedTextbookReference=TextbookReference&{bookId:string;pageNumbers:number[]};
export const textbooks:Textbook[]=catalog;
export const textbookById=(id?:string)=>textbooks.find(book=>book.id===id);
function browserAssetUrl(url:string){
 if(typeof document==='undefined'||!url.startsWith('/'))return url;
 return new URL(url.slice(1),document.baseURI).toString();
}
export function textbookPageSource(book:Textbook,page:number){
 if(!Number.isInteger(page)||page<1||page>book.pageCount)throw Error('无效的教材页码');
 const pageUrl=book.pageUrlTemplate?book.pageUrlTemplate.replace('{page}',String(page)):book.url;
 if(!pageUrl)throw Error('教材页面文件不存在');
 return {url:browserAssetUrl(pageUrl),pageNumber:book.pageUrlTemplate?1:page,documentPages:book.pageUrlTemplate?1:book.pageCount};
}
export function linkedTextbooks(refs:TextbookReference[]=[]):LinkedTextbookReference[]{
 return refs.filter((ref):ref is LinkedTextbookReference=>{
  const book=textbookById(ref.bookId);
  return !!book&&!!ref.pageNumbers?.length&&ref.pageNumbers.every(n=>Number.isInteger(n)&&n>=1&&n<=book.pageCount);
 });
}
