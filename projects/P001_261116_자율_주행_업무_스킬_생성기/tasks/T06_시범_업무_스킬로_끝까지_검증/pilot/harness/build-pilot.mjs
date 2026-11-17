// 시범 플레이북 만들기(T06) — pace-playbook-maker 도구로 처음부터: 인터뷰 기록 → 흐름 뼈대 → 실제 GitHub 화면 수행·가림 캡처(대기) → [사람 확인] → 승인 → 생성.
// 두 단계로 나눈다: `capture`는 대기 이미지까지 만들고 멈춘다(경로·해시를 출력), 사람이 이미지를 확인한 뒤 `finish --sha <확인한 해시>`로 승인·생성한다.
// 작업 폴더는 저장소 밖 임시 폴더(PILOT_WORK 또는 기본 임시 경로) — 인터뷰·대기 파일은 산출물에 들어가지 않는다.
// 사용: node build-pilot.mjs capture | node build-pilot.mjs finish --sha <해시> --out <플레이북 출력 폴더>
import {mkdirSync,existsSync,rmSync,readFileSync,cpSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyRound2} from './round2.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');   // 저장소 루트(…/tasks/T06…/pilot/harness → 6단계 위)
const T=join(ROOT,'skills','pace-playbook-maker','tools');
const imp=f=>import(new URL('file:///'+join(T,f).replace(/\\/g,'/')).href);
const {createStore,createOrcaBrowser,captureStep,approvePending,observeStep,orcaExe}=await imp('orca-adapter.mjs');
const {saveInterview,checkInterview}=await imp('interview.mjs');
const {initFlow}=await imp('scaffold.mjs');
const {generatePlaybook,checkPlaybook}=await imp('playbook.mjs');
const {buildFlow,reviewHash}=await imp('build.mjs');
const {contentHash}=await imp('agent-map.mjs');

const WORK=process.env.PILOT_WORK||join(tmpdir(),'pace-t06-pilot-work');
const PENDING=join(WORK,'pending');
const FLOW='repo-latest',NAME='github-repo-latest';
const LEARN_REPO='ceo4ever/pace';
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const mode=process.argv[2];
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const orca=(...a)=>{const r=spawnSync(orcaExe(),[...a,'--json'],{encoding:'utf8',timeout:90000});const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;};

// 인터뷰 답(값이 아니라 형태·출처·이름) — 한 번에 한 질문으로 받은 답을 모은 기록
const interview={
  goal:'공개 GitHub 저장소 페이지에서 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 읽어 표로 낸다',
  scope:'로그인 없이 저장소 첫 화면을 읽는 조회까지(쓰기·별 누르기·포크·로그인·API 직접 호출 제외)',
  inputs:[{name:'저장소',form:'문자열',source:'user'}],
  outputs:[
    {name:'기본 브랜치',format:'문자열',sensitivity:'public',deliverTo:'result-table'},
    {name:'별 개수',format:'문자열',sensitivity:'public',deliverTo:'result-table'},
    {name:'최신 커밋 해시',format:'문자열',sensitivity:'public',deliverTo:'result-table'},
    {name:'최신 커밋 제목',format:'문자열',sensitivity:'public',deliverTo:'result-table'},
    {name:'최신 커밋 날짜',format:'문자열',sensitivity:'public',deliverTo:'result-table'}],
  resultTo:'result-table',
  services:[{alias:'github',kind:'web',origin:'https://github.com',auth:{method:'none',source:'로그인 없음(공개 저장소 익명 열람)'}}],
  success:['표에 기본 브랜치·별 개수·최신 커밋 해시·제목·날짜 다섯 항목이 모두 채워진다','값이 저장소 페이지에 보이는 것과 같다'],
  noRiskyActions:true,riskyActions:[],
  exceptions:['페이지가 늦게 열린다','쿠키·알림 안내 창이 뜬다','저장소가 없거나 비공개라 404가 나온다'],frequency:'필요할 때',
  privacy:{kinds:[],handling:'공개 정보만 다룬다 — 계정·개인정보 없음. 커밋 작성자 이름은 읽지 않고 화면 캡처에서 가린다'},
  humanPoints:[{step:'S02',reason:'ambiguous'}]
};

const work=createStore(WORK);

