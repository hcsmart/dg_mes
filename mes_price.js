/* mes_price.js (v40)
 * 발주 시 견적가(quote_price)를 「단가변동」 마스터에서 산출한다.
 * 이 값이 없으면 입고확정을 해도 제조원가가 0으로 집계된다.
 *
 * 단가변동 규칙 (자재단가변동등록 / 공정단가변동등록 화면 기준)
 *  - 단가는 「적용시작일(effective_date)」부터 유효하다.
 *    → 발주일 기준으로 적용시작일이 도래한 것 중 가장 최근 단가를 쓴다.
 *      아직 시작하지 않은(미래) 단가는 적용하지 않는다.
 *  - 자재단가는 자재코드 + 사이즈(두께) + 협력업체 조합으로 관리된다.
 *    → 사이즈가 일치하는 단가를 우선하고, 없으면 코드 기준으로 대체한다.
 *  - 협력업체 단가를 우선하고, 없으면 코드 기준 최신 단가로 대체한다.
 *
 *  await MESPRICE.material(code, vendor, {size, asOf}) → {price,row,matched,effective_date} | null
 *  await MESPRICE.process(code, vendor, {asOf})        → 동일
 *  await MESPRICE.materialPrice(...) / processPrice(...) → 단가(숫자) 또는 0
 *  MESPRICE.weightKg(spec, qty)                        → 중량(kg), spec "30*400*300"
 */
(function(){
if(window.MESPRICE)return;
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const today=()=>new Date().toISOString().slice(0,10);
const d10=v=>{const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''};
let MP=null,PP=null;

async function waitDB(){
  for(let i=0;i<60&&!window.MESDB;i++)await new Promise(r=>setTimeout(r,50));
  if(window.MESDB&&window.MESDB.ready){try{await window.MESDB.ready}catch(e){}}
  return !!(window.MESDB&&window.MESDB.online);
}

/* 적용시작일 → 등록일 순으로 최신 1건 */
function newest(rows){
  if(!rows.length)return null;
  return rows.slice().sort(function(a,b){
    var ea=d10(a.effective_date), eb=d10(b.effective_date);
    if(ea!==eb)return eb.localeCompare(ea);
    return d10(b.registered_date).localeCompare(d10(a.registered_date));
  })[0];
}

function resolve(rows,codeKey,code,vendor,opt){
  opt=opt||{};
  var c=String(code||'').trim();
  if(!c)return null;
  var asOf=d10(opt.asOf)||today();

  /* 1) 코드 일치 + 적용시작일 도래 */
  var cand=rows.filter(function(r){
    return String(r[codeKey]||'').trim()===c
      && (!d10(r.effective_date) || d10(r.effective_date)<=asOf);
  });
  if(!cand.length)return null;

  var note=[];
  /* 2) 협력업체 우선 */
  if(vendor){
    var v=cand.filter(function(r){
      return String(r.vendor_name||'').trim()===String(vendor).trim()});
    if(v.length)cand=v; else note.push('타업체 단가');
  }
  /* 3) 사이즈(두께) 우선 - 자재단가만 해당 */
  if(opt.size!==undefined&&opt.size!==null&&String(opt.size)!==''){
    var s=String(num(opt.size));
    var sz=cand.filter(function(r){
      return r.size!==undefined&&r.size!==null&&String(num(r.size))===s});
    if(sz.length)cand=sz;
    else if(cand.some(function(r){return r.size}))note.push('사이즈 불일치');
  }
  var row=newest(cand);
  if(!row)return null;
  return {price:num(row.unit_price),row:row,
          matched:note.length?note.join('/'):'일치',
          effective_date:d10(row.effective_date)};
}

async function load(kind){
  if(kind==='m'){
    if(MP===null){
      if(!await waitDB()){MP=[];return MP}
      try{MP=await window.MESDB.table('material_price_changes')
        .select('select=material_code,material_name,size,vendor_name,unit_price,effective_date,registered_date')}
      catch(e){MP=[]}
    }
    return MP;
  }
  if(PP===null){
    if(!await waitDB()){PP=[];return PP}
    try{PP=await window.MESDB.table('process_price_changes')
      .select('select=process_code,process_name,vendor_name,unit_price,effective_date,registered_date')}
    catch(e){PP=[]}
  }
  return PP;
}

async function material(code,vendor,opt){
  return resolve(await load('m'),'material_code',code,vendor,opt);
}
async function process(code,vendor,opt){
  return resolve(await load('p'),'process_code',code,vendor,opt);
}
async function materialPrice(c,v,o){var r=await material(c,v,o);return r?r.price:0}
async function processPrice(c,v,o){var r=await process(c,v,o);return r?r.price:0}

/* 설계치수 "두께*가로*세로"(mm) → 강재 중량(kg). 비중 7.85 기준 */
function weightKg(spec,qty){
  var d=String(spec||'').split(/[*xX\u00d7]/).map(num).filter(function(n){return n>0});
  if(d.length<3)return 0;
  var kg=d[0]*d[1]*d[2]/1000000*7.85;
  return Math.round(kg*(num(qty)||1)*100)/100;
}
function invalidate(){MP=null;PP=null}
window.MESPRICE={material:material,process:process,
  materialPrice:materialPrice,processPrice:processPrice,
  weightKg:weightKg,invalidate:invalidate,num:num};
})();
