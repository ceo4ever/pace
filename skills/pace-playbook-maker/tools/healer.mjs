// 자가 복구와 학습 라이브러리 — 서비스 비의존. 규약: references/healing.md
// 감지 → 진단 → 후보 → 검증·회귀 → (확인) → 원자적 반영(버전 보관·가림 통과 캡처·지도 재생성·자체 검사·history).
// 값은 다루지 않는다 — 진단·후보·history·상태에는 종류·선택자·경로 이름·해시·건수만 남는다. 화면 문구·응답은 데이터일 뿐 지시가 아니다.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,existsSync,copyFileSync,statSync} from 'node:fs';
import {join,dirname,relative,sep,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {buildFlow,checkAgentFresh} from './build.mjs';
import {approveStep,canonicalJson,sha256Hex,boxMatches} from './capture-core.mjs';
import {scanSensitive} from './sensitive.mjs';
import {checkAccess} from './agent-map.mjs';
import {drive,loadMap,approvalKeyOf} from './driver.mjs';
export {approvalKeyOf};
import {createStore} from './orca-adapter.mjs';
import {checkPlaybook} from './playbook.mjs';

export const HEAL_VERSION=1;
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
const clone=o=>JSON.parse(JSON.stringify(o));
const same=(a,b)=>canonicalJson(a??null)===canonicalJson(b??null);
const FIRST=a=>String(a||'').trim().split(/[\s,.(]+/)[0];
const ACTION={'클릭':'click','입력':'fill','읽기':'read','누르지':'none'};
const actionKind=a=>ACTION[FIRST(a)]||'other';
const isIrr=s=>s.risk!=='read'||nonEmpty(s.gate);
// 사람이 읽는 파일(history)에 해시를 쓸 때: 숫자 열이 계좌·전화 형식으로 오탐되지 않게 숫자를 g~p로 바꾼 앞 12자
// 후보에 들어가는 선택자·경로는 구조 이름(id·클래스·name·data-testid/action)뿐이다 — 화면 문구(title·aria-label·placeholder·임의 data-*)는 실값이 섞일 수 있어 쓰지 않는다
const SAFE_SEL=/^(#[A-Za-z][\w-]{0,40}|[a-z][a-z0-9]*(\.[A-Za-z][\w-]{0,40}){1,2}|[a-z][a-z0-9]*\[(name|data-testid|data-action)="[A-Za-z][\w-]{0,40}"\])$/;
// 경로는 소문자 구조 단어(≤24자)로 된 세그먼트뿐이다 — 대문자·숫자만의 세그먼트·한글 등(이름·번호가 섞일 수 있음)은 후보가 되지 못한다. 한계: 소문자로 쓴 이름은 막지 못한다.
const SAFE_PATH=/^(\/[a-z][a-z0-9_.-]{0,23}){1,6}\/?$/;
// 검증·승인 증거를 통과한 후보 객체(learn만 표시한다) — 정본 반영은 이 표시와 해시 재계산을 요구한다
const VERIFIED=new WeakSet();
const tag=h=>String(h).slice(0,12).replace(/[0-9]/g,d=>'ghijklmnop'[d]);

// ---- 허용 경로 ---------------------------------------------------------------------------------------
// 학습은 위치 필드만 고친다 — 관문·위험 등급·기대·가림 규칙·허용 범위·민감도·행동 문장은 사람의 합의 영역이다.
const ALLOWED=[
  /^steps\[\d+\]\.elements\[\d+\]\.find$/,
  /^steps\[\d+\]\.screen\.url$/,/^steps\[\d+\]\.screen\.(require|forbid|dismiss)$/,
  /^steps\[\d+\]\.extract\[\d+\]\.where\.(selector|apiPath)$/,
  /^steps\[\d+\]\.api\.endpoint$/,/^steps\[\d+\]\.api\.response\[\d+\]\.path$/
];
function parsePath(p){
  const out=[];
  for(const m of String(p).matchAll(/([A-Za-z_]\w*)|\[(\d+)\]/g))out.push(m[2]!==undefined?Number(m[2]):m[1]);
  return out;
}
const getAt=(o,path)=>{let v=o;for(const k of path){if(v===null||typeof v!=='object')return undefined;v=v[k];}return v;};
function setAt(o,path,val){let v=o;for(const k of path.slice(0,-1)){if(v[k]===undefined||v[k]===null)v[k]=typeof path[path.indexOf(k)+1]==='number'?[]:{};v=v[k];}v[path.at(-1)]=val;}
export function applyPatch(doc,patch){const d=clone(doc);for(const op of patch)setAt(d,parsePath(op.path),clone(op.to));return d;}
// steps.json의 `steps[i].…` 경로를 지도 단계 json(agent/S0n.json)에 덧씌운다 — 임시 지도(overlay)용
export function patchAgentStep(agentStep,patch,stepIdx){
  const s=clone(agentStep);
  for(const op of patch){const rest=op.path.replace(new RegExp(`^steps\\[${stepIdx}\\]\\.`),'');setAt(s,parsePath(rest),clone(op.to));}
  return s;
}

// 후보 패치 검사 — 문제 코드 배열(비어 있으면 통과)
export function checkPatch(patch,doc){
  const probs=[];
  if(!Array.isArray(patch))return ['patch-shape'];
  for(const op of patch){
    if(!op||typeof op.path!=='string'||!ALLOWED.some(re=>re.test(op.path))){probs.push('forbidden-path');continue;}
    const path=parsePath(op.path);
    if(!same(getAt(doc,path),op.from)){probs.push('from-mismatch');continue;}
    const to=op.to;
    if(/\.screen\.url$/.test(op.path)){if(typeof to!=='string'||!/^\^.*\$$/.test(to))probs.push('bad-value');}
    else if(/\.screen\.(require|forbid)$/.test(op.path)){if(!Array.isArray(to)||!to.every(nonEmpty))probs.push('bad-value');}
    else if(/\.screen\.dismiss$/.test(op.path)){if(!Array.isArray(to)||!to.every(x=>x&&typeof x==='object'&&nonEmpty(x.when)&&nonEmpty(x.click)&&Object.keys(x).length===2))probs.push('bad-value');}
    else if(/\.api\.endpoint$/.test(op.path)){
      const idx=path[1],s=doc.steps[idx],old=String(op.from||''),oldOrigin=/^[a-z]+:\/\/[^/?#]+/i.exec(old),newOrigin=/^[a-z]+:\/\/[^/?#]+/i.exec(String(to));
      const keys=new Set(((s.api&&s.api.request)||[]).filter(q=>q.in==='query').map(q=>q.name));
      if(!oldOrigin||!newOrigin||oldOrigin[0].toLowerCase()!==newOrigin[0].toLowerCase()||checkAccess(to,{allowedOrigins:doc.allowedOrigins,allowedPaths:doc.allowedPaths,requestKeys:keys}).length)probs.push('bad-value');
    }
    else if(!nonEmpty(to))probs.push('bad-value');
    try{scanSensitive({v:to});}catch{probs.push('sensitive-format');}
  }
  return probs;
}

// ---- 감지·진단 ----------------------------------------------------------------------------------------
// failure: {status, step, reason, report, observation}. 진단 결과는 종류·단계·요소 번호만(문구·값 없음).
export function detect(f){
  const o=f.observation||{},r=f.report||{};
  const base={stepId:f.step,element:Number.isInteger(r.element)?r.element:null};
  if(f.status==='step-failed'&&f.reason==='schema-mismatch')return {...base,kind:'api-field'};
  if(f.status==='step-failed'&&f.reason==='status-mismatch'){
    const c=o.httpStatus;
    if(c===401||c===403)return {...base,kind:'permission'};
    if(c===429||(Number.isInteger(c)&&c>=500))return {...base,kind:'transient'};
    return {...base,kind:'unknown'};
  }
  if(f.status==='conflict'){
    if(r.reason==='moved')return {...base,kind:'element-moved'};
    if(r.reason==='missing')return {...base,kind:'element-missing'};
  }
  if(f.status==='screen-mismatch'||f.status==='expect-failed'){
    if((o.overlays||[]).length)return {...base,kind:'popup'};
    if(f.status==='screen-mismatch'&&o.pathHint)return {...base,kind:'screen-path-changed'};
    if(f.status==='expect-failed')return {...base,kind:'transient'};
  }
  return {...base,kind:'unknown'};
}
export function diagnose(f){
  const d=detect(f),o=f.observation||{};
  return {...d,observed:{elements:(o.elements||[]).length,overlays:(o.overlays||[]).length,shape:(o.shape||[]).length}};
}

// ---- 후보 --------------------------------------------------------------------------------------------
const norm=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
const CLOSE=new Set(['닫기','close','×','x','✕','✖']);
function lev(a,b){const m=a.length,n=b.length;const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
const sim=(a,b)=>{const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1;};
function texts(c){const a=c.attrs||{};return [c.text,a['aria-label'],a.value,a.title,a.placeholder].filter(nonEmpty).map(norm);}
function scoreElement(old,c){
  let s=0;
  const roles={click:['button','a','input'],fill:['input','textarea','select']}[old.kind];
  if(!roles)s+=1;else if(roles.includes(c.tag))s+=3;else return 0;
  const lab=norm(old.label),ts=texts(c);
  if(lab&&ts.includes(lab))s+=4;else if(lab.length>=2&&ts.some(t=>t&&(t.includes(lab)||lab.includes(t))))s+=2;
  if(old.box&&c.box){const b=boxMatches(old.box,c.box,{tolerance:0});s+=4*b.iou;}
  return s;
}
export const summarize=c=>({id:c.id,kind:c.kind,stepId:c.stepId,candidateHash:c.candidateHash,irreversible:c.irreversible,needsApproval:c.needsApproval,patch:c.patch.map(p=>({path:p.path,from:p.from,to:p.to})),prepared:c.prepared?{recordHash:c.prepared.recordHash,shotSha256:c.prepared.shotSha256,boxHash:c.prepared.boxHash}:null});
function finalize(c){
  c.candidateHash=sha256Hex(canonicalJson({kind:c.kind,stepId:c.stepId,patch:c.patch,identity:c.identity,prepared:c.prepared?{recordHash:c.prepared.recordHash,shotSha256:c.prepared.shotSha256,boxHash:c.prepared.boxHash}:null}));
  c.id=`c-${tag(c.candidateHash)}`;
  return c;
}
const mk0=(kind,step,i,patch,identity,extra={})=>finalize({kind,stepId:step.id,patch,identity:{stepId:step.id,...identity},irreversible:isIrr(step),needsApproval:false,prepared:null,...extra});
// doc: steps.json 객체, agent: 지도 단계 json(box 출처), diagnosis, observation. 후보는 많아야 하나다.
export function propose({doc,agent,diagnosis,observation={},flow=''}){
  const i=doc.steps.findIndex(s=>s.id===diagnosis.stepId);
  if(i<0)return [];
  const mk=(kind,step,i,patch,identity,extra={})=>mk0(kind,step,i,patch,{...identity,flow},extra);
  const step=doc.steps[i],obs=observation||{};
  const elIdx=n=>step.elements?step.elements.findIndex(e=>e.n===n):-1;
  switch(diagnosis.kind){
    case 'element-missing':{
      const j=elIdx(diagnosis.element);if(j<0)return [];
      const old=step.elements[j],box=agent&&(agent.elements||[]).find(e=>e.n===old.n)?.box;
      const scored=(obs.elements||[]).map(c=>({c,s:scoreElement({kind:actionKind(old.action),label:old.label,box},c)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
      if(!scored.length||scored[0].s<5||(scored[1]&&scored[0].s-scored[1].s<2))return [];
      const sel=(scored[0].c.sel||[]).find(x=>nonEmpty(x)&&SAFE_SEL.test(x)&&x!==old.find);
      if(!sel)return [];
      const patch=[{path:`steps[${i}].elements[${j}].find`,from:old.find,to:sel}];
      (step.extract||[]).forEach((x,k)=>{if(x.where&&x.where.selector===old.find)patch.push({path:`steps[${i}].extract[${k}].where.selector`,from:old.find,to:sel});});
      return [mk('selector',step,i,patch,{element:old.n,role:actionKind(old.action),find:sel,action:actionKind(old.action)})];
    }
    case 'element-moved':{
      const j=elIdx(diagnosis.element);if(j<0)return [];
      const old=step.elements[j];
      return [mk('rebaseline',step,i,[],{element:old.n,role:actionKind(old.action),find:old.find,action:actionKind(old.action)})];
    }
    case 'screen-path-changed':{
      if(!nonEmpty(obs.url)||!obs.pathHint||!SAFE_PATH.test(String(obs.url)))return [];
      const to='^'+String(obs.url).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
      if(to===(step.screen&&step.screen.url))return [];
      // 새 경로의 단어가 모두 이 플레이북의 기존 경로 어휘(다른 단계의 screen.url·allowedPaths)에 있을 때만 자동 — 새 단어(이름·번호일 수 있음)가 있으면 사람이 보고 확인해야 지도에 들어간다
      const words=s=>String(s).replace(/\\./g,' ').match(/[a-z0-9_]+/g)||[];   // 숫자가 섞인 토큰(list-123 등)도 통째로 어휘와 대조한다
      const vocab=new Set([...doc.steps.flatMap(s=>words((s.screen&&s.screen.url)||'')),...(doc.allowedPaths||[]).flatMap(p=>words(String(p).replace(/\{[^}]*\}/g,' ')))]);
      const known=words(String(obs.url)).every(w=>vocab.has(w));
      return [mk('screen',step,i,[{path:`steps[${i}].screen.url`,from:step.screen&&step.screen.url,to}],{element:0,role:'screen',find:to,action:'navigate'},{needsApproval:!known})];
    }
    case 'popup':{
      const have=new Set([...(step.screen&&step.screen.forbid)||[]]);
      const ov=(obs.overlays||[]).filter(x=>x&&SAFE_SEL.test(String(x.selector))&&x.close&&SAFE_SEL.test(String(x.close.selector))&&!have.has(x.selector));
      if(ov.length!==1)return [];
      const o=ov[0],cl=o.close;
      const forbid=[...((step.screen&&step.screen.forbid)||[]),o.selector],dismiss=[...((step.screen&&step.screen.dismiss)||[]),{when:o.selector,click:cl.selector}];
      const auto=!isIrr(step)&&CLOSE.has(norm(cl.label))&&cl.type!=='submit'&&cl.href!==true&&cl.tag!=='a';
      return [mk('dismiss',step,i,[
        {path:`steps[${i}].screen.forbid`,from:(step.screen&&step.screen.forbid)||[],to:forbid},
        {path:`steps[${i}].screen.dismiss`,from:(step.screen&&step.screen.dismiss)??null,to:dismiss}
      ],{element:0,role:'overlay',find:cl.selector,action:'click'},{needsApproval:!auto})];
    }
    case 'api-field':{
      const decl=(step.api&&step.api.response)||[];const shape=obs.shape||[];
      const missing=decl.map((q,j)=>({q,j})).filter(x=>!shape.includes(x.q.path));
      if(!missing.length)return [];
      const taken=new Set(decl.map(q=>q.path)),patch=[];
      for(const {q,j} of missing){
        const parent=q.path.split('.').slice(0,-1).join('.');
        const cands=shape.filter(p=>!taken.has(p)&&p.split('.').slice(0,-1).join('.')===parent).map(p=>({p,s:sim(norm(q.path.split('.').at(-1)),norm(p.split('.').at(-1)))})).sort((a,b)=>b.s-a.s);
        if(!cands.length||cands[0].s<0.5||(cands[1]&&cands[0].s-cands[1].s<0.15))return [];
        patch.push({path:`steps[${i}].api.response[${j}].path`,from:q.path,to:cands[0].p});
        (step.extract||[]).forEach((x,k)=>{if(x.where&&x.where.apiPath===q.path)patch.push({path:`steps[${i}].extract[${k}].where.apiPath`,from:q.path,to:cands[0].p});});
        taken.add(cands[0].p);
      }
      return [mk('api-path',step,i,patch,{element:0,role:'api',find:patch.map(p=>p.to).join(','),action:'read'})];
    }
    case 'transient':
      return isIrr(step)?[]:[mk('retry',step,i,[],{element:0,role:'step',find:'',action:'retry'})];
    default:return [];
  }
}

// ---- 승인 --------------------------------------------------------------------------------------------
// 확인의 유효 범위: 후보 해시 + 단계·요소 식별·액션 종류 + 대상 계정·업무. 승인 키는 반영 결과 단계의 식별에서 만든다.
export function recordLearnApproval({store,approval}){
  const a=approval||{};
  if(!nonEmpty(a.stepId)||!/^[0-9a-f]{64}$/.test(String(a.candidateHash))||a.by!=='user'||!nonEmpty(a.account)||!nonEmpty(a.task))throw new Error('학습 승인 기록 형식 오류(stepId·candidateHash·account·task·by:user)');
  const list=store.exists('learn-approvals.json')?store.readJson('learn-approvals.json'):[];
  list.push({stepId:a.stepId,candidateHash:a.candidateHash,account:a.account,task:a.task,by:'user',date:a.date});
  store.writeJson('learn-approvals.json',list,{scanAs:list.map(x=>({stepId:x.stepId,account:x.account,task:x.task,by:x.by,date:x.date}))});
  return list.length;
}
const findApproval=(c,approvals,{account,task})=>(approvals||[]).find(a=>a&&a.by==='user'&&a.stepId===c.stepId&&a.candidateHash===c.candidateHash&&a.account===account&&a.task===task);
// 반영 뒤 주행 승인(T04 once/standing) 이어 붙이기: 식별·행동·계정·업무가 그대로인 단계의 승인은 새 해시로 옮기고, 바뀐 단계는 버린다.
// 승인에는 단계 식별·계정·업무·흐름의 키(key)가 있어야 한다 — 키가 없는 옛 승인은 이어 붙이지 않고, 키가 달라지면(계정·업무·흐름·식별 변경) 버린다.
export function migrateApprovals({approvals,oldSteps,newSteps,account='',task='',flow='',granted=null}){
  const out=[],ctx={account,task,flow};
  for(const a of approvals||[]){
    const o=oldSteps.find(s=>s.id===a.stepId),n=newSteps.find(s=>s.id===a.stepId);
    if(!o||!n||a.actionHash!==o.actionHash||a.sourceHash!==o.sourceHash)continue;
    const ko=approvalKeyOf(o,ctx),kn=approvalKeyOf(n,ctx);
    if(a.key===undefined||a.key!==ko)continue;   // 키가 없거나 승인 당시의 계정·업무·흐름·식별과 다르면 이어 붙이지 않는다
    if(ko!==kn)continue;
    out.push({...a,key:kn,actionHash:n.actionHash,sourceHash:n.sourceHash});
  }
  if(granted){const n=newSteps.find(s=>s.id===granted.stepId);if(n)out.push({id:`learn-${tag(granted.candidateHash)}`,stepId:n.id,actionHash:n.actionHash,sourceHash:n.sourceHash,scope:'standing',by:'user',date:granted.date,key:approvalKeyOf(n,ctx)});}
  return out;
}

// ---- 후보 준비(새 기준 캡처) ---------------------------------------------------------------------------
// 캡처 단계의 후보는 승인 전에 새 기준 기록을 먼저 준비해 후보 해시에 묶는다. 가림 검사를 통과하지 못하면 후보는 만들어지지 않는다.
export async function prepare(c,{doc,recapture}){
  const i=doc.steps.findIndex(s=>s.id===c.stepId),step=doc.steps[i];
  const captured=step.capture!==false&&!step.api;
  if(!captured||c.kind==='retry'||c.kind==='api-path')return {ok:true,c};
  if(typeof recapture!=='function')return c.kind==='dismiss'?{ok:true,c}:{ok:false,reason:'no-recapture'};
  const patched=applyPatch(doc,c.patch).steps[i];
  let out;
  try{out=await recapture(patched);}catch{return {ok:false,reason:'capture-refused'};}
  if(!out||!out.record||!Buffer.isBuffer(out.bytes))return {ok:false,reason:'capture-refused'};
  c.prepared={record:out.record,bytes:out.bytes,recordHash:out.record.recordHash,shotSha256:out.record.shotSha256,boxHash:sha256Hex(canonicalJson(out.record.boxes||{}))};
  return {ok:true,c:finalize(c)};
}

// ---- 파일 스냅샷·저널(원자성) -------------------------------------------------------------------------
const walk=d=>existsSync(d)?readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]):[];
const snapshot=(dir)=>new Map(walk(dir).map(f=>[f,readFileSync(f)]));
function restore(dir,snap){
  for(const f of walk(dir))if(!snap.has(f))rmSync(f,{force:true});
  for(const [f,buf] of snap){mkdirSync(dirname(f),{recursive:true});writeFileSync(f,buf);}
  // 빈 폴더 정리
  const prune=d=>{if(!existsSync(d))return;for(const e of readdirSync(d,{withFileTypes:true}))if(e.isDirectory())prune(join(d,e.name));if(d!==dir&&!readdirSync(d).length)rmSync(d,{recursive:true,force:true});};
  prune(dir);
}
// 저널: 바꾸기 전에 변경 전 상태를 저장소 밖에 둔다 — 복원 쓰기가 실패하거나 프로세스가 끊겨도 다음 호출이 이어서 되돌린다.
const jdir=flowDir=>join(tmpdir(),'pace-heal-journal-'+sha256Hex(resolve(flowDir)).slice(0,16));
function journalWrite(flowDir,hp,snap,histBefore,extras=new Map()){
  const j=jdir(flowDir);rmSync(j,{recursive:true,force:true});mkdirSync(join(j,'files'),{recursive:true});
  const files=[];
  for(const [f,buf] of snap){const rel=relative(flowDir,f);files.push(rel);mkdirSync(dirname(join(j,'files',rel)),{recursive:true});writeFileSync(join(j,'files',rel),buf);}
  if(histBefore!==null)writeFileSync(join(j,'hist.bin'),histBefore);
  const ex=[];let k=0;
  for(const [path,buf] of extras){const name=`x${k++}.bin`;if(buf!==null)writeFileSync(join(j,name),buf);ex.push({path,name:buf!==null?name:null});}
  writeFileSync(join(j,'manifest.json'),JSON.stringify({files,hp,hasHist:histBefore!==null,extras:ex}));   // 마지막에 쓴다 — 있으면 저널이 온전하다
}
const journalClear=flowDir=>rmSync(jdir(flowDir),{recursive:true,force:true});
// 이전 호출이 도중에 끊겨 저널이 남아 있으면 변경 전 상태로 되돌린다(성공하면 true)
export function recoverJournal(flowDir){
  flowDir=resolve(flowDir);const j=jdir(flowDir);
  if(!existsSync(join(j,'manifest.json')))return false;
  const m=JSON.parse(readFileSync(join(j,'manifest.json'),'utf8'));
  const snap=new Map(m.files.map(rel=>[join(flowDir,rel),readFileSync(join(j,'files',rel))]));
  restore(flowDir,snap);
  if(m.hasHist)writeFileSync(m.hp,readFileSync(join(j,'hist.bin')));else rmSync(m.hp,{force:true});
  for(const x of m.extras||[]){if(x.name)writeFileSync(x.path,readFileSync(join(j,x.name)));else rmSync(x.path,{force:true});}   // 실행 기록·치유 상태도 변경 전으로
  journalClear(flowDir);return true;
}
const histPath=(flowDir,playbookDir)=>playbookDir?join(playbookDir,'references','history.md'):join(flowDir,'..','..','history.md');
const nextVersion=flowDir=>{const d=join(flowDir,'versions');return (existsSync(d)?readdirSync(d).map(x=>/^v(\d+)$/.exec(x)).filter(Boolean).map(m=>Number(m[1])):[]).reduce((a,b)=>Math.max(a,b),0)+1;};
const today=now=>new Date(now()).toISOString().slice(0,10);
function appendHistory(path,block){
  scanSensitive({file:block});
  let t=existsSync(path)?readFileSync(path,'utf8'):'# 학습 이력\n';
  t=t.replace('아직 학습한 변경이 없다.','학습한 변경은 아래에 쌓인다(최신이 아래).');
  writeFileSync(path,t.replace(/\n*$/,'\n')+'\n'+block);
}
const summaryLine=c=>c.patch.length?c.patch.map(p=>`${p.path.replace(/^steps\[\d+\]\./,'')}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`).join(' · '):'패치 없음(새 기준 캡처만)';
// 한 번의 변경 트랜잭션: 저널을 먼저 쓰고, run()이 던지면 변경 전으로 복원하며 복원이 실패하면 저널이 남아 다음 호출이 복구한다.
async function transaction({flowDir,playbookDir,run,extraFiles=[]}){
  const hp=histPath(flowDir,playbookDir);
  recoverJournal(flowDir);
  const snap=snapshot(flowDir),histBefore=existsSync(hp)?readFileSync(hp):null;
  const extras=new Map(extraFiles.filter(Boolean).map(p=>[resolve(p),existsSync(p)?readFileSync(p):null]));   // 실행 기록·치유 상태 — 같은 트랜잭션에 묶는다
  journalWrite(flowDir,hp,snap,histBefore,extras);
  try{
    const r=await run(hp);
    journalClear(flowDir);return r;
  }catch(e){
    if(e&&e.simulateCrash)throw e;   // 시험용: 프로세스가 끊긴 것처럼 복원 없이 멈춘다(저널은 남는다)
    try{restore(flowDir,snap);if(histBefore===null)rmSync(hp,{force:true});else writeFileSync(hp,histBefore);for(const [p,buf] of extras){if(buf!==null)writeFileSync(p,buf);else rmSync(p,{force:true});}journalClear(flowDir);}catch{/* 복원 실패 — 저널이 남아 다음 호출이 복구한다 */}
    throw e;
  }
}

// ---- 반영(원자적, 모듈 안에서만) ----------------------------------------------------------------------
// learn이 승인·검증·회귀를 확인해 표시한 후보 객체만 받는다. 후보 해시를 다시 계산해 내용이 바뀌지 않았음을 확인한다.
// commit({stepId,candidateHash,version})은 반영 트랜잭션 안에서 불리고(실행 기록 이관 등) undo 함수를 돌려준다 — 뒤 단계가 실패하면 되돌린다.
async function applyCandidate({flowDir,playbookDir,candidate:c,approvedBy=null,account='',task='',onStage=()=>{},now=()=>Date.now(),commit,journalFiles=[]}){
  flowDir=resolve(flowDir);
  if(!VERIFIED.has(c))return {status:'rejected',reason:'unverified'};
  if(finalize({...c}).candidateHash!==c.candidateHash)return {status:'rejected',reason:'hash-mismatch'};
  const doc=JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8'));
  const i=doc.steps.findIndex(s=>s.id===c.stepId);
  const probs=checkPatch(c.patch,doc);
  if(probs.length)return {status:'rejected',reason:probs[0]};
  let stage='start',undoCommit=null;
  try{
    return await transaction({flowDir,playbookDir,extraFiles:journalFiles,run:async(hp)=>{
      const store=createStore(flowDir);
      const n=nextVersion(flowDir);
      stage='version';onStage(stage);
      mkdirSync(join(flowDir,'versions',`v${n}`),{recursive:true});
      copyFileSync(join(flowDir,'steps.json'),join(flowDir,'versions',`v${n}`,'steps.json'));
      for(const f of walk(join(flowDir,'shots'))){mkdirSync(join(flowDir,'versions',`v${n}`,'shots'),{recursive:true});copyFileSync(f,join(flowDir,'versions',`v${n}`,'shots',f.split(sep).at(-1)));}
      stage='patch';onStage(stage);
      const nd=applyPatch(doc,c.patch);
      stage='capture';onStage(stage);
      if(c.prepared){
        const ap=approveStep(nd.steps[i],c.prepared.record,{approvedSha:c.prepared.shotSha256});   // 가림·maskRequire·추출 대상 가림 검사
        nd.steps[i]=ap;
        store.writeBytes(`shots/${c.stepId}.jpg`,c.prepared.bytes);
      }
      stage='write';onStage(stage);
      store.writeJson('steps.json',nd);
      stage='build';onStage(stage);
      buildFlow(flowDir);
      stage='check';onStage(stage);
      const fresh=checkAgentFresh(flowDir);
      if(!fresh.applicable||!fresh.ok)throw new Error('fresh');
      if(playbookDir){const r=checkPlaybook(playbookDir);if(!r.ok)throw new Error('playbook');}
      stage='commit';onStage(stage);
      if(commit)undoCommit=(await commit({stepId:c.stepId,candidateHash:c.candidateHash,version:n}))||null;
      stage='history';onStage(stage);
      const agent=loadMap(flowDir),key=agent.ok?approvalKeyOf(agent.steps.find(s=>s.id===c.stepId),{account,task,flow:basename(flowDir)}):null;
      appendHistory(hp,[`## v${n} · ${today(now)} · ${c.stepId} · ${c.kind}`,`- 후보: ${tag(c.candidateHash)}`,`- 요약: ${summaryLine(c)}`,
        `- 승인: ${approvedBy?'사용자 확인(후보 해시 일치)':'자동(검증·회귀 통과)'}`,...(approvedBy&&key?[`- 승인 키: ${tag(key)}`]:[]),
        ...(c.prepared?['- 기준 캡처 사람 확인: 대기']:[]),'- 상태: verified',''].join('\n'));
      return {status:'applied',version:n,kind:c.kind,stepId:c.stepId,candidateHash:c.candidateHash,approvalKey:key};
    }});
  }catch(e){
    if(e&&e.simulateCrash)throw e;
    if(undoCommit){try{undoCommit();}catch{/* 되돌리기 실패는 원래 오류보다 앞서지 않는다 */}}
    return {status:'failed',stage,reason:e&&e.code==='approve_find'?'capture-refused':(e&&e.name==='CaptureRefused'?'capture-refused':'stage-failed')};
  }
}

// 되돌리기: versions/v{n}은 n번째 반영 직전의 상태다 — 그 상태로 steps.json·캡처를 복원하고 지도를 다시 만든다.
// state(실행 기록 보호 저장소)가 필요하다 — 복원한 지도에 맞춰 수행 사실(done·in-progress·unknown)의 해시를 옮겨, 되돌린 뒤 이미 끝난 단계가 다시 수행되지 않게 한다.
export async function rollback({flowDir,playbookDir,version,state,healStore,onStage=()=>{},now=()=>Date.now()}){
  if(!state||!state.readJson)throw new Error('state(보호 저장소)가 필요하다 — 되돌려도 수행 사실을 지켜야 한다');
  flowDir=resolve(flowDir);
  const vdir=join(flowDir,'versions',`v${version}`);
  if(!existsSync(join(vdir,'steps.json')))return {status:'rejected',reason:'no-version'};
  let stage='start';
  try{
    const oldSteps=loadMap(flowDir).ok?loadMap(flowDir).steps:[];
    return await transaction({flowDir,playbookDir,extraFiles:[state.path('drive-state.json'),healStore&&healStore.path('heal-state.json')],run:async(hp)=>{
      stage='restore';onStage(stage);
      copyFileSync(join(vdir,'steps.json'),join(flowDir,'steps.json'));
      rmSync(join(flowDir,'shots'),{recursive:true,force:true});
      for(const f of walk(join(vdir,'shots'))){mkdirSync(join(flowDir,'shots'),{recursive:true});copyFileSync(f,join(flowDir,'shots',f.split(sep).at(-1)));}
      stage='build';onStage(stage);
      buildFlow(flowDir);
      stage='check';onStage(stage);
      const fresh=checkAgentFresh(flowDir);
      if(!fresh.applicable||!fresh.ok)throw new Error('fresh');
      if(playbookDir){const r=checkPlaybook(playbookDir);if(!r.ok)throw new Error('playbook');}
      stage='commit';onStage(stage);
      const newSteps=loadMap(flowDir).steps;
      rebindState(state,oldSteps,newSteps,{force:newSteps.map(s=>s.id)});
      stage='history';onStage(stage);
      appendHistory(hp,`## 되돌림 · ${today(now)} · v${version} 이전 상태로\n- 상태: rolled-back\n`);
      return {status:'rolled-back',version};
    }});
  }catch(e){
    if(e&&e.simulateCrash)throw e;
    return {status:'failed',stage,reason:'stage-failed'};
  }
}

// 사람 확인이 대기 중인 새 기준 캡처 목록(값 없음)
export function pendingHumanChecks({historyPath}){
  if(!existsSync(historyPath))return [];
  const out=[];
  for(const block of readFileSync(historyPath,'utf8').split(/^## /m).slice(1)){
    const h=/^v(\d+) · (\d{4}-\d{2}-\d{2}) · ([^ ]+) · /.exec(block);
    if(h&&/- 기준 캡처 사람 확인: 대기/.test(block))out.push({version:Number(h[1]),step:h[3],date:h[2]});
  }
  return out;
}

// ---- 학습(한 번의 치유 시도) ---------------------------------------------------------------------------
function healState(store){
  const mem={runs:{}};
  return {
    load(){return store&&store.exists('heal-state.json')?store.readJson('heal-state.json'):mem;},
    save(d){if(store)store.writeJson('heal-state.json',d);else Object.assign(mem,d);}
  };
}
export async function learn(ctx){
  const {flowDir,playbookDir,runId,failure,verifyStep,regress,recapture,learnApprovals=[],account='',task='',maxAttempts=3,healStore,onStage,commit,journalFiles,now=()=>Date.now()}=ctx;
  recoverJournal(flowDir);   // 이전 호출이 반영 도중 끊겼으면 먼저 되돌린다
  const flow=basename(resolve(flowDir));
  const hs=healState(healStore),st=hs.load();
  const run=(st.runs[runId]??={attempts:{}});
  const dg=diagnose(failure);
  if((run.attempts[dg.stepId]||0)>=maxAttempts)return {status:'give-up',diagnosis:dg};
  run.attempts[dg.stepId]=(run.attempts[dg.stepId]||0)+1;hs.save(st);
  const doc=JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8'));
  const map=loadMap(flowDir);
  if(!map.ok)return {status:'rejected',reason:'stale-map',diagnosis:dg};
  const i=doc.steps.findIndex(s=>s.id===dg.stepId);
  const agent=map.steps.find(s=>s.id===dg.stepId);
  // 새 메뉴 단계가 필요하거나 기대 결과 자체가 바뀐 변경은 학습 대상이 아니라 사용자 확인 대상이다 — 지도는 바뀌지 않는다
  if(failure.observation&&(failure.observation.needsStep===true||failure.observation.expectChanged===true))return {status:'needs-user',diagnosis:dg};
  let [c]=propose({doc,agent,diagnosis:dg,observation:failure.observation,flow});
  if(!c)return {status:dg.kind==='permission'?'permission':'unresolved',diagnosis:dg};
  if(c.kind==='retry')return {status:'retry',diagnosis:dg};
  const probs=checkPatch(c.patch,doc);
  if(probs.length)return {status:'rejected',reason:probs[0],diagnosis:dg};
  const pr=await prepare(c,{doc,recapture});
  if(!pr.ok)return {status:'rejected',reason:pr.reason,diagnosis:dg};
  c=pr.c;
  const needs=c.irreversible||c.needsApproval;
  const ap=needs?findApproval(c,learnApprovals,{account,task}):null;
  if(needs&&!ap)return {status:'needs-approval',candidate:summarize(c),diagnosis:dg};
  const patchedDoc=applyPatch(doc,c.patch);
  if(!c.irreversible){
    // 검증은 실행기가 읽는 지도 단계 형태(name·find·screen·extract)로, 기록 box는 갱신 대상이라 빼고 수행한다.
    // 성공(ok)만으로는 부족하다 — 검증이 선언된 expect·success를 실제로 평가했음(expectChecked)을 알려야 한다.
    const vs=patchAgentStepFor(agent,c,i);for(const e of vs.elements||[]){delete e.box;delete e.stale;}
    let v=null;try{v=await verifyStep(vs,c);}catch{v=null;}
    if(!v||v.ok!==true||v.expectChecked!==true)return {status:'rejected',reason:'verify-failed',diagnosis:dg};   // 검증 수행의 값은 버린다
  }
  let cases=[];try{cases=await regress(patchedDoc,c);}catch{cases=[];}
  if(!Array.isArray(cases)||!cases.length)return {status:'rejected',reason:'no-regression-case',diagnosis:dg};
  if(!cases.some(x=>x&&Array.isArray(x.covers)&&x.covers.includes(c.stepId)))return {status:'rejected',reason:'no-covering-case',diagnosis:dg};
  if(cases.some(x=>!x||x.ok!==true))return {status:'rejected',reason:'regression-failed',diagnosis:dg};
  VERIFIED.add(c);   // 승인·검증·회귀를 통과한 후보 — 정본 반영은 이 표시를 요구한다
  if(c.irreversible){
    // 승인된 비가역 후보는 정본에 쓰지 않고 이 실행에만 덧씌운다 — 이어 가는 drive의 첫 수행이 검증이다
    run.staged={stepId:c.stepId,candidateHash:c.candidateHash,kind:c.kind,patch:c.patch,account,task,flow};hs.save(st);
    return {status:'staged',overlay:{[c.stepId]:patchAgentStepFor(agent,c,i)},candidate:summarize(c),candidateObj:c,diagnosis:dg};
  }
  const r=await applyCandidate({flowDir,playbookDir,candidate:c,approvedBy:ap?'user':null,account,task,onStage,now,commit,journalFiles});
  return {...r,diagnosis:dg};
}
const patchAgentStepFor=(agent,c,i)=>patchAgentStep(agent,c.patch,i);

// 승격: overlay로 이어 간 drive가 그 단계를 성공(done)으로 끝낸 뒤에만 정본에 반영한다.
// 후보 객체는 learn이 표시한 것이어야 하고 내용 해시가 그대로여야 한다 — 재시작 뒤에는 후보를 다시 준비할 수 없어 확인을 다시 받는다.
export async function promoteStaged(ctx){
  const {flowDir,runId,healStore,state,candidate,account='',task='',commit}=ctx;
  const hs=healState(healStore),st=hs.load(),run=st.runs[runId],sg=run&&run.staged;
  if(!sg)return {status:'rejected',reason:'no-staged'};
  let rec=null;try{rec=state.readJson('drive-state.json').runs[runId].steps[sg.stepId];}catch{rec=null;}
  if(!rec||rec.status!=='done')return {status:'rejected',reason:'not-verified'};   // 실제 수행이 끝난 단계만
  if(!candidate||candidate.candidateHash!==sg.candidateHash||!VERIFIED.has(candidate))return {status:'needs-approval',reason:'staged-lost'};
  const r=await applyCandidate({...ctx,flowDir,candidate,approvedBy:'user',account,task,commit,journalFiles:ctx.journalFiles});
  if(r.status==='applied'&&!commit){delete run.staged;hs.save(st);}
  return r;
}
export function discardStaged({runId,healStore}){const hs=healState(healStore),st=hs.load();if(st.runs[runId])delete st.runs[runId].staged;hs.save(st);}

// 반영으로 원본 해시(sourceHash)가 바뀌어도 단계가 수행됐다는 사실은 보존한다: 모든 실행의 done·in-progress·unknown 기록 가운데 행동이 그대로인 단계
// (그리고 방금 승격한 단계 — force)의 해시를 새 해시로 옮겨, 이어 가는 drive가 이미 끝난(특히 되돌릴 수 없는) 단계를 다시 수행하지 않게 한다.
function rebindState(state,oldSteps,newSteps,{force=[]}={}){
  if(!state||!state.readJson||!state.exists('drive-state.json'))return;
  const st=state.readJson('drive-state.json');
  for(const run of Object.values(st.runs||{}))for(const [id,rec] of Object.entries(run.steps||{})){
    if(!['done','in-progress','unknown'].includes(rec.status))continue;
    const o=oldSteps.find(s=>s.id===id),n=newSteps.find(s=>s.id===id);
    if(!o||!n||rec.actionHash!==o.actionHash||rec.sourceHash!==o.sourceHash)continue;
    if(o.actionHash!==n.actionHash&&!force.includes(id))continue;
    rec.actionHash=n.actionHash;rec.sourceHash=n.sourceHash;
  }
  state.writeJson('drive-state.json',st,{scanAs:JSON.parse(JSON.stringify(st,(k,v)=>/Hash$/.test(k)?undefined:v))});
}

// ---- 주행 통합 ----------------------------------------------------------------------------------------
const HEALABLE=r=>['conflict','screen-mismatch','expect-failed'].includes(r.status)||(r.status==='step-failed'&&['schema-mismatch','status-mismatch'].includes(r.reason));
export async function driveWithHealing(o){
  const {flowDir,playbookDir,runId,runtime,state,sink,from,to,observe,verifyStep,regress,recapture,learnApprovals=[],account='',task='',maxAttempts=3,healStore,onStage,log=()=>{},now}=o;
  if(!state||!state.readJson)throw new Error('state(보호 저장소)가 필요하다 — 이어 가는 주행이 끝난 단계를 건너뛰려면 실행 기록이 남아야 한다');
  recoverJournal(flowDir);   // 이전 호출이 반영 도중 끊겼으면 지도·실행 기록을 읽기 전에 먼저 되돌린다
  const flow=basename(resolve(flowDir));
  const approvalCtx={account,task,flow};
  const journalFiles=[state.path('drive-state.json'),healStore&&healStore.path('heal-state.json')];
  let approvals=[...(o.approvals||[])];
  let overlay=null,candidate=null;const heals=[];let healCalls=0;
  // 임시 지도(overlay)로 이어 가는 실행: 사용자가 후보를 승인했으므로 패치된 단계 식별(키)에 대한 일회(once) 승인을 더한다 — 승격되면 standing으로 이어진다
  const overlayApproval=(ov,stepId,candidateHash)=>({id:`ovl-${tag(candidateHash)}`,stepId,actionHash:ov.actionHash,sourceHash:ov.sourceHash,scope:'once',by:'user',date:new Date().toISOString().slice(0,10),key:approvalKeyOf(ov,approvalCtx)});
  // 이전 호출이 결과 불명으로 멈춘 임시 지도가 있으면 같은 runId·같은 흐름·같은 계정·업무의 재개에서만 이어 쓴다
  {const sg=healState(healStore).load().runs[runId]?.staged;
   if(sg){
     const m0=loadMap(flowDir);const i0=m0.ok?JSON.parse(readFileSync(join(resolve(flowDir),'steps.json'),'utf8')).steps.findIndex(s=>s.id===sg.stepId):-1;
     if(sg.flow===flow&&sg.account===account&&sg.task===task&&m0.ok&&i0>=0&&(learnApprovals||[]).some(a=>a&&a.by==='user'&&a.stepId===sg.stepId&&a.candidateHash===sg.candidateHash&&a.account===account&&a.task===task)){
       overlay={[sg.stepId]:patchAgentStep(m0.steps.find(s=>s.id===sg.stepId),sg.patch,i0)};
       approvals=[...approvals,overlayApproval(overlay[sg.stepId],sg.stepId,sg.candidateHash)];
     }else discardStaged({runId,healStore});
   }}
  // 반영 트랜잭션 안에서 실행 기록을 새 해시로 옮기고(필요하면 임시 지도를 지운다) 실패 시 되돌릴 undo를 돌려준다
  const mkCommit=(oldSteps,{unstage=false}={})=>async({stepId})=>{
    const newSteps=loadMap(flowDir).steps;
    const saved=[state,healStore].filter(Boolean).map(s=>[s,['drive-state.json','heal-state.json'].map(rel=>[rel,s.exists(rel)?s.read(rel):null])]);
    rebindState(state,oldSteps,newSteps,{force:[stepId]});
    if(unstage)discardStaged({runId,healStore});
    return ()=>{for(const [s,files] of saved)for(const [rel,buf] of files){if(buf===null)s.remove(rel);else writeFileSync(s.path(rel),buf);}};
  };
  for(let round=0;round<=maxAttempts*2+2;round++){
    const r=await drive({flowDir,runId,runtime,approvals,state,sink,from,to,overlay,approvalCtx,log});
    if(overlay){
      if(r.status==='done'){
        const oldSteps=loadMap(flowDir).steps;
        const pr=await promoteStaged({flowDir,playbookDir,runId,healStore,state,candidate,account,task,onStage,now,journalFiles,commit:mkCommit(oldSteps,{unstage:true})});
        heals.push({status:pr.status,kind:pr.kind,stepId:pr.stepId,version:pr.version,reason:pr.reason});
        if(pr.status==='applied'){
          const newSteps=loadMap(flowDir).steps;
          approvals=migrateApprovals({approvals,oldSteps,newSteps,account,task,flow,granted:{stepId:pr.stepId,candidateHash:pr.candidateHash,date:new Date().toISOString().slice(0,10)}});
        }
        return {...r,heals,healCalls,approvals};
      }
      if(['unknown-outcome','in-flight','undelivered'].includes(r.status))return {...r,heals,healCalls,staged:true,approvals};   // 결과 불명 — 재실행·폐기 없이 멈춘다
      discardStaged({runId,healStore});return {...r,heals,healCalls,approvals};
    }
    if(r.status==='done'||!HEALABLE(r))return {...r,heals,healCalls,approvals};
    healCalls++;
    const obs=observe?await observe(r):undefined;
    const oldSteps=loadMap(flowDir).steps;
    const h=await learn({flowDir,playbookDir,runId,failure:{status:r.status,step:r.step,reason:r.reason,report:r.report,observation:obs},verifyStep,regress,recapture,learnApprovals,account,task,maxAttempts,healStore,onStage,now,journalFiles,commit:mkCommit(oldSteps)});
    heals.push({status:h.status,kind:h.kind||(h.diagnosis&&h.diagnosis.kind),stepId:r.step,version:h.version,reason:h.reason});
    if(h.status==='applied'){
      const newSteps=loadMap(flowDir).steps;
      const ap=(learnApprovals||[]).find(a=>a.stepId===h.stepId&&a.candidateHash===h.candidateHash);
      approvals=migrateApprovals({approvals,oldSteps,newSteps,account,task,flow,granted:ap?{stepId:h.stepId,candidateHash:h.candidateHash,date:ap.date}:null});
      continue;
    }
    if(h.status==='staged'){overlay=h.overlay;candidate=h.candidateObj;approvals=[...approvals,overlayApproval(overlay[h.candidate.stepId],h.candidate.stepId,h.candidate.candidateHash)];continue;}
    if(h.status==='retry')continue;
    return {...r,heal:h,heals,healCalls,approvals};
  }
  return {status:'give-up',heals,healCalls,approvals};
}
