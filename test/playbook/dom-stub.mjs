// 오버레이 함수 테스트용 최소 DOM 스텁 (외부 의존성 없음). 지원: 태그·#id·.class·[attr]·[attr=값] 단순 선택자, 공백 자손 결합자, 쉼표 목록.
// 지원하지 않는 선택자는 throw한다(잘못된 선택자 사례로도 쓴다).
const parseSimple=s=>{
  const m=/^([a-zA-Z*][\w-]*)?((?:[#.:][\w-]+|\[[\w-]+(?:=[\w-]+)?\])*)$/.exec(s);
  if(!m||(!m[1]&&!m[2]))throw new SyntaxError('selector: '+s);
  const c={tag:m[1]&&m[1]!=='*'?m[1].toLowerCase():null,id:null,cls:[],attrs:[]};
  for(const p of m[2].match(/[#.:][\w-]+|\[[^\]]+\]/g)||[]){
    if(p[0]==='#')c.id=p.slice(1);else if(p[0]==='.')c.cls.push(p.slice(1));
    else if(p[0]===':'){if(p!==':popover-open')throw new SyntaxError('selector: '+s);c.attrs.push(['data-popover-open',undefined]);}   // 스텁: data-popover-open 속성이 있으면 :popover-open
    else{const [k,v]=p.slice(1,-1).split('=');c.attrs.push([k,v]);}
  }
  return c;
};
const matchSimple=(el,c)=>el.nodeType===1
  &&(!c.tag||el.tagName.toLowerCase()===c.tag)&&(!c.id||el.id===c.id)
  &&c.cls.every(x=>(el.getAttribute('class')||'').split(/\s+/).includes(x))
  &&c.attrs.every(([k,v])=>v===undefined?el.attrs[k]!==undefined:el.attrs[k]===v);
const parseSel=sel=>String(sel).split(',').map(p=>p.trim().split(/\s+/).map(parseSimple));
function matchesSel(el,sel){
  return parseSel(sel).some(chain=>{
    if(!matchSimple(el,chain.at(-1)))return false;
    let cur=el.parentElement;
    for(let i=chain.length-2;i>=0;i--){while(cur&&!matchSimple(cur,chain[i]))cur=cur.parentElement;if(!cur)return false;cur=cur.parentElement;}
    return true;
  });
}

export class Text{
  constructor(v,rect){this.nodeType=3;this.nodeValue=v;this.parentElement=null;this.rect=rect||{left:0,top:0,width:50,height:10};}
}
export class El{
  constructor(tag,{id='',attrs={},rect={left:0,top:0,width:100,height:20},value,text,shadow}={}){
    this.nodeType=1;this.tagName=tag.toUpperCase();this.id=id;this.attrs={...attrs};this.rect={...rect};this.children=[];this.parentElement=null;this.style={cssText:''};
    this.value=value;this.shadowRoot=shadow||null;this._doc=null;this.scrollX=0;this.scrollY=0;
    if(text!==undefined)this.appendChild(new Text(text,rect));
  }
  getAttribute(k){return k==='class'?(this.attrs.class??null):(this.attrs[k]??null);}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
  getBoundingClientRect(){const r=this.rect;return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.left+r.width,bottom:r.top+r.height};}
  get textContent(){return this.children.map(c=>c.nodeType===3?c.nodeValue:c.textContent).join('');}
  get innerText(){return this.textContent;}
  set textContent(v){this.children=[];this.appendChild(new Text(v));}
  matches(sel){return matchesSel(this,sel);}
  querySelectorAll(sel){const out=[];const walk=n=>{for(const c of n.children){if(c.nodeType!==1)continue;if(matchesSel(c,sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
}
// 문서: documentElement 아래 body. iframe 요소의 contentDocument로도 쓴다.
export class Doc{
  constructor(){
    this.nodeType=9;this.documentElement=new El('html');this.body=new El('body',{rect:{left:0,top:0,width:800,height:600}});
    this.documentElement.appendChild(this.body);this.children=[this.documentElement];
    this.defaultView={scrollX:0,scrollY:0,innerWidth:800,innerHeight:600};
  }
  createElement(t){return new El(t);}
  getElementById(id){return this.documentElement.querySelectorAll('#'+id)[0]||null;}
  querySelectorAll(sel){return this.documentElement.querySelectorAll(sel);}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  createRange(){let n=null;return {selectNodeContents(x){n=x;},getClientRects(){return [n.rect];}};}
  createTreeWalker(rootNode){
    const texts=[];const walk=x=>{for(const c of x.children){if(c.nodeType===3)texts.push(c);else walk(c);}};
    walk(rootNode===this?this.documentElement:rootNode);
    let i=0;return {nextNode:()=>texts[i++]||null};
  }
}
// iframe 추가: access=false면 contentDocument 접근 시 null
export function addIframe(parent,{id='',rect={left:10,top:10,width:200,height:100},access=true}={}){
  const f=new El('iframe',{id,rect});const d=new Doc();
  Object.defineProperty(f,'contentDocument',{get:()=>access?d:null});
  parent.appendChild(f);
  return {iframe:f,doc:d};
}
export class MutationObserverStub{
  constructor(cb){this.cb=cb;this.queue=[];MutationObserverStub.all.push(this);}
  observe(target){this.target=target;}
  disconnect(){this.off=true;}
  takeRecords(){const q=this.queue;this.queue=[];return q;}
}
MutationObserverStub.all=[];
// 테스트가 변경을 흉내 낸다 — 모든 활성 옵저버 큐에 쌓는다(사후 검사의 takeRecords가 가져간다)
export function emitMutation(rec,only=null){for(const m of MutationObserverStub.all)if(!m.off&&(!only||m.target===only))m.queue.push(rec);}
// 전역 설치 후 오버레이를 실행한다
export function withDom(doc,fn){
  const saved={};
  const set=(k,v)=>{saved[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});};
  MutationObserverStub.all=[];
  set('document',doc);set('NodeFilter',{SHOW_TEXT:4});set('MutationObserver',MutationObserverStub);
  try{return fn();}
  finally{
    for(const [k,d] of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
    delete globalThis.__flowcap;
  }
}
// 전역을 설치해 두고 여러 번 evalJs할 수 있게 한다(어댑터 테스트용). 반환: 해제 함수
export function installDom(doc){
  const saved={};
  const set=(k,v)=>{saved[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});};
  MutationObserverStub.all=[];
  set('document',doc);set('NodeFilter',{SHOW_TEXT:4});set('MutationObserver',MutationObserverStub);
  return ()=>{for(const [k,d] of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}delete globalThis.__flowcap;};
}
