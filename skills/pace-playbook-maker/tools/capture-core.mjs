// 공통 캡처 코어 — 서비스 비의존. 브라우저 실행은 어댑터가 browser 함수(throw 계약)로 넘긴다.
// 원칙: fail-closed. 마스킹 설정이 없거나, 설정이 있어도 실제로 덮지 못했으면 파일을 남기지 않는다.
//  - 거부 대상: mask 없음·잘못됨, capture:false 단계, 오버레이 실패(형태 검사), 접근 못 한/선언 안 된 iframe, 잘못된 규칙,
//    캡처 중 화면 변경(스크롤·뷰포트 안 DOM 변경) — 이미 저장된 스크린샷 원본은 browser.discard로 삭제한다.
// 알려진 한계(덮지 못하거나 감지하지 못함 — 해당 서비스 화면에서 쓰기 전에 T04처럼 실제로 관측해 판단한다):
//  - 닫힌 shadow root, 글자 없는 이미지·canvas·video 안의 실데이터, ::before/::after의 content 글자, 텍스트 노드가 여러 조각으로 나뉘어 정규식이 걸치는 경우
//  - top layer는 dialog[open]·:popover-open만 감지한다(fullscreen 요소 등은 미감지). html/body의 transform·filter 등이 있으면 거부한다
//  - 사후 검사는 DOM 변경·스크롤·마스킹 대상 rect만 본다 — CSS 애니메이션·일시 이동·왕복 스크롤·마스킹 대상이 아닌 요소의 CSS-only 레이아웃 변경은 감지하지 못한다
//  - mutationIgnore는 텍스트 변경(characterData)만 허용한다 — textContent·innerHTML로 갱신하는 영역은 childList라 항상 거부된다
// mask 항목: `re:` 접두 = 정규식(글자 노드), 그 외 = CSS 선택자(보이는 요소 중 글자·값이 있는 것). `text:`는 find 전용이라 mask에는 쓰지 않는다.

export class CaptureRefused extends Error {
  constructor(message,code='refused'){super(message);this.name='CaptureRefused';this.code=code;}
}

const isStr=x=>typeof x==='string'&&x.trim().length>0;

// mask 형식 검증 — 생성기(build.mjs)와 캡처가 같은 규칙을 쓴다. 문제가 있으면 Error를 던진다.
export function validateMask(mask){
  if(!Array.isArray(mask)||mask.length===0)throw new Error('mask가 없거나 비어 있다 (비어 있지 않은 문자열 배열 필요)');
  for(const m of mask){
    if(!isStr(m))throw new Error('mask 항목은 비어 있지 않은 문자열이어야 한다');
    if(m.startsWith('re:')){
      if(m.length===3)throw new Error('mask 정규식이 비어 있다');
      try{new RegExp(m.slice(3));}catch{throw new Error(`mask 정규식이 컴파일되지 않는다: ${m}`);}
    }
  }
  return true;
}

// 단계·흐름 설정이 캡처를 허용하는지 — 아니면 CaptureRefused
export function assertCapturable(step,doc){
  if(!step||typeof step!=='object')throw new CaptureRefused('단계를 찾지 못했다','step');
  if(step.capture===false)throw new CaptureRefused(`캡처 금지 단계${step.captureNote?`: ${step.captureNote}`:''}`,'capture_false');
  try{validateMask(doc?.mask);}catch(e){throw new CaptureRefused(`마스킹 설정 오류 — 캡처 거부: ${e.message}`,'mask');}
}

