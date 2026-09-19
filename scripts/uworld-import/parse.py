from pathlib import Path
import json,re,collections,hashlib,shutil,argparse
cli=argparse.ArgumentParser();cli.add_argument('--work-dir',type=Path,required=True);args=cli.parse_args()
base=args.work_dir.resolve();repo=Path(__file__).resolve().parents[2]
layout=json.loads((base/'pages/layout.json').read_text());meta=json.loads((base/'source-manifest.json').read_text());qpages=json.loads((base/'preflight.json').read_text())['qPages']
assert meta['sha256']=='859fe102be0372d7c0517af8a52c758683a75cc4b287803bc99951462b5d6e01','This parser is verified only for the recorded source PDF.'
map_path=repo/'data/uworld-2025/appendix-subject-map.json';subject_map=json.loads(map_path.read_text()) if map_path.exists() else {}
subjects={'Civil Procedure':'civil-procedure','Constitutional Law':'constitutional-law','Contracts':'contracts','Criminal Law':'criminal-law-procedure','Criminal Procedure':'criminal-law-procedure','Evidence':'evidence','Real Property':'real-property','Torts':'torts'}
zh={'Civil Procedure':'民事诉讼法','Constitutional Law':'宪法','Contracts':'合同法','Criminal Law':'刑法','Criminal Procedure':'刑事诉讼','Evidence':'证据法','Real Property':'不动产法','Torts':'侵权法'}
zh_id={v:zh[k] for k,v in subjects.items()};zh_id['criminal-law-procedure']='刑法与刑事诉讼'
def clean(s):return s.replace('\ufffe','-').replace('\u00ad','').replace('\u00a0',' ').replace('\x00','')
def flat(s):return re.sub(r'\s+',' ',clean(s)).strip()
def paragraphs(lines):
 out=[];last=None
 for line in lines:
  txt=clean(line['text']);y=line['y']
  new=last is None or last-y>18.5 or y>last or re.match(r'^(?:\(Choices?\b|Educational objective\b|References\b|Copyright\b|•)',txt)
  if new:out.append(txt)
  else:out[-1]+=' '+txt
  last=y
 return '\n\n'.join(flat(x) for x in out if x.strip())
