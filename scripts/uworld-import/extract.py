from pathlib import Path
import pypdfium2 as pdfium
from pypdf import PdfReader
import json,hashlib,time,argparse,re
cli=argparse.ArgumentParser();cli.add_argument('pdf',type=Path);cli.add_argument('--work-dir',type=Path,required=True);args=cli.parse_args()
src=args.pdf.resolve();work=args.work_dir.resolve();(work/'pages').mkdir(parents=True,exist_ok=True)
repo=Path(__file__).resolve().parents[2];root=repo/'public/uworld-2025/images';root.mkdir(parents=True,exist_ok=True)
sha=hashlib.sha256(src.read_bytes()).hexdigest()
assert sha=='859fe102be0372d7c0517af8a52c758683a75cc4b287803bc99951462b5d6e01','This importer is verified only for the recorded source PDF.'
doc=pdfium.PdfDocument(str(src));reader=PdfReader(src);out=[];seen={};count=0;start=time.time();raw=[]
bookmarks=[{'title':x['/Title'],'startPage':reader.get_destination_page_number(x)+1} for x in reader.outline if isinstance(x,dict)]
for i,item in enumerate(bookmarks):item['endPage']=bookmarks[i+1]['startPage']-1 if i+1<len(bookmarks) else len(doc)
(work/'source-manifest.json').write_text(json.dumps({'fileName':src.name,'sha256':sha,'pageCount':len(doc),'bookmarks':bookmarks,'metadata':{str(k):str(v) for k,v in reader.metadata.items()}},ensure_ascii=False,indent=2))
for i in range(len(doc)):
 page=doc[i];tp=page.get_textpage();t=tp.get_text_range();raw.append({'page':i+1,'text':t});pos=0;lines=[]
 for line in t.splitlines(True):
  if line.strip():
   idx=pos+len(line)-len(line.lstrip());box=tp.get_charbox(idx,loose=True)
   lines.append({'text':line.strip(),'x':round(box[0],2),'y':round(box[1],2)})
  pos+=len(line)
 images=[]
 for im in reader.pages[i].images:
  data=im.data;sha=hashlib.sha256(data).hexdigest();ext=Path(im.name).suffix.lower();ext=ext if ext in ['.png','.jpg','.jpeg','.jp2'] else '.png'
  if ext=='.jp2':
   import io
   buf=io.BytesIO();im.image.save(buf,format='PNG');data=buf.getvalue();ext='.png';sha=hashlib.sha256(data).hexdigest()
  name=seen.get(sha)
  if not name:
   name=f'p{i+1:04d}-{sha[:12]}{ext}';(root/name).write_bytes(data);seen[sha]=name
  w,h=im.image.size
  images.append({'src':f'uworld-2025/images/{name}','alt':f'原文图表 · PDF 第 {i+1} 页','sourcePage':i+1,'width':w,'height':h});count+=1
 out.append({'page':i+1,'lines':lines,'images':images});tp.close();page.close()
 if (i+1)%500==0:print(f'{i+1}/5950 pages, {count} images, {time.time()-start:.1f}s',flush=True)
# Tables represented by PDF text/path objects need their original spatial layout.
tables=[]
for item in out:
 lines=item['lines']
 if any(lines[i]['y']>lines[i-1]['y']+8 for i in range(1,len(lines))):
  pn=item['page'];page=doc[pn-1];im=page.render(scale=1.5).to_pil();name=f'p{pn:04d}-original-layout.webp'
  im.save(root/name,format='WEBP',lossless=True,method=4)
  item['images'].append({'src':f'uworld-2025/images/{name}','alt':f'原文排版（含表格或示意图）· PDF 第 {pn} 页','sourcePage':pn,'width':im.width,'height':im.height});page.close();tables.append(pn)
qpages=[]
for page in raw:
 marks=re.findall(r'(?m)^[ \t]*([A-D])\.[ \t]+(?=\S)',page['text'].replace('\r\n','\n'))
 if all(x in marks for x in 'ABCD') and 'Explanation:' not in page['text']:qpages.append(page['page'])
(work/'pages/layout.json').write_text(json.dumps(out,ensure_ascii=False))
(work/'pages/text.json').write_text(json.dumps(raw,ensure_ascii=False))
(work/'preflight.json').write_text(json.dumps({'qPages':qpages},indent=2))
print('COMPLETE',len(out),'pages;',len(qpages),'questions;',count,'embedded images;',len(tables),'original layout pages.')
