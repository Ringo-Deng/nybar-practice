export type TranslationProgress={message:string;completed?:number;total?:number};
export type TranslationWorkerRequest={id:number;text:string};
export type TranslationWorkerResponse=
 | {id:number;type:'progress';progress:TranslationProgress}
 | {id:number;type:'result';text:string}
 | {id:number;type:'error';message:string};
