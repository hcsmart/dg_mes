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
