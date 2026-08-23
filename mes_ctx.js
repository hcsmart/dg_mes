/* mes_ctx.js — v2
 * 삭제·취소 확인 다이얼로그 (전 화면 공용)
 *   모든 화면의 삭제/취소 버튼 클릭을 가로채 확인창을 한 번 더 띄운다.
 *   화면 자체에 confirm()이 있으면 중복 질문이 되지 않도록 1회 통과시킨다.
 * 화면별 제외: window.MES_CTX_OPT = {noGuard:/라벨 또는 onclick 정규식/}
 */
(function(){
if(window.__mesCtx)return; window.__mesCtx=1;

const DEL_TXT=/삭제|취소|제거|remove|delete/i;
const NOGUARD=/^\s*msg\s*\(|closeActive|close\w*\(|hide\w*\(/i;  /* 안내문구·닫기 버튼 제외 */
const HARD=/삭제|제거|remove|delete/i;           /* 삭제 = 되돌리기 어려움 */

const css=`
#mesdlg-bg{position:fixed;inset:0;z-index:100000;background:rgba(20,28,35,.38);display:flex;
 align-items:center;justify-content:center;font:12px/1.6 'Malgun Gothic',맑은 고딕,sans-serif}
#mesdlg{min-width:330px;max-width:460px;background:#fff;border:1px solid #7f8f9c;
 box-shadow:0 6px 24px rgba(0,0,0,.3)}
#mesdlg .t{height:30px;display:flex;align-items:center;padding:0 12px;color:#fff;
 background:linear-gradient(#5f7f9f,#3f5f7d);font-weight:700}
#mesdlg .bd{padding:16px 18px 12px;color:#22303a}
#mesdlg .q{font-size:13px;font-weight:700;margin-bottom:9px}
#mesdlg .tg{background:#f4f7f9;border:1px solid #dde3e8;padding:7px 10px;color:#40525f;
 max-height:96px;overflow:auto;word-break:break-all;white-space:pre-wrap}
#mesdlg .w{margin-top:9px;color:#b3261e}
#mesdlg .bt{padding:10px 14px 14px;display:flex;gap:7px;justify-content:flex-end;background:#f7f9fa;
 border-top:1px solid #e3e9ed}
#mesdlg button{height:29px;min-width:78px;border:1px solid #9ba8b4;cursor:pointer;
 background:linear-gradient(#fff,#dfe6eb);font:12px 'Malgun Gothic',맑은 고딕,sans-serif}
#mesdlg button:hover{background:#fff}
#mesdlg button.danger{border-color:#a3312a;color:#fff;background:linear-gradient(#d4453c,#b3261e)}
#mesdlg button.danger:hover{background:linear-gradient(#e05149,#c22d24)}
#mesdlg button:focus{outline:2px solid #2f6fb5;outline-offset:1px}`;

let styled=false;
function ensureCss(){if(styled)return;styled=true;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st)}

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const txt=el=>(el?el.textContent:'').replace(/\s+/g,' ').trim();

function msg(s){
  if(window.MES&&MES.setMessage)return MES.setMessage(s);
  const m=document.getElementById('message');if(m)m.textContent=s;
}
function headers(tr){
  const tb=tr.closest('table');if(!tb)return[];
  const hr=tb.tHead?[...tb.tHead.rows].pop():null;
  return hr?[...hr.cells].map(txt):[];
}
function rowCells(tr){return [...tr.cells].map(td=>{
  const f=td.querySelector('input,select,textarea');
  return f?(f.type==='checkbox'?(f.checked?'Y':'N'):f.value):txt(td);
})}
function rowSummary(){
  const tr=document.querySelector('tbody tr.sel');
  if(!tr||!tr.cells)return '';
  const hs=headers(tr),cs=rowCells(tr);
  return cs.map((v,i)=>(hs[i]&&v.trim())?hs[i]+': '+v:null)
           .filter(Boolean).slice(0,6).join('\n');
}

function dlgConfirm(o){
  ensureCss();
  return new Promise(res=>{
    const bg=document.createElement('div');bg.id='mesdlg-bg';
    bg.innerHTML=`<div id="mesdlg" role="dialog" aria-modal="true">
      <div class="t">${esc(o.title||'확인')}</div>
      <div class="bd">
        <div class="q">${esc(o.q)}</div>
        ${o.target?`<div class="tg">${esc(o.target)}</div>`:''}
        ${o.warn?`<div class="w">${esc(o.warn)}</div>`:''}
      </div>
      <div class="bt">
        <button type="button" data-a="0">취소</button>
        <button type="button" data-a="1" class="${o.danger?'danger':''}">${esc(o.ok||'확인')}</button>
      </div></div>`;
    document.body.appendChild(bg);
    const done=v=>{if(!bg.parentNode)return;bg.remove();document.removeEventListener('keydown',key,true);res(v)};
    function key(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false)}
      else if(e.key==='Enter'&&document.activeElement&&document.activeElement.dataset.a===undefined){
        e.preventDefault();e.stopPropagation();done(false)}   /* Enter 오입력 방지 */
    }
    bg.addEventListener('click',e=>{
      const b=e.target.closest('button[data-a]');
      if(b){e.stopPropagation();done(b.dataset.a==='1');return}
      if(e.target===bg){e.stopPropagation();done(false)}
    },true);
    document.addEventListener('keydown',key,true);
    /* 기본 포커스는 '취소' — 엔터 연타로 지워지는 사고 방지 */
    setTimeout(()=>bg.querySelector('button[data-a="0"]').focus(),0);
  });
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');
  if(!b||b.disabled)return;
  if(b.__mesOk){b.__mesOk=false;return}              /* 확인 통과분은 그대로 실행 */
  if(b.closest('#mesdlg-bg'))return;                 /* 확인창 자체 버튼 제외 */
  const label=txt(b),oc=b.getAttribute('onclick')||'';
  if(!DEL_TXT.test(label))return;
  if(NOGUARD.test(oc))return;
  const opt=window.MES_CTX_OPT||{};
  if(opt.noGuard&&(opt.noGuard.test(oc)||opt.noGuard.test(label)))return;

  e.preventDefault();e.stopPropagation();
  const hard=HARD.test(label);
  const name=label.replace(/^[^가-힣A-Za-z]+/,'')||'확인';
  const ok=await dlgConfirm({
    title:name, q:`${name} 하시겠습니까?`,
    target:rowSummary(),
    warn:hard?'이 작업은 되돌릴 수 없습니다.':'',
    ok:hard?'삭제':'실행', danger:hard
  });
  if(!ok){msg('취소했습니다.');return}
  /* 화면 자체 confirm이 있으면 중복 질문이 되므로 1회만 통과시킨다 */
  const orig=window.confirm;window.confirm=()=>true;
  b.__mesOk=true;
  try{b.click()}finally{setTimeout(()=>{window.confirm=orig},0)}
},true);

window.MESCTX={confirm:dlgConfirm};
})();
