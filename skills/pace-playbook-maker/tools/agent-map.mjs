// 에이전트 지도(agent/) 생성 — steps.json에서 agentView:true인 흐름만. 서비스 비의존.
// 지도 문자열은 전부 사람이 쓴 steps.json 값이다. 코어가 만드는 값은 box 숫자·불리언·해시뿐이고 화면 글자는 넣지 않는다.
// 보장 수준(사용자 결정): 탐지 가능한 민감 형식은 생성 거부 + 출처 제한 + 사람 확인 기록(contentHash). 형식 없는 값(이름·주소)의 완전 차단은 보장하지 않는다.
// 이 금지는 지도·명세·기록 파일에 실값이 '기록'되는 것만 막는다 — 주행 때 extract로 읽어 결과 저장 위치로 넘기는 수집은 막지 않는다.
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256Hex,canonicalJson,extractTarget,recordShapeProblems,contextHash} from './capture-core.mjs';
import {scanSensitive} from './sensitive.mjs';

export const AGENT_SCHEMA=1;
const HEX64=/^[0-9a-f]{64}$/;
const IDENT=/^[A-Za-z][\w-]{0,63}$/;
const PLACEHOLDER=/^(<[^<>]+>|\{[^{}]+\})$/;
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
export const sourceHashOf=text=>sha256Hex(Buffer.from(String(text).replace(/\r\n/g,'\n'),'utf8'));

// 민감 형식 탐지는 sensitive.mjs(코어도 같은 검사를 쓴다)
export {scanSensitive};

