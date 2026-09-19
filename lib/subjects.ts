export type Subject = {id:string;zh:string;en:string;group:'MBE';scope:string};
export const subjects:Subject[] = [
 {id:'civil-procedure',zh:'民事诉讼法',en:'Civil Procedure',group:'MBE',scope:'管辖权、诉状、证据开示、审前程序、审判与上诉'},
 {id:'constitutional-law',zh:'宪法',en:'Constitutional Law',group:'MBE',scope:'司法审查、联邦权力、州与联邦关系及个人权利'},
 {id:'contracts',zh:'合同法',en:'Contracts',group:'MBE',scope:'合同成立、履行、违约与救济及货物买卖'},
 {id:'criminal-law-procedure',zh:'刑法与刑事诉讼',en:'Criminal Law and Procedure',group:'MBE',scope:'犯罪构成、抗辩、搜查扣押、讯问与被告人权利'},
 {id:'evidence',zh:'证据法',en:'Evidence',group:'MBE',scope:'相关性、证人、传闻、特权及证据认证'},
 {id:'real-property',zh:'不动产法',en:'Real Property',group:'MBE',scope:'地产权益、租赁、转让、登记、抵押与土地使用'},
 {id:'torts',zh:'侵权法',en:'Torts',group:'MBE',scope:'故意侵权、过失、严格责任、抗辩与损害赔偿'},
];
export const subjectById=(id?:string)=>subjects.find(subject=>subject.id===id);
export const syllabusUrl='https://www.ncbex.org/exams/mbe/preparing-mbe';
