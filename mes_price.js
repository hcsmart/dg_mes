/* mes_price.js (v39)
 * 발주 시 견적가(quote_price)를 마스터 단가에서 자동 산출한다.
 * 이 값이 없으면 입고확정을 해도 제조원가가 0으로 집계된다.
 *
 *   await MESPRICE.material(materialCode, vendorName)  → 단가(원/kg) 또는 0
 *   await MESPRICE.process(processCode, vendorName)    → 단가(원) 또는 0
 *   MESPRICE.weightKg(spec, qty)                       → 중량(kg), spec "30*400*300"
 */
(function(){
if(window.MESPRICE)return;
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
let MP=null,PP=null;

async function waitDB(){
  for(let i=0;i<60&&!window.MESDB;i++)await new Promise(r=>setTimeout(r,50));
  if(window.MESDB&&window.MESDB.ready){try{await window.MESDB.ready}catch(e){}}
  return !!(window.MESDB&&window.MESDB.online);
}
/* 같은 코드에 여러 단가가 있으면 적용일(effective_date) 최신 건을 쓴다 */
function pick(rows,codeKey,code,vendor){
  const c=String(code||'').trim();
  if(!c)return 0;
  let cand=rows.filter(r=>String(r[codeKey]||'').trim()===c);
  if(!cand.length)return 0;
  if(vendor){
    const v=cand.filter(r=>String(r.vendor_name||'').trim()===String(vendor).trim());
    if(v.length)cand=v;              /* 업체 단가 우선, 없으면 전체 최신 */
  }
  cand=cand.slice().sort((a,b)=>String(b.effective_date||b.registered_date||'')
    .localeCompare(String(a.effective_date||a.registered_date||'')));
  return num(cand[0].unit_price);
}
async function material(code,vendor){
  if(MP===null){
    if(!await waitDB()){MP=[];return 0}
    try{MP=await window.MESDB.table('material_price_changes')
      .select('select=material_code,vendor_name,unit_price,effective_date,registered_date')}
    catch(e){MP=[]}
  }
  return pick(MP,'material_code',code,vendor);
}
async function process(code,vendor){
  if(PP===null){
    if(!await waitDB()){PP=[];return 0}
    try{PP=await window.MESDB.table('process_price_changes')
      .select('select=process_code,vendor_name,unit_price,effective_date,registered_date')}
    catch(e){PP=[]}
  }
  return pick(PP,'process_code',code,vendor);
}
/* 설계치수 "두께*가로*세로"(mm) → 강재 중량(kg). 비중 7.85 기준 */
function weightKg(spec,qty){
  const d=String(spec||'').split(/[*xX×]/).map(s=>num(s)).filter(n=>n>0);
  if(d.length<3)return 0;
  const kg=d[0]*d[1]*d[2]/1000000*7.85;
  return Math.round(kg*(num(qty)||1)*100)/100;
}
function invalidate(){MP=null;PP=null}
window.MESPRICE={material,process,weightKg,invalidate,num};
})();
