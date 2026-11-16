// T03 S-7·S-7c(e2e): Orca 실제 브라우저로 민감 값 주입 작성 시나리오 — 인터뷰 → 흐름 뼈대 → 수행·관찰·캡처·승인 → API 단계 → 플레이북 생성.
// 화면·가짜 API 응답·인터뷰 답에 합성 민감 값을 넣고, 각 단계 직후 도구가 만든 모든 파일에 원문이 없는지 보고
// 캡처 이미지는 픽셀로 검증한다(가림 색이 덮였는가, 가림 없이 찍은 대조군에서는 같은 검사가 실패하는가).
// Orca가 없으면 건너뛴다. 마감 증거는 Orca에서 실행한 결과(evidence/e2e-playbook.txt).
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,statSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createStore,createOrcaBrowser,captureStep,approvePending,observeStep,orcaExe} from '../../skills/pace-playbook-maker/tools/orca-adapter.mjs';
import {initFlow,addApiStep} from '../../skills/pace-playbook-maker/tools/scaffold.mjs';
import {checkInterview,saveInterview} from '../../skills/pace-playbook-maker/tools/interview.mjs';
import {generatePlaybook,checkPlaybook} from '../../skills/pace-playbook-maker/tools/playbook.mjs';
import {sensitiveKinds} from '../../skills/pace-playbook-maker/tools/sensitive.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {CaptureRefused} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
import {tmp,cleanup} from './t03-helpers.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const PAGE=pathToFileURL(join(here,'..','fixtures','playbook','service-page.html')).href;
const exe=orcaExe();
const orca=(...args)=>{
  let last;
  for(let i=0;i<4;i++){
    const r=spawnSync(exe,[...args,'--json'],{encoding:'utf8',timeout:60000});
    try{if(r.error)throw r.error;const j=JSON.parse(r.stdout);if(!j.ok)throw new Error(`orca ${args[0]} 실패`);return j.result;}catch(e){last=e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);}
  }
  throw last;
};
const available=process.env.PACE_SKIP_BROWSER_E2E==='1'?false:(()=>{try{orca('tab','list');return true;}catch{return false;}})();
const pages=[];
after(()=>{for(const p of pages){try{orca('tab','close','--page',p);}catch{/* 이미 닫힘 */}}cleanup();});
const log=(...a)=>console.log('[e2e-playbook]',...a);

// 합성 민감 값(조각으로 만든다)
const RRN=['900101','1234567'].join('-');
const ACCT=['1002','123','456789'].join('-');
const PW=['pass','word=','hunter2','value'].join('');
const SECRETS=[RRN,ACCT,PW,'hunter2value','1234567'.slice(0)];
const hasSecret=text=>SECRETS.some(s=>text.includes(s));

// 디렉터리 스냅샷(상대 경로 → 크기·수정시각) — 단계 직후 새로 생기거나 바뀐 파일만 스캔한다
const snap=dirs=>{const m=new Map();for(const d of dirs){if(!existsSync(d))continue;const walk=p=>readdirSync(p,{withFileTypes:true}).forEach(e=>{const f=join(p,e.name);if(e.isDirectory())walk(f);else{const s=statSync(f);m.set(f,s.mtimeMs+':'+s.size);}});walk(d);}return m;};
function scanNew(before,dirs,label){
  const after_=snap(dirs);const fresh=[];
  for(const [f,sig] of after_)if(before.get(f)!==sig)fresh.push(f);
  for(const f of fresh){
    const buf=readFileSync(f);
    assert.ok(!hasSecret(buf.toString('latin1'))&&!hasSecret(buf.toString('utf8')),`${label}: 합성 값 원문이 파일에 있다: ${f}`);
  }
  log(label,'새·변경 파일',fresh.length,'개 — 원문 0건');
  return after_;
}

