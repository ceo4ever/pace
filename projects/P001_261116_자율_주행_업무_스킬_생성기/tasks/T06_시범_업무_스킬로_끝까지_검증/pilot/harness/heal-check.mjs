// 변경 학습 확인(T06 S-4, T-4) — 시범 플레이북 **복사본**의 원본 steps.json에서 한 요소의 선택자를 현재 페이지에 없는 낡은 값으로 바꾸고 buildFlow로 지도를
// 정상 재생성한 뒤(생성물 agent/*는 직접 고치지 않는다), 실제 GitHub 페이지(게스트 프로필)에서 네 단계를 관찰한다:
//  ① 손상 전 정상 주행(정답 일치) ② 손상 직후 진단 실패(치유 없는 drive가 해당 단계에서 멈추고 진단 종류가 나옴)
//  ③ 자가 복구·반영(driveWithHealing — steps.json 선택자 변경·지도 재생성·checkAgentFresh·history 항목) ④ 새 탭 재주행(정답 일치·치유 호출 0)
// 복구하지 못하면 그 사실과 이유를 그대로 기록한다(T-4 미충족). 값은 공개 정보라 판정 결과만 남기고, 흐름 상태·기록 폴더는 유출 검사 대상으로 보존한다.
// 사용: node heal-check.mjs <출력 파일> <상태 보존 폴더> [--repo owner/name]
import {spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetchTruth} from './truth.mjs';
import {judge} from './score.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {driveWithHealing,pendingHumanChecks}=await imp('healer.mjs');
const {createWebProbe}=await imp('heal-web.mjs');
const {createWebRuntime,drive,loadMap}=await imp('driver.mjs');
const {createStore,createOrcaBrowser,orcaExe,recaptureStep}=await imp('orca-adapter.mjs');
const {buildFlow,checkAgentFresh}=await imp('build.mjs');
// 재캡처는 최초 캡처와 같은 값 노출 관문을 거치는 recaptureStep(orca-adapter)으로 한다

