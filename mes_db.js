/* DG mes - Supabase 연동 (v16)
 * 1) MESDB.bind(page, ()=>({var:arr,...}))  : page_state 테이블에서 화면 데이터 복원 + 버튼 클릭 후 자동 저장
 * 2) MESDB.table(name).select()/upsert(rows)/delete(match) : 정규화 테이블 직접 접근
 */
(function(){
const CFG={url:'https://ipggvrzxfcryzryileuv.supabase.co',key:'sb_publishable_CHO-dAOU00HNwno52255mg_H3C1_vew'};
const H=()=>({'apikey':CFG.key,'Authorization':'Bearer '+CFG.key,'Content-Type':'application/json'});
async function rest(path,opt={}){const r=await fetch(CFG.url+'/rest/v1/'+path,{...opt,headers:{...H(),...(opt.headers||{})}});if(!r.ok)throw new Error(r.status+' '+await r.text());const t=await r.text();return t?JSON.parse(t):null}
const table=name=>({
  select:(q='select=*')=>rest(`${name}?${q}`),
  upsert:(rows,onConflict)=>{const a=Array.isArray(rows)?rows:[rows];const keys=[];for(const r of a)for(const k in r)if(!keys.includes(k))keys.push(k);
    const norm=a.map(r=>{const o={};for(const k of keys)o[k]=(r[k]===undefined?null:r[k]);return o});
    return rest(`${name}${onConflict?'?on_conflict='+onConflict:''}`,{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(norm)})},
  delete:(match)=>rest(`${name}?`+Object.entries(match).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`).join('&'),{method:'DELETE',headers:{'Prefer':'return=minimal'}})
});
let page=null,getter=null,last='',timer=null,online=false;
function snapshot(){const o=getter()||{};const out={};for(const k in o)if(Array.isArray(o[k]))out[k]=o[k];return out}
function badge(t,color){let b=document.getElementById('mesdb-badge');if(!b){b=document.createElement('div');b.id='mesdb-badge';b.style.cssText='position:fixed;right:8px;bottom:50px;font:11px Malgun Gothic,sans-serif;padding:2px 7px;border-radius:9px;color:#fff;opacity:.85;z-index:9999;pointer-events:none';document.body.appendChild(b)}b.textContent=t;b.style.background=color}
async function load(){try{const rows=await rest(`page_state?page=eq.${encodeURIComponent(page)}&select=data`);online=true;if(rows&&rows[0]){const saved=rows[0].data,cur=getter()||{};for(const k in saved){if(Array.isArray(cur[k])&&Array.isArray(saved[k])){cur[k].length=0;cur[k].push(...saved[k])}}
  (window.MES?.search||window.search||window.render||(()=>{}))();last=JSON.stringify(snapshot());badge('DB 연결 · 저장본 복원','#2e7d32')}else{last=JSON.stringify(snapshot());badge('DB 연결 · 초기데이터','#1565c0')}}catch(e){online=false;badge('DB 미연결(로컬)','#9e9e9e');console.warn('MESDB',e.message)}}
async function persist(){if(!online)return;const s=JSON.stringify(snapshot());if(s===last)return;try{await rest('page_state',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{page,data:JSON.parse(s),updated_at:new Date().toISOString()}])});last=s;badge('DB 저장됨 '+new Date().toLocaleTimeString('ko-KR'),'#2e7d32')}catch(e){badge('DB 저장실패','#c62828');console.warn('MESDB',e.message)}}
function bind(p,g){page=p;getter=g;load();document.addEventListener('click',e=>{if(e.target.closest('button,[onclick]')){clearTimeout(timer);timer=setTimeout(persist,400)}},true);document.addEventListener('change',()=>{clearTimeout(timer);timer=setTimeout(persist,400)},true)}
async function reset(){await rest(`page_state?page=eq.${encodeURIComponent(page)}`,{method:'DELETE'});location.reload()}
window.MESDB={cfg:CFG,rest,table,bind,persist,reset,get online(){return online}};
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
  else v=(v===''||v===undefined)?null:String(v);
  o[col]=v}return o}
function badge(t,c){let b=document.getElementById('mesdb-badge');if(!b){b=document.createElement('div');b.id='mesdb-badge';b.style.cssText='position:fixed;right:8px;bottom:50px;font:11px Malgun Gothic,sans-serif;padding:2px 7px;border-radius:9px;color:#fff;opacity:.85;z-index:9999;pointer-events:none';document.body.appendChild(b)}b.textContent=t;b.style.background=c}

async function master(opt){
  const map=norm(opt.map), pkScreen=opt.pk, pkCol=map[pkScreen].col;
  let snap=new Map(), online=false, timer=null;
  const arr=()=>opt.get();
  const key=r=>String(r[pkScreen]??'');
  function take(){snap=new Map(arr().map(r=>[key(r),JSON.stringify(r)]))}

  try{
    const rows=await MESDB.table(opt.table).select('select=*');
    const a=arr(); a.length=0; a.push(...rows.map(r=>toScreen(r,map)));
    online=true; (opt.render||window.render||(()=>{}))(); take();
    badge(`DB: ${opt.table} ${rows.length}건`,'#2e7d32');
  }catch(e){online=false;badge('DB 미연결(로컬)','#9e9e9e');console.warn('MESDB.master',e.message);return}

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