if(mode==='capture'){
  rmSync(WORK,{recursive:true,force:true});mkdirSync(PENDING,{recursive:true});
  saveInterview({workDir:WORK,interview,store:work});
  const chk=checkInterview(work.readJson('interview.json'));
  if(!chk.complete)throw new Error('인터뷰 불완전: '+chk.missing.join(',')+' '+chk.problems.join(' / '));
  const {dir:flowDir}=initFlow({workDir:WORK,flow:FLOW,interview,allowedPaths:['/{owner}/{repo}']});
  const flow=createStore(flowDir);
  const d=flow.readJson('steps.json');d.allowedPaths=['/{owner}/{repo}'];   // 웹 흐름 — 접근 경로는 저장소 페이지 한 모양뿐(템플릿)
  // 가림: 읽어 올 값 영역 전부(캡처 이미지에 값이 남지 않게) + 커밋 작성자·아바타
  // 가림: 읽어 올 값이 보이는 **모든 위치** — 대상 요소뿐 아니라 About의 별 개수(정규식)·파일 목록 각 행의 커밋 제목·시간·커밋 링크·상대 시간까지(같은 값이 여러 곳에 보인다)
  d.mask=['#ref-picker-repos-header-ref-selector','[data-testid="star-button"]','[data-testid="latest-commit"]','[data-testid="latest-commit-details"]','[data-testid="directory-content"]','[data-testid="author-link"]','[data-testid="github-avatar"]','relative-time','a[href*="/commit/"]','[class*="insightItem"]','re:\\d[\\d.,]*[kKmM]?\\s+stars?'];
  d.steps.push({id:'S01',title:'저장소 페이지 열기',risk:'read',lane:'both',tool:'orca',command:'orca tab create --url https://github.com/<owner/repo>',
    purpose:'입력한 공개 저장소의 첫 화면을 연다',enter:'새 탭이 열려 있다',
    identify:{title:'저장소 첫 화면',anchors:['저장소 이름 머리글이 보인다','Code 탭이 보인다']},
    screen:{url:'^/[^/]+/[^/]+/?$',require:['[data-testid="repo-name-link"]'],forbid:[]},
    elements:[],success:'저장소 페이지가 열려 머리글에 저장소 이름이 보인다',escalate:'404가 나오거나 로그인을 요구한다',
    capture:false,captureNote:'열기만 하는 단계라 기준 화면은 다음 단계에서 찍는다',status:'todo'});
  d.steps.push({id:'S02',title:'저장소 요약 읽기',risk:'read',lane:'forward',tool:'orca',
    purpose:'기본 브랜치·별 개수·최신 커밋을 화면에서 읽는다',enter:'S01 성공',
    identify:{title:'저장소 첫 화면',anchors:['최신 커밋 줄이 보인다','별(Star) 단추가 보인다']},
    screen:{url:'^/[^/]+/[^/]+/?$',require:['[data-testid="latest-commit"]'],forbid:[]},
    elements:[
      {n:1,label:'기본 브랜치',find:'#ref-picker-repos-header-ref-selector',action:'읽기',wait:'없음',expect:'브랜치 이름이 보인다',onChange:'멈춘다'},
      {n:2,label:'별 개수',find:'[data-testid="star-button"]',action:'읽기',wait:'없음',expect:'Star 옆에 개수가 보인다(예 124k)',onChange:'멈춘다'},
      {n:3,label:'최신 커밋 제목',find:'[data-testid="latest-commit-html"]',action:'읽기',wait:'없음',expect:'비어 있지 않다',onChange:'멈춘다'},
      {n:4,label:'최신 커밋 링크',find:'[data-testid="latest-commit-details"] a[href*="/commit/"]',action:'읽기',wait:'없음',expect:'링크 글자가 7자 해시다',onChange:'멈춘다'},
      {n:5,label:'최신 커밋 날짜',find:'[data-testid="latest-commit-details"] relative-time',action:'읽기',wait:'없음',expect:'datetime 속성(UTC 시각)이 있다',onChange:'멈춘다'}],
    maskRequire:['[data-testid="latest-commit"]'],
    extract:[
      {name:'기본 브랜치',where:{selector:'#ref-picker-repos-header-ref-selector'},format:'문자열',sensitivity:'public',deliverTo:'result-table',verify:'비어 있지 않음'},
      {name:'별 개수',where:{selector:'[data-testid="star-button"]'},format:'문자열',sensitivity:'public',deliverTo:'result-table',verify:'숫자 또는 k·m 표기'},
      {name:'최신 커밋 해시',where:{selector:'[data-testid="latest-commit-details"] a[href*="/commit/"]'},format:'문자열',sensitivity:'public',deliverTo:'result-table',verify:'링크 글자(7자 해시) — 링크 주소 끝 전체 해시의 앞 7자와 같다'},
      {name:'최신 커밋 제목',where:{selector:'[data-testid="latest-commit-html"]'},format:'문자열',sensitivity:'public',deliverTo:'result-table',verify:'비어 있지 않음'},
      {name:'최신 커밋 날짜',where:{selector:'[data-testid="latest-commit-details"] relative-time'},format:'문자열',sensitivity:'public',deliverTo:'result-table',verify:'datetime 속성의 UTC 날짜'}],
    success:'다섯 값이 모두 읽힌다',escalate:'선택자가 하나라도 없다 — 화면이 바뀐 것이다',status:'todo'});
  flow.writeJson('steps.json',d);
  // 실제 화면 수행
  // 로그인 없는 격리 프로필에서만 연다 — 기본 프로필은 사용자의 로그인 상태를 담고 있다
  const prof=orca('tab','profile','list').profiles.find(x=>x.label==='pace-t06-guest');
  if(!prof)throw new Error('게스트 프로필(pace-t06-guest)이 없다 — orca tab profile create --label pace-t06-guest --scope isolated');
  const page=orca('tab','create','--url','https://github.com/'+LEARN_REPO,'--profile',prof.id).browserPageId;
  for(let i=0;i<40;i++){sleep(700);try{const r=orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')");if(r.result==='true'||r.result===true)break;}catch{/* 로드 중 */}}
  orca('viewport','--page',page,'--width','1280','--height','900','--scale','1');sleep(1500);
  const login=orca('eval','--page',page,'--expression',"JSON.stringify({signin:!!document.querySelector('a[href^=\"/login\"]'),user:!!(document.querySelector('meta[name=\"user-login\"]')||{}).content})").result;
  if(JSON.parse(login).user||!JSON.parse(login).signin)throw new Error('로그인 상태가 아닌 화면이어야 한다(로그아웃 확인 실패)');
  const browser=createOrcaBrowser({page});
  const pending=createStore(PENDING);
  const step=flow.readJson('steps.json').steps.find(s=>s.id==='S02');
  const expects=step.elements.map(e=>({find:e.find,state:'visible'}));
  const cap=captureStep({browser,pending,doc:{mask:flow.readJson('steps.json').mask},step,actions:[],expects});
  console.log(JSON.stringify({page,work:WORK,pendingImage:pending.path('S02.jpg'),sha:cap.sha,note:'이미지를 사람이 확인한 뒤 finish --sha <해시>'}));
}else if(mode==='finish'){
  const sha=arg('--sha'),out=arg('--out');
  if(!sha||!out)throw new Error('--sha와 --out이 필요하다');
  const flowDir=join(WORK,'flows',FLOW),flow=createStore(flowDir),pending=createStore(PENDING);
  if(pending.exists('S02.jpg'))approvePending({pending,flow,stepId:'S02',sha,now:new Date().toISOString().slice(0,10)});   // 이미 승인됐으면(재실행) 건너뛴다
  // 서술·합의 문자열 사람 확인 해시(valueReview) — 시범은 캡틴 위임이라 확인자를 기록에 그대로 적는다
  const d=applyRound2(flow.readJson('steps.json'));d.allowedPaths=['/{owner}/{repo}'];   // 웹 흐름 — 접근 경로는 저장소 페이지 한 모양뿐(템플릿) · 2라운드 보완(round2.mjs)
  const s2=d.steps.find(s=>s.id==='S02');if(!s2.shotHash||!s2.shotHash.startsWith(sha))throw new Error('승인된 캡처 해시가 --sha와 다르다 — 사람이 확인한 해시로만 생성한다');
  d.valueReview={date:new Date().toISOString().slice(0,10),reviewer:'시범 작성(에이전트) — 서술·합의 문자열 사람 확인 대기',note:'공개 정보만 다루는 시범 업무',contentHash:contentHash(d)};
  flow.writeJson('steps.json',d);
  const target=resolve(out);if(existsSync(target))rmSync(target,{recursive:true,force:true});mkdirSync(dirname(target),{recursive:true});
  try{generatePlaybook({workDir:WORK,outDir:target,name:NAME});}catch(e){console.error('생성 실패:',e.message);process.exit(1);}
  const chk=checkPlaybook(target,{name:NAME});
  console.log(JSON.stringify({generated:target,check:chk}));
  if(!chk.ok)process.exit(1);
}else{
  console.error('사용: capture | finish --sha <해시> --out <폴더>');process.exit(2);
}
