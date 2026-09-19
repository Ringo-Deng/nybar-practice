import type {Question} from './study-types';
export type Chapter={id:string;subjectId:string;bookId:string;bookZh:string;bookEn:string;number:number;zh:string;en:string};
// Add chapters only when a corresponding Nybar source has been imported.
export const chapters:Chapter[]=[];
export const chapterById=(id?:string)=>chapters.find(chapter=>chapter.id===id);
export function filterQuestions<T extends Pick<Question,'sourceId'|'subjectId'|'chapterId'|'sourceSet'>>(items:T[],filter:{sourceId?:string;subjectId?:string;chapterId?:string;sourceSet?:string}){
 return items.filter(q=>(!filter.sourceId||filter.sourceId==='all'||q.sourceId===filter.sourceId)&&(!filter.subjectId||q.subjectId===filter.subjectId)&&(!filter.chapterId||q.chapterId===filter.chapterId)&&(!filter.sourceSet||q.sourceSet===filter.sourceSet));
}