// ---- 페이지 안에서 실행되는 오버레이 함수 (전역 document·NodeFilter·MutationObserver 사용) ----
// 직렬화되어 브라우저에서 실행되므로 외부 변수를 참조하지 않는다. 테스트는 같은 함수를 DOM 스텁 전역으로 실행한다.
export function overlay(cfg){
  const G=globalThis,errors=[],perRule={},frames={};
  if(G.__flowcap){try{G.__flowcap.cleanup();}catch(e){errors.push('이전 오버레이 정리 실패');}}
  const root=document.createElement('div');
  root.id='__flowcap';
  root.style.cssText='position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  document.body.appendChild(root);
  const inCap=n=>{let e=n&&(n.nodeType===1?n:n.parentElement);while(e){if(e.id==='__flowcap')return true;e=e.parentElement;}return false;};
  const rectOf=(r,off)=>{const l=r.left+(off?off.left:0),t=r.top+(off?off.top:0);return {left:l,top:t,width:r.width,height:r.height,right:l+r.width,bottom:t+r.height};};
  const sig=(getRects,off)=>{const out=[];for(const r of getRects())out.push(rectOf(r,off));return JSON.stringify(out);};
  const maskedEls=new Set(),sigs=[];let masked=0;
  const box=(r,bg,txt)=>{const b=document.createElement('div');b.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;background:'+bg+';color:#fff;font:10px sans-serif;overflow:hidden';if(txt)b.textContent=txt;root.appendChild(b);return b;};
  const cover=(el,getRects,off)=>{for(const r of getRects())box(rectOf(r,off),'#475569','●●●');masked++;if(el)maskedEls.add(el);sigs.push({f:()=>sig(getRects,off),s0:sig(getRects,off)});};
  // 문서 목록: 최상위 + 선언한 frames (접근 못 하면 거부 사유)
  const docs=[{doc:document,off:null}],declared=new Set();
  // frames 값: 선택자 문자열(필수 — 없으면 거부) 또는 {selector, optional:true}(화면에 없으면 통과, 있는데 접근 못 하면 거부)
  for(const [alias,def] of Object.entries(cfg.frames||{})){
    const sel=typeof def==='string'?def:def.selector,optional=typeof def==='object'&&def.optional===true;
    let el=null;
    try{el=document.querySelector(sel);}catch(e){errors.push(`frame ${alias}: 선택자 오류`);frames[alias]={ok:false};continue;}
    if(!el){
      if(optional){frames[alias]={ok:true,absent:true};continue;}
      errors.push(`frame ${alias}: iframe을 찾지 못함`);frames[alias]={ok:false};continue;
    }
    let d=null;try{d=el.contentDocument;}catch(e){d=null;}
    if(!d||!d.body){errors.push(`frame ${alias}: 접근 불가`);frames[alias]={ok:false};continue;}
    declared.add(el);frames[alias]={ok:true};
    const fr=el.getBoundingClientRect();
    // 테두리(clientLeft/Top)만큼 안쪽 문서 좌표가 밀린다
    docs.push({doc:d,off:{left:fr.left+(el.clientLeft||0),top:fr.top+(el.clientTop||0)},alias});
  }
  // 열린 shadow root 포함 순회 대상
  const rootsOf=doc=>{const out=[doc],q=[doc];while(q.length){const r=q.shift();for(const el of r.querySelectorAll('*')){if(el.shadowRoot){out.push(el.shadowRoot);q.push(el.shadowRoot);}}}return out;};
  // html·body에 transform·filter·perspective·will-change가 있으면 fixed 오버레이의 기준이 달라져 상자가 어긋난다 — 거부
  for(const {doc} of docs){
    const gcs=doc.defaultView&&doc.defaultView.getComputedStyle;
    if(!gcs)continue;
    for(const el of [doc.documentElement,doc.body]){
      const cs=doc.defaultView.getComputedStyle(el)||{};
      for(const p of ['transform','translate','rotate','scale','filter','backdrop-filter','perspective','will-change','contain','container-type']){
        const v=String(cs[p]||'').trim();
        if(v&&v!=='none'&&v!=='auto'&&v!=='normal')errors.push(`html/body의 ${p}가 설정돼 오버레이 좌표 기준이 달라진다`);
      }
    }
  }
  const res=[];
  for(const rule of cfg.res||[]){try{res.push({rule,re:new RegExp(rule.slice(3))});perRule[rule]=0;}catch(e){errors.push(`mask 정규식 오류: ${rule}`);}}
  for(const sel of cfg.css||[])perRule[sel]=0;
  perRule['(기본:값 있는 입력)']=0;
  const SKIP=new Set(['button','submit','reset','checkbox','radio','hidden','image','file','range','color']);
  for(const {doc,off} of docs){
    for(const rt of rootsOf(doc)){
      // 선언 안 된 보이는 iframe(중첩 포함)은 덮을 수 없으므로 거부
      for(const f of rt.querySelectorAll('iframe,frame,object,embed')){
        if(declared.has(f)||inCap(f))continue;
        const r=f.getBoundingClientRect();
        if(r.width>0&&r.height>0)errors.push('선언되지 않은 보이는 iframe·object·embed');
      }
      // top layer(모달 dialog·popover)는 position:fixed 오버레이 위에 그려지므로 덮을 수 없다 — 보이면 거부
      for(const f of rt.querySelectorAll('dialog[open]')){
        const r=f.getBoundingClientRect();
        if(r.width>0&&r.height>0)errors.push('열린 dialog(top layer)가 보인다');
      }
      try{
        for(const f of rt.querySelectorAll(':popover-open')){
          const r=f.getBoundingClientRect();
          if(r.width>0&&r.height>0)errors.push('열린 popover(top layer)가 보인다');
        }
      }catch(e){/* :popover-open 미지원 브라우저 — popover 자체가 없다 */}
      // 글자 노드: re: 규칙
      if(res.length){
        const tw=doc.createTreeWalker(rt===doc?doc.body:rt,NodeFilter.SHOW_TEXT);let n;
        while((n=tw.nextNode())){
          if(inCap(n))continue;
          let hit=false;
          for(const x of res)if(x.re.test(n.nodeValue)){perRule[x.rule]++;hit=true;}
          if(!hit)continue;
          const rg=doc.createRange();rg.selectNodeContents(n);
          cover(n.parentElement,()=>rg.getClientRects(),off);
        }
      }
      // CSS 규칙: 글자·값이 있는 보이는 요소
      for(const sel of cfg.css||[]){
        let list;
        try{list=rt.querySelectorAll(sel);}catch(e){errors.push(`mask 선택자 오류: ${sel}`);continue;}
        for(const el of list){
          if(inCap(el))continue;
          const r=el.getBoundingClientRect();
          if(!(r.width>0&&r.height>0))continue;
          if(!(String(el.innerText||el.textContent||'').trim()||String(el.value||'').trim()))continue;
          perRule[sel]++;cover(el,()=>[el.getBoundingClientRect()],off);
        }
      }
      // 규칙과 무관하게 항상: 값 있는 입력·textarea·select·contenteditable
      for(const el of rt.querySelectorAll('input,textarea,select,[contenteditable]')){
        if(inCap(el))continue;
        const tag=String(el.tagName).toLowerCase();
        let filled;
        if(tag==='input'){const t=String(el.getAttribute('type')||'text').toLowerCase();filled=!SKIP.has(t)&&String(el.value||'').length>0;}
        else if(tag==='textarea'||tag==='select')filled=String(el.value||'').length>0;
        else filled=el.getAttribute('contenteditable')!=='false'&&String(el.innerText||el.textContent||'').trim().length>0;
        if(!filled)continue;
        // 공개 허용 입력: 선택자에 맞고 값 전체가 허용 패턴과 정확히 일치할 때만 덮지 않는다(그 밖은 그대로 덮음)
        // 값 패턴은 ^(?:…)$로 다시 감싸 전체 일치만 인정한다(최상위 |로 고정이 풀리는 우회 차단)
        if(tag==='input'&&(cfg.reveal||[]).some(x=>{try{return el.matches(x.selector)&&new RegExp('^(?:'+x.value.slice(1,-1)+')$').test(String(el.value));}catch(e){return false;}}))continue;
        const r=el.getBoundingClientRect();
        if(!(r.width>0&&r.height>0))continue;
        perRule['(기본:값 있는 입력)']++;cover(el,()=>[el.getBoundingClientRect()],off);
      }
    }
  }
  // 번호 태그(뷰포트 안 요소만)
  const view=document.defaultView||globalThis;
  const vis=r=>r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<view.innerHeight&&r.left<view.innerWidth;
  const missing=[];
  for(const e of cfg.elements||[]){
    try{
      let f=String(e.find||''),d=document,off=null;
      const m=/^([A-Za-z_][\w-]*):/.exec(f);
      if(m&&frames[m[1]]){
        const dd=docs.find(x=>x.alias===m[1]);
        if(!dd){missing.push(e.n);continue;}   // 선택 frame이 화면에 없다
        d=dd.doc;off=dd.off;f=f.slice(m[0].length);
      }
      let el=null;
      if(f.startsWith('text:')){const t=f.slice(5);el=[...d.querySelectorAll('button,a,input[type=button],input[type=radio],label,span,th,td,strong,b,h1,h2,h3,h4,h5,h6,p,div')].find(x=>(x.tagName!=='DIV'||![...x.children].some(c=>c.nodeType===1))&&String((x.innerText||x.value||x.title||'')).trim()===t&&vis(rectOf(x.getBoundingClientRect(),off)));}
      else el=[...d.querySelectorAll(f)].find(x=>vis(rectOf(x.getBoundingClientRect(),off)));
      if(!el){missing.push(e.n);continue;}
      const r=rectOf(el.getBoundingClientRect(),off);
      box({left:r.left-3,top:r.top-3,width:r.width+6,height:r.height+6},'transparent').style.border='2px solid #dc2626';
      const t=box({left:r.left-12,top:r.top-12,width:18,height:18},'#dc2626',String(e.n));t.style.borderRadius='9px';
      // 숫자를 원 가운데에 — 가로 가운데·세로는 줄 높이를 원 지름과 같게
      t.style.textAlign='center';t.style.lineHeight='18px';t.style.fontSize='11px';t.style.fontWeight='700';t.style.fontFamily='Arial,sans-serif';
    }catch(err){missing.push(e.n);}
  }
  // 변경 감시 — 오버레이 완성 뒤 시작한다. 허용: mutationIgnore 영역 안의 텍스트 변경(단, 마스킹 대상·규칙 일치 새 값 제외)
  const records=[],observers=[];
  const ancestorHit=(el,test)=>{for(let e=el;e;e=e.parentElement)if(test(e))return true;return false;};
  // 스크린샷 도구(Orca)가 캡처 중 기존 input의 type을 같은 값으로 다시 쓰고(file→file 등), name을 잠시 지웠다 되돌린다(2026-11-10 관측).
  // type: 모든 변경 기록의 이전 값(oldValue)이 캡처 전 값과 같아야 한다 — 중간에 다른 type이 있었으면(예: hidden→text→hidden) 화면이 바뀐 것이라 실패.
  // name: 그리기에 영향이 없어 post 때 캡처 전 값으로 돌아와 있으면 통과. 그 밖의 속성·새 input·input 아닌 요소는 그대로 실패.
  const inputAttrs=new Map(),toggled=new Set();
  for(const {doc} of docs)for(const el of doc.querySelectorAll('input'))inputAttrs.set(el,[el.getAttribute('name'),el.getAttribute('type')]);
  const handle=rs=>{
    for(const r of rs){
      if(inCap(r.target))continue;
      if(r.type==='attributes'&&inputAttrs.has(r.target)){
        const [,t0]=inputAttrs.get(r.target);
        if(r.attributeName==='name'){toggled.add(r.target);continue;}
        if(r.attributeName==='type'&&r.oldValue===t0){toggled.add(r.target);continue;}
      }
      let ok=false;
      if(r.type==='characterData'&&(cfg.ignore||[]).length){
        const p=r.target.parentElement;
        try{
          ok=ancestorHit(p,e=>(cfg.ignore).some(s=>e.matches(s)))
            &&!ancestorHit(p,e=>maskedEls.has(e))
            &&!res.some(x=>x.re.test(String(r.target.nodeValue||'')));
        }catch(e){ok=false;}
      }
      if(!ok)records.push(r.type);
    }
  };
  for(const {doc} of docs){
    const mo=new MutationObserver(handle);
    mo.observe(doc.documentElement||doc.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true});
    observers.push(mo);
  }
  const scroll0=docs.map(({doc})=>[doc.defaultView.scrollX,doc.defaultView.scrollY]);
  G.__flowcap={
    post(){
      for(const mo of observers)handle(mo.takeRecords());
      for(const el of toggled){const [n0,t0]=inputAttrs.get(el);if(el.getAttribute('name')!==n0||el.getAttribute('type')!==t0)records.push('attributes');}
      const reasons=[];
      if(records.length)reasons.push('dom_changed');
      const sc=docs.map(({doc})=>[doc.defaultView.scrollX,doc.defaultView.scrollY]);
      if(JSON.stringify(sc)!==JSON.stringify(scroll0))reasons.push('scroll_changed');
      if(sigs.some(s=>s.f()!==s.s0))reasons.push('layout_changed');
      return {ok:reasons.length===0,reasons};
    },
    cleanup(){for(const mo of observers)mo.disconnect();root.remove();delete G.__flowcap;return true;}
  };
  return {masked,errors,frames,perRule,missing};
}

