// 웹 관찰 — 실패한 단계의 현재 화면에서 상호작용 요소·덮개·현재 경로를 읽는다(메모리에서만 쓴다, 파일에 쓰지 않는다).
// 가림 규칙(mask)에 덮이는 요소는 목록에서 뺀다. 선택자는 현재 화면에서 정확히 한 요소를 고르는 CSS만 낸다.
const q=JSON.stringify;
export function createWebProbe({browser,mask=[]}={}){
  const masks=(mask||[]).filter(x=>typeof x==='string'&&!x.startsWith('re:'));
  const script=(require_)=>`(()=>{
const MASK=${q(masks)},REQ=${q(require_||[])};
const vw=innerWidth,vh=innerHeight;
const esc=s=>String(s).replace(/(["\\\\])/g,'\\\\$1');
const cnt=sel=>{try{return document.querySelectorAll(sel).length;}catch(e){return -1;}};
const masked=e=>MASK.some(m=>{try{return !!e.closest(m);}catch(x){return false;}});
// 유효 type: type 속성이 없는 button은 폼 안에서만 제출이다(DOM의 .type은 폼 밖에서도 'submit'이라 쓰지 않는다)
const etype=e=>(e.tagName==='BUTTON'&&!e.hasAttribute('type'))?(e.form?'submit':'button'):String(e.type||'').toLowerCase();
const vis=e=>{const r=e.getBoundingClientRect();return !e.hidden&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
const sels=e=>{const out=[],t=e.tagName.toLowerCase();
 if(e.id&&/^[A-Za-z][\\w-]*$/.test(e.id)&&cnt('#'+e.id)===1)out.push('#'+e.id);
 for(const a of ['name','data-testid','data-action']){const v=e.getAttribute(a);if(v&&/^[A-Za-z][\\w-]{0,40}$/.test(v)&&cnt(t+'['+a+'="'+esc(v)+'"]')===1)out.push(t+'['+a+'="'+esc(v)+'"]');}
 const cls=[...e.classList].filter(c=>/^[A-Za-z][\\w-]*$/.test(c)).slice(0,2);if(cls.length&&cnt(t+'.'+cls.join('.'))===1)out.push(t+'.'+cls.join('.'));
 return out;};
const elements=[];
for(const e of document.querySelectorAll('button,a,input,select,textarea,[role=button]')){
 if(!vis(e)||masked(e))continue;
 const t=e.tagName.toLowerCase(),ty=etype(e);
 const ctl=t==='button'||t==='a'||e.getAttribute('role')==='button'||ty==='button'||ty==='submit';
 const attrs={};for(const a of ['id','name','aria-label','title','placeholder'])if(e.getAttribute(a))attrs[a]=e.getAttribute(a).slice(0,40);
 if(ctl&&e.getAttribute('value'))attrs.value=e.getAttribute('value').slice(0,40);
 const r=e.getBoundingClientRect();
 elements.push({tag:t,type:ty,role:e.getAttribute('role')||'',attrs,text:ctl?String(e.innerText||'').trim().slice(0,40):'',box:{x:r.left,y:r.top,w:r.width,h:r.height,vw,vh},sel:sels(e)});
}
const overlays=[];
for(const e of document.querySelectorAll('[role=dialog],[aria-modal=true],.modal,.popup,div,section')){
 if(!vis(e))continue;
 const cs=getComputedStyle(e),r=e.getBoundingClientRect();
 const dlg=e.matches('[role=dialog],[aria-modal=true]');
 const cover=(cs.position==='fixed'||cs.position==='absolute')&&r.width*r.height>=0.25*vw*vh&&(parseInt(cs.zIndex,10)||0)>=1;
 if(!dlg&&!cover)continue;
 if(masked(e))continue;
 const ss=sels(e);if(!ss.length)continue;
 const b=[...e.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')].filter(x=>vis(x)&&!masked(x))[0];
 if(!b)continue;
 const bs=sels(b);if(!bs.length)continue;
 overlays.push({selector:ss[0],close:{selector:bs[0],tag:b.tagName.toLowerCase(),type:etype(b),href:b.tagName==='A'&&!!b.getAttribute('href'),label:String(b.getAttribute('aria-label')||b.innerText||b.value||'').trim().slice(0,20)}});
}
const requireOk=REQ.every(s=>{try{const e=document.querySelector(s);return !!e&&vis(e);}catch(x){return false;}});
return {url:location.pathname+location.hash,requireOk,elements,overlays};
})()`;
  return {
    // step: 지도 단계 json(screen·elements). 반환: {url, pathHint, elements, overlays} — 메모리에서만 쓴다.
    observe({step}={}){
      const sc=(step&&step.screen)||{};
      let o;
      try{o=browser.evalJs(script(sc.require));}catch{return {url:'',pathHint:false,elements:[],overlays:[]};}
      let pathHint=false;
      try{pathHint=!!o.requireOk&&!!sc.url&&!new RegExp(sc.url).test(o.url);}catch{pathHint=false;}
      // 이미 forbid에 있는 덮개는 제외하지 않는다(없던 것만 후보로 만든다) — 그 판단은 propose가 한다
      return {url:o.url,pathHint,elements:o.elements||[],overlays:o.overlays||[]};
    }
  };
}