// 저장된 JPEG을 data URL로 빈 탭의 캔버스에 올려 영역 평균 색을 잰다(독립 검사)
function meanColor(blankPage,jpeg,box){
  const url='data:image/jpeg;base64,'+jpeg.toString('base64');
  const expr=`(async()=>{const img=new Image();img.src=${JSON.stringify(url)};await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(${box.x},${box.y},${box.w},${box.h}).data;let r=0,gg=0,b=0,n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];}return JSON.stringify({w:img.width,h:img.height,r:r/n,g:gg/n,b:b/n});})()`;
  const res=orca('eval','--page',blankPage,'--expression',expr).result;
  return JSON.parse(JSON.parse(res)===res?res:typeof JSON.parse(res)==='string'?JSON.parse(res):res);
}
const near=(c,t,tol)=>Math.abs(c.r-t[0])<tol&&Math.abs(c.g-t[1])<tol&&Math.abs(c.b-t[2])<tol;
const MASK_COLOR=[71,85,105],ORIGINAL=[253,224,71];   // 가림 색(#475569)·합성 값 영역의 원래 배경(#fde047)

test('S-7·S-7c 민감 값 주입 작성: 인터뷰·화면·API 응답의 합성 값이 도구가 만든 어떤 파일에도 없고, 캡처 이미지는 픽셀로 가려졌다', {skip:available?false:'Orca 브라우저 CLI를 쓸 수 없어 건너뜀(마감 증거는 Orca에서 실행한 결과)'}, ()=>{
  const blank=orca('tab','create','--url','about:blank').browserPageId;pages.push(blank);
  const page=orca('tab','create','--url',PAGE).browserPageId;pages.push(page);   // 마지막이 활성 탭
  orca('wait','--page',page,'--selector','#q');
  orca('viewport','--page',page,'--width','320','--height','240','--scale','1');
  const browser=createOrcaBrowser({page});

  const workDir=tmp('pace-t03-e2e-work-'),pendingDir=join(tmp('pace-t03-e2e-pend-'),'pending');mkdirSync(pendingDir,{recursive:true});
  const work=createStore(workDir),pending=createStore(pendingDir);
  const dirs=[workDir,pendingDir];
  const tmpBefore=new Set(readdirSync(tmpdir()).filter(f=>/^pace-playbook-/.test(f)));
  let state=snap(dirs);

  // 1) 인터뷰: 사용자가 실값을 말했지만 기록에는 종류만 남는다
  const answer=`제 주민번호는 ${RRN}이고 계좌는 ${ACCT}, 로그인은 ${PW} 로 합니다`;
  const kinds=sensitiveKinds(answer);
  assert.ok(kinds.length>=3,`종류 탐지: ${kinds}`);
  const iv={goal:'가상 서비스 조회 결과를 결과 시트로 넘긴다',scope:'가상 서비스의 조회 화면과 전송 API까지',
    inputs:[{name:'조회어',form:'문자열',source:'user'}],outputs:[{name:'조회 결과',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'},{name:'전송 결과',format:'선택값',sensitivity:'public'}],resultTo:'result-sheet',
    services:[{alias:'svc',kind:'web',origin:'https://app.example.test',auth:{method:'env-token',source:'SVC_TOKEN'}}],
    success:['조회 결과 영역이 나타난다'],riskyActions:[{name:'결과 전송',irreversible:true,gate:'사람의 전송 승인 한마디 필요'}],
    exceptions:['공지 창이 늦게 뜬다'],frequency:'주 1회',privacy:{kinds,handling:'값은 결과 저장 위치로만 넘기고 기록에는 종류만 남긴다'},humanPoints:[{step:'S01',reason:'auth'}]};
  assert.deepEqual(checkInterview(iv),{complete:true,missing:[],problems:[]});
  // 실값을 그대로 적은 기록은 저장 단계에서 거부된다(쓰기 전에 막히므로 파일이 생기지 않는다)
  assert.throws(()=>work.writeJson('interview-raw.json',{...iv,privacy:{kinds,handling:answer}}),/민감 형식 거부/);
  assert.ok(!work.exists('interview-raw.json'));
  saveInterview({workDir,interview:iv,store:work});   // 최초 저장도 쓰기 전 검사를 거친다
  state=scanNew(state,dirs,'인터뷰');

  // 2) 흐름 뼈대
  const {dir:flowDir}=initFlow({workDir,flow:'svc',interview:iv,allowedPaths:['/api/{id}/send']});
  const flow=createStore(flowDir);
  const d0=flow.readJson('steps.json');
  d0.mask=['#result'];
  d0.steps.push({id:'S01',title:'조회',risk:'read',tool:'reader.mjs',purpose:'조회 결과를 읽는다',enter:'새 탭이 열려 있다',
    identify:{title:'가상 서비스',anchors:['조회 버튼이 보인다']},screen:{url:'^/.*service-page\\.html$',require:['#go'],forbid:[]},
    elements:[{n:1,label:'결과 영역',find:'#result',action:'조회를 눌러 연다',wait:'결과가 보인다',expect:'값이 있다',onChange:'멈춘다'}],
    maskRequire:['#result'],
    extract:[{name:'조회 결과',where:{selector:'#result'},format:'문자열',sensitivity:'masked',deliverTo:'result-sheet',verify:'비어 있지 않음'}],
    success:'결과 영역이 나타난다',escalate:'결과 영역이 나타나지 않는다',status:'todo'});
  flow.writeJson('steps.json',d0);
  state=scanNew(state,dirs,'흐름 뼈대');

  const actions=[{type:'fill',find:'#q',value:'<조회어>'},{type:'click',find:'#go'}];
  const expects=[{find:'#result',state:'visible'},{find:'#result',state:'filled'}];
  const stepNow=()=>flow.readJson('steps.json').steps.find(s=>s.id==='S01');
  const doc=()=>({mask:flow.readJson('steps.json').mask});
  const reload=()=>{orca('goto','--page',page,'--url',PAGE);orca('wait','--page',page,'--selector','#q');orca('viewport','--page',page,'--width','320','--height','240','--scale','1');};

  // 3) S-7c 수행하며 기록 검증: 액션 생략·잘못된 대상·잘못된 추출은 기록·승인이 거부된다(대기 파일 0개)
  const refused=(args)=>{try{captureStep({browser,pending,doc:doc(),...args});return null;}catch(e){return e;}};
  reload();
  let e=refused({step:stepNow(),actions:[actions[0]],expects});                   // 조회를 누르지 않음 → 결과가 나타나지 않는다
  assert.ok(e instanceof CaptureRefused&&e.code==='observe_failed','액션 생략은 거부');assert.deepEqual(pending.list(),[]);
  reload();
  e=refused({step:stepNow(),actions:[actions[0],{type:'click',find:'#goo'}],expects}); // 잘못된 대상
  assert.ok(e&&e.code==='observe_failed','잘못된 대상은 거부');assert.deepEqual(pending.list(),[]);
  reload();
  const badExtract={...stepNow(),extract:[{...stepNow().extract[0],where:{selector:'#nothing'}}]};
  e=refused({step:badExtract,actions,expects});                                      // 잘못된 추출 선택자
  assert.ok(e&&e.code==='extract_unlinked','잘못된 추출은 거부');assert.deepEqual(pending.list(),[]);
  const obsOnly=(()=>{reload();return observeStep({browser,actions,expects});})();
  assert.deepEqual(obsOnly,{ok:true,failed:[]},'정상 관찰은 불리언뿐');
  state=scanNew(state,dirs,'거부 시나리오');

  // 4) 정상: 수행 → 가림 캡처 → 대기 → 승인
  reload();
  const cap=captureStep({browser,pending,doc:doc(),step:stepNow(),actions,expects});
  state=scanNew(state,dirs,'캡처(대기)');
  const jpg=pending.read('S01.jpg');
  const meta=pending.readJson('S01.json');
  assert.equal(meta.record.elementsMasked['1'],true,'요소 전체가 가림 영역에 덮였다는 코어 증거');
  approvePending({pending,flow,stepId:'S01',sha:cap.sha,now:'2026-11-16'});
  state=scanNew(state,dirs,'승인');
  assert.deepEqual(pending.list(),[]);

  // 5) 이미지 픽셀 검증 — 저장된 shots/S01.jpg의 합성 값 영역(10,60 300x100)을 독립적으로 잰다
  const saved=flow.read('shots/S01.jpg');
  const REGION={x:110,y:90,w:100,h:30};                  // 영역 한가운데(가림 글자·태그와 겹치지 않는 곳)
  const masked=meanColor(blank,saved,REGION);
  log('저장 이미지',masked.w+'x'+masked.h,'영역 평균 색',JSON.stringify({r:+masked.r.toFixed(0),g:+masked.g.toFixed(0),b:+masked.b.toFixed(0)}));
  assert.ok(near(masked,MASK_COLOR,40),'저장 이미지의 합성 값 영역이 가림 색이 아니다');
  assert.ok(!near(masked,ORIGINAL,60),'저장 이미지에 원래 배경이 보인다');
  // 대조군: 가림 오버레이 없이 찍은 이미지는 같은 검사가 실패해야 한다(검사의 검출력)
  reload();observeStep({browser,actions,expects});
  const rawPath=browser.screenshot();
  const rawBytes=readFileSync(rawPath);browser.discard(rawPath);
  const control=meanColor(blank,rawBytes,REGION);
  log('대조군(가림 없음) 영역 평균 색',JSON.stringify({r:+control.r.toFixed(0),g:+control.g.toFixed(0),b:+control.b.toFixed(0)}));
  assert.ok(near(control,ORIGINAL,40),'대조군이 원래 배경이 아니다');
  assert.ok(!near(control,MASK_COLOR,40),'대조군에서 가림 검사가 통과해 버린다 — 검출력이 없다');

  // 6) API 단계: 가짜 응답 객체(합성 값 포함)에서 경로·형태만 기록
  const observed={result:{status:'sent',ref:RRN,account:ACCT,secret:PW},count:1};
  addApiStep({flowDir,observedResponse:observed,step:{id:'S02',title:'결과 전송',risk:'r1',gate:'사람의 전송 승인 한마디 필요',tool:'sender.mjs',purpose:'결과를 보낸다',enter:'S01 성공 + 승인',
    identify:{anchors:['API 단계']},api:{method:'POST',endpoint:'https://app.example.test/api/{id}/send',request:[{name:'x-target',in:'header',role:'target',form:'<대상 식별자>'}],successStatus:'202'},
    extract:[{name:'전송 결과',where:{apiPath:'result.status'},format:'선택값',sensitivity:'public',verify:'값이 완료 상태'}],
    success:'202와 완료 상태',escalate:'거절 응답',status:'todo'}});
  state=scanNew(state,dirs,'API 단계');

  // 7) 확인 기록 + 생성
  const d=flow.readJson('steps.json');
  d.valueReview={date:'2026-11-16',reviewer:'검토자',note:'값 자리는 자리표시뿐 — 가상 표본',contentHash:'0'.repeat(64)};
  d.valueReview.contentHash=contentHash(d);
  flow.writeJson('steps.json',d);
  const outDir=join(tmp('pace-t03-e2e-out-'),'svc-playbook');
  generatePlaybook({workDir,outDir,name:'svc-playbook'});
  const outFiles=snap([outDir]);
  for(const f of outFiles.keys()){const b=readFileSync(f);assert.ok(!hasSecret(b.toString('latin1'))&&!hasSecret(b.toString('utf8')),`생성물에 합성 값 원문: ${f}`);}
  log('생성물 파일',outFiles.size,'개 — 원문 0건');
  assert.deepEqual(checkPlaybook(outDir),{ok:true,problems:[]});
  state=scanNew(state,dirs,'생성 뒤 작업·대기 폴더');
  // 생성 중 쓴 임시 폴더는 남지 않는다
  const tmpAfter=readdirSync(tmpdir()).filter(f=>/^pace-playbook-/.test(f)&&!tmpBefore.has(f));
  assert.deepEqual(tmpAfter,[],'생성 임시 폴더가 남았다');
  // 보호 저장소가 기록한 모든 쓰기 경로에도 값이 없다
  for(const p of [...work.writes,...pending.writes,...flow.writes])assert.ok(!hasSecret(p),'쓰기 경로에 값');
  // API 응답 값은 지도·steps.json 어디에도 없고 api.response는 경로·형태뿐
  const api=JSON.parse(readFileSync(join(outDir,'references','flows','svc','agent','S02.json'),'utf8')).api;
  assert.deepEqual(api.response.map(r=>r.path).sort(),['count','result.account','result.ref','result.secret','result.status']);
  assert.ok(api.response.every(r=>['문자열','숫자'].includes(r.type)));
  log('완료 — 인터뷰·화면·API 응답의 합성 민감 값이 어떤 파일에도 남지 않았고 캡처는 픽셀로 가려짐을 확인');
});
