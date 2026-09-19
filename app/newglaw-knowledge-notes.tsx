'use client';
import {BookMarked,ExternalLink} from 'lucide-react';
import type {NewglawNote} from '@/lib/newglaw-note-types';

export function NewglawKnowledgeNotes({notes}:{notes:NewglawNote[]}){
 if(!notes.length)return null;
 return <section id="newglaw-knowledge" className="newglaw-knowledge" aria-labelledby="newglaw-heading">
  <div className="newglaw-heading">
   <BookMarked size={19}/>
   <div><h3 id="newglaw-heading">补充知识要点</h3><p>依原网页章节与顺序忠实改写，未加入其他教材内容。</p></div>
  </div>
  <div className="newglaw-note-list">
   {notes.map(note=><details className="newglaw-note" key={note.id}>
    <summary><span>{note.title}</span><small>{note.sections.length} 个小节</small></summary>
    <div className="newglaw-note-body">
     {note.sections.map(section=><section key={section.heading}><h4>{section.heading}</h4><ul>{section.points.map((point,index)=><li key={`${section.heading}-${index}`}>{point}</li>)}</ul></section>)}
     <a className="newglaw-source-link" href={note.url} target="_blank" rel="noreferrer">查看资料原文<ExternalLink size={13}/></a>
    </div>
   </details>)}
  </div>
 </section>;
}
