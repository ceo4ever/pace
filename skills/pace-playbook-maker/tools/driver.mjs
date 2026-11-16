// 자율 주행 라이브러리 — 서비스 비의존. 규약(references/driving.md)의 기계적으로 검증할 수 있는 부분을 구현한다:
// 최신 확인·관문(승인 규칙)·결과 불명 처리와 재개·값이 새지 않는 주행 기록·운영 명령 계약.
// 값은 runtime.perform이 반환하고 sink로만 흐른다 — 반환 객체·상태 파일·로그에는 건수와 코드만 남는다.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkAgentFresh} from './build.mjs';
import {checkAccess} from './agent-map.mjs';
import {createHash} from 'node:crypto';
import {boxMatches,canonicalJson} from './capture-core.mjs';
import {sensitiveKinds} from './sensitive.mjs';

const HEX64=/^[0-9a-f]{64}$/;
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
// 값이 섞일 수 있는 문자열(이유·예외 메시지·오류 본문)은 허용 어휘 목록에 있을 때만 남긴다 — 모양만 맞는 문자열은 통과시키지 않는다
const REASONS=new Set(['needs-approval','no-map-rule','screen-mismatch','expect-failed','conflict','step-failed','param-missing','action-unsupported','find-unsupported','access-denied','undeclared-key','not-api-step','redirect-refused','status-mismatch','schema-mismatch','missing-value','no-destination','sink-failed','unknown-outcome','in-flight','undelivered','moved','missing','unknown','timeout']);
const safeCode=x=>typeof x==='string'&&REASONS.has(x)?x:'<가려짐>';
const errCode=e=>safeCode(e&&typeof e==='object'&&typeof e.code==='string'?e.code:'');
// 중단 보고(locate.report)는 지도에서 단계 정보를 만들고 runtime이 준 것은 요소 번호·이유 코드만 받는다 — 임의 필드는 버린다
const mkReport=(s,r)=>({step:s.id,element:Number.isInteger(r&&r.element)&&(s.elements||[]).some(e=>e.n===r.element)?r.element:null,reason:safeCode(r&&r.reason),sourceHash:s.sourceHash,shotSha256:(s.shot&&s.shot.sha256)||null});

// ---- 지도 읽기(최신 확인 포함) -----------------------------------------------------------------------
export function loadMap(flowDir){
  const fresh=checkAgentFresh(flowDir);
  if(!fresh.applicable||!fresh.ok)return {ok:false,problems:fresh.problems?.length??1};
  const dir=join(flowDir,'agent');
  const index=JSON.parse(readFileSync(join(dir,'index.json'),'utf8'));
  const steps=index.steps.map(s=>JSON.parse(readFileSync(join(dir,s.json),'utf8')));
  return {ok:true,index,steps};
}

