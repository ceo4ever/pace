// Orca 브라우저용 서비스 비의존 어댑터 라이브러리 — 코어 runCapture·captureRecord·approveStep을 연결한다.
// 서비스 고유 부분(화면 판정 screen, 탭 범위, 로그인)은 업무 저장소가 adapter.md의 계약·템플릿 절대로 얹는다.
// 모든 파일 쓰기는 보호 저장소(createStore)를 거친다 — 쓰기 직전 내용을 민감 형식 검사하고 쓴 경로를 기록한다.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {runCapture,captureRecord,approveStep,sha256Hex,CaptureRefused,leakScript,leakProblems} from './capture-core.mjs';
import {scanSensitive} from './sensitive.mjs';

const refuse=(msg,code)=>{throw new CaptureRefused(msg,code);};
const today=()=>new Date().toISOString().slice(0,10);

// ---- 보호 저장소 ---------------------------------------------------------------------------------------
// writeJson: scanAs(스캔용 구조, 기본은 obj 자신)를 scanSensitive에 통과시킨 뒤에만 쓴다. 거부하면 파일이 생기지 않는다.
// writeBytes: 이미지처럼 텍스트로 검사할 수 없는 바이트(확장자 .jpg만) — 이미지는 가림 증거·픽셀 검사로 따로 검증한다.
export function createStore(baseDir){
  const base=resolve(baseDir);
  const writes=[];
  const full=rel=>{
    const p=resolve(base,rel);
    if(p!==base&&!p.startsWith(base+sep))throw new Error('저장소 밖 경로');
    return p;
  };
  const put=(rel,data)=>{const p=full(rel);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,data);writes.push(relative(base,p).split(sep).join('/'));return p;};
  return {
    baseDir:base,writes,
    path:rel=>full(rel),
    exists:rel=>existsSync(full(rel)),
    read:rel=>readFileSync(full(rel)),
    readJson:rel=>JSON.parse(readFileSync(full(rel),'utf8')),
    writeJson(rel,obj,{scanAs}={}){scanSensitive(scanAs??obj);return put(rel,JSON.stringify(obj,null,1)+'\n');},
    writeText(rel,text){scanSensitive({file:String(text)});return put(rel,text);},
    writeBytes(rel,buf){if(!/\.jpe?g$/i.test(rel))throw new Error('바이트 쓰기는 이미지(.jpg)만 허용한다');return put(rel,buf);},
    remove(rel){const p=full(rel);if(existsSync(p))rmSync(p,{recursive:true,force:true});},
    list(){return existsSync(base)?walk(base).map(p=>relative(base,p).split(sep).join('/')).sort():[];}
  };
}
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);

// ---- Orca 브라우저 -------------------------------------------------------------------------------------
const sleepMs=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
export function orcaExe(){
  if(process.env.ORCA_EXE)return process.env.ORCA_EXE;
  return process.platform==='win32'?join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'Programs','orca','resources','bin','orca.exe'):'orca';
}
// 반환: {evalJs, screenshot, discard, sleep, page} — 코어 browser 계약(실패하면 throw).
export function createOrcaBrowser({page,exe=orcaExe(),tries=4}={}){
  if(!page)throw new Error('page(browserPageId)가 필요하다 — 지정한 탭만 다룬다');
  const once=args=>{
    const r=spawnSync(exe,[...args,'--json'],{encoding:'utf8',timeout:60000});
    if(r.error)throw r.error;
    let j;try{j=JSON.parse(r.stdout);}catch{throw new Error(`orca ${args[0]} 출력 해석 실패`);}
    if(!j.ok)throw new Error(`orca ${args[0]} 실패: ${String((j.error&&j.error.code)||'error')}`);   // 메시지 원문은 화면 값이 섞일 수 있어 코드만 붙인다
    return j.result;
  };
  const call=(...args)=>{let last;for(let i=0;i<tries;i++){try{return once(args);}catch(e){last=e;sleepMs(700);}}throw last;};
  return {
    page,
    evalJs(expr){const r=call('eval','--page',page,'--expression',`JSON.stringify(${expr})`);return JSON.parse(r.result);},
    screenshot(){const r=call('screenshot','--page',page,'--format','jpeg');const p=r.path||r.file||(r.result&&r.result.path);if(!p)throw new Error('screenshot_path_missing');return p;},
    discard(p){unlinkSync(p);},
    sleep:sleepMs
  };
}

