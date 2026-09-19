export type QuestionSource={id:string;name:string;description:string};
// These are library categories, not claims that licensed questions are included.
export const questionSources:QuestionSource[]=[
 {id:'ncbe',name:'NCBE',description:'官方题目'},
 {id:'barbri',name:'BARBRI',description:'BARBRI 练习题'},
 {id:'adaptibar',name:'AdaptiBar',description:'AdaptiBar 练习题'},
 {id:'uworld',name:'UWorld',description:'UWorld 练习题'},
 {id:'personal',name:'我的题目',description:'个人整理的练习题'},
];
export const sourceById=(id?:string)=>questionSources.find(source=>source.id===id);
export const questionNumberLabel=(q:{number:number;sourceSession?:number;sourceId?:string})=>q.sourceSession?`Set ${q.sourceSession} · Q${q.number}`:`Q${q.number}`;
export const officialSamplesUrl='https://www.ncbex.org/exams/mbe/preparing-mbe';