// 공개 허용 입력 형식 검사 — {selector, value}. value는 ^…$로 고정된 정규식이어야 한다(부분 일치로 넓게 풀리지 않게)
export function validateReveal(reveal){
  if(!Array.isArray(reveal))throw new Error('revealInputs는 배열이어야 한다');
  for(const x of reveal){
    if(!x||typeof x.selector!=='string'||!x.selector.trim())throw new Error('revealInputs.selector가 비어 있다');
    if(typeof x.value!=='string'||!x.value.startsWith('^')||!x.value.endsWith('$'))throw new Error('revealInputs.value는 ^…$로 고정된 정규식이어야 한다');
    try{new RegExp(x.value);new RegExp('^(?:'+x.value.slice(1,-1)+')$');}catch{throw new Error(`revealInputs.value가 컴파일되지 않는다: ${x.value}`);}
    // 민감 표본(주민·외국인등록번호·계좌·카드 형식)이나 빈 값과 일치하는 패턴은 거부 — 차단 목록보다 표본 검증이 정본
    const re=new RegExp('^(?:'+x.value.slice(1,-1)+')$');
    for(const sample of ['','900101-1234567','9001015234567','123-456-789012','1002-123-456789','1234-5678-9012-3456','홍길동'])
      if(re.test(sample))throw new Error('revealInputs.value가 민감 표본·빈 값과 일치한다 — 공개 범위가 너무 넓다');
  }
  return true;
}
export function overlayScript({elements=[],mask,frames={},mutationIgnore=[],revealInputs=[]}){
  validateMask(mask);validateReveal(revealInputs);
  const cfg={
    elements:elements.map(e=>({n:e.n,find:e.find})),
    css:mask.filter(m=>!m.startsWith('re:')),
    res:mask.filter(m=>m.startsWith('re:')),
    frames,ignore:mutationIgnore,
    reveal:revealInputs.map(x=>({selector:x.selector,value:x.value}))
  };
  return `(${overlay.toString()})(${JSON.stringify(cfg)})`;
}
export const postCheckScript=()=>`(()=>{const f=globalThis.__flowcap;return f?f.post():{ok:false,reasons:['overlay_missing']}})()`;
export const cleanupScript=()=>`(()=>{const f=globalThis.__flowcap;return f?f.cleanup():true})()`;

