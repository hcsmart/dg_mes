/* mes_ctx.js — v1
 * 그리드 행 우클릭 컨텍스트 메뉴 (전 화면 공용)
 *  - <tbody> 안의 행에서 우클릭하면 메뉴 표시
 *  - 해당 화면 footer의 버튼을 그대로 메뉴 항목으로 노출 (권한 disabled 반영)
 *  - 셀/행 복사 기능 기본 제공
 *  - 입력요소 위에서는 브라우저 기본 메뉴 유지(붙여넣기 등)
 * 페이지별 추가 설정: window.MES_CTX_OPT = {exclude:/regex/, extra:[{t:'라벨',f:fn}]}
 */
(function(){
if(window.__mesCtx)return; window.__mesCtx=1;

/* footer 버튼 중 행과 무관한 것 제외 */
const SKIP=/closeActive|^\s*search\(|csv|excel|export|print|reload|location\.reload/i;
const SKIP_TXT=/닫기|검색|조회$|EXCEL|엑셀|출력|인쇄|PRINT|초기화|처음|이전|다음|마지막/i;
/* 선택 계열 행 핸들러만 재현(모달 닫힘 등 부작용 방지) */
const SELFN=/^(pick|sel|select|choose|row)/i;
const IN_DLG=/dialog|modal|popup|dlg|look|overlay|layer/i;

const css=`
#mesctx{position:fixed;z-index:99999;display:none;min-width:170px;max-width:280px;background:#fff;
 border:1px solid #9ba8b4;box-shadow:2px 3px 8px rgba(0,0,0,.25);padding:3px 0;
 font:12px/1.5 'Malgun Gothic',맑은 고딕,sans-serif;color:#22303a;user-select:none}
#mesctx .hd{padding:5px 14px;color:#5b6870;background:#eef2f5;border-bottom:1px solid #dde3e8;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mesctx .mi{padding:6px 14px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mesctx .mi:hover{background:#2f6fb5;color:#fff}
#mesctx .mi.dis{color:#aab3ba;cursor:default}
#mesctx .mi.dis:hover{background:#fff;color:#aab3ba}
#mesctx .sep{height:1px;background:#dde3e8;margin:3px 0}
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

let menu=null,curTr=null,curTd=null;

function ensure(){
  if(menu)return menu;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  menu=document.createElement('div');menu.id='mesctx';document.body.appendChild(menu);
  return menu;
}
function close(){if(menu)menu.style.display='none'}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const txt=el=>(el?el.textContent:'').replace(/\s+/g,' ').trim();

function msg(s){
  if(window.MES&&MES.setMessage)return MES.setMessage(s);
  const m=document.getElementById('message');if(m)m.textContent=s;
}
function copyText(s,label){
  s=String(s??'');
  const ok=()=>msg((label||'복사')+': '+(s.length>60?s.slice(0,60)+'…':s));
  const fb=()=>{const ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';
    ta.style.opacity=0;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');ok()}catch(e){msg('복사 실패')}ta.remove()};
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(s).then(ok).catch(fb);
  else fb();
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

/* ── 삭제/취소 확인 다이얼로그 ───────────────────────────────
 * 모든 화면의 삭제·취소 버튼 클릭을 가로채 확인창을 한 번 더 띄운다.
 * (컨텍스트 메뉴에서 실행해도 동일 경로를 타므로 함께 적용됨)
 */
const DEL_TXT=/삭제|취소|제거|remove|delete/i;
const NOGUARD=/^\s*msg\s*\(|closeActive|close\w*\(|hide\w*\(/i;  /* 안내문구·닫기 버튼 제외 */
const HARD=/삭제|제거|remove|delete/i;           /* 삭제 = 되돌리기 어려움 */

function dlgConfirm(o){
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

function rowSummary(){
  const tr=document.querySelector('tbody tr.sel')||curTr;
  if(!tr||!tr.cells)return '';
  const hs=headers(tr),cs=rowCells(tr);
  return cs.map((v,i)=>(hs[i]&&v.trim())?hs[i]+': '+v:null)
           .filter(Boolean).slice(0,6).join('\n');
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

  e.preventDefault();e.stopPropagation();close();
  const hard=HARD.test(label);
  const ok=await dlgConfirm({
    title:label.replace(/^[^가-힣A-Za-z]+/,'')||'확인',
    q:`${label.replace(/^[^가-힣A-Za-z]+/,'')} 하시겠습니까?`,
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

/* 화면 footer 버튼 → 메뉴 항목 */
function footItems(){
  const out=[],opt=window.MES_CTX_OPT||{};
  const bs=document.querySelectorAll('footer.foot button, .foot button, .toolbar button');
  bs.forEach(b=>{
    const oc=b.getAttribute('onclick')||'',t=txt(b);
    if(!/[가-힣A-Za-z0-9]/.test(t))return;          /* 아이콘 전용 버튼 제외 */
    if(SKIP.test(oc)||SKIP_TXT.test(t))return;
    if(opt.exclude&&(opt.exclude.test(oc)||opt.exclude.test(t)))return;
    if(out.length>=8)return;
    out.push({t,dis:b.disabled,tip:b.disabled?(b.title||'권한이 없습니다'):'',f:()=>b.click()});
  });
  return out;
}

function build(tr,td){
  const opt=window.MES_CTX_OPT||{};
  const hs=headers(tr),cs=rowCells(tr);
  const ci=td?td.cellIndex:-1;
  const items=[];
  const fi=footItems();
  if(fi.length){items.push(...fi,{sep:1})}
  if(ci>=0)items.push({t:`⧉ 셀 복사${hs[ci]?' ('+hs[ci]+')':''}`,f:()=>copyText(cs[ci],'셀 복사')});
  items.push({t:'⧉ 행 복사 (탭 구분)',f:()=>copyText(cs.join('\t'),'행 복사')});
  items.push({t:'⧉ 행 복사 (항목:값)',f:()=>copyText(
    cs.map((v,i)=>(hs[i]?hs[i]+': ':'')+v).filter(x=>x.trim()&&!/^\s*:/.test(x)).join('\n'),'행 복사')});
  if(opt.extra&&opt.extra.length)items.push({sep:1},...opt.extra);
  /* 앞뒤 구분선 정리 */
  return items.filter((m,i,a)=>!(m.sep&&(i===0||i===a.length-1||a[i-1]&&a[i-1].sep)));
}

function open(e,tr,td){
  const m=ensure(),items=build(tr,td);
  if(!items.length)return;
  const cs=rowCells(tr).filter(x=>x.trim()).slice(0,3).join(' · ');
  m.innerHTML=(cs?`<div class="hd">${esc(cs)}</div>`:'')
   +items.map((it,k)=>it.sep?'<div class="sep"></div>'
     :`<div class="mi${it.dis?' dis':''}" data-k="${k}"${it.tip?` title="${esc(it.tip)}"`:''}>${esc(it.t)}</div>`).join('');
  m.querySelectorAll('.mi').forEach(el=>{
    el.onmousedown=ev=>ev.preventDefault();
    el.onclick=()=>{const it=items[+el.dataset.k];if(!it||it.dis)return;close();try{it.f()}catch(err){msg('실행 오류: '+err.message)}};
  });
  m.style.display='block';m.style.left='0px';m.style.top='0px';
  const w=m.offsetWidth,h=m.offsetHeight;
  let x=e.clientX,y=e.clientY;
  if(x+w>innerWidth-4)x=Math.max(4,innerWidth-w-4);
  if(y+h>innerHeight-4)y=Math.max(4,innerHeight-h-4);
  m.style.left=x+'px';m.style.top=y+'px';
}

document.addEventListener('contextmenu',e=>{
  const t=e.target;
  if(t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]'))return;
  const tr=t.closest('tbody tr');
  if(!tr||!tr.closest('table')){close();return}
  if(!tr.cells.length||(tr.cells.length===1&&tr.cells[0].hasAttribute('colspan'))){close();return}
  const host=tr.closest('[class],[id]');
  if(host&&(IN_DLG.test(host.className||'')||IN_DLG.test(host.id||''))){close();return}
  e.preventDefault();
  curTr=tr;curTd=t.closest('td');
  const oc=tr.getAttribute('onclick')||'';
  if(SELFN.test(oc.trim()))
    try{tr.click()}catch(err){}
  setTimeout(()=>open(e,tr,curTd),0);
},true);

document.addEventListener('click',close);
document.addEventListener('scroll',close,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
window.addEventListener('blur',close);
window.MESCTX={close,copyText};
})();