// ---- 승인 규칙 ----------------------------------------------------------------------------------------
// 단계 식별(요소 번호·이름·find·동작 종류, API 메서드·경로) + 대상 계정·업무·흐름의 해시 — 복구가 승인에 붙이는 키(key)다.
export function approvalKeyOf(step,{account='',task='',flow=''}={}){
  const kind=a=>KINDS[FIRST(a)]||'other';
  const ident={stepId:step.id,elements:(step.elements||[]).map(e=>({n:e.n,name:e.name,find:e.find,action:kind(e.action)})),
    api:step.api?{method:step.api.method,path:String(step.api.endpoint||'').split('?')[0]}:null,account,task,flow};
  return createHash('sha256').update(canonicalJson(ident)).digest('hex');
}
const needsRule=s=>s.risk!=='read'||nonEmpty(s.gate);
const irreversible=s=>s.risk!=='read'||nonEmpty(s.gate);
const isIrr=irreversible;
// 비읽기 단계는 지도에 승인 규칙(gate)이 선언되어 있고 사용자 승인 기록(once/standing)이 해시에 맞을 때만 자율이다.
// once는 소모되기 전에도 한 실행(runId)에 예약되어 다른 실행이 쓰지 못한다.
export function approvalCheck(step,approvals,consumed=[],{reserved={},runId,ctx}={}){
  if(!needsRule(step))return {ok:true};
  if(!nonEmpty(step.gate))return {ok:false,reason:'no-map-rule'};   // 지도에 규칙이 없으면 외부 기록이 있어도 묻는다
  for(const a of approvals||[]){
    if(!a||a.by!=='user'||a.stepId!==step.id||a.actionHash!==step.actionHash||a.sourceHash!==step.sourceHash)continue;
    // 계정·업무·흐름 맥락(ctx)이 주어지면(복구 주행) 키가 있고 현재 맥락과 같은 승인만 쓴다 — 키 없는 옛 승인은 거부한다. 맥락이 없으면 키 있는 승인은 쓰지 않는다(검증할 수 없다).
    if(ctx){if(a.key===undefined||a.key!==approvalKeyOf(step,ctx))continue;}else if(a.key!==undefined)continue;
    if(a.scope==='standing')return {ok:true,approval:a};
    if(a.scope==='once'&&nonEmpty(a.id)&&!consumed.includes(a.id)&&(reserved[a.id]===undefined||reserved[a.id]===runId))return {ok:true,approval:a};
  }
  return {ok:false,reason:'needs-approval'};
}
// 사용자 승인 기록을 보호 저장소(approvals.json)에 남긴다 — 값 없음, 해시에 묶는다
export function recordApproval({store,approval}){
  const a=approval||{};
  if(!nonEmpty(a.stepId)||!HEX64.test(String(a.actionHash))||!HEX64.test(String(a.sourceHash))||!['once','standing'].includes(a.scope)||a.by!=='user')throw new Error('승인 기록 형식 오류(stepId·actionHash·sourceHash·scope·by:user)');
  if(a.scope==='once'&&!nonEmpty(a.id))throw new Error('once 승인은 id가 필요하다');
  const list=store.exists('approvals.json')?store.readJson('approvals.json'):[];
  list.push({id:a.id,stepId:a.stepId,actionHash:a.actionHash,sourceHash:a.sourceHash,scope:a.scope,by:'user',date:a.date,...(HEX64.test(String(a.key))?{key:a.key}:{})});   // key: 복구가 붙이는 식별·계정·업무 키(있으면 보존)
  store.writeJson('approvals.json',list,{scanAs:stripHashes(list)});
  return list.length;
}
// 쓰기 시작할 때 once를 이 실행에 예약하고, 행동이 실행된 뒤 소모한다
function reserve(st,a,runId){if(a&&a.scope==='once')st.reserved[a.id]=runId;}
function consume(st,s,approvals,runId,ctx){const a=approvalCheck(s,approvals,st.consumed,{reserved:st.reserved,runId,ctx}).approval;if(a&&a.scope==='once'&&!st.consumed.includes(a.id))st.consumed.push(a.id);}

// ---- 상태(주행 기록) ----------------------------------------------------------------------------------
function makeState(state){
  const fresh=()=>({version:1,runs:{},consumed:[],reserved:{}});
  const mem=fresh();
  const norm=d=>{d.runs??={};d.consumed??=[];d.reserved??={};return d;};
  return state&&state.readJson?{
    load(){return norm(state.exists('drive-state.json')?state.readJson('drive-state.json'):fresh());},
    save(d){state.writeJson('drive-state.json',d,{scanAs:stripHashes(d)});}
  }:{load(){return norm(mem);},save(d){Object.assign(mem,d);}};
}
// 해시 필드(키 이름이 해시 전용)는 검사에서 면제되므로 상태의 숫자·코드 구조만 검사에 넘긴다
const stripHashes=d=>JSON.parse(JSON.stringify(d,(k,v)=>/Hash$|^key$/.test(k)?undefined:v));   // key: 승인에 붙는 식별·계정·업무 해시
function markDone(rec,s,n,evidence,delivered){
  Object.assign(rec,{status:'done',actionHash:s.actionHash,sourceHash:s.sourceHash,extractCount:n,reason:undefined,delivered});
  if(isIrr(s))rec.irreversible={executed:true,evidence};
}
// 되돌릴 수 없는 행동의 결과가 불명일 때: 조회로 판정한다. 반환 'done'|'retry'|'in-flight'|'unknown-outcome'
// not-done은 원래 요청이 끝났음(settled)이 확인된 뒤 **다시 조회해도** not-done일 때만 재수행 근거다.
async function resolveUnknown(s,rec,runtime,ctx,attempt){
  const look=async()=>{try{return runtime.lookup?await runtime.lookup(s,ctx):'unknown';}catch{return 'unknown';}};
  const first=await look();
  if(first==='done')return 'done';
  if(first==='not-done'){
    let settled='in-flight';
    try{settled=runtime.settle?await runtime.settle(s,{...ctx,attemptKey:`${ctx.runId}:${s.id}:${attempt}`}):'in-flight';}catch{settled='in-flight';}
    if(settled==='settled'){
      const again=await look();   // 종료를 확인하는 사이 원래 요청이 성공했을 수 있다
      if(again==='done')return 'done';
      if(again==='not-done')return 'retry';
      rec.status='unknown';return 'unknown-outcome';
    }
    rec.status='unknown';return 'in-flight';
  }
  rec.status='unknown';return 'unknown-outcome';
}

