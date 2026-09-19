export type AnnotationRect={x:number;y:number;width:number;height:number};
export type TextbookAnnotation={
 id:string;bookId:string;page:number;quote:string;note:string;color:'yellow';rects:AnnotationRect[];
 sourceQuestionId:string|null;createdAt:number;updatedAt:number;revision:number;
};
export type TextbookAnnotationData={annotations:TextbookAnnotation[]};
export type TextbookAnnotationDraft=Omit<TextbookAnnotation,'createdAt'|'updatedAt'|'revision'>&{revision?:number};

export function validAnnotationRects(value:unknown):value is AnnotationRect[]{
 if(!Array.isArray(value)||!value.length||value.length>100)return false;
 return value.every(rect=>{
  if(!rect||typeof rect!=='object')return false;
  const item=rect as Record<string,unknown>;
  const numbers=['x','y','width','height'].map(key=>item[key]);
  if(!numbers.every(number=>typeof number==='number'&&Number.isFinite(number)))return false;
  const [x,y,width,height]=numbers as number[];
  return x>=0&&y>=0&&width>0&&height>0&&x+width<=1.01&&y+height<=1.01;
 });
}