// ---- 형태 문법 · 접근 범위 판정 ----------------------------------------------------------------------
const FORMAT_TOKENS=new Set(['문자열','숫자','정수','금액','날짜','여부','선택값','목록','주민번호','계좌번호','카드번호','전화번호','이메일','YYYY-MM-DD','YYYYMMDD','YYYY-MM','HH:mm']);
export function formatOk(s){
  if(!nonEmpty(s)||/["'`]/.test(s))return false;
  const bare=s.replace(/<[^<>]*>/g,'자리표시');   // 꺾쇠 자리표시는 한 토큰으로 본다
  if(/\d{3,}/.test(bare.replace(/YYYY|MM|DD|HH|mm/g,'')))return false;
  return bare.split(/[\s,/|·+()]+/).filter(Boolean).every(tok=>FORMAT_TOKENS.has(tok)||tok==='자리표시');
}
const originRegex=entry=>new RegExp('^'+entry.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/<[^>]*>/g,'[a-z0-9-]+')+'$');
function normalizePath(raw){
  if(/\\|%2f|%5c|%00|\0/i.test(raw))return null;
  let p;try{p=decodeURIComponent(raw||'/');}catch{return null;}
  if(/\\|\0/.test(p))return null;
  const out=[];
  for(const seg of p.split('/').slice(1)){
    if(seg==='.'||seg==='')continue;
    if(seg==='..'){if(!out.length)return null;out.pop();continue;}
    out.push(seg);
  }
  return out;
}
// url이 접근 허용 범위 안인지. 반환: 문제 목록(값 없음). requestKeys: 단계 api.request의 query 키 집합
export function checkAccess(url,{allowedOrigins=[],allowedPaths=[],requestKeys=new Set()}={}){
  const m=/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(String(url));
  if(!m)return ['URL 형식이 아니다'];
  const probs=[];
  if(m[5]!==undefined)probs.push('fragment는 허용하지 않는다');
  if(m[2].includes('@'))probs.push('userinfo는 허용하지 않는다');
  const origin=`${m[1].toLowerCase()}://${m[2].toLowerCase()}`;
  if(!allowedOrigins.some(o=>nonEmpty(o)&&(o.includes('<')?originRegex(o).test(origin):o.toLowerCase()===origin)))probs.push('allowedOrigins 밖 origin이다');
  const segs=normalizePath(m[3]);
  if(segs===null)probs.push('경로 형식이 허용되지 않는다(역슬래시·인코딩된 구분자·상위 이동)');
  else if(!allowedPaths.some(p=>{const ps=p.split('/').slice(1).filter(x=>x!=='');return ps.length===segs.length&&ps.every((x,i)=>/^\{[^{}]+\}$/.test(x)?segs[i].length>0:x===segs[i]);}))probs.push('allowedPaths 밖 경로다');
  if(m[4]){
    for(const pair of m[4].slice(1).split('&').filter(Boolean)){
      const [k,...rest]=pair.split('=');const v=rest.join('=');
      if(!requestKeys.has(k))probs.push('선언되지 않은 query 키가 있다');
      if(!PLACEHOLDER.test(v))probs.push('query 값은 자리표시(<…>·{…})만 허용한다');
    }
  }
  return probs;
}

// ---- 해시 --------------------------------------------------------------------------------------------
// contentHash: 서술·합의 행의 문자열만(위치·행동·토큰·해시 필드와 valueReview 자신 제외)
export function contentEntries(d){
  const out=[];
  const add=(path,v)=>{if(typeof v==='string')out.push([path,v]);};
  add('title',d.title);add('purpose',d.purpose);add('resultTo',d.resultTo);
  (d.rules||[]).forEach((x,i)=>add(`rules[${i}]`,x));
  (d.onChangeProcedure||[]).forEach((x,i)=>add(`onChangeProcedure[${i}]`,x));
  for(const [k,v] of Object.entries(d.risks||{}))add(`risks.${k}.label`,v&&v.label);
  for(const [k,v] of Object.entries(d.lanes||{}))add(`lanes.${k}`,v);
  (d.changes||[]).forEach((c,i)=>{add(`changes[${i}].what`,c&&c.what);add(`changes[${i}].step`,c&&c.step);add(`changes[${i}].date`,c&&c.date);});
  (d.events||[]).forEach((e,i)=>{add(`events[${i}].when`,e&&e.when);add(`events[${i}].then`,e&&e.then);});
  (d.run||[]).forEach((e,i)=>{add(`run[${i}].label`,e&&e.label);add(`run[${i}].note`,e&&e.note);});
  (d.allowedOrigins||[]).forEach((x,i)=>add(`allowedOrigins[${i}]`,x));
  (d.allowedPaths||[]).forEach((x,i)=>add(`allowedPaths[${i}]`,x));
  (d.steps||[]).forEach((s,i)=>{
    const b=`steps[${i}]`;
    for(const k of ['title','purpose','enter','gate','success','escalate','risk','capturePage','toolNote','captureNote','maskRequireNote'])add(`${b}.${k}`,s[k]);
    add(`${b}.identify.title`,s.identify&&s.identify.title);
    ((s.identify&&s.identify.anchors)||[]).forEach((x,j)=>add(`${b}.identify.anchors[${j}]`,x));
    (s.elements||[]).forEach((e,j)=>{for(const k of ['label','action','wait','expect','onChange'])add(`${b}.elements[${j}].${k}`,e[k]);});
    (s.extract||[]).forEach((e,j)=>{for(const k of ['name','verify','sensitivity','deliverTo','format'])add(`${b}.extract[${j}].${k}`,e[k]);});
    ((s.api&&s.api.response)||[]).forEach((q,j)=>add(`${b}.api.response[${j}].type`,q&&q.type));   // 응답 형태는 읽은 값을 해석하는 계약이라 합의 필드
    ((s.api&&s.api.request)||[]).forEach((q,j)=>{
      add(`${b}.api.request[${j}].form`,q.form);
      if(q.role==='target'){add(`${b}.api.request[${j}].name`,q.name);add(`${b}.api.request[${j}].in`,q.in);add(`${b}.api.request[${j}].role`,q.role);}
    });
  });
  return out.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
}
export const contentHash=d=>sha256Hex(canonicalJson(contentEntries(d)));
// actionHash: 단계 자신의 tool·command, 그 단계를 covers로 덮는 run의 command·covers, API 행동(method·endpoint·param 요청·successStatus)
export function actionHash(d,s){
  const order=(d.steps||[]).map(x=>x.id),i=order.indexOf(s.id);
  const runs=(d.run||[]).filter(r=>r&&Array.isArray(r.covers)&&order.indexOf(r.covers[0])<=i&&i<=order.indexOf(r.covers[1])).map(r=>({command:r.command,covers:r.covers}));
  const api=s.api?{method:s.api.method,endpoint:s.api.endpoint,successStatus:s.api.successStatus,request:(s.api.request||[]).filter(q=>q.role!=='target').map(q=>({name:q.name,in:q.in}))}:null;
  return sha256Hex(canonicalJson({tool:s.tool??null,command:s.command??null,runs,api}));
}

// ---- 검사 + 산출물 계산 ------------------------------------------------------------------------------
// 중첩 객체의 허용 키 밖 필드는 지도에 넣지 않고 거부한다(투영이 통째 복사로 새지 않게)
const onlyKeys=(o,allowed,path,err)=>{
  if(!o||typeof o!=='object'||Array.isArray(o)){err(`${path}가 객체가 아니다`);return false;}
  for(const k of Object.keys(o))if(!allowed.includes(k)){err(`${path}.${k}는 허용 필드가 아니다`);return false;}
  return true;
};
const strArr=v=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ---- 출력 스키마: 지도 json의 모든 잎 경로와 타입은 여기 선언된 것뿐이다(s 문자열·n 숫자·b 불리언). 그 밖(객체가 문자열 자리에 든 경우 포함)은 거부한다 ----
const S='s',N='n',B='b';
const OUT_SPEC=[
  [/^agentSchema$/,N],[/^generated$/,S],[/^sourceHash$/,S],[/^actionHash$/,S],
  // index
  [/^index\.(title|purpose|resultTo|start)$/,S],[/^index\.(allowedOrigins|allowedPaths|rules|onChangeProcedure)\[\]$/,S],[/^index\.risks\.[^.]+$/,S],
  [/^index\.frames\.[^.]+\.selector$/,S],[/^index\.frames\.[^.]+\.optional$/,B],
  [/^index\.run\[\]\.(label|command|note)$/,S],[/^index\.run\[\]\.covers\[\]$/,S],[/^index\.events\[\]\.(when|then)$/,S],
  [/^index\.steps\[\]\.(id|title|risk|gate|html|json|actionHash)$/,S],[/^index\.steps\[\]\.shot\.(path|sha256)$/,S],
  // 단계
  [/^step\.(id|title|purpose|risk|gate|lane|enter|tool|toolNote|command|capturePage|success|escalate|next)$/,S],
  [/^index\.lanes\.[^.]+$/,S],[/^step\.identify\.title$/,S],[/^step\.identify\.anchors\[\]$/,S],
  [/^step\.screen\.url$/,S],[/^step\.screen\.(require|forbid)\[\]$/,S],[/^step\.screen\.dismiss\[\]\.(when|click)$/,S],
  [/^step\.elements\[\]\.n$/,N],[/^step\.elements\[\]\.(name|find|action|wait|expect|onChange)$/,S],
  [/^step\.elements\[\]\.box\.(x|y|w|h|vw|vh|dpr)$/,N],[/^step\.elements\[\]\.stale$/,B],
  [/^step\.extract\[\]\.(name|format|sensitivity|deliverTo|verify)$/,S],[/^step\.extract\[\]\.where\.(selector|apiPath)$/,S],
  [/^step\.api\.(method|endpoint|successStatus)$/,S],[/^step\.api\.request\[\]\.(name|in|role|form)$/,S],[/^step\.api\.response\[\]\.(path|type)$/,S],
  [/^step\.events\[\]\.(when|then)$/,S],
  [/^step\.locate\.(primary|secondary|onConflict)$/,S],[/^step\.locate\.report\[\]$/,S],
  [/^step\.shot\.(path|sha256)$/,S],[/^step\.view\.(vw|vh|dpr)$/,N]
];
export function validateOutput(obj,kind){
  const bad=[];
  const walk=(v,p)=>{
    if(v===undefined)return;
    if(v===null){return;}   // 값이 없음(next·box)은 경로만 본다
    if(Array.isArray(v)){v.forEach(x=>walk(x,p+'[]'));return;}
    if(typeof v==='object'){for(const [k,x] of Object.entries(v))walk(x,p?`${p}.${k}`:k);return;}
    const type=typeof v==='string'?S:typeof v==='number'?N:typeof v==='boolean'?B:'?';
    const full=`${kind}.${p}`;
    const spec=OUT_SPEC.find(([re])=>re.test(full)||re.test(p));
    if(!spec||spec[1]!==type)bad.push(p);
  };
  walk(obj,'');
  // null 자리도 선언된 경로여야 한다
  const nulls=[];const wn=(v,p)=>{if(v===null)nulls.push(p);else if(Array.isArray(v))v.forEach(x=>wn(x,p+'[]'));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))wn(x,p?`${p}.${k}`:k);};wn(obj,'');
  for(const p of nulls)if(!/^(next|elements\[\]\.box)$/.test(p))bad.push(p);
  if(bad.length)throw new Error('지도 출력 검사 실패 — 허용되지 않은 필드·타입: '+[...new Set(bad)].join(', '));
}
export const MANAGED=/^(index\.json|S\d+\.(json|html))$/;
const json=o=>JSON.stringify(o,null,2)+'\n';

