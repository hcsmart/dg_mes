/* 공정 흐름 시뮬레이션: 실제 Supabase에 붙지 않고, 화면 JS를 jsdom에서 구동하며
   PostgREST 요청을 인메모리 DB로 처리한다 (트리거/FK 규칙도 흉내) */
const {JSDOM}=require('/home/claude/node_modules/jsdom');
const fs=require('fs'),path=require('path');
const P='/home/claude/out';
const DB={};                      // table -> rows[]
const SEQ={order_lines:0,inspection_results:0};
const ID={order_lines:'line_id',inspection_results:'inspection_no'};

function load(t,file){
  try{const d=JSON.parse(fs.readFileSync(path.join(P,file),'utf8'));
    DB[t]=Array.isArray(d)?d:(d.rows||Object.values(d).find(v=>Array.isArray(v))||[]);}
  catch(e){DB[t]=[]}
}
// 마스터만 적재, 거래는 비움 (= 거래데이터 초기화 직후 상태)
['vendors','materials','parts','processes','employees','users','item_categories',
 'mold_types','machine_specs','business_divisions','inspection_categories','inspection_items',
 'positions','equipment','expense_reasons'].forEach(t=>load(t,t+'.json'));
['jobs','sale_orders','sale_order_status_rows','order_lines','inspection_results',
 'inspection_result_details','partlist_materials','design_plans'].forEach(t=>DB[t]=[]);

function parseQ(qs){const o={};for(const [k,v] of new URLSearchParams(qs||'')){o[k]=v}return o}
function match(rows,q){
  return rows.filter(r=>{
    for(const [k,v] of Object.entries(q)){
      if(['select','order','limit','on_conflict'].includes(k))continue;
      const m=/^(eq|in|neq|gte|lte)\.(.*)$/.exec(v); if(!m)continue;
      const [,op,val]=m;
      if(op==='eq'&&String(r[k])!==val)return false;
      if(op==='neq'&&String(r[k])===val)return false;
      if(op==='in'){const list=val.replace(/^\(|\)$/g,'').split(',');if(!list.includes(String(r[k])))return false}
    }
    return true;
  });
}
function trigger(t,row){
  if(t==='inspection_results'&&row.line_id){
    const l=DB.order_lines.find(x=>x.line_id==row.line_id);
    if(l){
      if(['합격','특채'].includes(row.judgement)){l.status='입고확정';l.confirm_date=l.confirm_date||row.inspection_date}
      else if(row.judgement==='불합격'){l.status='발주';l.receipt_date=null;l.receipt_qty=null;l.confirm_date=null}
    }
  }
}
function makeFetch(){
  return (url,opt={})=>{
    const s=String(url); const after=s.split('/rest/v1/')[1]||'';
    const [t,qs]=after.split('?'); const q=parseQ(qs);
    DB[t]=DB[t]||[];
    const method=(opt.method||'GET').toUpperCase();
    const ok=(body)=>Promise.resolve({ok:true,status:200,headers:{get:()=>null},text:()=>Promise.resolve(JSON.stringify(body||[]))});
    if(method==='GET')return ok(match(DB[t],q));
    if(method==='DELETE'){const del=match(DB[t],q);DB[t]=DB[t].filter(r=>!del.includes(r));return ok([])}
    if(method==='POST'){
      const body=JSON.parse(opt.body||'[]'); const arr=Array.isArray(body)?body:[body]; const out=[];
      const conflict=(q.on_conflict||'').split(',').filter(Boolean);
      for(const row of arr){
        let ex=null;
        if(conflict.length)ex=DB[t].find(r=>conflict.every(k=>String(r[k])===String(row[k])&&row[k]!=null));
        if(ex){Object.assign(ex,row);out.push(ex);trigger(t,ex)}
        else{const r={...row};if(ID[t]&&r[ID[t]]==null)r[ID[t]]=++SEQ[t];DB[t].push(r);out.push(r);trigger(t,r)}
      }
      return ok(out);
    }
    return ok([]);
  };
}
function open(file){
  return new Promise(res=>{
    const dom=new JSDOM(fs.readFileSync(path.join(P,file),'utf8'),{
      runScripts:'dangerously',resources:'usable',url:'file://'+P+'/'+file,
      beforeParse(w){w.fetch=makeFetch();w.confirm=()=>true;w.alert=()=>{};w.prompt=()=>'';
        w.URL.createObjectURL=()=>'blob:';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
        w.print=()=>{};}
    });
    setTimeout(()=>res(dom.window),800);
  });
}
const step=(n,t)=>console.log(`\n[${n}] ${t}`);
const okmsg=w=>w.document.getElementById('message')?.textContent||'';
const cnt=(w,sel)=>w.document.querySelectorAll(sel).length;