// ---- 수행하며 관찰 -------------------------------------------------------------------------------------
// actions: [{type:'click'|'fill', find(CSS 선택자), value?(자리표시 값)}], expects: [{find, state:'visible'|'filled'}]
// 반환은 불리언 관찰뿐이다({ok, failed:[{kind,index}]}) — 화면 값은 반환하지 않는다.
export function observeStep({browser,actions=[],expects=[]}){
  const act=JSON.stringify(actions.map(a=>({type:a.type,find:a.find,value:a.value??''})));
  const exp=JSON.stringify(expects.map(e=>({find:e.find,state:e.state})));
  const expr=`(()=>{const A=${act},E=${exp};const ar=A.map(a=>{try{const el=document.querySelector(a.find);if(!el)return false;if(a.type==='click'){el.click();return true;}if(a.type==='fill'){el.focus&&el.focus();el.value=a.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;}catch(e){return false;}});
const er=E.map(e=>{try{const el=document.querySelector(e.find);if(!el)return false;const r=el.getBoundingClientRect();const vis=!el.hidden&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';if(e.state==='visible')return vis;if(e.state==='filled')return vis&&String(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)?(el.value??''):(el.textContent??'')).trim().length>0;return false;}catch(e){return false;}});
return {ar,er};})()`;
  let res;
  try{res=browser.evalJs(expr);}catch{return {ok:false,failed:[{kind:'browser',index:0}]};}
  const failed=[];
  (res.ar||[]).forEach((v,i)=>{if(v!==true)failed.push({kind:'action',index:i});});
  (res.er||[]).forEach((v,i)=>{if(v!==true)failed.push({kind:'expect',index:i});});
  if(!Array.isArray(res.ar)||!Array.isArray(res.er))failed.push({kind:'browser',index:0});
  return {ok:failed.length===0,failed};
}

