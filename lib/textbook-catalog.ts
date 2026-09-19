import {textbooks,type Textbook} from './textbooks';

export type TextbookCatalogData={titles:Record<string,string>;imported:Textbook[]};

export function mergeTextbookCatalog(data?:TextbookCatalogData|null){
 const renamed=textbooks.map(book=>{
  const title=data?.titles[book.id]?.trim();
  return title?{...book,title,shortTitle:title}:book;
 });
 return [...renamed,...(data?.imported??[])];
}
