/* DG mes - 기준정보 엑셀 붙여넣기 (v44)
 * mes_db.js 다음, MESDB.master({...}) 호출 앞에 로드한다.
 *   [script src="mes_db.js"] -> [script src="mes_paste.js"] -> [script] MESDB.master({...})
 * MESDB.master 를 감싸 화면 정보(테이블/PK/컬럼)를 가로챈 뒤
 * 하단 버튼바에 [엑셀 붙여넣기] 버튼과 입력 모달을 붙인다.
 */
(function(){
if(!window.MESDB||window.__mesPaste)return; window.__mesPaste=1;

let INFO=null;
const origMaster=MESDB.master;
MESDB.master=function(opt){
  const map={};
  for(const k in opt.map){const v=opt.map[k];map[k]=(typeof v==='string')?{col:v}:v}
  INFO={table:opt.table,pk:opt.pk,map,get:opt.get,
        render:()=>{try{(opt.render||window.render||(()=>{}))()}catch(e){console.warn(e)}}};
  return origMaster.apply(this,arguments);
};

/* ── 화면 컬럼 순서/라벨 ─────────────────────────────── */
function keysOf(){
  let ks=null;
  try{if(typeof colKeys!=='undefined'&&Array.isArray(colKeys))ks=colKeys.slice()}catch(e){}
  if(!ks||!ks.length)ks=Object.keys(INFO.map);
  const valid=Object.keys(INFO.map);
  ks=ks.filter(k=>valid.includes(k));
  for(const k of valid)if(!ks.includes(k))ks.push(k);
  return ks;
}
function labelsOf(ks){
  const L={},A={};
  const put=(k,t)=>{t=String(t||'').trim();if(!t)return;(A[k]=A[k]||[]).push(t);if(!L[k])L[k]=t};
  /* 1) 입력폼: <div class="label">번호</div><input id="code"> */
  document.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{
    if(!ks.includes(el.id))return;
    const p=el.previousElementSibling;
    if(p&&/label|lab/.test(p.className||''))put(el.id,p.textContent);
  });
  /* 2) 그리드 헤더 */
  let th=[...document.querySelectorAll('thead th')].map(t=>t.textContent.trim());
  if(th.length&&/^(no|no\.|순번|번호)$/i.test(th[0])&&th.length>ks.length)th=th.slice(1);
  else if(th.length===ks.length+1)th=th.slice(1);
  let gk=null;
  try{if(typeof colKeys!=='undefined'&&Array.isArray(colKeys))gk=colKeys}catch(e){}
  if(gk&&th.length===gk.length)gk.forEach((k,i)=>put(k,th[i]));
  else if(th.length===ks.length)ks.forEach((k,i)=>put(k,th[i]));
  ks.forEach(k=>{if(!L[k])L[k]=k;(A[k]=A[k]||[]).push(k)});
  return {L,A};
}

const nz=s=>String(s).replace(/[\s()\[\]·\-_/.,]/g,'').toLowerCase();
function matchKey(h){
  h=String(h).trim(); if(!h)return '';
  const has=(k,f)=>(AL[k]||[]).some(f);
  let k=KS.find(x=>has(x,a=>a===h)); if(k)return k;
  const n=nz(h); if(!n)return '';
  k=KS.find(x=>has(x,a=>nz(a)===n)); if(k)return k;
  if(n.length<2)return '';
  return KS.find(x=>has(x,a=>{const z=nz(a);return z.length>=2&&(z.includes(n)||n.includes(z))}))||'';
}

/* ── TSV 파서 (엑셀 클립보드: 탭 구분, 따옴표 셀 지원) ── */
function parseTSV(text){
  const rows=[];let row=[],cell='',q=false;
  text=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}
      else cell+=c;
    }else{
      if(c==='"'&&cell==='')q=true;
      else if(c==='\t'){row.push(cell);cell=''}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else cell+=c;
    }
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row)}
  return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}

