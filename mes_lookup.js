/* mes_lookup.js — v1  공용 마스터 조회
 * 모든 화면이 거래처/사원/자재/부품/공정/설비/금형타입/기계사양/사업부/아이템을
 * 하드코딩 대신 DB 마스터에서 실시간 조회한다.
 *
 *   MESLOOK.open(kind, cb)            팝업. cb({code,name,raw})
 *   MESLOOK.bindPair(kind, codeId, nameId)   코드/명칭 input 쌍에 연결해 팝업 오픈
 *   MESLOOK.rows(kind [,filter])      Promise<마스터 행 배열> (캐시)
 *   MESLOOK.names(kind)               Promise<명칭 배열>
 *   MESLOOK.fillSelect(sel, kind, {value,label,keep,filter})  select 옵션 채우기
 *   MESLOOK.invalidate(kind)          캐시 무효화
 */
(function(){
if(window.MESLOOK)return;

const KINDS={
 vendor:   {title:'거래처 조회',    table:'vendors', order:'vendor_code',
            cols:['코드','거래처명','구분'], map:r=>[r.vendor_code,r.vendor_name,r.vendor_type||'']},
 customer: {title:'고객사 조회',    table:'vendors', order:'vendor_code',
            cols:['코드','고객사명','구분'], map:r=>[r.vendor_code,r.vendor_name,r.vendor_type||''],
            filter:r=>r.vendor_type==='고객사'||r.vendor_type==='양산처'},
 vendor_purchase:{title:'협력업체(구매품)', table:'vendors', order:'vendor_name',
            cols:['코드','업체명'], map:r=>[r.vendor_code,r.vendor_name], filter:r=>r.purchase_item_flag===true,
            fallback:r=>r.vendor_type==='협력업체'},
 vendor_material:{title:'협력업체(원재료)', table:'vendors', order:'vendor_name',
            cols:['코드','업체명'], map:r=>[r.vendor_code,r.vendor_name], filter:r=>r.raw_material_flag===true,
            fallback:r=>r.vendor_type==='협력업체'},
 vendor_outsourcing:{title:'협력업체(외주가공)', table:'vendors', order:'vendor_name',
            cols:['코드','업체명'], map:r=>[r.vendor_code,r.vendor_name], filter:r=>r.outsourcing_flag===true,
            fallback:r=>r.vendor_type==='협력업체'},
 design_partner:{title:'협력업체(외주설계)', table:'outsourced_design_partners', order:'seq',
            cols:['No','업체명'], map:r=>[r.seq,r.partner_name], code:r=>r.partner_name, name:r=>r.partner_name},
 employee: {title:'사원 조회',      table:'employees', order:'employee_name',
            cols:['사원코드','사원명'], map:r=>[r.employee_code,r.employee_name||''],
            filter:r=>!!(r.employee_name&&String(r.employee_name).trim())},
 material: {title:'자재 조회',      table:'materials', order:'material_code',
            cols:['자재코드','자재명','그룹'], map:r=>[r.material_code,r.material_name||'',r.material_group||'']},
 part:     {title:'부품 조회',      table:'parts', order:'part_code',
            cols:['부품코드','부품명','그룹'], map:r=>[r.part_code,r.part_name||'',r.part_group||'']},
 process:  {title:'공정 조회',      table:'processes', order:'process_group,sort_order,process_code',
            cols:['공정코드','공정명','그룹','순서'], map:r=>[r.process_code,r.process_name,r.process_group||'',r.sort_order??'']},
 equip:    {title:'설비(작업장) 조회', table:'equipment', order:'equipment_code',
            cols:['설비코드','설비명','그룹','사용'], map:r=>[r.equipment_code,r.equipment_name,r.equipment_group||'',r.is_active===false?'N':'Y'],
            activeKey:r=>r.is_active!==false},
 mold:     {title:'금형타입 조회',  table:'mold_types', order:'mold_type_code',
            cols:['코드','금형타입명'], map:r=>[r.mold_type_code,r.mold_type_name]},
 mspec:    {title:'기계사양 조회',  table:'machine_specs', order:'machine_spec_code',
            cols:['코드','기계사양명'], map:r=>[r.machine_spec_code,r.machine_spec_name]},
 biz:      {title:'사업부 조회',    table:'business_divisions', order:'business_division_code',
            cols:['코드','사업부명'], map:r=>[r.business_division_code,r.business_division_name]},
 item:     {title:'아이템 조회',    table:'item_categories', order:'item_code',
            cols:['코드','아이템명'], map:r=>[r.item_code,r.item_name]},
 inspection_category:{title:'검사구분 조회', table:'inspection_categories', order:'sort_order,inspection_category_code',
            cols:['코드','검사구분명','대상'], map:r=>[r.inspection_category_code,r.inspection_category_name,r.inspection_target||''],
            activeKey:r=>r.is_active!==false},
 inspection_item:{title:'검사항목 조회', table:'inspection_items', order:'inspection_item_code',
            cols:['코드','검사항목명','그룹'], map:r=>[r.inspection_item_code,r.inspection_item_name,r.inspection_group||''],
            activeKey:r=>r.is_active!==false},
 job:      {title:'제번(수주) 조회', table:'set_order_job_pool', order:'row_no',
            cols:['제번','품명','고객사','수주유형','S1예정일'],
            map:r=>[r.job_no,r.item_name||'',r.customer_name||'',r.order_type||'',r.s1_date||''],
            code:r=>r.job_no, name:r=>r.item_name||''},
};

const CACHE={};
const online=()=>{try{return !!(window.MESDB&&MESDB.online)}catch(e){return false}};

async function rows(kind,extraFilter){
 const K=KINDS[kind]; if(!K)throw new Error('unknown lookup: '+kind);
 if(!online()&&window.MESDB&&MESDB.ready){try{await MESDB.ready}catch(e){}}
 if(!online())throw new Error('DB 미연결');
 if(!CACHE[kind])CACHE[kind]=await MESDB.table(K.table).select('select=*&order='+K.order);
 let out=CACHE[kind];
 if(K.filter){
  const f=out.filter(K.filter);
  /* v26: 마스터 구분 플래그가 비어 있어 결과가 0건이면 대체 기준으로 표시한다.
     (플래그 미입력 때문에 협력업체 목록이 통째로 비는 사고 방지) */
  out=f.length?f:(K.fallback?out.filter(K.fallback):f);
 }
 if(extraFilter)out=out.filter(extraFilter);
 return out;
}
const names=async kind=>{const K=KINDS[kind];return (await rows(kind)).map(r=>(K.name?K.name(r):K.map(r)[1])||K.map(r)[0])};
const invalidate=kind=>{if(kind)delete CACHE[kind];else for(const k in CACHE)delete CACHE[k]};

async function fillSelect(sel,kind,opt={}){
 if(typeof sel==='string')sel=document.getElementById(sel);
 if(!sel)return;
 const K=KINDS[kind];
 let rs; try{rs=await rows(kind,opt.filter)}catch(e){return}
 const keep=opt.keep??['ALL','전체'];
 const head=[...sel.options].filter(o=>keep.includes(o.textContent.trim())).map(o=>o.outerHTML).join('');
 sel.innerHTML=head+rs.map(r=>{
  const v=opt.value?opt.value(r):(K.code?K.code(r):K.map(r)[0]);
  const l=opt.label?opt.label(r):(K.name?K.name(r):K.map(r)[1])||v;
  return `<option value="${esc(v)}">${esc(l)}</option>`}).join('');
}

/* ── 팝업 UI ─────────────────────────────────────────── */
const css=`
#meslk-mask{position:fixed;inset:0;background:rgba(20,28,35,.38);z-index:9500;display:none;align-items:center;justify-content:center;font:12px 'Malgun Gothic',맑은 고딕,sans-serif}
#meslk-mask.on{display:flex}
#meslk{width:540px;min-width:340px;max-width:94vw;max-height:78vh;background:#fff;border:1px solid #7f8f9c;box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;flex-direction:column;color:#22303a}
#meslk .hd{height:30px;display:flex;align-items:center;padding:0 6px 0 12px;color:#fff;background:linear-gradient(#5f7f9f,#3f5f7d);font-weight:700}
#meslk .x{margin-left:auto;width:24px;height:22px;border:0;background:transparent;color:#fff;cursor:pointer;font:inherit}
#meslk .bar{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #dde3e8;background:#f5f7f9}
#meslk .bar input[type=text]{flex:1;height:24px;border:1px solid #b9c3cb;padding:0 6px;font:inherit}
#meslk .bar label{white-space:nowrap;color:#4d5c69}
#meslk .cnt{color:#6d7b88;white-space:nowrap}
#meslk .bd{flex:1;overflow:auto;min-height:150px}
/* v40: 열폭을 글자 기준으로 산출해 <col> 로 지정한다 (기존 width:100% 균등분배 → 코드열이 과하게 넓어짐) */
#meslk table{width:100%;border-collapse:collapse;table-layout:fixed}
#meslk th{position:sticky;top:0;background:linear-gradient(#e9eef3,#f5f7f9);border-bottom:1px solid #c3ccd4;height:24px;padding:0 7px;text-align:left;font-weight:700}
#meslk td{height:23px;border-bottom:1px solid #e7ecf0;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#meslk th{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#meslk tbody tr:hover td{background:#edf6fd;cursor:pointer}
#meslk tbody tr.sel td{background:#2d75b7;color:#fff}
#meslk .ft{display:flex;gap:6px;justify-content:flex-end;padding:8px 10px;background:#f7f9fa;border-top:1px solid #e3e9ed}
#meslk .btn{height:26px;min-width:64px;border:1px solid #9ba8b4;background:linear-gradient(#fff,#dfe6eb);cursor:pointer;font:inherit}
#meslk .btn:hover{background:#fff}`;

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let ui=null,curKind=null,curCb=null,sel=-1;

function ensure(){
 if(ui)return ui;
 const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
 ui=document.createElement('div');ui.id='meslk-mask';
 ui.innerHTML=`<div id="meslk">
  <div class="hd"><span id="meslk-title"></span><button class="x">✕</button></div>
  <div class="bar"><input type="text" id="meslk-q" placeholder="코드 / 명칭 검색">
   <label id="meslk-aw"><input type="checkbox" id="meslk-a" checked>사용중만</label>
   <span class="cnt" id="meslk-c"></span></div>
  <div class="bd"><table id="meslk-t"></table></div>
  <div class="ft"><button class="btn" id="meslk-clear">지우기</button>
   <button class="btn" id="meslk-ok">선택</button>
   <button class="btn" id="meslk-close">닫기</button></div></div>`;
 document.body.appendChild(ui);
 ui.querySelector('.x').onclick=close;
 ui.querySelector('#meslk-close').onclick=close;
 ui.querySelector('#meslk-ok').onclick=confirmPick;
 ui.querySelector('#meslk-clear').onclick=()=>{done({code:'',name:'',raw:null})};
 ui.querySelector('#meslk-q').oninput=renderList;
 ui.querySelector('#meslk-a').onchange=renderList;
 ui.addEventListener('click',e=>{if(e.target===ui)close()});
 document.addEventListener('keydown',e=>{
  if(!curKind)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
  else if(e.key==='Enter'){e.preventDefault();confirmPick()}
 },true);
 return ui;
}
function close(){if(ui)ui.classList.remove('on');curKind=null;curCb=null}
function done(v){const cb=curCb;close();cb&&cb(v)}
function filtered(){
 const K=KINDS[curKind],q=ui.querySelector('#meslk-q').value.trim().toLowerCase();
 const onlyA=K.activeKey&&ui.querySelector('#meslk-a').checked;
 return (CACHE[curKind]||[]).filter(r=>(!K.filter||K.filter(r))
  &&(!onlyA||K.activeKey(r))
  &&(!q||K.map(r).some(v=>String(v).toLowerCase().includes(q))));
}
/* ── v40: 글자 기준 열폭 자동 산출 ──────────────────────
 * 헤더와 데이터의 실제 렌더 폭을 재서 열마다 필요한 만큼만 준다.
 * canvas measureText 를 쓰고, 사용할 수 없으면 문자 기반(한글 2배)으로 추정한다. */
const CELL_PAD=16, COL_MIN=54, COL_MAX=340, SAMPLE=400;
let _mctx=null;
function textPx(t,bold){
 t=String(t??'');
 if(_mctx===null){
  try{const c=document.createElement('canvas');_mctx=c.getContext('2d')||false}catch(e){_mctx=false}
 }
 if(_mctx){
  _mctx.font=(bold?'700 ':'')+"12px 'Malgun Gothic','맑은 고딕',sans-serif";
  const m=_mctx.measureText(t);
  if(m&&m.width)return m.width;
 }
 /* fallback: 한글·전각 2배 */
 let u=0;
 for(const ch of t)u+=/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(ch)?2:1;
 return u*6.4;
}
function colWidths(K,rs){
 const n=K.cols.length, w=K.cols.map(c=>textPx(c,true)+CELL_PAD);
 const lim=Math.min(rs.length,SAMPLE);
 for(let i=0;i<lim;i++){
  const v=K.map(rs[i]);
  for(let c=0;c<n;c++){const p=textPx(v[c])+CELL_PAD;if(p>w[c])w[c]=p}
 }
 return w.map(x=>Math.round(Math.max(COL_MIN,Math.min(COL_MAX,x))));
}
function applySize(K,rs){
 const w=colWidths(K,rs);
 const box=ui.querySelector('#meslk');
 const bd=ui.querySelector('#meslk .bd');
 /* 세로 스크롤바 여유 + 테두리 */
 const need=w.reduce((a,b)=>a+b,0)+18;
 const vw=(window.innerWidth||1024);
 const target=Math.max(340,Math.min(need,Math.round(vw*0.94)));
 box.style.width=target+'px';
 const avail=target-18;
 let sum=w.reduce((a,b)=>a+b,0);
 if(sum>avail){
  /* 창이 좁으면 넓은 열부터 비례로 줄여 가로 스크롤을 없앤다.
     (마지막 열만 줄이면 열이 많을 때 초과분을 다 흡수하지 못한다) */
  for(let pass=0;pass<4&&sum>avail;pass++){
   const over=sum-avail;
   const room=w.map(x=>Math.max(0,x-COL_MIN));
   const roomSum=room.reduce((a,b)=>a+b,0);
   if(roomSum<=0)break;
   const cut=Math.min(over,roomSum);
   for(let i=0;i<w.length;i++)w[i]=Math.round(w[i]-cut*(room[i]/roomSum));
   sum=w.reduce((a,b)=>a+b,0);
  }
  /* 반올림 오차 보정 */
  let diff=sum-avail;
  for(let i=w.length-1;i>=0&&diff>0;i--){
   const c=Math.min(diff,w[i]-COL_MIN);
   if(c>0){w[i]-=c;diff-=c}
  }
 }else if(sum<avail){
  w[w.length-1]+=avail-sum;   /* 남는 폭은 마지막 열이 흡수 */
 }
 const total=w.reduce((a,b)=>a+b,0);
 /* table-layout:fixed + width:100% 는 잔여폭을 열에 균등 재분배한다.
    산출한 폭이 그대로 적용되도록 테이블 폭을 px 로 못박는다. */
 const tb=ui.querySelector('#meslk-t');
 tb.style.width=total+'px';
 tb.style.minWidth=total+'px';
 bd.style.overflowX=(total>avail)?'auto':'hidden';
 return w;
}
function bindRows(){
 sel=-1;
 ui.querySelectorAll('#meslk-t tbody tr[data-i]').forEach(tr=>{
  tr.onclick=()=>{sel=+tr.dataset.i;ui.querySelectorAll('#meslk-t tbody tr').forEach(x=>x.classList.remove('sel'));tr.classList.add('sel')};
  tr.ondblclick=()=>{sel=+tr.dataset.i;confirmPick()};
 });
}
/* v41: 폭 계산 등에서 예외가 나도 목록은 반드시 보이도록 안전망을 둔다 */
function renderList(){
 try{renderList_()}catch(e){
  console.warn('MESLOOK render',e&&e.message);
  try{
   const K=KINDS[curKind],rs=filtered();
   const box=ui.querySelector('#meslk');if(box)box.style.width='';
   const tb=ui.querySelector('#meslk-t');tb.style.width='';tb.style.minWidth='';
   tb.innerHTML='<thead><tr>'+K.cols.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr></thead><tbody>'+
    rs.map((r,i)=>`<tr data-i="${i}">`+K.map(r).map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join('')+'</tbody>';
   ui.querySelector('#meslk-c').textContent=rs.length+'건';
   bindRows();
  }catch(e2){}
 }
}
function renderList_(){
 if(!curKind)return;
 const K=KINDS[curKind],rs=filtered();
 const w=applySize(K,rs);
 ui.querySelector('#meslk-t').innerHTML=
  '<colgroup>'+w.map(x=>`<col style="width:${x}px">`).join('')+'</colgroup>'+
  '<thead><tr>'+K.cols.map((c,i)=>`<th title="${esc(c)}">${esc(c)}</th>`).join('')+'</tr></thead><tbody>'+
  (rs.length?rs.map((r,i)=>`<tr data-i="${i}">`+K.map(r).map(v=>`<td title="${esc(v)}">${esc(v)}</td>`).join('')+'</tr>').join('')
   :`<tr><td colspan="${K.cols.length}" style="height:56px;text-align:center;color:#8a97a2">검색결과가 없습니다.</td></tr>`)
  +'</tbody>';
 ui.querySelector('#meslk-c').textContent=rs.length+'건';
 bindRows();
}
function confirmPick(){
 if(sel<0)return;
 const K=KINDS[curKind],r=filtered()[sel];if(!r)return;
 const v=K.map(r);
 done({code:K.code?K.code(r):v[0], name:K.name?K.name(r):(v[1]||v[0]), raw:r});
}
async function open(kind,cb){
 const K=KINDS[kind];if(!K){console.warn('MESLOOK: unknown',kind);return}
 /* v41: 예전에는 여기서 online() 을 즉시 판정하고 그냥 return 했다.
    mes_lookup.js 는 mes_db.js 보다 먼저 로드되고 연결 확인(ping)은 비동기라,
    연결이 끝나기 전에 버튼을 누르면 팝업이 조용히 열리지 않았다.
    → 창을 먼저 띄우고 그 안에서 연결을 기다린다. */
 ensure();curKind=kind;curCb=cb;sel=-1;
 ui.querySelector('#meslk-title').textContent=K.title;
 ui.querySelector('#meslk-q').value='';
 ui.querySelector('#meslk-a').checked=true;
 ui.querySelector('#meslk-aw').style.display=K.activeKey?'':'none';
 ui.classList.add('on');
 if(!online()){
  ui.querySelector('#meslk-t').innerHTML='<tbody><tr><td style="height:56px;text-align:center;color:#8a97a2">연결 확인 중…</td></tr></tbody>';
  for(let i=0;i<60&&!window.MESDB;i++)await new Promise(r=>setTimeout(r,50));
  if(window.MESDB&&window.MESDB.ready){try{await window.MESDB.ready}catch(e){}}
  if(!online()&&window.MESDB&&window.MESDB.ping){try{await window.MESDB.ping()}catch(e){}}
  if(curKind!==kind)return;            /* 대기 중 사용자가 닫았으면 중단 */
  if(!online()){
   ui.querySelector('#meslk-t').innerHTML='<tbody><tr><td style="height:56px;text-align:center;color:#c62828">DB에 연결할 수 없어 마스터를 조회하지 못했습니다.<br>새로고침 후 다시 시도하세요.</td></tr></tbody>';
   const m=document.getElementById('message');if(m)m.textContent='DB 미연결 — 마스터를 조회할 수 없습니다.';
   return;
  }
 }
 if(!CACHE[kind]){
  ui.querySelector('#meslk-t').innerHTML='<tbody><tr><td style="height:56px;text-align:center;color:#8a97a2">불러오는 중…</td></tr></tbody>';
  try{await rows(kind)}catch(e){
   ui.querySelector('#meslk-t').innerHTML=`<tbody><tr><td style="height:56px;text-align:center;color:#c62828">조회 실패: ${esc(String(e.message||e).slice(0,80))}</td></tr></tbody>`;
   return;
  }
 }
 renderList();
 ui.querySelector('#meslk-q').focus();
}
function bindPair(kind,codeId,nameId){
 open(kind,v=>{
  const c=document.getElementById(codeId),n=document.getElementById(nameId);
  if(c){c.value=v.code;c.dispatchEvent(new Event('input',{bubbles:true}));c.dispatchEvent(new Event('change',{bubbles:true}))}
  if(n){n.value=v.name;n.dispatchEvent(new Event('input',{bubbles:true}))}
 });
}
window.MESLOOK={open,bindPair,rows,names,fillSelect,invalidate,KINDS};
})();