export function computeAgent(d,here,sourceText){
  scanSensitive(d);   // 단독 호출에서도 민감 형식 검사를 건너뛰지 않는다(깊이 방어)
  const errs=[],err=m=>errs.push(m);
  const steps=d.steps||[];
  // 사람 확인 기록
  const vr=d.valueReview;
  if(!vr||typeof vr!=='object')err('valueReview가 필요하다(사람 확인 기록)');
  else{
    if(!nonEmpty(vr.date)||!nonEmpty(vr.reviewer))err('valueReview.date·reviewer가 비어 있다');
    if(!nonEmpty(vr.note))err('valueReview.note가 비어 있다');
    if(!HEX64.test(String(vr.contentHash)))err('valueReview.contentHash 형식 오류(--review-hash로 계산)');
    else if(vr.contentHash!==contentHash(d))err('검토 뒤 서술·합의 문자열이 바뀌었다 — 다시 확인하고 --review-hash 값을 valueReview.contentHash에 적는다');
  }
  // 접근 범위·결과 위치(합의 필드)
  const listOk=(v,name,pathLike)=>{
    if(!Array.isArray(v)||!v.length||v.some(x=>!nonEmpty(x)||(pathLike&&!x.startsWith('/'))))err(`${name}는 비어 있지 않은 문자열 배열이어야 한다`);
  };
  listOk(d.allowedOrigins,'allowedOrigins',false);listOk(d.allowedPaths,'allowedPaths',true);
  if(d.resultTo!==undefined&&!(typeof d.resultTo==='string'&&IDENT.test(d.resultTo)))err('resultTo 식별자 형식 오류');
  const order=steps.map(s=>s.id);
  const frames={};
  if(d.frames!==undefined){
    if(!d.frames||typeof d.frames!=='object'||Array.isArray(d.frames))err('frames가 객체가 아니다');
    else for(const [alias,def] of Object.entries(d.frames)){
      if(!IDENT.test(alias)){err('frames 별칭 형식 오류(영문 식별자만)');continue;}
      if(typeof def==='string'&&nonEmpty(def))frames[alias]={selector:def};
      else if(def&&typeof def==='object'&&onlyKeys(def,['selector','optional'],`frames.${alias}`,err)&&nonEmpty(def.selector))frames[alias]={selector:def.selector,optional:def.optional===true?true:undefined};
      else err(`frames.${alias} 형식 오류`);
    }
  }
  if(d.rules!==undefined&&!strArr(d.rules))err('rules는 문자열 배열이다');
  if(d.onChangeProcedure!==undefined&&!strArr(d.onChangeProcedure))err('onChangeProcedure는 문자열 배열이다');
  if(d.run)for(const r of d.run)if(r.command!==undefined&&!nonEmpty(r.command))err('run.command가 비어 있다');
  const plan=[],stepOut=[];
  steps.forEach((s,i)=>{
    const b=`steps[${i}]`,id=s.id;
    if(s.next!==undefined&&s.next!==(order[i+1]??null))err(`${b}.next가 배열 순서와 다르다`);
    if(s.view!==undefined)err(`${b}.view는 steps.json에 쓰지 않는다(좌표의 출처는 captureRecord)`);
    for(const [j,e] of (s.elements||[]).entries())if('box' in e)err(`${b}.elements[${j}].box는 steps.json에 쓰지 않는다(좌표의 출처는 captureRecord)`);
    if(s.screen!==undefined){
      if(onlyKeys(s.screen,['url','require','forbid','dismiss'],`${b}.screen`,err)){
        if(s.screen.dismiss!==undefined){
          if(!Array.isArray(s.screen.dismiss))err(`${b}.screen.dismiss는 {when,click} 배열이다`);
          else for(const [j,x] of s.screen.dismiss.entries())if(onlyKeys(x,['when','click'],`${b}.screen.dismiss[${j}]`,err)&&!(nonEmpty(x.when)&&nonEmpty(x.click)))err(`${b}.screen.dismiss[${j}]: when·click은 비어 있지 않은 선택자 문자열이다`);
        }
        if(s.screen.url!==undefined&&(typeof s.screen.url!=='string'||!/^\^.*\$$/.test(s.screen.url)))err(`${b}.screen.url은 ^…$로 고정해야 한다`);
        for(const k of ['require','forbid'])if(s.screen[k]!==undefined&&!strArr(s.screen[k]))err(`${b}.screen.${k}는 문자열 배열이다`);
      }
    }
    const isApi=s.api!==undefined;
    if(!isApi&&s.capture===false&&!(nonEmpty(s.tool)&&nonEmpty(s.success)&&(nonEmpty(s.screen&&s.screen.url)||((s.identify&&s.identify.anchors)||[]).some(nonEmpty))))err(`${b}: 캡처하지 않는 웹 단계도 tool·success와 화면 판정(screen.url 또는 identify.anchors)이 필요하다`);
    if(s.capture!==false&&!isApi&&!(s.screen&&nonEmpty(s.screen.url)&&Array.isArray(s.screen.require)&&s.screen.require.length&&Array.isArray(s.screen.forbid)))err(`${b}: 캡처 단계는 screen.url·require(1개 이상)·forbid가 필요하다`);
    if(!isApi&&s.capture===false&&/API 단계/.test(String(s.captureNote||'')))err(`${b}: API 단계는 api 필드로 쓴다(옛 표기만으로는 지도를 만들 수 없다)`);
    // 요소
    const nset=new Set();
    for(const [j,e] of (s.elements||[]).entries()){
      if(!nonEmpty(e.find)||!nonEmpty(e.action))err(`${b}.elements[${j}]: find·action이 필요하다(사람 없이 실행할 지도의 완결성)`);
      if(!Number.isInteger(e.n)||e.n<=0)err(`${b}.elements[${j}].n은 양의 정수여야 한다`);
      else if(nset.has(e.n))err(`${b}.elements[${j}].n이 중복이다`);
      nset.add(e.n);
    }
    // 캡처 증거
    const capture=s.capture!==false&&!isApi;
    let rec=null,shot=null;
    if(capture){
      const shotPath=join(here,'shots',id+'.jpg');
      if(!existsSync(shotPath))err(`${b}: 캡처 단계인데 shots/${id}.jpg가 없다`);
      else{
        const actual=sha256Hex(readFileSync(shotPath));
        if(!HEX64.test(String(s.shotHash)))err(`${b}.shotHash가 없다(승인 필요)`);
        else if(s.shotHash!==actual)err(`${b}.shotHash가 실제 캡처와 다르다(캡처 교체 — 재승인 필요)`);
        else shot={path:`shots/${id}.jpg`,sha256:actual};
      }
      rec=s.captureRecord;
      if(!rec||typeof rec!=='object')err(`${b}.captureRecord가 없다(승인 필요)`);
      else{
        if(!HEX64.test(String(s.recordHash)))err(`${b}.recordHash가 없다`);
        else if(sha256Hex(canonicalJson(rec))!==s.recordHash)err(`${b}.recordHash가 captureRecord와 다르다(수기 수정)`);
        if(rec.shotSha256!==s.shotHash)err(`${b}.captureRecord.shotSha256이 shotHash와 다르다`);
        for(const m of recordShapeProblems(rec))err(`${b}.captureRecord: ${m}`);
        for(const rule of s.maskRequire||[])if(!(rec.masking&&rec.masking.perRule&&rec.masking.perRule[rule]>=1))err(`${b}: 가림 필수 규칙이 캡처에서 0건이다`);
      }
    }else if(s.captureRecord!==undefined||s.shotHash!==undefined)err(`${b}: 캡처하지 않는 단계에 승인 기록이 있다`);
    // 추출
    (s.extract||[]).forEach((x,j)=>{
      const p=`${b}.extract[${j}]`;
      if(!onlyKeys(x,['name','where','format','sensitivity','deliverTo','verify'],p,err))return;
      if(!nonEmpty(x.name))err(`${p}.name이 비어 있다`);
      const w=x.where;
      if(w&&typeof w==='object'&&!('box' in w))onlyKeys(w,['selector','apiPath'],`${p}.where`,err);
      for(const k of ['selector','apiPath'])if(w&&w[k]!==undefined&&!nonEmpty(w[k]))err(`${p}.where.${k}가 비어 있다`);
      if(!w||typeof w!=='object'||('box' in w))err(`${p}.where는 selector 또는 apiPath 하나다(box는 지원하지 않는다)`);
      else if((w.selector===undefined)===(w.apiPath===undefined))err(`${p}.where는 selector·apiPath 중 하나만 쓴다`);
      if(!formatOk(x.format))err(`${p}.format은 형태 문법(형식 이름 토큰)만 허용한다`);
      if(!['public','masked','restricted'].includes(x.sensitivity))err(`${p}.sensitivity 값 오류`);
      if(x.deliverTo!==undefined&&!(typeof x.deliverTo==='string'&&IDENT.test(x.deliverTo)))err(`${p}.deliverTo 식별자 형식 오류`);
      if((x.sensitivity==='masked'||x.sensitivity==='restricted')&&x.deliverTo===undefined)err(`${p}: masked·restricted는 deliverTo가 필요하다`);
      if(x.verify!==undefined&&!nonEmpty(x.verify))err(`${p}.verify가 비어 있다`);
      if(w&&w.apiPath!==undefined&&!(isApi&&Array.isArray(s.api.response)&&s.api.response.some(r=>r.path===w.apiPath)))err(`${p}.where.apiPath가 api.response에 없다`);
      if(isApi&&w&&w.selector!==undefined)err(`${p}.where: API 단계는 apiPath만 쓴다`);
      if(!isApi&&!capture&&w&&w.selector!==undefined&&extractTarget(s,x)===null)err(`${p}.where.selector가 번호 요소의 find와 같지 않다`);
      if(capture&&w&&w.selector!==undefined){
        if(x.sensitivity==='restricted')err(`${p}: 캡처 단계에 restricted 추출은 둘 수 없다`);
        const n=extractTarget(s,x);
        if(n===null)err(`${p}.where.selector가 번호 요소의 find와 같지 않다`);
        else if(rec&&rec.finds&&rec.finds[n]===(s.elements.find(e=>e.n===n)||{}).find&&!(rec.elementsMasked&&rec.elementsMasked[n]===true))err(`${p}: 추출 대상 요소가 캡처에서 가려지지 않았다`);
      }
      if(capture&&w&&w.selector===undefined&&w.apiPath===undefined)err(`${p}.where 오류`);
    });
    if(capture&&(s.extract||[]).some(x=>x&&x.sensitivity==='restricted'))err(`${b}: 캡처 단계에 restricted 추출은 둘 수 없다`);
    // API 단계
    if(isApi){
      const a=s.api,p=`${b}.api`;
      onlyKeys(a,['method','endpoint','request','response','successStatus'],p,err);
      if(s.capture!==false)err(`${b}: API 단계는 capture:false여야 한다`);
      if(!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(a.method))err(`${p}.method 오류`);
      const reqs=Array.isArray(a.request)?a.request:[];
      if(a.request!==undefined&&!Array.isArray(a.request))err(`${p}.request는 배열이다`);
      const keys=new Set();
      reqs.forEach((q,j)=>{
        const rp=`${p}.request[${j}]`;
        onlyKeys(q,['name','in','role','form'],rp,err);
        if(!nonEmpty(q.name))err(`${rp}.name이 비어 있다`);
        if(!['query','body','header'].includes(q.in))err(`${rp}.in 값 오류`);
        if(q.role!==undefined&&!['param','target'].includes(q.role))err(`${rp}.role 값 오류`);
        if(!formatOk(q.form))err(`${rp}.form은 형태 문법만 허용한다`);
        if(q.in==='query')keys.add(q.name);
      });
      if(!nonEmpty(a.endpoint))err(`${p}.endpoint가 비어 있다`);
      else for(const m of checkAccess(a.endpoint,{allowedOrigins:d.allowedOrigins,allowedPaths:d.allowedPaths,requestKeys:keys}))err(`${p}.endpoint: ${m}`);
      if(a.successStatus!==undefined&&!/^[1-5]\d\d$/.test(String(a.successStatus)))err(`${p}.successStatus 형식 오류`);
      const resp=Array.isArray(a.response)?a.response:[];
      resp.forEach((r,j)=>{onlyKeys(r,['path','type'],`${p}.response[${j}]`,err);if(!nonEmpty(r.path)||!formatOk(r.type))err(`${p}.response[${j}] 오류(path·type)`);});
      if(a.successStatus===undefined&&!resp.length)err(`${p}: successStatus 또는 response가 필요하다`);
      if((s.extract||[]).length&&!resp.length)err(`${p}.response가 필요하다(읽을 값이 있다)`);
      if(!nonEmpty(s.success)||!nonEmpty(s.escalate))err(`${b}: API 단계는 success·escalate가 필요하다(성공·실패 구별)`);
    }
    // 출력
    const ctxNow=(dd,ss)=>contextHash(ss,dd.frames||{});
    const els=(s.elements||[]).map(e=>{
      const o={n:e.n,name:e.label,find:e.find};
      if(capture&&rec&&rec.boxes){
        const bx=rec.boxes[e.n];
        if(bx&&rec.finds&&rec.finds[e.n]===e.find&&rec.view&&rec.contextSha===ctxNow(d,s))o.box={x:bx.x,y:bx.y,w:bx.w,h:bx.h,vw:rec.view.vw,vh:rec.view.vh,dpr:rec.view.dpr};
        else{o.box=null;o.stale=true;}
      }
      Object.assign(o,{action:e.action,expect:e.expect,wait:e.wait,onChange:e.onChange});
      return o;
    });
    const events=(d.events||[]).filter(e=>(e.steps||[]).includes(id)).map(e=>({when:e.when,then:e.then}));
    const ah=actionHash(d,s);
    const out={agentSchema:AGENT_SCHEMA,generated:'생성 파일 — steps.json에서 만든다. 직접 고치지 않는다.',id,title:s.title,purpose:s.purpose,risk:s.risk,gate:s.gate,lane:s.lane,
      enter:s.enter,identify:s.identify?{title:s.identify.title,anchors:s.identify.anchors}:undefined,screen:s.screen?{url:s.screen.url,require:s.screen.require,forbid:s.screen.forbid,dismiss:s.screen.dismiss}:undefined,tool:s.tool,toolNote:s.toolNote,command:s.command,capturePage:s.capturePage,elements:els,
      extract:(s.extract||[]).map(x=>({name:x.name,where:{selector:x.where.selector,apiPath:x.where.apiPath},format:x.format,sensitivity:x.sensitivity,deliverTo:x.deliverTo,verify:x.verify})),
      api:isApi?{method:s.api.method,endpoint:s.api.endpoint,request:(s.api.request||[]).map(q=>({name:q.name,in:q.in,role:q.role||'param',form:q.form})),response:(s.api.response||[]).map(r=>({path:r.path,type:r.type})),successStatus:s.api.successStatus}:undefined,
      success:s.success,escalate:s.escalate,events,next:order[i+1]??null,
      locate:{primary:'find',secondary:'box',onConflict:'stop',report:['step','element','reason','sourceHash','shotSha256']},
      shot:shot||undefined,view:capture&&rec&&rec.view?{vw:rec.view.vw,vh:rec.view.vh,dpr:rec.view.dpr}:undefined,actionHash:ah};
    stepOut.push({id,out,s,capture,shot,els});
  });
  if(errs.length)throw new Error('에이전트 지도 검사 실패:\n'+errs.map(x=>'- '+x).join('\n'));
  const sourceHash=sourceHashOf(sourceText);
  const files=new Map();
  for(const {out} of stepOut)validateOutput(JSON.parse(JSON.stringify(out)),'step');
  const risks=Object.fromEntries(Object.entries(d.risks||{}).map(([k,v])=>[k,v&&v.label]));
  for(const {id,out,s,capture,shot,els} of stepOut){
    out.sourceHash=sourceHash;
    files.set(`${id}.json`,json(out));
    files.set(`${id}.html`,renderHtml(d,s,out,capture,shot,els));
  }
  const indexObj={agentSchema:AGENT_SCHEMA,generated:'생성 파일 — steps.json에서 만든다. 직접 고치지 않는다.',title:d.title,purpose:d.purpose,resultTo:d.resultTo,
    allowedOrigins:d.allowedOrigins,allowedPaths:d.allowedPaths,risks,frames:Object.keys(frames).length?frames:undefined,lanes:d.lanes&&Object.keys(d.lanes).length?d.lanes:undefined,rules:d.rules,onChangeProcedure:d.onChangeProcedure,start:steps[0]?.enter??null,
    run:(d.run||[]).map(r=>({label:r.label,command:r.command,covers:r.covers,note:r.note})),
    events:(d.events||[]).filter(e=>!(e.steps||[]).length).map(e=>({when:e.when,then:e.then})),
    steps:stepOut.map(({id,out,shot})=>({id,title:out.title,risk:out.risk,gate:out.gate,html:`${id}.html`,json:`${id}.json`,shot:shot||undefined,actionHash:out.actionHash})),
    sourceHash};
  validateOutput(JSON.parse(JSON.stringify(indexObj)),'index');
  files.set('index.json',json(indexObj));
  return files;
}

