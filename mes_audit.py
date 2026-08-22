import json,re,os,glob,collections
import sys; P=sys.argv[1] if len(sys.argv)>1 else '.'
files=set(os.listdir(P))
m=json.load(open(f'{P}/mes_manifest.json'))
print("== 1. manifest 파일/데이터 존재 검증")
for p in m['pages']:
    f=p['file']
    if p['status']=='implemented' and f not in files: print(" 누락HTML:",p['menu'],f)
    for d in p.get('data_json',[]):
        if d not in files: print(" 누락JSON:",p['menu'],'->',d)
html_in_manifest={p['file'] for p in m['pages']}
for f in files:
    if f.endswith('.html') and f not in html_in_manifest and f!='index.html': print(" 매니페스트 미등록 HTML:",f)
print("== 2. HTML이 fetch하는 JSON 존재 검증")
for f in sorted(files):
    if not f.endswith('.html'): continue
    s=open(f'{P}/{f}',encoding='utf-8',errors='ignore').read()
    for j in set(re.findall(r"['\"]([\w\-]+\.json)['\"]",s)):
        if j not in files: print(f" {f} -> {j} 없음")
    for h in set(re.findall(r"href=['\"]([\w\-]+\.html)['\"]",s)):
        if h not in files: print(f" {f} -> {h} 링크 깨짐")
print("== 3. index.html 메뉴 링크")
s=open(f'{P}/index.html',encoding='utf-8').read()
links=set(re.findall(r"([\w\-]+\.html)",s))
for l in sorted(links):
    if l not in files: print(" 깨진 메뉴:",l)
impl={p['file'] for p in m['pages'] if p['status']=='implemented'}
for f in sorted(impl-links): print(" 메뉴에 없는 구현페이지:",f)
print("== 4. PK 유일성 / 스키마-JSON 키 일치")
sch=json.load(open(f'{P}/schema.json'))['tables']
def load(fn):
    d=json.load(open(f'{P}/{fn}',encoding='utf-8'))
    if isinstance(d,dict):
        for k in ('rows','records','data','items'):
            if k in d and isinstance(d[k],list): return d[k]
        for v in d.values():
            if isinstance(v,list) and v and isinstance(v[0],dict): return v
        return []
    return d
data={}
for fn in sorted(files):
    if fn.endswith('.json') and fn not in('mes_manifest.json','schema.json','relations.json','index.json','photo_provenance.json'):
        data[fn[:-5]]=load(fn)
for t,rows in data.items():
    if t in sch:
        pk=sch[t].get('pk')
        if pk and rows:
            keys=[k.strip() for k in pk.strip('()').split(',')]
            vals=[tuple(r.get(k) for k in keys) if len(keys)>1 else r.get(keys[0]) for r in rows]
            dup=[v for v,c in collections.Counter(vals).items() if c>1]
            if dup: print(f" {t}.{pk} 중복:",dup[:5])
            if any(v is None or (isinstance(v,tuple) and None in v) for v in vals): print(f" {t}.{pk} null 존재")
        cols=set(sch[t]['columns'])
        used=set(k for r in rows for k in r)
        if used-cols: print(f" {t} 스키마에 없는 키:",sorted(used-cols)[:8])
        if cols-used and rows: print(f" {t} JSON에 없는 컬럼:",sorted(cols-used)[:8])
    else: print(" schema 미정의 테이블:",t,len(rows))
for t in sch:
    if t not in data: print(" JSON 없는 스키마 테이블:",t)
print("== 5. FK 무결성")
rel=json.load(open(f'{P}/relations.json'))
for fk in rel['candidate_foreign_keys']:
    if not fk.get('to'): continue
    ft,fc=fk['from'].split('.'); tt,tc=fk['to'].split('.')
    fc=fc.replace('[]','')
    if ft not in data or tt not in data: print(" 테이블없음:",fk['from'],'->',fk['to']); continue
    tv={r.get(tc) for r in data[tt]}
    miss=set()
    for r in data[ft]:
        v=r.get(fc)
        for x in (v if isinstance(v,list) else [v]):
            if x not in (None,'') and x not in tv: miss.add(x)
    if miss: print(f" {fk['from']}->{fk['to']} 미참조 {len(miss)}건:",sorted(map(str,miss))[:6])
print("== 6. 업무흐름 시뮬레이션 (job_no 체인)")
jobs={}
for t,rows in data.items():
    js={r.get('job_no') for r in rows if r.get('job_no')}
    if js: jobs[t]=js
allj=set().union(*jobs.values())
print(" job_no 보유 테이블:",len(jobs),"/ 총 job_no:",len(allj))
base=jobs.get('sale_orders',set())
for t,js in sorted(jobs.items()):
    print(f"  {t:38s} {len(js):4d}  수주미존재:{len(js-base)}")
