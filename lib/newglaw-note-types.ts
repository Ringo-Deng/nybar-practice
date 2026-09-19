export type NewglawSection={
 heading:string;
 points:string[];
};
export type NewglawNote={
 id:string;
 title:string;
 url:string;
 sections:NewglawSection[];
};