/* ── UI ──────────────────────────────────────────────── */
const CSS=`
#mpBtn{height:28px;min-width:112px;border:1px solid #9ba8b4;background:linear-gradient(#fff,#dfe6eb);font:inherit;cursor:pointer}
#mpBtn:hover{background:#fff}
#mpDim{position:fixed;inset:0;background:rgba(20,32,44,.42);z-index:99990;display:flex;align-items:center;justify-content:center}
#mpBox{width:min(940px,94vw);max-height:92vh;display:flex;flex-direction:column;background:#fff;border:1px solid #7d8b98;box-shadow:0 10px 34px rgba(0,0,0,.3);font:12px "Malgun Gothic","맑은 고딕",Arial,sans-serif;color:#344757}
#mpBox h2{margin:0;padding:9px 13px;font-size:15px;font-weight:600;background:linear-gradient(#eaf2f9,#cfdfec);border-bottom:1px solid #a9b7c3}
#mpBox .bd{padding:10px 13px;overflow:auto}
#mpBox .hint{color:#6b7a88;margin:0 0 7px}
#mpTa{width:100%;height:132px;border:1px solid #aeb9c3;padding:6px;font:12px Consolas,monospace;resize:vertical}
#mpMapWrap{margin-top:9px;border:1px solid #c7d1d9;overflow:auto;max-height:210px}
#mpMapWrap table{border-collapse:collapse;width:100%}
#mpMapWrap th,#mpMapWrap td{border:1px solid #d7dfe6;padding:3px 6px;white-space:nowrap;font-size:12px}
#mpMapWrap th{background:#eef3f7;position:sticky;top:0}
#mpMapWrap select{font:inherit;height:24px;border:1px solid #b5c0c9;width:100%}
#mpMapWrap td.pv{color:#5c6b78}
#mpBox .ft{padding:8px 13px;border-top:1px solid #c7d1d9;background:#eef2f5;display:flex;gap:6px;align-items:center}
#mpBox .ft button{height:28px;min-width:76px;border:1px solid #9ba8b4;background:linear-gradient(#fff,#dfe6eb);font:inherit;cursor:pointer}
#mpBox .ft button.pri{background:linear-gradient(#4a90d9,#2f75b5);color:#fff;border-color:#2c6396}
#mpStat{margin-left:auto;color:#5c6b78}
#mpBox label.ck{display:flex;align-items:center;gap:4px;cursor:pointer}
`;
function css(){const s=document.createElement('style');s.textContent=CSS;document.head.appendChild(s)}

let KS=[],LB={},AL={},GRID=[],HEAD=false;

function open_(){
  if(!INFO){alert('이 화면은 붙여넣기를 지원하지 않습니다.');return}
  KS=keysOf();{const r=labelsOf(KS);LB=r.L;AL=r.A}GRID=[];
  const dim=document.createElement('div');dim.id='mpDim';
  dim.innerHTML=`<div id="mpBox">
   <h2>엑셀 붙여넣기 — ${LB[INFO.pk]||INFO.pk} 기준 등록/수정</h2>
   <div class="bd">
    <p class="hint">엑셀에서 범위를 복사(Ctrl+C)한 뒤 아래 칸에 붙여넣기(Ctrl+V) 하세요. 제목행이 있으면 자동으로 컬럼이 연결됩니다.
    <b>${LB[INFO.pk]||INFO.pk}</b> 값이 기존 자료와 같으면 수정, 없으면 신규 등록됩니다.</p>
    <textarea id="mpTa" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>
    <div id="mpMapWrap" style="display:none"></div>
   </div>
   <div class="ft">
    <label class="ck"><input type="checkbox" id="mpHead"> 첫 행은 제목</label>
    <button id="mpTpl">양식 복사</button>
    <span id="mpStat"></span>
    <button id="mpOk" class="pri">적용</button>
    <button id="mpNo">닫기</button>
   </div></div>`;
  document.body.appendChild(dim);
  const ta=dim.querySelector('#mpTa');
  ta.addEventListener('input',()=>refresh(true));
  ta.addEventListener('paste',()=>setTimeout(()=>refresh(true),0));
  dim.querySelector('#mpHead').addEventListener('change',()=>refresh(false));
  dim.querySelector('#mpNo').onclick=close_;
  dim.querySelector('#mpOk').onclick=apply_;
  dim.querySelector('#mpTpl').onclick=()=>{
    const line=KS.map(k=>LB[k]).join('\t');
    (navigator.clipboard?navigator.clipboard.writeText(line):Promise.reject())
      .then(()=>stat('제목행을 복사했습니다. 엑셀 1행에 붙여넣고 자료를 채우세요.'))
      .catch(()=>{ta.value=line;stat('클립보드 사용 불가 — 아래 칸의 제목행을 복사하세요.')});
  };
  dim.addEventListener('mousedown',e=>{if(e.target===dim)close_()});
  document.addEventListener('keydown',esc);
  setTimeout(()=>ta.focus(),30);
}
function esc(e){if(e.key==='Escape')close_()}
function close_(){const d=document.getElementById('mpDim');if(d)d.remove();document.removeEventListener('keydown',esc)}
function stat(t){const s=document.getElementById('mpStat');if(s)s.textContent=t}

