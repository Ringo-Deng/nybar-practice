type ExplanationBlock={kind:'paragraph'|'bullet'|'choice'|'objective'|'heading'|'layout-heading'|'reference'|'copyright';text:string};

function explanationBlocks(value:string,hasLayout:boolean):ExplanationBlock[]{
 const paragraphs=value.replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/).map(part=>part.replace(/\s*\n\s*/g,' ').replace(/[\t ]+/g,' ').trim()).filter(Boolean);
 let inReferences=false;
 let objectiveNext=false;
 const blocks:ExplanationBlock[]=[];
 for(const text of paragraphs){
  if(hasLayout&&!blocks.length&&text.length<90&&!/[.!?。！？：:]$/.test(text)){
   blocks.push({kind:'layout-heading',text});continue;
  }
  if(/^References\s*:?$/i.test(text)||/^参考(?:资料|文献)\s*[:：]?$/.test(text)){
   inReferences=true;blocks.push({kind:'heading',text});continue;
  }
  if(/^Copyright\b|^版权(?:声明)?\s*[:：]|^版权所有/i.test(text)){blocks.push({kind:'copyright',text});continue;}
  if(/^(?:Educational objective|学习要点|教育目标|学习目标)\s*[:：]?$/i.test(text)){objectiveNext=true;continue;}
  if(/^(?:Educational objective|学习要点|教育目标|学习目标)\s*[:：]/i.test(text)){
   blocks.push({kind:'objective',text});continue;
  }
  if(objectiveNext){blocks.push({kind:'objective',text});objectiveNext=false;continue;}
  if(inReferences){blocks.push({kind:'reference',text});continue;}
  if(/^[（(](?:Choices?|选择|选项)\s*[A-D]|^[（(][A-D]\s*选择/i.test(text)){blocks.push({kind:'choice',text});continue;}
  blocks.push({kind:/^[•●▪·–-]\s*/.test(text)?'bullet':'paragraph',text});
 }
 return blocks;
}

export function PublisherExplanation({text,hasLayout=false}:{text:string;hasLayout?:boolean}){
 return <div className="publisher-explanation">
  {explanationBlocks(text,hasLayout).map((block,index)=>{
   if(block.kind==='objective')return <aside className="publisher-objective" key={index}><strong>{/^Educational objective/i.test(block.text)?'Educational objective':'学习要点'}</strong><p>{block.text.replace(/^(?:Educational objective|学习要点|教育目标|学习目标)\s*[:：]\s*/i,'')}</p></aside>;
   if(block.kind==='heading')return <h3 className="publisher-references-title" key={index}>{/^References/i.test(block.text)?'References':'参考资料'}</h3>;
   if(block.kind==='layout-heading')return <h3 className="publisher-layout-heading" key={index}>{block.text}</h3>;
   return <p key={index} className={`publisher-${block.kind}`}>{block.text}</p>;
  })}
 </div>;
}
