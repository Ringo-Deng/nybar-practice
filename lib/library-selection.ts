import {questionSources} from './question-sources';
import {subjects} from './subjects';

export type LibrarySelection={source:string;chosen:string|null};
export const librarySelectionKey='nybar-practice:library-selection:v1';
export const defaultLibrarySelection:LibrarySelection={source:'all',chosen:null};

function browserSessionStorage():Storage|undefined{
 try{return typeof window==='undefined'?undefined:window.sessionStorage;}catch{return undefined;}
}

export function readLibrarySelection(storage:Pick<Storage,'getItem'>|undefined=browserSessionStorage()):LibrarySelection{
 try{
  const saved=JSON.parse(storage?.getItem(librarySelectionKey)??'null');
  const validSource=saved?.source==='all'||questionSources.some(source=>source.id===saved?.source);
  if(!validSource)return {...defaultLibrarySelection};
  return {source:saved.source,chosen:subjects.some(subject=>subject.id===saved.chosen)?saved.chosen:null};
 }catch{return {...defaultLibrarySelection};}
}

export function writeLibrarySelection(selection:LibrarySelection,storage:Pick<Storage,'setItem'>|undefined=browserSessionStorage()){
 try{storage?.setItem(librarySelectionKey,JSON.stringify(selection));}catch{/* Navigation remains usable when browser storage is unavailable. */}
}
