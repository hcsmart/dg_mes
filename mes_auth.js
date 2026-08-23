/* DG mes 로그인 (v23) - Supabase 이메일 인증
 * index.html(부모)에서만 로드. 화면 iframe들은 mes_db.js가 부모의 토큰을 읽어 사용한다. */
(function(){
const URL_='https://ipggvrzxfcryzryileuv.supabase.co';
const KEY='sb_publishable_CHO-dAOU00HNwno52255mg_H3C1_vew';
const LS='dgmes.session';
const store={get(){try{return localStorage.getItem(LS)}catch(e){return null}},set(v){try{localStorage.setItem(LS,v)}catch(e){}},del(){try{localStorage.removeItem(LS)}catch(e){}}};

const AUTH={session:null,perms:null,role:null,name:null,
  get token(){return AUTH.session?.access_token||null},
  can(menu,right){ /* right: view|save|edit|delete */
    if(AUTH.role==='master'||AUTH.role==='admin')return true;
    if(!AUTH.perms)return right==='view';        /* 권한자료 없으면 조회만 */
    const hit=(m)=>AUTH.perms.find(p=>p.menu_name===m);
    /* 화면 권한 → 없으면 상위(중분류/모듈) 권한 상속 */
    const parts=(menu||'').split('/');
    for(let i=parts.length;i>=1;i--){
      const p=hit(parts.slice(0,i).join('/'));
      if(p)return !!p['can_'+(right==='delete'?'delete':right)];
    }
    return false;
  }};
window.MES_AUTH=AUTH;

async function api(path,opt={},useToken){
  const h={'apikey':KEY,'Content-Type':'application/json',
    'Authorization':'Bearer '+(useToken&&AUTH.token?AUTH.token:KEY)};
  const r=await fetch(URL_+path,{...opt,headers:{...h,...(opt.headers||{})}});
  const t=await r.text(); const b=t?JSON.parse(t):null;
  if(!r.ok)throw new Error(b?.msg||b?.error_description||b?.message||r.status);
  return b;
}

async function refresh(){
  if(!AUTH.session?.refresh_token)return false;
  try{
    const s=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',
      body:JSON.stringify({refresh_token:AUTH.session.refresh_token})});
    AUTH.session=s; store.set(JSON.stringify(s)); return true;
  }catch(e){return false}
}
/* 토큰 만료 5분 전 자동 갱신 */
setInterval(()=>{const s=AUTH.session;if(s&&s.expires_at*1000-Date.now()<5*60*1000)refresh()},60*1000);

async function loadPerms(){
  try{
    const rows=await api('/rest/v1/rpc/my_permissions',{method:'POST',body:'{}'},true);
    if(rows&&rows.length){AUTH.role=rows[0].role;AUTH.name=rows[0].name;
      AUTH.perms=rows.filter(r=>r.menu_name)}
    else{AUTH.role='user';AUTH.name=AUTH.session?.user?.email;AUTH.perms=[]}
  }catch(e){AUTH.role='user';AUTH.perms=[]}
}

