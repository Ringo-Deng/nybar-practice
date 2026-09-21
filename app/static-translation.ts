export type TranslationFields=Record<string,{en:string;zh?:string}>;

/** Read the Chinese layer shipped with the question bank. */
export function staticTranslation(fields:TranslationFields){
 const values=Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.zh?.trim()??'']));
 const missing=Object.values(fields).some(field=>field.en.trim()&&!field.zh?.trim());
 return {
  values,
  missing,
  message:missing?'这道题的静态中文译文缺失，请查看英文原文。':'',
 };
}