// ---- 캡처 → 대기 → 승인 ---------------------------------------------------------------------------------
const pendingJpg=id=>`${id}.jpg`,pendingMeta=id=>`${id}.json`;
// 값 노출 검사(캡처 공통 관문): 추출 대상 값이 대상 밖 다른 곳에 가려지지 않은 채 보이면 캡처하지 않는다(대상 요소만 가려서는 부족하다).
// 검사하지 못한 대상(대상 없음·값 없음)·결과 없음도 거부한다(fail-closed). 최초 캡처(captureStep)와 복구 재캡처(recaptureStep)가 같이 쓴다.
export function assertNoValueExposure({browser,doc,step}){
  if(!(step.extract||[]).some(x=>x&&x.where&&typeof x.where.selector==='string'))return;
  // 추출 선택자가 번호 요소에 연결되지 않았으면 그 사유(extract_unlinked)로 먼저 거부한다 — 화면에서 찾지 못한 추출 대상과 같은 원인이다
  const finds=new Set((step.elements||[]).map(e=>e&&e.find));
  if((step.extract||[]).some(x=>x&&x.where&&typeof x.where.selector==='string'&&!finds.has(x.where.selector)))refuse('추출 대상이 번호 요소에 연결되지 않았다','extract_unlinked');
  let leak;try{leak=browser.evalJs(leakScript({mask:doc&&doc.mask,step}));}catch{leak=null;}
  const probs=leakProblems(leak,step);
  if(probs.length)refuse(`캡처하지 않는다 — ${probs.join('; ')}. mask에 그 위치를 더하거나 값이 같은 곳을 가린다`,'value_exposed');
}
// 복구(자가 학습)의 재캡처 — driveWithHealing의 recapture 주입용. 최초 캡처와 같은 값 노출 관문을 거친 뒤 가림 캡처·기록을 만들고 원본 스크린샷은 지운다.
// 반환 {record, bytes}: 기록·이미지는 복구가 반영 트랜잭션에서 쓰고, 새 기준 캡처는 history에 '사람 확인: 대기'로 남는다(healing.md).
export function recaptureStep({browser,doc,step,frames={},delayMs}){
  assertNoValueExposure({browser,doc,step});
  const cap=runCapture({doc,step,frames,browser,...(delayMs!==undefined?{delayMs}:{})});
  try{
    const bytes=readFileSync(cap.path);
    const record=captureRecord({info:cap.info,post:cap.post,step,shotSha256:sha256Hex(bytes),frames});
    return {record,bytes};
  }finally{try{browser.discard(cap.path);}catch{/* 원본 삭제 실패는 결과를 바꾸지 않는다 */}}
}
// pending: 저장소 밖 대기 폴더의 보호 저장소. actions·expects가 주어지면 관찰이 ok일 때만 진행한다.
export function captureStep({browser,pending,doc,step,frames={},actions,expects,delayMs}){
  if(actions||expects){
    const obs=observeStep({browser,actions,expects});
    if(!obs.ok)refuse(`수행·관찰 실패(${obs.failed.map(f=>f.kind+':'+f.index).join(',')}) — 기록하지 않는다`,'observe_failed');
  }
  assertNoValueExposure({browser,doc,step});
  let rawPath=null,stored=false;
  try{
    const cap=runCapture({doc,step,frames,browser,...(delayMs!==undefined?{delayMs}:{})});
    rawPath=cap.path;
    const bytes=readFileSync(rawPath);
    const sha=sha256Hex(bytes);
    const record=captureRecord({info:cap.info,post:cap.post,step,shotSha256:sha,frames});
    pending.writeBytes(pendingJpg(step.id),bytes);stored=true;
    pending.writeJson(pendingMeta(step.id),{stepId:step.id,record},{scanAs:{steps:[{captureRecord:record,recordHash:record.recordHash}]}});
    browser.discard(rawPath);rawPath=null;
    return {stepId:step.id,sha:sha.slice(0,12)};
  }catch(e){
    if(stored){pending.remove(pendingJpg(step.id));pending.remove(pendingMeta(step.id));}
    if(rawPath){try{browser.discard(rawPath);}catch{/* 삭제 실패는 원래 오류에 덧붙이지 않는다 */}}
    throw e;
  }
}

// 승인: 대기 메타 해시 = 파일 해시 = 받은 해시 접두일 때만 shots/S0n.jpg로 옮기고 steps.json에 승인 기록을 쓴다.
// flow: 흐름 폴더의 보호 저장소. 거부하면 아무것도 바꾸지 않는다(대기 파일은 rejectPending이 지운다).
export function approvePending({pending,flow,stepId,sha,now=today()}){
  if(!pending.exists(pendingMeta(stepId))||!pending.exists(pendingJpg(stepId)))refuse('대기 파일이 없다','approve_no_pending');
  const meta=pending.readJson(pendingMeta(stepId));
  const bytes=pending.read(pendingJpg(stepId));
  const actual=sha256Hex(bytes);
  if(typeof sha!=='string'||sha.length<8||!/^[0-9a-f]+$/.test(sha)||!actual.startsWith(sha)||meta.record.shotSha256!==actual)refuse('해시가 일치하지 않는다 — 승인하지 않는다','approve_hash');
  const d=flow.readJson('steps.json');
  const idx=d.steps.findIndex(x=>x.id===stepId);
  if(idx<0)refuse('단계가 없다','approve_step');
  if(d.steps[idx].capture===false)refuse('캡처 금지 단계는 승인하지 않는다','approve_capture_false');
  const approved=approveStep(d.steps[idx],meta.record,{approvedSha:actual});
  approved.status='captured';approved.verified=now;
  d.steps[idx]=approved;
  flow.writeBytes(`shots/${stepId}.jpg`,bytes);
  flow.writeJson('steps.json',d);
  pending.remove(pendingJpg(stepId));pending.remove(pendingMeta(stepId));
  return {stepId,sha:actual.slice(0,12)};
}
export function rejectPending({pending,stepId}){pending.remove(pendingJpg(stepId));pending.remove(pendingMeta(stepId));}