// ---- 주행 ---------------------------------------------------------------------------------------------
export async function drive({flowDir,runId,runtime,approvals=[],state,sink,from,to,overlay,approvalCtx,now=()=>Date.now(),log=()=>{}}){
  if(!nonEmpty(runId))throw new Error('runId가 필요하다');
  const map=loadMap(flowDir);
  if(!map.ok){log({type:'stale-map'});return {status:'stale-map',completed:[],counts:{}};}
  // overlay: 이 실행에만 덧씌우는 단계 json(복구 후보 검증용) — 정본 지도는 읽기만 하고 해시 필드는 그대로 둔다
  if(overlay)map.steps=map.steps.map(s=>overlay[s.id]??s);
  const io=makeState(state);
  const st=io.load();
  const run=(st.runs[runId]??={steps:{}});
  const persist=()=>io.save(st);
  const completed=[],counts={};
  const startIdx=from?map.steps.findIndex(s=>s.id===from):0;
  const endIdx=to?map.steps.findIndex(s=>s.id===to):map.steps.length-1;   // to: 이 단계까지만(범위 주행)
  if(startIdx<0||endIdx<startIdx)return {status:'bad-range',completed,counts};   // 모르는 단계 id를 처음부터 다시 도는 것으로 바꾸지 않는다
  const ctx={index:map.index,runId};
  const gate=s=>approvalCheck(s,approvals,st.consumed,{reserved:st.reserved,runId,ctx:approvalCtx});
  const stop=(s,status,extra={})=>{
    const rec=run.steps[s.id]??={};
    if(rec.status!=='unknown')rec.status='stopped';
    rec.reason=safeCode(extra.reason??status);rec.actionHash=s.actionHash;rec.sourceHash=s.sourceHash;
    persist();
    log({type:'stop',step:s.id,status});
    return {status,step:s.id,...(extra.gate?{gate:extra.gate}:{}),...(extra.reason?{reason:safeCode(extra.reason)}:{}),...(extra.report?{report:mkReport(s,extra.report)}:{}),completed,counts};
  };
  // 조회로 행동 완료는 확인했지만 선언된 값은 전달되지 않았다 — 단계는 done으로 남기고(다시 수행하지 않는다) 완료로 숨기지 않고 보고한다
  const undelivered=s=>{log({type:'stop',step:s.id,status:'undelivered'});return {status:'undelivered',step:s.id,reason:'undelivered',completed,counts};};
  let lost;   // 조회로 완료만 확인되고 값은 전달되지 않은 단계(이전 호출에서 기록됨)
  for(let i=startIdx;i<=endIdx;i++){
    const s=map.steps[i];
    const rec=run.steps[s.id];
    // 같은 실행의 완료 상태는 해시가 같을 때만 건너뛴다
    if(rec&&rec.status==='done'&&rec.actionHash===s.actionHash&&rec.sourceHash===s.sourceHash){completed.push(s.id);counts[s.id]=rec.extractCount??0;if(rec.delivered===false&&(s.extract||[]).length)lost??=s;continue;}   // 값 미전달 기록은 재호출에서도 끝에 보고한다
    const irr=isIrr(s),hasExtract=(s.extract||[]).length>0;
    // 이전에 끊긴 되돌릴 수 없는 행동은 수행하기 전에 조회부터 한다
    let attempt=(rec&&rec.attempt)||0,resumedRetry=false;
    if(irr&&rec&&(rec.status==='in-progress'||rec.status==='unknown')&&rec.actionHash===s.actionHash&&rec.sourceHash===s.sourceHash){
      const r=await resolveUnknown(s,rec,runtime,ctx,attempt);
      if(r==='done'){markDone(rec,s,0,'lookup',!hasExtract);consume(st,s,approvals,runId,approvalCtx);persist();completed.push(s.id);counts[s.id]=0;if(hasExtract)return undelivered(s);continue;}
      if(r!=='retry')return stop(s,r==='in-flight'?'in-flight':'unknown-outcome',{reason:r});
      resumedRetry=true;
    }
    // 관문 — 수행하기 전에
    const ap=gate(s);
    if(!ap.ok)return stop(s,'needs-approval',{reason:ap.reason,gate:s.gate});
    // 화면 판정(부작용 없음)
    if(s.screen){
      let ok=false;try{ok=runtime.judgeScreen?await runtime.judgeScreen(s):false;}catch{ok=false;}   // 판정기가 없으면 화면을 모르는 것이라 멈춘다
      if(!ok)return stop(s,'screen-mismatch',{reason:'screen-mismatch',report:{element:null,reason:'screen-mismatch'}});
    }
    reserve(st,ap.approval,runId);   // once는 이 실행에 예약 — 부분 실행·불명이 되어도 다른 실행이 못 쓴다
    const timer=now();let retried=resumedRetry;
    for(;;){
      attempt+=1;
      const r0=run.steps[s.id]??={};
      Object.assign(r0,{status:irr?'in-progress':'running',actionHash:s.actionHash,sourceHash:s.sourceHash,attempt});
      if(irr)persist();   // 수행 전에 기록한다 — 끊겨도 다음 주행이 조회부터 한다
      let out=null,thrown=false;
      try{out=await runtime.perform(s,{...ctx,attemptKey:`${runId}:${s.id}:${attempt}`});}catch(e){thrown=true;log({type:'perform-error',step:s.id,code:errCode(e)});}
      const unknown=thrown||!out||out.timeout===true||(out.ok===false&&irr&&out.executed!==false);
      if(unknown&&irr){
        r0.status='unknown';persist();
        if(retried)return stop(s,'unknown-outcome',{reason:'unknown-outcome'});
        const r=await resolveUnknown(s,r0,runtime,ctx,attempt);
        if(r==='done'){markDone(r0,s,0,'lookup',!hasExtract);consume(st,s,approvals,runId,approvalCtx);persist();completed.push(s.id);counts[s.id]=0;if(hasExtract)return undelivered(s);break;}
        if(r==='retry'){retried=true;continue;}
        return stop(s,r==='in-flight'?'in-flight':'unknown-outcome',{reason:r});
      }
      if(!out||out.ok!==true){
        const code=safeCode(out&&out.reason);
        const status=code==='expect-failed'?'expect-failed':code==='conflict'?'conflict':'step-failed';
        return stop(s,status,{reason:code,report:out&&out.report?{...out.report,reason:out.report.reason??code}:undefined});
      }
      consume(st,s,approvals,runId,approvalCtx);   // 행동이 실행됐다 — 값 전달 실패가 있어도 once는 다시 쓰이지 않는다
      // 추출 전달 — 선언된 이름만 sink로, 값은 기록하지 않는다
      const afterExec=(status,reason)=>{if(irr){r0.status='unknown';r0.irreversible={executed:true,evidence:'perform'};}return stop(s,status,{reason});};   // 행동은 이미 실행됨 — 다시 수행하지 않게 불명으로 둔다
      let n=0;
      for(const x of s.extract||[]){
        const v=out.values&&out.values[x.name];
        if(v===undefined)return afterExec('step-failed','missing-value');
        const dest=x.deliverTo??map.index.resultTo;
        if(!nonEmpty(dest))return afterExec('no-destination','no-destination');
        try{await sink(dest,x.name,v);}catch{return afterExec('sink-failed','sink-failed');}
        n+=Array.isArray(v)?v.length:1;
      }
      markDone(r0,s,n,'perform',true);r0.ms=now()-timer;persist();
      completed.push(s.id);counts[s.id]=n;
      break;
    }
  }
  if(lost)return undelivered(lost);
  log({type:'done',steps:completed.length});
  return {status:'done',completed,counts};
}

