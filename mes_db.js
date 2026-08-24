/* DG mes - Supabase 연동 (v16)
 * 1) MESDB.bind(page, ()=>({var:arr,...}))  : page_state 테이블에서 화면 데이터 복원 + 버튼 클릭 후 자동 저장
 * 2) MESDB.table(name).select()/upsert(rows)/delete(match) : 정규화 테이블 직접 접근
 */
(function(){
/* ── v23: 초기 깜빡임 방지 ─────────────────────────────────────
 * 화면은 DB 연결 실패 대비용 인라인 데이터를 먼저 그린다. 그대로 두면
 * 인라인 자료가 잠깐 보였다가 DB 자료로 교체되며 깜빡인다.
 * DB 로드가 끝날 때까지 본문을 가려 최종 결과만 보이게 한다. */
(function(){
  if(window.__mesdbLoading)return; window.__mesdbLoading=true;
  var css='html.mesdb-loading body>*{visibility:hidden}'+
    'html.mesdb-loading:after{content:"불러오는 중…";position:fixed;inset:0;display:flex;'+
    'align-items:center;justify-content:center;font:13px "Malgun Gothic",sans-serif;color:#5b6b7a;'+
    'background:#f7fafc;z-index:99998}';
  var st=document.createElement('style');st.textContent=css;
  (document.head||document.documentElement).appendChild(st);
  document.documentElement.classList.add('mesdb-loading');
  var done=false;
  window.__mesdbReady=function(){if(done)return;done=true;
    document.documentElement.classList.remove('mesdb-loading')};
  setTimeout(window.__mesdbReady,900);   /* v36: 2500 -> 900ms */
  /* v36: MESDB.bind/master/lines 를 쓰지 않는 화면은 기다릴 이유가 없다 → 즉시 해제 */
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){if(!window.__mesdbBound)window.__mesdbReady()},0)});
  /* v36: DNS/TLS 를 미리 열어 첫 REST 요청 지연 제거 */
  try{var lk=document.createElement('link');lk.rel='preconnect';lk.crossOrigin='';
      lk.href='https://ipggvrzxfcryzryileuv.supabase.co';
      (document.head||document.documentElement).appendChild(lk)}catch(e){}
})();

const MES_VER='v36';window.MES_VER=MES_VER;
const CFG={url:'https://ipggvrzxfcryzryileuv.supabase.co',key:'sb_publishable_CHO-dAOU00HNwno52255mg_H3C1_vew'};
function tok(){try{return (window.MES_AUTH||window.parent.MES_AUTH)?.token||null}catch(e){return null}}
const H=()=>({'apikey':CFG.key,'Authorization':'Bearer '+(tok()||CFG.key),'Content-Type':'application/json'});
/* v36: 최상위 창에 GET 응답 캐시를 두어 화면(iframe)마다 같은 마스터를 다시 받지 않게 한다.
   쓰기(POST/PATCH/DELETE) 시 해당 테이블 캐시는 즉시 무효화한다. */
const XC=(function(){try{var w=window.top;if(!w.__MESXC)w.__MESXC=new Map();return w.__MESXC}
  catch(e){if(!window.__MESXC)window.__MESXC=new Map();return window.__MESXC}})();
const XTTL=20000;
const xclone=v=>(v===null||v===undefined)?v:JSON.parse(JSON.stringify(v));
const xdrop=path=>{const tb=String(path).split(/[?/]/)[0];
  if(tb==='rpc'){XC.clear();return}          /* RPC 는 어느 테이블을 바꿀지 모르므로 전체 무효화 */
  for(const k of [...XC.keys()])if(k.indexOf('|'+tb)>-1)XC.delete(k)};