// 오버레이 결과의 형태 검사 — 객체인지가 아니라 안전 조건을 모두 만족하는지 본다
export function checkOverlayResult(r,frames={}){
  if(!r||typeof r!=='object')throw new CaptureRefused('오버레이 결과가 없다','overlay_result');
  if(!Number.isFinite(r.masked))throw new CaptureRefused('오버레이 masked 값이 숫자가 아니다','overlay_result');
  if(!Array.isArray(r.errors))throw new CaptureRefused('오버레이 errors 형식 오류','overlay_result');
  if(r.errors.length)throw new CaptureRefused(`마스킹 오버레이 오류: ${r.errors.join('; ')}`,'overlay_errors');
  if(!r.perRule||typeof r.perRule!=='object'||Array.isArray(r.perRule))throw new CaptureRefused('오버레이 perRule 형식 오류','overlay_result');
  if(!r.frames||typeof r.frames!=='object')throw new CaptureRefused('오버레이 frames 형식 오류','overlay_result');
  for(const k of Object.keys(frames))if(r.frames[k]?.ok!==true)throw new CaptureRefused(`frame ${k}를 덮지 못했다`,'frame');
}

// 캡처 절차. browser: {evalJs(expr), screenshot()→경로, discard(path), sleep(ms)} — 실패하면 throw해야 한다.
// 반환: {path, info, post} — 거부·실패면 throw하고 저장된 원본은 삭제한다.
export function runCapture({doc,step,frames={},mutationIgnore=[],browser,delayMs=300}){
  assertCapturable(step,doc);
  let script;
  try{script=overlayScript({elements:step.elements||[],mask:doc.mask,frames,mutationIgnore,revealInputs:step.revealInputs||[]});}
  catch(e){throw new CaptureRefused(`공개 허용 입력 설정 오류 — 캡처 거부: ${e.message}`,'reveal');}
  let path=null,accepted=false,result=null,err=null,overlayTried=false;
  try{
    overlayTried=true;
    const info=browser.evalJs(script);
    checkOverlayResult(info,frames);
    browser.sleep(delayMs);
    path=browser.screenshot();
    const post=browser.evalJs(postCheckScript());
    if(!post||post.ok!==true||!Array.isArray(post.reasons)||post.reasons.length)
      throw new CaptureRefused(`캡처 중 화면이 바뀌어 거부: ${(post&&post.reasons||['검사 결과 없음']).join(',')}`,'changed');
    accepted=true;result={path,info,post};
  }catch(e){err=e;}
  let cleanupFailed=false,discardErr=null;
  if(overlayTried){try{if(browser.evalJs(cleanupScript())!==true)cleanupFailed=true;}catch(e){cleanupFailed=true;}}
  if(path&&!accepted){try{browser.discard(path);}catch(e){discardErr=e;}}
  if(err){
    if(discardErr){err.discardError=discardErr;err.message+=' (저장된 원본 삭제 실패 — 수동 삭제 필요)';}
    throw err;
  }
  return {...result,cleanupFailed};
}
