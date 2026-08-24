/* mes_jobpick.js (v39)
 * 제번을 손으로 타이핑해야 하는 화면(PartList 등록, 경비등록 등)에
 * 등록된 수주 제번 목록을 datalist 로 붙여 준다.
 *   MESJOB.attach('q_job', {onPick:fn})   → 입력칸 id 지정
 * job_pool 뷰(취소 제외)를 20초 캐시로 공유한다.
 */
(function(){
if(window.MESJOB)return;
let cache=null,cacheAt=0;
const TTL=20000;

async function waitDB(){
  for(let i=0;i<60&&!window.MESDB;i++)await new Promise(r=>setTimeout(r,50));
  if(window.MESDB&&window.MESDB.ready){try{await window.MESDB.ready}catch(e){}}
  return !!(window.MESDB&&window.MESDB.online);
}

async function list(){
  if(cache&&Date.now()-cacheAt<TTL)return cache;
  if(!await waitDB())return [];
  try{
    const rs=await window.MESDB.table('job_pool')
      .select('select=job_no,item_name,customer_name,order_date&order=row_no');
    cache=rs||[];cacheAt=Date.now();return cache;
  }catch(e){return []}
}
function invalidate(){cache=null;cacheAt=0}

async function attach(inputId,opt){
  opt=opt||{};
  const el=typeof inputId==='string'?document.getElementById(inputId):inputId;
  if(!el||el.__mesjob)return;
  el.__mesjob=1;
  const rs=await list();
  const dlId='mesjob_dl_'+(el.id||Math.random().toString(36).slice(2));
  let dl=document.getElementById(dlId);
  if(!dl){dl=document.createElement('datalist');dl.id=dlId;document.body.appendChild(dl)}
  dl.innerHTML=rs.map(r=>`<option value="${String(r.job_no).replace(/"/g,'')}">`+
    `${String(r.item_name||'').replace(/</g,'')}${r.customer_name?' · '+String(r.customer_name).replace(/</g,''):''}</option>`).join('');
  el.setAttribute('list',dlId);
  el.setAttribute('placeholder',rs.length?`제번 선택/입력 (등록 ${rs.length}건)`:'등록된 수주가 없습니다');
  el.setAttribute('autocomplete','off');
  if(opt.onPick){
    const fire=()=>{const v=(el.value||'').trim();
      if(v&&rs.some(r=>String(r.job_no)===v))opt.onPick(v)};
    el.addEventListener('change',fire);
    el.addEventListener('input',()=>{const v=(el.value||'').trim();
      if(rs.some(r=>String(r.job_no)===v))fire()});
  }
  return rs.length;
}
window.MESJOB={attach,list,invalidate};
})();