function ui(){
  const div=document.createElement('div');div.id='loginGate';
  div.innerHTML=`<style>
  #loginGate{position:fixed;inset:0;background:linear-gradient(135deg,#e8f0f7,#f7fafc);z-index:99999;
    display:flex;align-items:center;justify-content:center;font-family:"Malgun Gothic",sans-serif}
  #loginGate .card{background:#fff;border:1px solid #b9c6d2;box-shadow:0 8px 30px rgba(40,70,100,.15);
    padding:34px 38px;width:330px}
  #loginGate h1{margin:0 0 4px;font-size:26px;color:#1d3d5e}#loginGate h1 b{color:#2e6da4}
  #loginGate .sub{font-size:12px;color:#6b7885;margin-bottom:20px}
  #loginGate label{display:block;font-size:12px;color:#41556b;margin:10px 0 4px}
  #loginGate input{width:100%;height:32px;border:1px solid #9ca9b5;padding:0 9px;font-size:13px;box-sizing:border-box}
  #loginGate button{width:100%;height:36px;margin-top:18px;border:1px solid #2e6da4;
    background:linear-gradient(#4a8ec2,#2e6da4);color:#fff;font-size:14px;cursor:pointer}
  #loginGate .err{color:#c62828;font-size:12px;min-height:16px;margin-top:10px}
  #loginGate .hintbox{margin-top:16px;font-size:11px;color:#8a97a5;border-top:1px dashed #d4dde5;padding-top:10px}
  </style>
  <div class="card">
    <h1><b>DG</b> mes</h1><div class="sub">동구기업 MES 로그인</div>
    <label>이름 (또는 아이디)</label><input id="lgEmail" type="text" autocomplete="username" placeholder="예: 김민수">
    <label>비밀번호</label><input id="lgPw" type="password" autocomplete="current-password" placeholder="6자리 이상">
    <button id="lgBtn">로그인</button><div class="err" id="lgErr"></div>
    <div class="hintbox">이름 또는 아이디와 비밀번호로 로그인합니다. 계정이 없으면 관리자에게 문의하세요.</div>
  </div>`;
  document.body.appendChild(div);
  const go=async()=>{
    const btn=document.getElementById('lgBtn'),err=document.getElementById('lgErr');
    if(err)err.textContent=''; if(btn){btn.disabled=true;btn.textContent='확인 중…'}
    try{
      let email=lgEmail.value.trim();
      if(!email.includes('@')){
        email=await api('/rest/v1/rpc/login_email',{method:'POST',body:JSON.stringify({p_name:email})});
        if(!email)throw new Error('등록되지 않은 사용자입니다. 이름을 확인하거나 관리자에게 문의하세요.');
      }
      const s=await api('/auth/v1/token?grant_type=password',{method:'POST',
        body:JSON.stringify({email,password:lgPw.value})});
      AUTH.session=s;store.set(JSON.stringify(s));
      await loadPerms(); done();
    }catch(e){if(err)err.textContent='로그인 실패: '+(String(e.message).includes('Invalid')?'이름 또는 비밀번호가 올바르지 않습니다.':e.message)}
    if(document.getElementById('lgBtn')){lgBtn.disabled=false;lgBtn.textContent='로그인'}
  };
  lgBtn.onclick=go;
  lgPw.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  lgEmail.focus();
}

function applyMenuPermissions(){
  /* 좌측 트리·상단 모듈에서 조회권한 없는 항목 숨김 */
  try{
    if(AUTH.role==='master'||AUTH.role==='admin')return;
    document.querySelectorAll('[data-menu-path]').forEach(el=>{
      if(!AUTH.can(el.dataset.menuPath,'view'))el.style.display='none';
    });
  }catch(e){}
}
async function changePassword(){
  const p1=prompt('새 비밀번호를 입력하세요. (6자 이상)');
  if(p1===null)return;
  if(!p1||p1.length<6)return alert('비밀번호는 6자 이상이어야 합니다.');
  const p2=prompt('새 비밀번호를 한 번 더 입력하세요.');
  if(p2===null)return;
  if(p1!==p2)return alert('두 입력이 일치하지 않습니다.');
  try{
    await api('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:p1})},true);
    try{await api('/rest/v1/rpc/invalidate_temp_password',{method:'POST',body:'{}'},true)}catch(e){}
    alert('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
  }catch(e){alert('변경 실패: '+e.message)}
}
function userBadge(){
  const u=document.querySelector('.user');
  if(u&&AUTH.name)u.innerHTML=`${AUTH.name} (${AUTH.role==='master'?'마스터':AUTH.role==='admin'?'관리자':'사용자'}) &nbsp;`+
    `<a href="#" id="pwchg" style="font-size:11px">비밀번호 변경</a> · `+
    `<a href="#" id="lgout" style="font-size:11px">로그아웃</a>`;
  document.getElementById('pwchg')?.addEventListener('click',e=>{e.preventDefault();changePassword()});
  document.getElementById('lgout')?.addEventListener('click',e=>{e.preventDefault();
    store.del();location.reload()});
}
function done(){
  document.getElementById('loginGate')?.remove();
  userBadge(); applyMenuPermissions();
  window.dispatchEvent(new Event('mes-auth-ready'));
  /* 열려있는 iframe 새로고침해서 토큰 반영 */
  document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.location.reload()}catch(e){}try{}finally{}});
}

(async function init(){
  try{const saved=JSON.parse(store.get()||'null');
    if(saved){AUTH.session=saved;
      if(saved.expires_at*1000-Date.now()<60*1000){if(!await refresh()){store.del();AUTH.session=null}}
    }}catch(e){}
  if(AUTH.session){await loadPerms();done()}
  else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui);
  else ui();
})();
})();