questions=[];audits=[];warnings=[];counters=collections.Counter();batchmeta={}
for idx,pn in enumerate(qpages):
 section=next(x for x in meta['bookmarks'] if x['startPage']<=pn<=x['endPage'])
 end=qpages[idx+1]-1 if idx+1<len(qpages) else meta['pageCount']
 lines=layout[pn-1]['lines'];matches=[]
 for j,line in enumerate(lines):
  m=re.match(r'^([A-D])\.[ \t]+(.+)',line['text'])
  if m:matches.append((j,m.group(1),line['x']))
 d=[m for m in matches if m[1]=='D'][-1];positions={'D':d[0]};before=d[0]
 for letter in 'CBA':
  candidates=[m for m in matches if m[1]==letter and m[0]<before and abs(m[2]-d[2])<4]
  assert candidates,(pn,letter,matches)
  positions[letter]=candidates[-1][0];before=positions[letter]
 head=paragraphs(lines[:positions['A']]);parts=head.split('\n\n');ask=parts[-1];stem='\n\n'.join(parts[:-1])
 if not stem:
  raw=flat(head);m=list(re.finditer(r'(?<=[.!?])\s+(?=(?:Which|What|How|Is |Are |Can |May |Should |Will |Would |Does |Did |Do |If |Under |In |On |As |For |At |Who))',raw))

  if m:stem=raw[:m[-1].start()];ask=raw[m[-1].end():]
  else:stem='';ask=raw
 if not ask.rstrip().endswith('?'):warnings.append({'page':pn,'type':'ask_ending','ask':ask})
 options=[]
 rawq='\n'.join(x['text'] for x in lines)
 for k,letter in enumerate('ABCD'):
  chunk=[dict(x) for x in lines[positions[letter]:positions['ABCD'[k+1]] if k<3 else len(lines)]]
  chunk[0]['text']=re.sub(r'^[A-D]\.\s*','',chunk[0]['text'])
  cleanlines=[]
  for line in chunk:
   if re.match(r'^(?:Copyright\b|Correct$|Incorrect$|Correct answer\b|Collecting Statistics|\d+%Answered|.*Time Spent$|\d{4}Version$)',line['text']):break
   cleanlines.append(line['text'])
  text=flat(' '.join(cleanlines))
  if pn>=5357:text=re.sub(r'\s*\(\d{1,3}%\)\s*$','',text)
  assert text,(pn,letter,'empty option')
  options.append({'id':letter,'en':text,'zh':''})
 epages=layout[pn:end];original='\n\n'.join(paragraphs(p['lines']) for p in epages if p['lines'])
 original=re.sub(r'^Explanation\s*:\s*','',original).strip()
 exclusions=set()
 for note in re.findall(r'\(Choices?\s+([^)]*)\)',original,re.I):exclusions.update(re.findall(r'\b[A-D]\b',note))
 assert len(exclusions)==3,(pn,'answer exclusions',exclusions)
 answer=(set('ABCD')-exclusions).pop();explicit=re.search(r'Correct answer\s*([A-D])',rawq)
 conflict=bool(explicit and explicit.group(1)!=answer)
 if conflict:
  assert pn==5821 and answer=='C' and explicit.group(1)=='D', (pn,'unreviewed answer conflict')
  warnings.append({'page':pn,'type':'source_label_conflict_reviewed','derived':'C','explicit':'D','resolution':'原文显式答案 D 与正文 recover nothing 一致；原文 (Choice D) 段实质描述选项 C，保留原文并单列核对说明。'})
  answer='D'
 objective=re.search(r'Educational objective\s*:?\s*(.*?)(?=\n\nReferences\b|\n\nCopyright\b|\Z)',original,re.S|re.I)
 objective=flat(objective.group(1)) if objective else ''
 images=[]
 for page in epages:images.extend(page['images'])
 unique=[];seen=set()
 for img in images:
  if img['src'] not in seen:unique.append(img);seen.add(img['src'])
 entry=subject_map.get(str(pn),{})
 subject=subjects.get(section['title']) or entry.get('subjectId','pending')
 category=(section['title'] if pn<5357 else 'NCBE appendix '+subject)
 counters[category]+=1;batch=(counters[category]-1)//50+1
 prefix='uworld-2025-'+(section['title'].lower().replace(' ','-') if pn<5357 else 'ncbe-appendix-'+subject)
 setid=f'{prefix}-b{batch:02d}';label=(zh[section['title']] if pn<5357 else 'NCBE 附录 · '+zh_id.get(subject,'待分类'))+f' · 第 {batch} 组'
 title='2025UWorld MBE QBank'+(' · NCBE 200 题附录' if pn>=5357 else '')
 explanation_pages=[p['page'] for p in epages if p['lines'] or p['images']]
 assert original and explanation_pages,(pn,'missing explanation')
 question={'id':f'uworld-2025-p{pn:05d}','sourceId':'uworld','sourceSet':setid,'sourceSetLabel':label,'sourceTitle':title,'sourcePages':[pn],'subjectId':subject,'number':idx+1,'stem':stem,'stemZh':'','ask':ask,'askZh':'','options':options,'explanation':{'kind':'publisher-original','answer':answer,'topic':entry.get('topic') or section['title'],'en':original,'zh':'','ruleEn':objective,'ruleZh':'','warning':'','options':{},'source':title+' · 上传 PDF 原解析','sourceUrl':'uworld-2025/source.pdf','originalPdfPages':explanation_pages,'textbookReferences':[{'book':'2025UWorld MBE QBank（上传文件）','bookId':'uworld-2025-source','chapter':section['title'],'pages':f'{pn}–{end}','section':'本题题干、原解析与图表','pageNumbers':[pn]+explanation_pages}]}}
 if conflict:question['explanation']['warning']='原文核对说明：PDF 第 5821 页明确标注正确答案 D，解析正文也写明应获赔 nothing。第 5822 页的“(Choice D)”段落实际描述选项 C 的按比例减赔情形，存在选项字母误标。本题按原文明确答案记为 D，原解析文字保持不变。'
 if layout[pn-1]['images']:question['images']=layout[pn-1]['images']
 if unique:question['explanation']['images']=unique
 questions.append(question)
 evidence={'questionId':question['id'],'number':idx+1,'sourceSection':section['title'],'questionPage':pn,'endPage':end,'explanationPages':explanation_pages,'answer':answer,'answerMethod':('explicit_answer_with_reviewed_source_label_conflict' if conflict else 'explicit_and_exclusion_match') if explicit else 'derived_from_explanation_exclusions','excludedChoices':sorted(exclusions),'images':len(unique),'questionImages':len(question.get('images',[]))}
 if explicit:evidence['explicitAnswer']=explicit.group(1)
 if pn>=5357:evidence['subjectClassification']=entry
 audits.append(evidence)
 if setid not in batchmeta:batchmeta[setid]={'id':setid,'label':label,'subjectId':subject,'sourceId':'uworld','questions':0,'firstPage':pn,'lastPage':end}
 batchmeta[setid]['questions']+=1;batchmeta[setid]['lastPage']=end
assert len(questions)==2003
fingerprints=collections.defaultdict(list)
for q in questions:fingerprints[re.sub(r'[^a-z0-9]','',q['stem'].lower()+q['ask'].lower())].append(q['id'])
duplicates=[v for v in fingerprints.values() if len(v)>1]
result={'total':len(questions),'bySubject':dict(collections.Counter(q['subjectId'] for q in questions)),'bySection':dict(counters),'batches':list(batchmeta.values()),'explicitAnswersChecked':sum('explicitAnswer'in a for a in audits),'inferredAnswers':sum('explicitAnswer'not in a for a in audits),'duplicateStems':duplicates,'warnings':warnings,'questionImageCount':sum(len(q.get('images',[])) for q in questions),'explanationImageReferences':sum(len(q['explanation'].get('images',[])) for q in questions),'questions':audits}
(base/'parsed-questions.json').write_text(json.dumps(questions,ensure_ascii=False,indent=2)+'\n');(base/'parse-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['questions','batches']},ensure_ascii=False,indent=2))