// ---- 운영 명령 ----------------------------------------------------------------------------------------
// 운영 명령(여러 단계를 한 번에 수행)을 주입한 operation({from,to},{checkpoint,attemptKey,runId})로 부른다. 실제 명령 호출은 호출자 몫.
// 계약: 되돌릴 수 없는 단계는 수행 전에 checkpoint(id,'in-progress'), 끝나면 checkpoint(id,'done',values?)를 부른다.
// 이 계약을 어기고 체크포인트 없이 행동한 명령은 라이브러리가 판정할 수 없다 — 규약은 그런 명령을 읽기 전용 단계에만 쓰게 한다.
export async function driveOperation({flowDir,runLabel,runId,operation,runtime,approvals=[],state,sink,maxResumes=3,approvalCtx,log=()=>{}}){
  if(!nonEmpty(runId))throw new Error('runId가 필요하다');
  const map=loadMap(flowDir);
  if(!map.ok)return {status:'stale-map',completed:[]};
  const op=(map.index.run||[]).find(r=>r.label===runLabel);
  if(!op)return {status:'no-operation',completed:[]};
  const ids=map.steps.map(s=>s.id);
  const a0=ids.indexOf((op.covers||[])[0]),a1=ids.indexOf((op.covers||[])[1]);
  if(a0<0||a1<a0)return {status:'no-operation',completed:[]};
  const range=map.steps.slice(a0,a1+1);
  const io=makeState(state);
  const st=io.load();
  const run=(st.runs[runId]??={steps:{}});
  const gate=s=>approvalCheck(s,approvals,st.consumed,{reserved:st.reserved,runId,ctx:approvalCtx});
  const valid=(s,r)=>r&&r.actionHash===s.actionHash&&r.sourceHash===s.sourceHash;
  const pending=()=>range.filter(s=>!(valid(s,run.steps[s.id])&&run.steps[s.id].status==='done'));
  const doneIds=()=>range.filter(s=>!pending().includes(s)).map(s=>s.id);
  // 아직 끝나지 않은 범위 안 비읽기 단계마다 관문 — 하나라도 안 맞으면 명령을 부르지 않는다
  for(const s of pending()){
    const ap=gate(s);
    if(!ap.ok){log({type:'stop',step:s.id,status:'needs-approval'});return {status:'needs-approval',step:s.id,reason:ap.reason,gate:s.gate,completed:doneIds()};}
  }
  for(const s of pending())reserve(st,gate(s).approval,runId);   // once는 이 실행에 예약
  io.save(st);
  const queue=[];   // 체크포인트에 실려 온 값 — 호출이 끝난 뒤 sink로 전달
  const checkpoint=(stepId,status,values)=>{
    const s=range.find(x=>x.id===stepId);if(!s)return;
    const rec=run.steps[stepId]??={};
    if(status==='done'){
      Object.assign(rec,{status:'done',actionHash:s.actionHash,sourceHash:s.sourceHash});
      if(isIrr(s))rec.irreversible={executed:true,evidence:'checkpoint'};
      if((s.extract||[]).length&&rec.delivered!==true)rec.delivered=false;
      consume(st,s,approvals,runId,approvalCtx);   // 행동이 실행됐다 — 이 once는 다시 쓰이지 않는다
      if(values)queue.push([stepId,values]);
    }else{
      Object.assign(rec,{status:'in-progress',actionHash:s.actionHash,sourceHash:s.sourceHash,attempt:(rec.attempt||0)+1});
    }
    io.save(st);   // 단계 하나가 끝날 때마다 즉시 영속
  };
  const attemptKey=stepId=>`${runId}:${stepId}:${(run.steps[stepId]&&run.steps[stepId].attempt)||0}`;
  const flush=async result=>{
    const batches=[...queue.splice(0)];
    if(result&&result.values)for(const [sid,vals] of Object.entries(result.values))batches.push([sid,vals]);
    for(const [sid,vals] of batches){
      const s=range.find(x=>x.id===sid);if(!s||!vals||typeof vals!=='object')continue;
      const rec=run.steps[sid]??={};
      let all=true;
      for(const x of s.extract||[]){
        const dest=x.deliverTo??map.index.resultTo;
        if(vals[x.name]===undefined||!nonEmpty(dest)||typeof sink!=='function'){all=false;continue;}
        try{await sink(dest,x.name,vals[x.name]);}catch{all=false;}
      }
      if(all&&(s.extract||[]).length)rec.delivered=true;
    }
    io.save(st);
  };
  const cap=range.some(isIrr)?1:maxResumes;   // 되돌릴 수 없는 단계가 있으면 한 번만 다시 부른다(일반 주행의 재수행 한 번과 같다)
  let normalReturn=false,lastResult=null;
  for(let resume=0;resume<=cap;resume++){
    const todo=pending();
    if(!todo.length)break;
    // 직전에 끊겨 in-progress로 남은 되돌릴 수 없는 단계는 명령을 다시 부르기 전에 조회로 판정한다
    const first=todo[0];
    const rec=run.steps[first.id];
    // 명령이 오류 없이 돌아왔는데 되돌릴 수 없는 단계가 남았으면 체크포인트 계약이 깨진 것이라 실행 여부를 알 수 없다 — 다시 부르지 않고 멈춘다
    // (실패를 정상 반환으로 알리며 failedAt이 첫 비가역 단계 이전·그 단계이면 그 뒤 단계는 시작 전이라 안전하다)
    const firstIrr=todo.find(isIrr),inProg=s=>{const r=run.steps[s.id];return r&&(r.status==='in-progress'||r.status==='unknown');};
    const fa=lastResult&&ids.indexOf(lastResult.failedAt);
    if(normalReturn&&firstIrr&&!inProg(firstIrr)&&!(fa>=0&&fa<=ids.indexOf(firstIrr.id)))return {status:'unknown-outcome',step:firstIrr.id,completed:doneIds()};
    if(isIrr(first)&&rec&&(rec.status==='in-progress'||rec.status==='unknown')){
      const r=await resolveUnknown(first,rec,runtime,{index:map.index,runId},rec.attempt||resume);
      if(r==='done'){markDone(rec,first,0,'lookup',!(first.extract||[]).length);consume(st,first,approvals,runId,approvalCtx);io.save(st);continue;}
      if(r!=='retry'){io.save(st);return {status:r==='in-flight'?'in-flight':'unknown-outcome',step:first.id,completed:doneIds()};}
    }
    let result=null;lastResult=null;
    normalReturn=true;
    try{result=await operation({from:first.id,to:range[range.length-1].id},{checkpoint,attemptKey,runId});}catch(e){normalReturn=false;log({type:'operation-error',code:errCode(e)});}
    lastResult=result;
    await flush(result);   // 반환 보고·체크포인트 값은 같은 파이프로 전달
  }
  const left=pending();
  if(left.length)return {status:'unknown-outcome',step:left[0].id,completed:doneIds()};
  // 행동 완료와 결과 전달은 다르다 — 선언된 값이 전달되지 않은 단계가 있으면 완료로 보고하지 않는다
  const undelivered=range.find(s=>(s.extract||[]).length&&(run.steps[s.id]&&run.steps[s.id].delivered)!==true);
  if(undelivered){run.steps[undelivered.id].reason='undelivered';io.save(st);return {status:'undelivered',step:undelivered.id,reason:'undelivered',completed:doneIds()};}
  return {status:'done',completed:range.map(s=>s.id)};
}

