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
#mesctx .sep{height:1px;background:#dde3e8;margin:3px 0}`;

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