function refresh(auto){
  const ta=document.getElementById('mpTa');
  GRID=parseTSV(ta.value);
  const wrap=document.getElementById('mpMapWrap');
  if(!GRID.length){wrap.style.display='none';stat('');return}
  const ck=document.getElementById('mpHead');
  if(auto){
    const f=GRID[0].map(v=>String(v).trim());
    const hit=f.filter(v=>matchKey(v)).length;
    ck.checked=(hit>=Math.max(1,Math.ceil(f.length*0.5)));
  }
  HEAD=ck.checked;
  const cols=Math.max(...GRID.map(r=>r.length));
  const guess=[];
  for(let c=0;c<cols;c++)guess.push(HEAD?matchKey(String(GRID[0][c]||'')):(KS[c]||''));
  /* 제목이 달라 못 찾은 칸은 위치 순서로 보완 */
  const used=new Set(guess.filter(Boolean));let auto2=0;
  for(let c=0;c<cols;c++){
    if(guess[c])continue;
    let k=KS[c];
    if(!k||used.has(k))k=KS.find(x=>!used.has(x))||'';
    if(k){guess[c]=k;used.add(k);auto2++}
  }
  const body=GRID.slice(HEAD?1:0);
  let html='<table><thead><tr>';
  for(let c=0;c<cols;c++){
    html+=`<th><select data-c="${c}"><option value="">(무시)</option>`
      +KS.map(k=>`<option value="${k}"${guess[c]===k?' selected':''}>${LB[k]}</option>`).join('')
      +'</select></th>';
  }
  html+='</tr></thead><tbody>';
  body.slice(0,6).forEach(r=>{
    html+='<tr>';for(let c=0;c<cols;c++)html+=`<td class="pv">${String(r[c]??'').replace(/[<>&]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]))}</td>`;
    html+='</tr>';
  });
  html+='</tbody></table>';
  wrap.innerHTML=html;wrap.style.display='';
  wrap.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>stat(`${body.length}행 인식`)));
  stat(`${body.length}행 인식${HEAD?' (제목행 제외)':''}${auto2?` · ${auto2}개 열은 순서로 자동 연결 — 위 항목 확인`:''}`);
}

function apply_(){
  if(!GRID.length){stat('붙여넣은 자료가 없습니다.');return}
  const sels=[...document.querySelectorAll('#mpMapWrap select')];
  const cmap=sels.map(s=>s.value);
  if(!cmap.includes(INFO.pk)){stat(`${LB[INFO.pk]||INFO.pk} 컬럼을 지정하세요.`);return}
  const body=GRID.slice(HEAD?1:0);
  const arr=INFO.get(), pk=INFO.pk;
  const all=Object.keys(INFO.map);
  let add=0,upd=0,skip=0;
  for(const r of body){
    const o={};
    cmap.forEach((k,c)=>{if(k)o[k]=String(r[c]??'').trim()});
    const key=String(o[pk]??'').trim();
    if(!key){skip++;continue}
    let t=arr.find(x=>String(x[pk]??'')===key);
    if(!t){t={};all.forEach(k=>t[k]='');arr.push(t);add++}else upd++;
    for(const k in o)t[k]=o[k];
  }
  INFO.render();
  close_();
  const m=`엑셀 붙여넣기: 신규 ${add}건, 수정 ${upd}건${skip?`, 무시 ${skip}건`:''}`;
  if(window.MES&&window.MES.setMessage)window.MES.setMessage(m+' — DB 반영 중…');
  Promise.resolve(MESDB.syncMaster?MESDB.syncMaster():null).then(()=>{
    if(window.MES&&window.MES.setMessage)window.MES.setMessage(m+' — DB 반영 완료');
  }).catch(e=>{
    if(window.MES&&window.MES.setMessage)window.MES.setMessage('DB 반영 실패: '+String(e.message||e).slice(0,120));
  });
}

/* ── 버튼 삽입 ───────────────────────────────────────── */
function mount(){
  if(document.getElementById('mpBtn'))return;
  const b=document.createElement('button');
  b.id='mpBtn';b.type='button';b.textContent='▤ 엑셀 붙여넣기';b.onclick=open_;
  const ft=document.querySelector('.foot,.footer,footer');
  if(ft){
    const msg=ft.querySelector('.msg');
    if(msg)ft.insertBefore(b,msg);else ft.appendChild(b);
  }else{
    b.style.cssText='position:fixed;right:12px;bottom:12px;z-index:9990';
    document.body.appendChild(b);
  }
}
function boot(){css();mount()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