// 수행 전 거절(부작용 없음) — drive가 결과 불명으로 보지 않고 곧바로 실패로 다루게 executed:false를 단다
const refuse=(reason,extra={})=>({ok:false,reason,executed:false,...extra});

// ---- 웹 실행기 ----------------------------------------------------------------------------------------
const FIRST=a=>String(a||'').trim().split(/[\s,.(]+/)[0];
const KINDS={'클릭':'click','입력':'fill','읽기':'read','누르지':'none'};
export function createWebRuntime({browser,params={},waitMs=3000,pollMs=100,sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms),dismiss={},freshness=true}={}){
  const ev=expr=>browser.evalJs(expr);
  const q=JSON.stringify;
  const cssOnly=f=>typeof f==='string'&&!/^text:/.test(f)&&!/^[A-Za-z_][\w-]*:(?!:)/.test(f.replace(/\[[^\]]*\]/g,''))||false;
  const rectOf=find=>ev(`(()=>{const e=document.querySelector(${q(find)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};})()`);
  const state=find=>ev(`(()=>{const e=document.querySelector(${q(find)});if(!e)return {exists:false};const r=e.getBoundingClientRect();const vis=!e.hidden&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';const t=String(e.value??e.textContent??'');let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return {exists:true,vis,filled:vis&&t.trim().length>0,h};})()`);
  const visible=sel=>{const s=state(sel);return s.exists&&s.vis;};
  return {
    async judgeScreen(step){
      const sc=step.screen||{};
      const url=ev('location.pathname+location.hash');
      if(sc.url&&!new RegExp(sc.url).test(url))return false;
      const check=()=>(sc.require||[]).every(visible)&&!(sc.forbid||[]).some(visible);
      if(check())return true;
      // 늦은 덮개: 닫는 방법이 주입되어 있으면 한 번 닫고 다시 판정한다
      const how={...Object.fromEntries((sc.dismiss||[]).map(x=>[x.when,x.click])),...dismiss};   // 지도에 선언된 닫는 방법 + 호출자가 주입한 것
      for(const f of sc.forbid||[])if(visible(f)&&how[f]){ev(`(()=>{const e=document.querySelector(${q(how[f])});if(e)e.click();return true;})()`);sleep(pollMs);}
      return check();
    },
    async perform(step){
      const els=step.elements||[];
      const plan=[];
      for(const el of els){
        const kind=KINDS[FIRST(el.action)];
        if(!kind)return refuse('action-unsupported');
        if(!cssOnly(el.find))return refuse('find-unsupported');
        if(kind==='fill'&&params[el.name]===undefined)return refuse('param-missing');   // 아무것도 하기 전에 거절
        plan.push({el,kind});
      }
      // 위치 대조: 기록 box가 있고 증거가 유효하면 find로 찾은 실제 위치와 맞아야 한다 — 어긋나면 중단 보고
      for(const {el} of plan){
        const r=rectOf(el.find);
        if(!r)return refuse('conflict',{report:{step:step.id,element:el.n,reason:'missing',sourceHash:step.sourceHash,shotSha256:step.shot&&step.shot.sha256}});
        if(el.box&&!el.stale&&r.w>0&&r.h>0&&!boxMatches(el.box,r).ok)return refuse('conflict',{report:{step:step.id,element:el.n,reason:'moved',sourceHash:step.sourceHash,shotSha256:step.shot&&step.shot.sha256}});
      }
      const readers=plan.filter(p=>p.kind==='read').map(p=>p.el.find);
      for(const x of step.extract||[])if(x.where&&x.where.selector&&!readers.includes(x.where.selector)&&cssOnly(x.where.selector))readers.push(x.where.selector);
      const before=freshness?readers.map(f=>state(f)):[];
      for(const {el,kind} of plan){
        if(kind==='fill'){
          const v=params[el.name];
          ev(`(()=>{const e=document.querySelector(${q(el.find)});e.focus&&e.focus();e.value=${q(String(v))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
        }else if(kind==='click'){
          ev(`(()=>{const e=document.querySelector(${q(el.find)});e.click();return true;})()`);
        }
      }
      // 기대·대기: 읽기 대상이 보이고 비어 있지 않고(이전 상태와 달라질 때까지) 폴링
      let waited=0,ok=!readers.length;
      while(!ok){
        ok=readers.every((f,i)=>{const s=state(f);return s.exists&&s.filled&&(!freshness||!before[i]||!before[i].exists||before[i].h!==s.h||!before[i].filled);});
        if(ok)break;
        if(waited>=waitMs)break;
        sleep(pollMs);waited+=pollMs;
      }
      if(!ok)return {ok:false,reason:'expect-failed',executed:undefined};
      const values={};
      for(const x of step.extract||[]){
        if(x.where&&x.where.selector)values[x.name]=ev(`(()=>{const e=document.querySelector(${q(x.where.selector)});return e?String(e.value??e.textContent??''):null;})()`);
      }
      return {ok:true,values,expectChecked:readers.length>0};   // 읽기 대상이 있어 기대 결과를 실제로 관찰했을 때만 true — 복구 검증이 요구한다
    }
  };
}

// ---- API 실행기 ---------------------------------------------------------------------------------------
const getPath=(obj,path)=>{
  const parts=path.split('.');
  const walk=(v,i)=>{
    if(i>=parts.length)return [v];
    const raw=parts[i],arr=raw.endsWith('[]'),k=arr?raw.slice(0,-2):raw;
    const next=v&&typeof v==='object'?v[k]:undefined;
    if(next===undefined)return null;
    if(arr){if(!Array.isArray(next))return null;const out=[];for(const x of next){const r=walk(x,i+1);if(r)out.push(...r);}return out;}
    return walk(next,i+1);
  };
  const r=walk(obj,0);return r===null?undefined:r;
};
// 응답의 필드 경로 이름만(값 없음) — 식별자 모양이 아니거나 민감 형식인 키는 뺀다
function shapePaths(v,prefix='',depth=0,out=[]){
  if(out.length>=200||depth>6||v===null||typeof v!=='object')return out;
  if(Array.isArray(v)){if(v.length)shapePaths(v[0],prefix+'[]',depth+1,out);return out;}
  for(const [k,x] of Object.entries(v)){
    if(!/^[A-Za-z_][A-Za-z0-9_-]{0,40}$/.test(k)||sensitiveKinds(k).length)continue;
    const path=prefix?`${prefix}.${k}`:k;
    if(x!==null&&typeof x==='object')shapePaths(x,path,depth+1,out);else out.push(path);
  }
  return out;
}
export function createApiRuntime({fetch:fetchFn,params={},timeoutMs=10000,lookup,settle}={}){
  let last={shape:[],httpStatus:null};   // 마지막 응답의 경로 이름·상태 코드만 — 진단용, 메모리에만 둔다
  return {
    observe:()=>({...last,shape:[...last.shape]}),
    ...(lookup?{lookup}:{}),...(settle?{settle}:{}),
    async perform(step,ctx={}){
      const a=step.api;
      if(!a)return refuse('not-api-step');
      const idx=ctx.index||{};
      const decl=a.request||[];
      const keys=ins=>new Set(decl.filter(q=>q.in===ins).map(q=>q.name));
      // 호출 전 검사 — 허용 밖이면 fetch를 부르지 않는다
      const tpl=checkAccess(a.endpoint,{allowedOrigins:idx.allowedOrigins,allowedPaths:idx.allowedPaths,requestKeys:keys('query')});
      if(tpl.length)return refuse('access-denied');
      const bodyKeys=keys('body'),headerKeys=new Set([...keys('header')].map(k=>k.toLowerCase()));
      for(const k of Object.keys(params.body||{}))if(!bodyKeys.has(k))return refuse('undeclared-key');
      for(const k of Object.keys(params.headers||{}))if(!headerKeys.has(k.toLowerCase()))return refuse('undeclared-key');
      const base=a.endpoint.split('?')[0];
      let url=base;
      for(const m of base.matchAll(/\{([^{}]+)\}/g)){
        const v=(params.path||{})[m[1]];if(v===undefined)return refuse('param-missing');
        url=url.replace(m[0],encodeURIComponent(String(v)));
      }
      const qs=[];
      for(const k of keys('query')){const v=(params.query||{})[k];if(v===undefined)return refuse('param-missing');qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);}
      // 값을 채운 최종 URL도 origin·경로가 허용 안이어야 한다
      if(checkAccess(url,{allowedOrigins:idx.allowedOrigins,allowedPaths:idx.allowedPaths,requestKeys:new Set()}).length)return refuse('access-denied');
      const finalUrl=qs.length?`${url}?${qs.join('&')}`:url;
      const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),timeoutMs);
      let res;
      try{
        res=await fetchFn(finalUrl,{method:a.method,headers:params.headers||{},...(params.body?{body:JSON.stringify(params.body)}:{}),redirect:'manual',signal:ac.signal});
      }catch(e){clearTimeout(timer);return {ok:false,timeout:true};}
      clearTimeout(timer);
      last={shape:[],httpStatus:res.status};
      if(res.type==='opaqueredirect'||(res.status>=300&&res.status<400))return {ok:false,reason:'redirect-refused'};
      if(a.successStatus!==undefined&&String(res.status)!==String(a.successStatus))return {ok:false,reason:'status-mismatch'};
      let body;
      try{body=await res.json();}catch{body=undefined;}
      last={shape:shapePaths(body),httpStatus:res.status};
      for(const q of a.response||[]){if(q&&typeof q.path==='string'&&getPath(body,q.path)===undefined)return {ok:false,reason:'schema-mismatch'};}   // 선언된 응답 경로가 모두 있어야 한다
      const values={};
      for(const x of step.extract||[]){
        if(!x.where||x.where.apiPath===undefined)continue;
        const got=getPath(body,x.where.apiPath);
        if(got===undefined||(Array.isArray(got)&&!got.length&&!(a.response||[]).some(r=>r.path===x.where.apiPath)))return {ok:false,reason:'schema-mismatch'};
        values[x.name]=got.length===1?got[0]:got;
      }
      return {ok:true,status:res.status,values,expectChecked:true};
    }
  };
}