async function rest(path,opt={}){
  const mth=(opt.method||'GET').toUpperCase();
  if(mth!=='GET'){xdrop(path);return rest_(path,opt)}
  const k=(tok()||'a')+'|'+path, c=XC.get(k);
  if(c&&Date.now()-c.t<XTTL)return xclone(await c.p);
  const p=rest_(path,opt);XC.set(k,{t:Date.now(),p});
  try{return xclone(await p)}catch(e){XC.delete(k);throw e}
}
async function rest_(path,opt={}){const r=await fetch(CFG.url+'/rest/v1/'+path,{...opt,headers:{...H(),...(opt.headers||{})}});if(!r.ok){const b=await r.text();if(r.status===401||r.status===403||/permission denied|row-level security/i.test(b))throw new Error('권한 없음(RLS): 로그인이 필요한 자료입니다. '+r.status);if(/violates foreign key/i.test(b))throw new Error('참조 무결성 위반: 마스터에 없는 코드입니다. 기준정보에 먼저 등록하세요.');if(/violates check constraint/i.test(b))throw new Error('허용되지 않는 값입니다(구분/상태 코드 확인).');throw new Error(r.status+' '+b.slice(0,200))}const t=await r.text();return t?JSON.parse(t):null}
const table=name=>({
  select:(q='select=*')=>rest(`${name}?${q}`),
  upsert:(rows,onConflict)=>{const a=Array.isArray(rows)?rows:[rows];const keys=[];for(const r of a)for(const k in r)if(!keys.includes(k))keys.push(k);
    const norm=a.map(r=>{const o={};for(const k of keys)o[k]=(r[k]===undefined?null:r[k]);return o});
    return rest(`${name}${onConflict?'?on_conflict='+onConflict:''}`,{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(norm)})},
  delete:(match)=>rest(`${name}?`+Object.entries(match).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`).join('&'),{method:'DELETE',headers:{'Prefer':'return=minimal'}})
});
let page=null,getter=null,last='',timer=null,online=false;
function snapshot(){const o=getter()||{};const out={};for(const k in o)if(Array.isArray(o[k]))out[k]=o[k];return out}
function badge(t,color){t=t+' · '+MES_VER;let b=document.getElementById('mesdb-badge');if(!b){b=document.createElement('div');b.id='mesdb-badge';b.style.cssText='position:fixed;right:8px;bottom:50px;font:11px Malgun Gothic,sans-serif;padding:2px 7px;border-radius:9px;color:#fff;opacity:.85;z-index:9999;pointer-events:none';document.body.appendChild(b)}b.textContent=t;b.style.background=color}
async function load(){try{const rows=await rest(`page_state?page=eq.${encodeURIComponent(page)}&select=data`);online=true;if(rows&&rows[0]){const saved=rows[0].data,cur=getter()||{};for(const k in saved){if(Array.isArray(cur[k])&&Array.isArray(saved[k])){cur[k].length=0;cur[k].push(...saved[k])}}
  (window.MES?.search||window.search||window.render||(()=>{}))();last=JSON.stringify(snapshot());badge('DB 연결 · 저장본 복원','#2e7d32');window.__mesdbReady&&window.__mesdbReady()}else{last=JSON.stringify(snapshot());badge('DB 연결 · 초기데이터','#1565c0');window.__mesdbReady&&window.__mesdbReady()}}catch(e){online=false;badge('DB 미연결(로컬)','#9e9e9e');console.warn('MESDB',e.message);window.__mesdbReady&&window.__mesdbReady()}}
async function persist(){if(!online)return;const s=JSON.stringify(snapshot());if(s===last)return;try{await rest('page_state',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{page,data:JSON.parse(s),updated_at:new Date().toISOString()}])});last=s;badge('DB 저장됨 '+new Date().toLocaleTimeString('ko-KR'),'#2e7d32')}catch(e){badge('DB 저장실패','#c62828');console.warn('MESDB',e.message)}}
function bind(p,g){window.__mesdbBound=1;page=p;getter=g;load();document.addEventListener('click',e=>{if(e.target.closest('button,[onclick]')){clearTimeout(timer);timer=setTimeout(persist,400)}},true);document.addEventListener('change',()=>{clearTimeout(timer);timer=setTimeout(persist,400)},true)}
async function reset(){await rest(`page_state?page=eq.${encodeURIComponent(page)}`,{method:'DELETE'});location.reload()}
/* RPC (Postgres 함수) 호출 */
async function rpc(fn,args){
  const r=await rest('rpc/'+fn,{method:'POST',body:JSON.stringify(args||{})});
  return Array.isArray(r)?r[0]:r;
}
window.MESDB={cfg:CFG,rest,table,bind,persist,reset,rpc,get online(){return online}};
MESDB.auth=()=>{try{return window.MES_AUTH||window.parent.MES_AUTH||null}catch(e){return null}};
MESDB.pageMenu=()=>{try{const f=location.pathname.split('/').pop();return window.parent.MES_MENU_OF?.(f)||null}catch(e){return null}};
MESDB.canSave=()=>{const a=MESDB.auth();if(!a)return true;const m=MESDB.pageMenu();return m?a.can(m,'save'):true};
/* 저장 권한이 없으면 저장/삭제류 버튼 비활성 */
document.addEventListener('DOMContentLoaded',()=>{const a=MESDB.auth();if(!a||a.role==='admin'||a.role==='master')return;const m=MESDB.pageMenu();if(!m)return;
  const cs=a.can(m,'save'),ce=a.can(m,'edit'),cd=a.can(m,'delete');
  document.querySelectorAll('button[onclick]').forEach(b=>{const oc=b.getAttribute('onclick');
    if(/save|receive|confirm|apply|register/i.test(oc)&&!cs||/remove|del|cancel/i.test(oc)&&!cd){
      b.disabled=true;b.title='권한이 없습니다';b.style.opacity=.45}});});
MESDB.ping=async()=>{try{await rest('page_state?select=page&limit=1');online=true}catch(e){online=false}return online};MESDB.ready=MESDB.ping();
})();

/* ── v17: 마스터 화면 ↔ 정규화 테이블 직결 ──────────────────────────
 * MESDB.master({page, table, pk, map, get, render})
 *   map : 화면키 -> DB컬럼명(문자열) 또는 {col, type:'text|num|bool|ynbool'}
 *   화면 배열을 DB에서 로드해 교체하고, 저장/삭제 시 변경분만 업서트/삭제한다.
 *   page_state 방식(MESDB.bind)과 달리 실제 정규화 테이블에 반영된다.
 */
(function(){
const norm=m=>{const o={};for(const k in m){const v=m[k];o[k]=typeof v==='string'?{col:v,type:'text'}:{type:'text',...v}}return o};
function toScreen(row,map){const o={};for(const k in map){const{col,type}=map[k];let v=row[col];
  if(type==='ynbool')v=(v===true?'Y':v===false?'N':'');
  else if(type==='bool')v=!!v;
  else if(type==='num')v=(v===null||v===undefined?'':v);
  else v=(v===null||v===undefined?'':String(v));
  o[k]=v}return o}
function toDb(row,map){const o={};for(const k in map){const{col,type}=map[k];let v=row[k];
  if(type==='ynbool')v=(v==='Y'?true:v==='N'?false:null);
  else if(type==='bool')v=(v===''||v===undefined||v===null)?null:!!v;
  else if(type==='num'){v=(v===''||v===null||v===undefined)?null:Number(v);if(Number.isNaN(v))v=null}
  else v=(v===''||v===undefined||v===null)?null:String(v);
  o[col]=v}return o}
function badge(t,c){t=t+' · '+(window.MES_VER||'v24');let b=document.getElementById('mesdb-badge');if(!b){b=document.createElement('div');b.id='mesdb-badge';b.style.cssText='position:fixed;right:8px;bottom:50px;font:11px Malgun Gothic,sans-serif;padding:2px 7px;border-radius:9px;color:#fff;opacity:.85;z-index:9999;pointer-events:none';document.body.appendChild(b)}b.textContent=t;b.style.background=c}

async function master(opt){
  window.__mesdbBound=1;
  const map=norm(opt.map), pkScreen=opt.pk, pkCol=map[pkScreen].col;
  let snap=new Map(), online=false, timer=null;
  const arr=()=>opt.get();
  const key=r=>String(r[pkScreen]??'');
  function take(){snap=new Map(arr().map(r=>[key(r),JSON.stringify(r)]))}

  try{
    const rows=await MESDB.table(opt.table).select('select=*');
    const a=arr(); a.length=0; a.push(...rows.map(r=>toScreen(r,map)));
    online=true; (opt.render||window.render||(()=>{}))(); take();
    badge(`DB: ${opt.table} ${rows.length}건`,'#2e7d32');window.__mesdbReady&&window.__mesdbReady();
  }catch(e){online=false;badge('DB 미연결(로컬)','#9e9e9e');console.warn('MESDB.master',e.message);window.__mesdbReady&&window.__mesdbReady();return}

  async function sync(){
    if(!online)return;
    const cur=arr(), curKeys=new Set(cur.map(key));
    const up=[], del=[];
    for(const r of cur){const k=key(r);if(!k)continue;if(snap.get(k)!==JSON.stringify(r))up.push(toDb(r,map))}
    for(const k of snap.keys())if(!curKeys.has(k))del.push(k);
    if(!up.length&&!del.length)return;
    try{
      if(up.length)await MESDB.table(opt.table).upsert(up,pkCol);
      for(const k of del)await MESDB.table(opt.table).delete({[pkCol]:k});
      take();
      badge(`DB 반영 ${up.length?'저장'+up.length:''}${del.length?' 삭제'+del.length:''} · ${new Date().toLocaleTimeString('ko-KR')}`,'#2e7d32');
    }catch(e){badge('DB 반영 실패','#c62828');console.warn('MESDB.master',e.message);
      if(window.MES?.setMessage)window.MES.setMessage('DB 반영 실패: '+e.message.slice(0,120))}
  }
  document.addEventListener('click',e=>{if(e.target.closest('button,[onclick]')){clearTimeout(timer);timer=setTimeout(sync,350)}},true);
  window.MESDB.syncMaster=sync;
}
window.MESDB.master=master;
})();

/* ── v18: 발주→입고→입고확정 라인 (order_lines) ─────────────────────
 * MESDB.lines({page, category, statuses, map, get, render, pk:'_id'})
 *   order_lines 테이블에서 category/status로 필터해 화면 배열에 로드하고,
 *   화면에서 바뀐 행만 되돌려 쓴다. 신규 발주는 MESDB.newLines()로 insert.
 */
(function(){
const N=m=>{const o={};for(const k in m){const v=m[k];o[k]=typeof v==='string'?{col:v,type:'text'}:{type:'text',...v}}return o};
const S2D={'대기':'발주','발주':'발주','입고':'입고','확정':'입고확정','입고확정':'입고확정'};
const D2S={'발주':'대기','입고':'입고','입고확정':'확정'};
const toS=(row,map)=>{const o={_id:row.line_id};for(const k in map){const{col,type}=map[k];let v=row[col];
  if(type==='num')v=(v===null||v===undefined?'':Number(v));
  else if(type==='date')v=(v?String(v).slice(0,10):'');
  else if(type==='status')v=D2S[v]||v||'대기';
  else v=(v===null||v===undefined?'':String(v));o[k]=v}return o};
const toD=(row,map)=>{const o={};for(const k in map){const{col,type}=map[k];let v=row[k];
  if(col==='line_id')continue;
  if(type==='num'){v=(v===''||v===null||v===undefined)?null:Number(v);if(Number.isNaN(v))v=null}
  else if(type==='date'){v=(v&&v!=='null'&&v!=='undefined')?String(v).slice(0,10):null;if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))v=null}
  else if(type==='status')v=S2D[v]||'발주';
  else v=(v===''||v===undefined||v===null)?null:String(v);o[col]=v}return o};
function badge(t,c){t=t+' · '+(window.MES_VER||'v24');let b=document.getElementById('mesdb-badge');if(!b){b=document.createElement('div');b.id='mesdb-badge';b.style.cssText='position:fixed;right:8px;bottom:50px;font:11px Malgun Gothic,sans-serif;padding:2px 7px;border-radius:9px;color:#fff;opacity:.85;z-index:9999;pointer-events:none';document.body.appendChild(b)}b.textContent=t;b.style.background=c}

async function lines(opt){
  window.__mesdbBound=1;
  const map=N(opt.map);let snap=new Map(),online=false,timer=null;
  const arr=()=>opt.get();
  const q=['select=*','order=line_id',`category=eq.${encodeURIComponent(opt.category)}`];
  if(opt.statuses&&opt.statuses.length)q.push(`status=in.(${opt.statuses.map(encodeURIComponent).join(',')})`);
  const take=()=>{snap=new Map(arr().filter(r=>r._id).map(r=>[r._id,JSON.stringify(r)]))};
  try{
    const rows=await MESDB.table('order_lines').select(q.join('&'));
    const a=arr();a.length=0;a.push(...rows.map(r=>toS(r,map)));
    online=true;(opt.render||window.render||(()=>{}))();take();
    badge(`DB: order_lines ${opt.category} ${rows.length}건`,'#2e7d32');window.__mesdbReady&&window.__mesdbReady();
  }catch(e){online=false;badge('DB 미연결(로컬)','#9e9e9e');console.warn('MESDB.lines',e.message);window.__mesdbReady&&window.__mesdbReady();return}

  async function sync(){
    if(!online)return;
    const cur=arr(),up=[],ins=[];
    for(const r of cur){
      if(!r._id){ins.push({...toD(r,map),category:opt.category,status:r.status||'발주'});continue}
      if(snap.get(r._id)!==JSON.stringify(r))up.push({line_id:r._id,...toD(r,map),updated_at:new Date().toISOString()});
    }
    if(!up.length&&!ins.length)return;
    try{
      if(up.length)await MESDB.table('order_lines').upsert(up,'line_id');
      if(ins.length)await MESDB.table('order_lines').upsert(ins);
      take();
      badge(`DB 반영 ${up.length+ins.length}건 · ${new Date().toLocaleTimeString('ko-KR')}`,'#2e7d32');
    }catch(e){badge('DB 반영 실패','#c62828');console.warn('MESDB.lines',e.message);
      if(window.MES?.setMessage)window.MES.setMessage('DB 반영 실패: '+e.message.slice(0,120))}
  }
  document.addEventListener('click',e=>{if(e.target.closest('button,[onclick]')){clearTimeout(timer);timer=setTimeout(sync,350)}},true);
  document.addEventListener('change',()=>{clearTimeout(timer);timer=setTimeout(sync,350)},true);
  window.MESDB.syncLines=sync;
}
/* v26: 발주취소 등 라인 삭제 (화면 배열에서만 지우고 DB에 남던 문제 수정) */
async function delLines(ids){
  const list=[].concat(ids||[]).map(Number).filter(n=>!Number.isNaN(n));
  if(!list.length)return 0;
  for(const id of list)await MESDB.table('order_lines').delete({line_id:id});
  badge(`DB 발주취소 ${list.length}건 삭제`,'#c62828');return list.length;
}
window.MESDB.delLines=delLines;
/* 발주등록 화면용: 신규 발주 라인 insert */
/* v34: order_lines 는 part_no→parts, material→materials, vendor_name→vendors FK 를 가진다.
   PartList/발주 화면에서 입력한 신규 품번·재질이 마스터에 없으면 저장이 통째로 실패하므로,
   자식 행을 버리지 않고 부모(마스터) 행을 먼저 만들어 준다. */
async function ensureRefs(rows){
  const created=[];
  const specs=[
    {col:'part_no',  table:'parts',     key:'part_code',    name:'part_name',    label:'품번'},
    {col:'material', table:'materials', key:'material_code',name:'material_name',label:'재질'},
  ];
  for(const s of specs){
    const vals=[...new Set(rows.map(r=>r[s.col]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''))];
    if(!vals.length)continue;
    const inList='('+vals.map(v=>'"'+String(v).replace(/"/g,'')+'"').join(',')+')';
    let ex=[];
    try{ex=await MESDB.table(s.table).select(`select=${s.key}&${s.key}=in.${encodeURIComponent(inList)}`)}catch(e){continue}
    const have=new Set(ex.map(x=>x[s.key]));
    const miss=vals.filter(v=>!have.has(v));
    if(!miss.length)continue;
    const add=miss.map(v=>{
      const src=rows.find(r=>r[s.col]===v)||{};
      const o={};o[s.key]=v;o[s.name]=src.part_name||src[s.col]||v;o.remark='발주등록 시 자동 생성';return o});
    try{await MESDB.table(s.table).upsert(add,s.key);created.push(`${s.label} ${miss.length}건`)}catch(e){}
  }
  if(created.length)badge('마스터 자동 등록: '+created.join(' / '),'#f57c00');
  return created;
}
async function newLines(rows){
  if(!rows||!rows.length)return 0;
  await ensureRefs(rows);
  await MESDB.table('order_lines').upsert(rows);
  badge(`DB 발주 ${rows.length}건 등록`,'#2e7d32');return rows.length;
}
window.MESDB.lines=lines;window.MESDB.newLines=newLines;window.MESDB.ensureRefs=ensureRefs;
})();