function renderHtml(d,s,out,capture,shot,els){
  const rows=els.map(e=>`<tr><td>${esc(e.n)}</td><td>${esc(e.name)}</td><td><code>${esc(e.find)}</code></td><td>${esc(e.action)}</td><td>${esc(e.wait)}</td><td>${esc(e.expect)}</td><td>${esc(e.onChange)}</td>${capture?`<td>${e.stale?'재캡처 필요':esc(e.box?'있음':'')}</td>`:''}</tr>`).join('');
  const boxes=capture?els.filter(e=>e.box).map(e=>`<div class="b" data-n="${esc(e.n)}" style="left:${(e.box.x/e.box.vw*100).toFixed(4)}%;top:${(e.box.y/e.box.vh*100).toFixed(4)}%;width:${(e.box.w/e.box.vw*100).toFixed(4)}%;height:${(e.box.h/e.box.vh*100).toFixed(4)}%"><i>${esc(e.n)}</i></div>`).join(''):'';
  const view=out.view;
  const img=capture&&shot&&view?`<div class="shot" style="aspect-ratio:${esc(view.vw)}/${esc(view.vh)}"><img src="../${esc(shot.path)}" alt="${esc(out.id)} 기준 화면">${boxes}</div>`:'';
  const ex=(out.extract||[]).map(x=>`<tr><td>${esc(x.name)}</td><td><code>${esc(JSON.stringify(x.where))}</code></td><td>${esc(x.format)}</td><td>${esc(x.sensitivity)}</td><td>${esc(x.deliverTo??d.resultTo??'')}</td><td>${esc(x.verify)}</td></tr>`).join('');
  const api=out.api?`<h2>API 명세(값 없음)</h2><table><thead><tr><th>method</th><th>endpoint</th><th>성공 상태</th></tr></thead><tbody><tr><td>${esc(out.api.method)}</td><td><code>${esc(out.api.endpoint)}</code></td><td>${esc(out.api.successStatus??'')}</td></tr></tbody></table>
<table><thead><tr><th>요청 이름</th><th>위치</th><th>역할</th><th>형태</th></tr></thead><tbody>${(out.api.request||[]).map(q=>`<tr><td>${esc(q.name)}</td><td>${esc(q.in)}</td><td>${esc(q.role)}</td><td>${esc(q.form)}</td></tr>`).join('')}</tbody></table>
<table><thead><tr><th>응답 경로</th><th>형태</th></tr></thead><tbody>${(out.api.response||[]).map(r=>`<tr><td><code>${esc(r.path)}</code></td><td>${esc(r.type)}</td></tr>`).join('')}</tbody></table>`:'';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(out.id)} ${esc(out.title)}</title>
<!-- 생성 파일 — steps.json에서 만든다. 직접 고치지 않는다. -->
<style>body{font:14px/1.5 system-ui,'Malgun Gothic',sans-serif;margin:16px;max-width:1100px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left;vertical-align:top}.shot{position:relative;max-width:900px;border:1px solid #cbd5e1}.shot img{display:block;width:100%;height:100%}.b{position:absolute;border:2px solid #dc2626;box-sizing:border-box}.b i{position:absolute;left:-2px;top:-2px;background:#dc2626;color:#fff;font:11px/16px Arial,sans-serif;min-width:16px;text-align:center;font-style:normal}code{font-size:12px}</style></head>
<body><h1>${esc(out.id)} ${esc(out.title)}</h1>
${out.purpose?`<p><b>목적</b>: ${esc(out.purpose)}</p>
`:''}<p>위험: ${esc(out.risk)}${out.gate?` · 관문: ${esc(out.gate)}`:''} · 다음: ${esc(out.next??'없음')}</p>
<p><b>진입 조건</b>: ${esc(out.enter)}</p>
${out.screen?`<p><b>화면 판정</b>: url <code>${esc(out.screen.url)}</code> · 있어야 함 ${(out.screen.require||[]).map(x=>`<code>${esc(x)}</code>`).join(' ')||'—'} · 보이면 안 됨 ${(out.screen.forbid||[]).map(x=>`<code>${esc(x)}</code>`).join(' ')||'—'}</p>`:''}
${out.identify?`<p><b>화면 식별</b>${out.identify.title?`: ${esc(out.identify.title)}`:''} ${(out.identify.anchors||[]).map(x=>`· ${esc(x)}`).join(' ')}</p>`:''}
${out.tool?`<p><b>도구</b>: <code>${esc(out.tool)}</code>${out.toolNote?` — ${esc(out.toolNote)}`:''}${out.command?` — <code>${esc(out.command)}</code>`:''}</p>`:''}
${out.capturePage?`<p><b>캡처 탭</b>: ${esc(out.capturePage)}</p>`:''}
${img}
<h2>요소(번호 = 캡처 박스)</h2><table><thead><tr><th>#</th><th>이름</th><th>찾기</th><th>동작</th><th>대기</th><th>기대</th><th>다르면</th>${capture?'<th>box</th>':''}</tr></thead><tbody>${rows||'<tr><td colspan="8">요소 없음</td></tr>'}</tbody></table>
<h2>추출</h2><table><thead><tr><th>이름</th><th>위치</th><th>형식</th><th>민감도</th><th>전달 위치</th><th>검증</th></tr></thead><tbody>${ex||'<tr><td colspan="6">없음</td></tr>'}</tbody></table>
${api}
<p><b>성공 판정</b>: ${esc(out.success)}</p><p><b>에스컬레이트</b>: ${esc(out.escalate)}</p>
${(out.events||[]).length?`<h2>이 단계의 비결정 이벤트</h2><ul>${out.events.map(e=>`<li>${esc(e.when)} → ${esc(e.then)}</li>`).join('')}</ul>`:''}
<p><b>위치 정책</b>: 1차 <code>${esc(out.locate.primary)}</code>, 보조 <code>${esc(out.locate.secondary)}</code>, 충돌 시 <code>${esc(out.locate.onConflict)}</code> — 보고 항목: ${out.locate.report.map(x=>`<code>${esc(x)}</code>`).join(' ')}</p>
</body></html>
`;
}
