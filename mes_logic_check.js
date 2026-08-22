const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const P=process.argv[2]||'.';
const files=fs.readdirSync(P).filter(f=>f.endswith?f.endswith('.html'):f.endsWith('.html')).filter(f=>f!=='index.html');
(async()=>{
let bad=0;
for(const f of files){
  const html=fs.readFileSync(path.join(P,f),'utf8');
  const errs=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'file://'+path.join(P,f),beforeParse(w){
    w.fetch=(u)=>{const fp=path.join(P,String(u).split('/').pop());if(!fs.existsSync(fp))return Promise.reject(new Error('404 '+u));return Promise.resolve({ok:true,json:()=>Promise.resolve(JSON.parse(fs.readFileSync(fp,'utf8'))),text:()=>Promise.resolve(fs.readFileSync(fp,'utf8'))})};
    w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'x';w.URL.createObjectURL=()=>'blob:';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
    w.addEventListener('error',e=>errs.push('runtime: '+(e.error?.message||e.message)));
    w.onunhandledrejection=e=>errs.push('promise: '+e.reason);
  }});
  dom.window.addEventListener('unhandledrejection',e=>errs.push('promise: '+e.reason));
  await new Promise(r=>setTimeout(r,300));
  const w=dom.window,d=w.document;
  // onclick 참조 함수 존재
  for(const el of d.querySelectorAll('[onclick]')){const m=el.getAttribute('onclick').match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);if(m&&typeof w[m[1]]!=='function'&&!/^(window|document)$/.test(m[1]))errs.push('onclick 함수 없음: '+m[1])}
  // 스크립트에서 참조하는 id가 DOM에 있는지 (bare id / getElementById)
  const ids=new Set([...d.querySelectorAll('[id]')].map(e=>e.id));
  for(const x of html.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)) if(!ids.has(x[1]))errs.push('id 없음: '+x[1]);
  // 버튼 실제 클릭 시뮬레이션
  const clicked=[];
  for(const el of d.querySelectorAll('button[onclick]')){const oc=el.getAttribute('onclick');if(/close|parent/.test(oc))continue;try{el.click();clicked.push(oc.split('(')[0])}catch(e){errs.push('클릭 오류 '+oc+': '+e.message)}}
  await new Promise(r=>setTimeout(r,100));
  // 표 렌더 확인
  const tb=[...d.querySelectorAll('tbody')];const empty=tb.filter(t=>!t.children.length).map(t=>t.id||'?');
  const st=errs.length?'FAIL':'ok';if(errs.length)bad++;
  console.log(`${st.padEnd(4)} ${f.padEnd(44)} 버튼${clicked.length} tbody${tb.length}(빈:${empty.length?empty.join(','):'-'})${errs.length?'\n     '+[...new Set(errs)].join('\n     '):''}`);
  w.close();
}
console.log('\nFAIL',bad,'/',files.length);
})();
