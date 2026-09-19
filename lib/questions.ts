import bank from './question-bank.json';
import type {Question,Explanation} from './study-types';
export type FullQuestion=Question&{explanation:Explanation};
export const questions:FullQuestion[]=bank as FullQuestion[];
export function publicQuestions(){return questions.map(({explanation,knowledge,...q})=>q);}