const [outFile,keepDir]=process.argv.slice(2);
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const REPO=arg('--repo')||'ceo4ever/pace';   // 기준 캡처를 찍은 화면(요소 box가 같은 배치)
const STALE='#ref-picker-repos-header-ref-selector-v0',ELEMENT=1;
const lines=[];const say=s=>{lines.push(s);console.log(s);};
const exe=orcaExe();
const orca=(...a)=>{let last;for(let i=0;i<3;i++){const r=spawnSync(exe,[...a,'--json'],{encoding:'utf8',timeout:90000});try{const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;}catch(e){last=e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);}}throw last;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const prof=orca('tab','profile','list').profiles.find(p=>p.label==='pace-t06-guest').id;
const pages=[];
// 정답 조회는 일시적 네트워크 오류(소켓 끊김)만 두 번 더 시도한다 — 응답 상태 오류(한도 등)는 그대로 실패
const NO_TRUTH=process.argv.includes('--no-truth');   // 진단용: 정답 조회 없이(정확도 판정은 실패로 표시)
const truthOf=async r=>{if(NO_TRUTH)return {branch:'',stars:-1,sha7:'',title:'',date:''};for(let i=0;;i++){try{return await fetchTruth(r);}catch(e){if(i>=2||/GitHub API/.test(String(e.message)))throw e;sleep(2000);}}};
const openTab=()=>{
  const page=orca('tab','create','--profile',prof,'--url','https://github.com/'+REPO).browserPageId;pages.push(page);
  for(let i=0;i<30;i++){sleep(700);try{if(String(orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')").result)==='true')break;}catch{}}
  orca('viewport','--page',page,'--width','1280','--height','900','--scale','1');sleep(1500);
  return {page,browser:createOrcaBrowser({page})};
};
// 라이브러리가 읽은 화면 글자(textContent)를 정답 판정 형식으로 — 별은 괄호 안 표기, 날짜는 표시 날짜, 나머지는 공백 정리
const toOut=v=>{
  const s=k=>String(v[k]??'').replace(/\s+/g,' ').trim();
  const star=/\(([^)]+)\)/.exec(s('별 개수'));const d=Date.parse(s('최신 커밋 날짜')+' UTC');
  return {branch:s('기본 브랜치'),stars:star?star[1]:s('별 개수'),sha7:s('최신 커밋 해시'),title:s('최신 커밋 제목'),date:Number.isFinite(d)?new Date(d).toISOString().slice(0,10):null};
};

const work=mkdtempSync(join(tmpdir(),'pace-t06-heal-'));
const out=join(work,'github-repo-latest');
cpSync(resolve(here,'..','github-repo-latest'),out,{recursive:true});
const flowDir=join(out,'references','flows','repo-latest');
const keep=resolve(keepDir);rmSync(keep,{recursive:true,force:true});mkdirSync(keep,{recursive:true});
const state=createStore(join(keep,'state')),healStore=createStore(join(keep,'heal'));
let tab=openTab();
const mkArgs=(t,sunk)=>{
  const web=createWebRuntime({browser:t.browser,waitMs:5000,pollMs:150,freshness:false});   // 읽기만 하는 단계 — 지문 비교를 끈다(규약 §2)
  const probe=createWebProbe({browser:t.browser,mask:JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8')).mask});
  const doc=()=>JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8'));
  return {web,args:{flowDir,playbookDir:out,state,healStore,from:'S02',to:'S02',runtime:web,account:'guest',task:'repo-latest',maxAttempts:3,
    sink:async(d,n,v)=>{sunk[n]=v;},
    observe:async r=>probe.observe({step:loadMap(flowDir).steps.find(s=>s.id===r.step)}),
    verifyStep:async vs=>{const ok=await web.judgeScreen(vs);return ok?web.perform(vs):{ok:false};},
    regress:async(pd,c)=>{const st=pd.steps.find(s=>s.id===c.stepId);const bad=(st.elements||[]).filter(e=>{try{return t.browser.evalJs(`document.querySelectorAll(${JSON.stringify(e.find)}).length`)!==1;}catch{return true;}});return [{name:'요소 선택자 유일성',covers:[c.stepId],ok:bad.length===0}];},
    recapture:async patched=>recaptureStep({browser:t.browser,doc:doc(),step:patched})
  }};
};
let pass=true;
try{
  // ① 손상 전 정상 주행
  let truthA=await truthOf(REPO);let sunk={};let {args}=mkArgs(tab,sunk);
  const r1=await driveWithHealing({...args,runId:'t06-pre'});
  let truthB=await truthOf(REPO);
  const j1=judge(toOut(sunk),truthA,truthB);
  say(`① 손상 전 주행(${REPO}): status=${r1.status} 치유 호출 ${r1.healCalls} · 정답 대조 ${JSON.stringify(j1.fields)} → ${r1.status==='done'&&r1.healCalls===0&&j1.ok?'정확(치유 없음)':j1.ok&&r1.status==='done'?`값 5/5 정확, 단 치유 ${r1.healCalls}회 필요 — "치유 없는 정상 주행" 조건은 미충족`:'실패'}`);
  if(r1.healCalls>0||r1.status!=='done')say(`   치유 ${JSON.stringify(r1.heals)}${r1.heal?' · 결과 '+JSON.stringify({status:r1.heal.status,reason:r1.heal.reason,kind:r1.heal.diagnosis&&r1.heal.diagnosis.kind}):''}`);
  if(!(r1.status==='done'&&r1.healCalls===0&&j1.ok))pass=false;
  // 손상: 원본 steps.json에서 요소 1(기본 브랜치)의 선택자를 낡은 값으로 — find와 extract.where.selector를 함께(둘은 같아야 한다)
  const p=join(flowDir,'steps.json'),d=JSON.parse(readFileSync(p,'utf8'));
  const s2=d.steps.find(s=>s.id==='S02');const el=s2.elements.find(e=>e.n===ELEMENT);const oldFind=el.find;
  el.find=STALE;for(const x of s2.extract)if(x.where&&x.where.selector===oldFind)x.where.selector=STALE;
  writeFileSync(p,JSON.stringify(d,null,1)+'\n');buildFlow(flowDir);
  const fresh=checkAgentFresh(flowDir);
  const present=String(tab.browser.evalJs(`document.querySelectorAll(${JSON.stringify(STALE)}).length`));
  say(`손상: 요소 ${ELEMENT} 선택자를 현재 화면에 없는 값으로 바꾸고 buildFlow 재생성 — checkAgentFresh ${fresh.ok?'통과':'실패 '+JSON.stringify(fresh.problems)} · 실제 DOM에서 그 선택자 ${present}개`);
  if(!fresh.ok||present!=='0')pass=false;
  // ② 손상 직후 — 치유 없는 주행이 해당 단계에서 멈추고 진단 종류를 낸다
  tab=openTab();({args}=mkArgs(tab,sunk={}));
  const r2=await drive({flowDir,runId:'t06-damaged',runtime:args.runtime,state,sink:args.sink,from:'S02',to:'S02',approvalCtx:{account:'guest',task:'repo-latest',flow:'repo-latest'}});
  say(`② 손상 직후 주행(치유 없음): status=${r2.status} 단계 ${r2.step} 진단 ${JSON.stringify(r2.report?{element:r2.report.element,reason:r2.report.reason}:r2.reason)} · 넘긴 값 ${Object.keys(sunk).length}개`);
  // 기대: 해당 단계(S02)에서 손상한 요소(1)를 못 찾아(missing) 멈추고 값은 하나도 넘기지 않는다
  if(!(r2.status==='conflict'&&r2.step==='S02'&&r2.report&&r2.report.element===ELEMENT&&r2.report.reason==='missing'&&Object.keys(sunk).length===0))pass=false;
  // ③ 자가 복구·반영
  ({args}=mkArgs(tab,sunk={}));
  truthA=await truthOf(REPO);
  const r3=await driveWithHealing({...args,runId:'t06-heal'});
  truthB=await truthOf(REPO);
  const after=JSON.parse(readFileSync(p,'utf8')).steps.find(s=>s.id==='S02').elements.find(e=>e.n===ELEMENT).find;
  const hist=readFileSync(join(out,'references','history.md'),'utf8');
  const fresh3=checkAgentFresh(flowDir);
  const pend=pendingHumanChecks({historyPath:join(out,'references','history.md')});
  say(`③ 자가 복구 주행: status=${r3.status} 치유 호출 ${r3.healCalls} · 치유 ${JSON.stringify(r3.heals)}${r3.heal?' · 결과 '+JSON.stringify({status:r3.heal.status,reason:r3.heal.reason,kind:r3.heal.diagnosis&&r3.heal.diagnosis.kind}):''}`);
  say(`   반영: steps.json 요소 ${ELEMENT} 선택자 ${after===STALE?'그대로(낡은 값)':after===oldFind?'원래 선택자로 복구':'새 선택자 '+after} · 지도 최신 ${fresh3.ok} · history S02 항목 ${/S02 ·/.test(hist)} · 사람 확인 대기 ${pend.filter(x=>x.step==='S02').length}건`);
  const j3=judge(toOut(sunk),truthA,truthB);
  say(`   복구 주행 값 정답 대조 ${JSON.stringify(j3.fields)}`);
  const healed=r3.status==='done'&&r3.heals.some(h=>h.status==='applied')&&after!==STALE&&fresh3.ok&&/S02 ·/.test(hist)&&j3.ok;
  if(!healed){pass=false;say('   → 복구하지 못했다 — T-4 미충족(이유는 위 치유 결과)');}
  else{
    // ④ 새 탭·새 실행 — 진단 없이 통과
    tab=openTab();({args}=mkArgs(tab,sunk={}));
    truthA=await truthOf(REPO);
    const r4=await driveWithHealing({...args,runId:'t06-post'});
    truthB=await truthOf(REPO);
    const j4=judge(toOut(sunk),truthA,truthB);
    say(`④ 반영 뒤 재주행: status=${r4.status} 치유 호출 ${r4.healCalls} · 정답 대조 ${JSON.stringify(j4.fields)} → ${r4.status==='done'&&r4.healCalls===0&&j4.ok?'정확':'실패'}`);
    if(!(r4.status==='done'&&r4.healCalls===0&&j4.ok))pass=false;
  }
  // 학습 산출물(history·steps.json·지도)도 유출 검사 대상으로 보존한다
  cpSync(out,join(keep,'playbook'),{recursive:true});
}finally{for(const pg of pages){try{orca('tab','close','--page',pg);}catch{}}rmSync(work,{recursive:true,force:true});}
say(`판정: ${pass?'T-4 충족':'T-4 미충족'}`);
if(outFile)writeFileSync(resolve(outFile),lines.join('\n')+'\n');
process.exitCode=pass?0:1;   // 미충족이면 실행도 실패로 끝난다
