const compactWhitespace=(value:string)=>value
 .replace(/\r\n?/g,'\n')
 .replace(/[\t ]+/g,' ')
 .trim();

export function normalizeInlineQuestionText(value:string):string{
 return compactWhitespace(value).replace(/\s*\n+\s*/g,' ').replace(/ {2,}/g,' ').trim();
}

export function normalizeExplanationText(value:string):string{
 const paragraphs=compactWhitespace(value)
  .split(/\n\s*\n+/)
  .map(part=>part.replace(/\s*\n\s*/g,' ').replace(/ {2,}/g,' ').trim())
  .filter(Boolean);
 return paragraphs.reduce<string[]>((result,paragraph)=>{
  const previous=result.at(-1);
  if(previous&&!/[.!?。！？][\]})'\u2019\u201d\"]*$/.test(previous))result[result.length-1]=`${previous} ${paragraph}`;
  else result.push(paragraph);
  return result;
 },[]).join('\n\n');
}
