// Intervals and the same-day retry queue follow Kanban v5.34's learning panel.
// These are product conventions, not a claimed exact forgetting curve.
export const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60] as const;
export type Rating = 'again' | 'hard' | 'good';
export type VocabularyCard = {
 id:string;word:string;kind:'term'|'word';meaning:string;example:string;
 questionId:string|null;sessionId:string|null;subjectId:string|null;sourceLabel:string;
 stage:number;nextReview:string;reviewCount:number;lastReviewedAt:number|null;
 lastReviewedDate:string|null;queueDate:string|null;queueOrder:number;
 createdAt:number;updatedAt:number;revision:number;
};
export type VocabularyData = {cards:VocabularyCard[];today:string;timeZone:string;savedId?:string;duplicate?:boolean};
export type VocabularyDraft = Pick<VocabularyCard,'word'|'kind'|'meaning'|'example'|'questionId'|'sessionId'> & {id:string;revision?:number;subjectId?:string|null;sourceLabel?:string};
export function wordKey(word:string){return word.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');}
export function validTimeZone(value:unknown){
 const zone=typeof value==='string'&&value.length<=80?value:'Asia/Shanghai';
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone;}catch{return 'Asia/Shanghai';}
}
export function reviewDate(timeZone:string,now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
export function addDays(today:string,days:number){const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function nextReview(card:Pick<VocabularyCard,'stage'>,rating:Rating,today:string,now=Date.now()){
 const oldStage=Math.max(0,Math.min(REVIEW_INTERVALS.length-1,card.stage));
 const stage=rating==='good'?Math.min(oldStage+1,REVIEW_INTERVALS.length-1):oldStage;
 return {stage,nextReview:rating==='again'?today:addDays(today,rating==='hard'?1:REVIEW_INTERVALS[stage]),queueDate:rating==='again'?today:null,queueOrder:rating==='again'?now:0,lastReviewedAt:now,lastReviewedDate:today};
}
export function dueCards(cards:VocabularyCard[],today:string){
 return cards.filter(c=>c.nextReview<=today).sort((a,b)=>{
  const aq=a.queueDate===today?a.queueOrder:0,bq=b.queueDate===today?b.queueOrder:0;
  return Number(aq>0)-Number(bq>0)||(aq&&bq?aq-bq:0)||a.nextReview.localeCompare(b.nextReview)||a.createdAt-b.createdAt||a.id.localeCompare(b.id);
 });
}
