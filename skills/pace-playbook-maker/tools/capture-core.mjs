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

import {createHash} from 'node:crypto';
import {scanSensitive} from './sensitive.mjs';

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

// 값 노출 검사 — 추출 대상 요소가 가려져도 **같은 값이 화면의 다른 곳**(예: 파일 목록의 커밋 제목·About의 별 개수)에 가려지지 않은 채 보이면 캡처 이미지에 값이 남는다.
// 화면에서 각 추출 대상의 현재 값을 읽어, 대상 요소 밖의 보이는 곳 중 mask 규칙(CSS 선택자 안·정규식 일치)에 덮이지 않은 곳에 그 값이 있는지 센다.
//  · 글자: 각 요소의 **대상 밖 글자**(대상 요소 하위 글자를 뺀 글자 — 대상을 품은 부모의 다른 글자도 본다)에서 값을 품은 **가장 작은 요소**를 센다
//    — 값이 여러 노드로 나뉘어(ab<span>cd</span>) 보여도 잡는다. 값은 길이와 무관하게 낱말 단위로 찾는다(짧은 값 '7'도 '별: 7'에서 잡는다).
//  · 입력칸: 다른 입력칸의 value에 같은 값이 있으면 센다.
// 대상마다 결과를 하나씩 낸다 — 대상 요소가 없거나 값이 비었으면 checked:false(검사하지 못함). 결과에는 이름·개수·사유만 있다(값 없음).
export function leakScript({mask,step}){
  const css=(mask||[]).filter(m=>typeof m==='string'&&!m.startsWith('re:'));
  const res=(mask||[]).filter(m=>typeof m==='string'&&m.startsWith('re:')).map(m=>m.slice(3));
  return `(()=>{
const CSS=${JSON.stringify(css)},RES=${JSON.stringify(res)},TG=${JSON.stringify(leakTargets(step))};
// 캡처는 뷰포트만 찍는다 — 화면 밖(스크롤 아래) 요소는 이미지에 남지 않는다
const VW=typeof innerWidth==='number'?innerWidth:Infinity,VH=typeof innerHeight==='number'?innerHeight:Infinity;
const vis=e=>{const r=e.getBoundingClientRect();const right=r.right??(r.left+r.width),bottom=r.bottom??(r.top+r.height);return r.width>0&&r.height>0&&right>0&&bottom>0&&r.left<VW&&r.top<VH&&getComputedStyle(e).visibility!=='hidden';};
const closest=(el,sel)=>{for(let p=el;p;p=p.parentElement){try{if(p.matches&&p.matches(sel))return true;}catch(e){return false;}}return false;};
const isInput=e=>/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
const norm=s=>String(s??'').replace(/\\s+/g,' ').trim();
const escRe=s=>s.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&');
const coveredEl=(el,text)=>{for(const m of CSS)if(closest(el,m))return true;for(const r of RES){try{if(new RegExp(r).test(text))return true;}catch(e){}}return false;};
const inside=(a,b)=>{for(let q=b;q;q=q.parentElement)if(q===a)return true;return false;};
const els=[];const walk=n=>{for(const c of n.children||[]){if(c.nodeType!==1)continue;els.push(c);walk(c);}};walk(document.body);
const out=[];
for(const t of TG){
  let el=null;try{el=document.querySelector(t.f);}catch(e){}
  if(!el){out.push({name:t.n,checked:false,reason:'missing'});continue;}
  const v=norm(isInput(el)?el.value:el.textContent);
  if(!v){out.push({name:t.n,checked:false,reason:'empty'});continue;}
  // 값은 낱말 단위로 찾는다(앞뒤가 글자·숫자가 아님) — 'main'이 'domain' 안에서 잡히지 않게. 길이와 무관(짧은 값도 낱말로 있으면 센다 — fail-closed)
  const tok=new RegExp('(^|[^\\\\p{L}\\\\p{N}])'+escRe(v)+'($|[^\\\\p{L}\\\\p{N}])','u');
  const has=s=>tok.test(norm(s));
  // 대상 밖 글자: 대상 요소 하위 글자를 빼고(경계는 공백) 이어 붙인다 — 대상을 품은 조상의 다른 글자도 검사된다
  const memo=new Map();
  const outText=nd=>{if(nd===el)return ' ';if(nd.nodeType===3)return nd.nodeValue||'';if(memo.has(nd))return memo.get(nd);const s=Array.from(nd.childNodes||nd.children||[]).map(outText).join('');memo.set(nd,s);return s;};
  let n=0;
  for(const e of els){
    if(e===el||inside(el,e))continue;   // 대상 자신·대상 안
    if(!vis(e))continue;
    if(isInput(e)){if(e.value!==undefined&&has(e.value)&&!coveredEl(e,String(e.value)))n++;continue;}
    const txt=outText(e);
    if(!has(txt))continue;
    // 더 작은 자식 요소가 값을 품으면 그 자식에서 센다(실제 DOM의 children은 HTMLCollection — 배열 메서드 없음)
    if(Array.from(e.children||[]).some(c=>c.nodeType===1&&c!==el&&!inside(el,c)&&has(outText(c))))continue;
    if(!coveredEl(e,txt))n++;
  }
  out.push({name:t.n,checked:true,exposed:n});
}
return out;
})()`;
}
// 값 노출 검사 대상 — 화면 선택자로 읽는 추출 선언(이름·선택자)
export function leakTargets(step){return ((step&&step.extract)||[]).filter(x=>x&&x.where&&typeof x.where.selector==='string').map(x=>({n:x.name,f:x.where.selector}));}
// 문제 문구 배열(이름·개수·사유만, 값 없음) — fail-closed: 결과가 배열이 아니거나, 대상마다 하나씩 checked 결과가 없거나, 노출이 있으면 문제다
export function leakProblems(res,step){
  if(!Array.isArray(res))return ['값 노출 검사 결과를 읽지 못했다'];
  const probs=[];
  const names=step?leakTargets(step).map(t=>t.n):res.map(x=>x&&x.name);
  for(const name of names){
    const x=res.find(r=>r&&r.name===name);
    const label=`추출 '${String(name).slice(0,40)}'`;
    if(!x||typeof x!=='object'){probs.push(`${label}의 값 노출 검사 결과가 없다`);continue;}
    if(x.checked!==true){probs.push(`${label}의 값 노출을 검사하지 못했다(${x.reason==='missing'?'대상 없음':x.reason==='empty'?'값 없음':'사유 모름'})`);continue;}
    if(!Number.isInteger(x.exposed)||x.exposed<0){probs.push(`${label}의 값 노출 검사 결과를 해석하지 못했다`);continue;}
    if(x.exposed>0)probs.push(`${label}의 값이 대상 밖 ${x.exposed}곳에 가려지지 않고 보인다`);
  }
  return probs;
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
  const maskedEls=new Set(),sigs=[],maskRects=[];let masked=0;
  const box=(r,bg,txt)=>{const b=document.createElement('div');b.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;background:'+bg+';color:#fff;font:10px sans-serif;overflow:hidden';if(txt)b.textContent=txt;root.appendChild(b);return b;};
  const cover=(el,getRects,off)=>{for(const r of getRects()){const rr=rectOf(r,off);maskRects.push(rr);box(rr,'#475569','●●●');}masked++;if(el)maskedEls.add(el);sigs.push({f:()=>sig(getRects,off),s0:sig(getRects,off)});};
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
  const missing=[],boxes={},elementsMasked={};
  // 요소 rect 전체가 가림 rect들의 합집합에 들어갈 때만 true(부분 가림은 false)
  const covered=(r,rects)=>{if(!(r.width>0&&r.height>0))return false;const xs=[r.left,r.right],ys=[r.top,r.bottom];for(const m of rects){for(const x of [m.left,m.right])if(x>r.left&&x<r.right)xs.push(x);for(const y of [m.top,m.bottom])if(y>r.top&&y<r.bottom)ys.push(y);}xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){if(xs[i+1]-xs[i]<=0||ys[j+1]-ys[j]<=0)continue;const cx=(xs[i]+xs[i+1])/2,cy=(ys[j]+ys[j+1])/2;if(!rects.some(m=>cx>=m.left&&cx<=m.right&&cy>=m.top&&cy<=m.bottom))return false;}return true;};
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
      boxes[e.n]={x:r.left,y:r.top,w:r.width,h:r.height};elementsMasked[e.n]=covered(r,maskRects);
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
  return {masked,errors,frames,perRule,missing,boxes,elementsMasked,view:{vw:view.innerWidth,vh:view.innerHeight,dpr:view.devicePixelRatio||1}};
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

// ---- 에이전트 지도(agentView)용: 캡처 기록·승인·위치 대응 -------------------------------------
// 좌표·가림 증거는 숫자·불리언·해시뿐이다(화면 글자 없음). 정본 저장 위치는 steps.json의 단계 captureRecord 하나.
export const sha256Hex=data=>createHash('sha256').update(data).digest('hex');
const HEX64=/^[0-9a-f]{64}$/;
const isNum=x=>typeof x==='number'&&Number.isFinite(x);
// 키 정렬 JSON(UTF-8) — 해시 입력의 정규 직렬화
export function canonicalJson(v){
  if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
// 캡처가 증거로 유효한 화면 조건 — 화면 판정(screen)과 프레임 별칭(선택자)이 바뀌면 이전 캡처 증거를 재사용하지 않는다.
export function contextHash(step,frames={}){
  const sc=step&&step.screen||{};
  const fr={};
  for(const [alias,def] of Object.entries(frames||{}))fr[alias]=typeof def==='string'?def:(def&&def.selector)??null;
  return sha256Hex(canonicalJson({screen:{url:sc.url??null,require:sc.require??[],forbid:sc.forbid??[]},frames:fr}));
}
// 추출 선언이 가리키는 번호 요소(where.selector === 요소 find). 없으면 null.
export function extractTarget(step,ex){
  const sel=ex&&ex.where&&ex.where.selector;
  if(typeof sel!=='string')return null;
  const el=(step.elements||[]).find(e=>e.find===sel);
  return el?el.n:null;
}
const refuse=(msg,code)=>{throw new CaptureRefused(msg,code);};

// runCapture 반환({info,post})·단계·승인 캡처 해시를 한 기록으로 묶는다. 실패 입력은 기록을 만들지 않고 거부한다.
export function captureRecord({info,post,step,shotSha256,frames={}}){
  if(!info||typeof info!=='object')refuse('캡처 결과 info가 없다','record_info');
  if(!post||post.ok!==true)refuse('사후 검사가 통과하지 않은 캡처는 기록하지 않는다','record_post');
  if(!Array.isArray(info.errors)||info.errors.length)refuse('오버레이 오류가 있는 캡처는 기록하지 않는다','record_errors');
  if(!HEX64.test(String(shotSha256)))refuse('캡처 해시 형식 오류','record_sha');
  if(!step||step.capture===false)refuse('캡처하지 않는 단계는 기록하지 않는다','record_step');
  const missing=new Set((info.missing||[]).map(Number));
  const boxes={},finds={};
  for(const e of step.elements||[]){
    finds[e.n]=e.find;
    const b=info.boxes&&info.boxes[e.n];
    if(!b){if(missing.has(Number(e.n)))continue;refuse(`요소 ${e.n} box가 없다`,'record_box');}
    for(const k of ['x','y','w','h'])if(!isNum(b[k]))refuse(`요소 ${e.n} box 값이 숫자가 아니다`,'record_box');
    boxes[e.n]={x:b.x,y:b.y,w:b.w,h:b.h};
  }
  const v=info.view||{};
  for(const k of ['vw','vh','dpr'])if(!isNum(v[k])||v[k]<=0)refuse('화면 크기·배율 값이 올바르지 않다','record_view');
  const elementsMasked={};
  for(const e of step.elements||[])if(boxes[e.n])elementsMasked[e.n]=Boolean(info.elementsMasked&&info.elementsMasked[e.n]);
  const perRule={};
  for(const [k,n] of Object.entries(info.perRule||{})){if(!isNum(n))refuse('perRule 건수가 숫자가 아니다','record_masking');perRule[k]=n;}
  if(!isNum(info.masked))refuse('masked 건수가 숫자가 아니다','record_masking');
  // 가림 필수 규칙은 건수 1 이상이어야 한다
  for(const rule of step.maskRequire||[])if(!(perRule[rule]>=1))refuse('가림 필수 규칙이 0건이다','mask_require_zero');
  // 추출 대상: 번호 요소에 연결되고 가려져야 하며, restricted는 캡처 단계에 둘 수 없다
  for(const ex of step.extract||[]){
    if(ex.sensitivity==='restricted')refuse('restricted 추출은 캡처 단계에 둘 수 없다','extract_restricted');
    if(ex.where&&ex.where.selector===undefined)continue;
    const n=extractTarget(step,ex);
    if(n===null)refuse('추출 대상이 번호 요소에 연결되지 않았다','extract_unlinked');
    if(missing.has(Number(n))||!boxes[n])refuse('추출 대상 요소를 화면에서 찾지 못했다','extract_missing');
    if(elementsMasked[n]!==true)refuse('추출 대상 요소가 가려지지 않았다','extract_unmasked');
  }
  const payload={boxes,view:{vw:v.vw,vh:v.vh,dpr:v.dpr},shotSha256,masking:{masked:info.masked,perRule},post:true,elementsMasked,finds,contextSha:contextHash(step,frames)};
  try{scanSensitive({steps:[{captureRecord:payload}]})}catch(e){refuse('캡처 기록에 민감 형식이 있다 — 기록하지 않는다','record_sensitive');}
  return {...payload,recordHash:sha256Hex(canonicalJson(payload))};
}

// 기록(payload) 구조 검사 — approveStep과 생성기가 같은 의미로 쓴다. 문제 목록을 돌려준다(값 없음).
export function recordShapeProblems(p){
  const probs=[];
  if(!p||typeof p!=='object'||Array.isArray(p))return ['기록이 객체가 아니다'];
  const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const exact=(o,keys,name)=>{if(isObj(o)&&Object.keys(o).some(k=>!keys.includes(k)))probs.push(`${name}에 허용되지 않은 키가 있다`);};
  exact(p,['boxes','view','shotSha256','masking','post','elementsMasked','finds','contextSha'],'기록');
  if(!HEX64.test(String(p.contextSha)))probs.push('contextSha 형식 오류');
  if(!isObj(p.boxes))probs.push('boxes가 객체가 아니다');
  else for(const [n,b] of Object.entries(p.boxes)){
    if(!/^\d+$/.test(n)||!isObj(b)||!['x','y','w','h'].every(k=>isNum(b[k]))||b.w<=0||b.h<=0)probs.push('box 값이 올바르지 않다');
  }
  if(!isObj(p.view)||!['vw','vh','dpr'].every(k=>isNum(p.view[k])&&p.view[k]>0))probs.push('view 값이 올바르지 않다');
  exact(p.view,['vw','vh','dpr'],'view');
  if(isObj(p.boxes))for(const b of Object.values(p.boxes))exact(b,['x','y','w','h'],'box');
  exact(p.masking,['masked','perRule'],'masking');
  if(!HEX64.test(String(p.shotSha256)))probs.push('shotSha256 형식 오류');
  if(!isObj(p.masking)||!isNum(p.masking.masked)||!isObj(p.masking.perRule)||Object.values(p.masking.perRule).some(v=>!isNum(v)))probs.push('masking 형식 오류');
  if(p.post!==true)probs.push('post가 true가 아니다(사후 검사 미통과)');
  if(!isObj(p.elementsMasked)||Object.values(p.elementsMasked).some(v=>typeof v!=='boolean'))probs.push('elementsMasked 형식 오류');
  else if(isObj(p.boxes)&&JSON.stringify(Object.keys(p.boxes).sort())!==JSON.stringify(Object.keys(p.elementsMasked).sort()))probs.push('elementsMasked 키가 boxes와 다르다');
  if(!isObj(p.finds)||Object.values(p.finds).some(v=>typeof v!=='string'))probs.push('finds 형식 오류');
  return probs;
}

// 승인: 기록 해시가 내용과 맞고 기록의 캡처 해시가 승인 해시와 같을 때만 새 step을 돌려준다(순수 함수).
export function approveStep(step,record,{approvedSha}={}){
  if(!step||step.capture===false)refuse('캡처하지 않는 단계는 승인하지 않는다','approve_step');
  if(!record||typeof record!=='object'||!HEX64.test(String(record.recordHash)))refuse('캡처 기록이 없거나 해시 형식이 아니다','approve_record');
  if(!HEX64.test(String(approvedSha)))refuse('승인 해시 형식 오류','approve_sha');
  const {recordHash,...payload}=record;
  if(sha256Hex(canonicalJson(payload))!==recordHash)refuse('캡처 기록이 변조되었다(해시 불일치)','approve_tamper');
  if(recordShapeProblems(payload).length)refuse('캡처 기록 구조가 올바르지 않다','approve_shape');
  try{scanSensitive({steps:[{captureRecord:payload}]})}catch(e){refuse('캡처 기록에 민감 형식이 있다 — 승인하지 않는다','approve_sensitive');}
  if(payload.shotSha256!==approvedSha)refuse('승인 해시가 기록의 캡처 해시와 다르다','approve_sha_mismatch');
  if(payload.post!==true)refuse('사후 검사가 통과하지 않은 기록','approve_post');
  for(const rule of step.maskRequire||[])if(!(payload.masking&&payload.masking.perRule&&payload.masking.perRule[rule]>=1))refuse('가림 필수 규칙이 0건이다','mask_require_zero');
  for(const e of step.elements||[]){
    if(payload.finds[e.n]!==e.find)refuse(`요소 ${e.n}의 선택자가 캡처 당시와 다르다 — 재캡처가 필요하다`,'approve_find');
    if(!payload.boxes[e.n])refuse(`요소 ${e.n} box가 기록에 없다`,'approve_box');
  }
  for(const ex of step.extract||[]){
    if(ex.sensitivity==='restricted')refuse('restricted 추출은 캡처 단계에 둘 수 없다','extract_restricted');
    if(ex.where&&ex.where.selector===undefined)continue;
    const n=extractTarget(step,ex);
    if(n===null)refuse('추출 대상이 번호 요소에 연결되지 않았다','extract_unlinked');
    if(payload.elementsMasked[n]!==true)refuse('추출 대상 요소가 가려지지 않았다','extract_unmasked');
  }
  const out={...step,captureRecord:payload,shotHash:approvedSha,recordHash};
  delete out.view;
  for(const e of out.elements||[])if('box' in e){out.elements=out.elements.map(({box,...rest})=>rest);break;}
  return out;
}

// 기록 box를 현재 뷰포트 비율로 환산해 실제 rect와 IoU로 같은 요소를 가리키는지 판정한다(CSS px 기준).
// recorded: {x,y,w,h,vw,vh}, actual: {x,y,w,h,vw,vh}. 한계: 같은 위치일 뿐 요소 정체성을 증명하지 않는다.
export function boxMatches(recorded,actual,{tolerance=0.6}={}){
  const ok=b=>b&&['x','y','w','h','vw','vh'].every(k=>isNum(b[k]))&&b.w>0&&b.h>0&&b.vw>0&&b.vh>0;
  if(!ok(recorded)||!ok(actual))return {ok:false,iou:0};
  const sx=actual.vw/recorded.vw,sy=actual.vh/recorded.vh;
  const a={l:recorded.x*sx,t:recorded.y*sy,r:(recorded.x+recorded.w)*sx,b:(recorded.y+recorded.h)*sy};
  const b={l:actual.x,t:actual.y,r:actual.x+actual.w,b:actual.y+actual.h};
  const iw=Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l)),ih=Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
  const inter=iw*ih,union=(a.r-a.l)*(a.b-a.t)+(b.r-b.l)*(b.b-b.t)-inter;
  const iou=union>0?inter/union:0;
  return {ok:iou>=tolerance,iou};
}