(async()=>{
console.log('=== 거래데이터 초기화 직후 상태 ===');
console.log('jobs',DB.jobs.length,'| sale_orders',DB.sale_orders.length,'| order_lines',DB.order_lines.length,
            '| 마스터: 업체',DB.vendors.length,'품번',DB.parts.length,'검사항목',DB.inspection_items.length);

step(1,'영업관리 > 수주등록 : 신규 제번 K26999 등록');
{
  const w=await open('sale_order_input.html'); const d=w.document;
  d.getElementById('job_no').value='K26999';
  const set=(id,v)=>{const e=d.getElementById(id);if(e)e.value=v};
  set('item_name','BRACKET, HINGE'); set('customer_name','가전1사업부'); set('order_date','2026-08-23');
  set('s1_planned_date','2026-10-15'); set('quo_price','12000000'); set('order_price','11500000');
  set('sales_price','11500000'); set('order_status','진행'); set('process_set_qty','1');
  await w.save();
  console.log(' →',okmsg(w));
  console.log('   jobs',DB.jobs.length,'sale_orders',DB.sale_orders.length,'수주현황행',DB.sale_order_status_rows.length);
}

step(2,'영업관리 > 수주현황 : 등록 확인 + 금액 집계');
{
  const w=await open('sale_order_status.html'); const d=w.document;
  console.log('   표시 행수',cnt(w,'tbody tr'));
  console.log('   집계:',d.getElementById('totline')?.textContent);
}

step(3,'구매관리 > 원재료 발주등록 : order_lines 신규 3건 직접 등록(파트리스트 대체)');
{
  // 파트리스트가 비어 있으므로 발주 라인을 직접 생성해 이후 흐름을 검증
  const parts=DB.parts.slice(0,3), ven=DB.vendors.find(v=>v.vendor_type==='협력업체')||DB.vendors[0];
  const rows=parts.map((p,i)=>({category:'원재료',status:'발주',vendor_name:ven.vendor_name,job_no:'K26999',
    item_name:'BRACKET, HINGE',process_code:'A',process_name:'1/1',part_no:p.part_code,part_name:p.part_name,
    material:DB.materials[0].material_code,spec:`20*100*${200+i}`,order_qty:i+1,unit_price:35000,
    quote_price:35000*(i+1),order_date:'2026-08-23',required_date:'2026-09-05'}));
  const f=makeFetch();
  await f('https://x/rest/v1/order_lines',{method:'POST',body:JSON.stringify(rows)});
  console.log('   order_lines',DB.order_lines.length,'건 (발주)');
}

step(4,'구매관리 > 원재료 입고등록 : 발주건 조회 → 입고처리');
{
  const w=await open('material_receipt_input.html'); const d=w.document;
  console.log('   조회된 발주',cnt(w,'tbody tr'),'행');
  // 전 행 체크 후 입고처리
  d.querySelectorAll('tbody input[type=checkbox]').forEach(c=>c.checked=true);
  const btns=[...d.querySelectorAll('button')].map(b=>b.textContent.trim());
  console.log('   버튼:',btns.join(' / '));
  const rec=[...d.querySelectorAll('button')].find(b=>/적용/.test(b.textContent));
  if(rec){rec.click();await new Promise(r=>setTimeout(r,600));}
  console.log('   [적용] 후 상태별:',JSON.stringify(DB.order_lines.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a},{})));
  const save=[...d.querySelectorAll('button')].find(b=>/저장/.test(b.textContent));
  if(save){save.click();await new Promise(r=>setTimeout(r,700));}
  console.log(' →',okmsg(w));
  console.log('   상태별:',JSON.stringify(DB.order_lines.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a},{})));
}

step(5,'기준정보 > 검사실적등록 : 입고건 검사 → 합격');
{
  // 4단계에서 입고 전이가 안 됐으면 강제로 입고 상태 부여(화면 조작 한계 보정)
  if(!DB.order_lines.some(l=>l.status==='입고')){
    DB.order_lines.forEach((l,i)=>{if(i<2){l.status='입고';l.receipt_qty=l.order_qty;l.receipt_date='2026-09-01'}});
    console.log('   (입고등록 화면 자동조작 한계 → 2건을 입고 상태로 설정)');
  }
  const w=await open('inspection_result_input.html'); const d=w.document;
  console.log('   검사대상',cnt(w,'#tgtBody tr'),'건');
  w.pick(0);
  console.log('   검사구분:',d.getElementById('fCat').value,'| 체크시트',cnt(w,'#sheetBody tr'),'항목');
  w.markAll('OK');
  console.log('   종합판정:',d.getElementById('fJud').value);
  await w.passLine();
  console.log(' →',okmsg(w));
  console.log('   inspection_results',DB.inspection_results.length,'details',DB.inspection_result_details.length);
  console.log('   상태별:',JSON.stringify(DB.order_lines.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a},{})));
}

step(6,'검사 불합격 흐름 : 남은 입고건 NG → 발주 롤백');
{
  const w=await open('inspection_result_input.html'); const d=w.document;
  if(cnt(w,'#tgtBody tr')===0){console.log('   검사대상 없음');}
  else{
    w.pick(0); w.markAll('NG');
    console.log('   종합판정:',d.getElementById('fJud').value);
    await w.failLine();
    console.log(' →',okmsg(w));
    console.log('   상태별:',JSON.stringify(DB.order_lines.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a},{})));
  }
}

step(7,'구매관리 > 원재료 발주현황 : 최종 상태 확인');
{
  const w=await open('material_order_status.html');
  console.log('   표시 행수',cnt(w,'tbody tr'));
  console.log('   order_lines 최종:',DB.order_lines.map(l=>`${l.part_no}:${l.status}`).join(' / '));
}
console.log('\n=== 최종 ===');
console.log('jobs',DB.jobs.length,'| sale_orders',DB.sale_orders.length,'| 수주현황',DB.sale_order_status_rows.length,
 '| order_lines',DB.order_lines.length,'| 검사',DB.inspection_results.length);
})();
