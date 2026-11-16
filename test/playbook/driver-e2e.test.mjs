// T04 S-8(e2e): T03 생성기로 만든 가상 플레이북을 규약대로 끝까지 주행한다.
//  - API 흐름(로컬 가짜 서버): 승인 없으면 POST 0회 멈춤 → 승인 뒤 정확히 1회 → 재주행(standing)은 묻지 않음, 허용 밖·리다이렉트 호출 0, 운영 명령도 같은 관문.
//  - 브라우저 흐름(Orca 실제 브라우저): 늦은 덮개 닫기·입력·클릭·지연된 결과 대기·추출 전달, 값은 sink에만.
// 브라우저 흐름은 Orca가 없으면 건너뛴다. 마감 증거는 Orca에서 실행한 결과(evidence/e2e-driving.txt).
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {drive,driveOperation,recordApproval,createApiRuntime,createWebRuntime,loadMap} from '../../skills/pace-playbook-maker/tools/driver.mjs';
import {createStore,createOrcaBrowser,orcaExe} from '../../skills/pace-playbook-maker/tools/orca-adapter.mjs';
import {generatePlaybook,checkPlaybook} from '../../skills/pace-playbook-maker/tools/playbook.mjs';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {fixtureInterview,alignFlow,makeWork,tmp,cleanup,readJson,writeJson} from './t03-helpers.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const PAGE=pathToFileURL(join(here,'..','fixtures','playbook','driver-page.html')).href;
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
const pages=[];let server=null;
after(()=>{for(const p of pages){try{orca('tab','close','--page',p);}catch{/* 이미 닫힘 */}}if(server)server.close();cleanup();});
const log=(...a)=>console.log('[e2e-driving]',...a);

// 합성 민감 값(조각으로 만든다) — 화면에 뜨는 값과 같다
const RRN=['900101','1234567'].join('-');
const hasSecret=text=>text.includes(RRN)||text.includes('1234567');
const filesOf=d=>existsSync(d)?readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesOf(join(d,e.name)):[join(d,e.name)]):[];

// ---- 로컬 가짜 API 서버 ----
function startServer(){
  const hits=[];
  const srv=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://x');hits.push({method:req.method,path:u.pathname,org:req.headers['x-target-org']});
    req.resume();
    if(req.method==='POST'&&/^\/organizations\/[^/]+\/documents\/redir\/send$/.test(u.pathname)){res.writeHead(302,{Location:'/evil'});res.end();return;}
    if(req.method==='POST'&&/^\/organizations\/[^/]+\/documents\/[^/]+\/send$/.test(u.pathname)){res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({result:{status:'완료'}}));return;}
    res.writeHead(404);res.end();
  });
  return new Promise(ok=>srv.listen(0,'127.0.0.1',()=>ok({srv,hits,origin:`http://127.0.0.1:${srv.address().port}`})));
}

// 생성기로 플레이북을 만든다: 인터뷰(원본 origin = 로컬 서버)·흐름은 T03 fixture를 합의에 맞춘 것, 브라우저 단계(S01)는 가상 페이지용으로 바꾼다.
function makePlaybook(origin){
  const iv=fixtureInterview({services:[{alias:'box',kind:'web',origin,auth:{method:'env-token',source:'BOX_TOKEN'}}],
    outputs:[{name:'목록 행',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'},{name:'문서 제목',format:'문자열',sensitivity:'public'},{name:'전송 결과',format:'선택값',sensitivity:'public'},{name:'조회 결과',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'}]});
  const work=makeWork(iv);alignFlow(work,iv);
  const p=join(work,'flows','sample-flow','steps.json'),d=readJson(p);
  const s1=d.steps.find(s=>s.id==='S01');
  s1.title='조회';s1.purpose='가상 조회 화면에서 결과를 읽는다.';s1.command='node reader.mjs query --page <page>';
  s1.screen={url:'^/.*/driver-page\\.html$',require:['#q'],forbid:['.notice-modal']};
  s1.elements=[
    {n:1,label:'조회어',find:'input#q',action:'입력, 조회어',wait:'없음',expect:'값이 들어간다',onChange:'멈춘다'},
    {n:2,label:'조회',find:'button#go',action:'클릭',wait:'없음',expect:'결과가 나타난다',onChange:'멈춘다'},
    {n:3,label:'결과',find:'#result',action:'읽기',wait:'결과가 나타난다',expect:'비어 있지 않다',onChange:'멈춘다'}];
  s1.extract=[{name:'조회 결과',where:{selector:'#result'},format:'문자열',sensitivity:'masked',deliverTo:'result-sheet',verify:'비어 있지 않음'}];
  s1.success='결과가 보인다.';
  d.steps.find(s=>s.id==='S03').risk='read';
  d.run=[{label:'전송 실행',command:'node sender.mjs --page <page>',covers:['S04','S04'],note:'API 한 단계'}];
  d.valueReview.contentHash=contentHash(d);
  writeJson(p,d);buildFlow(join(work,'flows','sample-flow'));
  const out=join(tmp('pace-t04-e2e-out-'),'box-list');
  generatePlaybook({workDir:work,outDir:out,name:'box-list'});
  const flowDir=join(out,'references','flows','sample-flow');
  assert.ok(existsSync(join(flowDir,'agent','index.json')),'생성된 플레이북에 agent/ 지도가 있다');
  return {out,flowDir};
}

const apiStepRuntime=(origin,flowDir,overrides={})=>{
  return createApiRuntime({fetch:(u,i)=>fetch(u,i),params:{path:{orgId:'o1',docId:'d1'},query:{format:'pdf'},headers:{'x-target-org':'o1'}},...overrides});
};
const approvalFor=(flowDir,id,scope,n)=>{const s=loadMap(flowDir).steps.find(x=>x.id===id);return {id:`e2e-${id}-${n}`,stepId:id,actionHash:s.actionHash,sourceHash:s.sourceHash,scope,by:'user',date:'2026-11-16'};};

test('S-8 API 흐름: 승인 없으면 POST 0회 → 승인 뒤 1회 → standing 재주행, 허용 밖·리다이렉트 호출 0, 운영 명령도 같은 관문', async()=>{
  const {srv,hits,origin}=await startServer();server=srv;
  const {flowDir}=makePlaybook(origin);
  const map=loadMap(flowDir);assert.equal(map.ok,true);
  const s4=map.steps.find(s=>s.id==='S04');
  const api=apiStepRuntime(origin,flowDir);
  const store=createStore(tmp('pace-t04-e2e-state-'));
  const sunk=[];const sink=async(dest,name,v)=>{sunk.push([dest,name,v]);};
  const logs=[];const lg=e=>logs.push(JSON.stringify(e));
  const posts=()=>hits.filter(h=>h.method==='POST').length;
  // 1) 승인 없음 — 멈춤, POST 0회
  let r=await drive({flowDir,runId:'a1',from:'S04',runtime:api,approvals:[],state:store,sink,log:lg});
  assert.equal(r.status,'needs-approval');assert.equal(r.step,'S04');assert.match(r.gate,/승인 한마디/);assert.equal(posts(),0);log('승인 없음 → needs-approval, POST',posts());
  // 2) 사용자 승인(standing) 기록 → 정확히 1회
  const ap=approvalFor(flowDir,'S04','standing',1);recordApproval({store,approval:ap});
  const approvals=store.readJson('approvals.json');
  r=await drive({flowDir,runId:'a1',from:'S04',runtime:api,approvals,state:store,sink,log:lg});
  assert.equal(r.status,'done');assert.equal(posts(),1);assert.deepEqual(sunk,[['result-sheet','전송 결과','완료']]);log('승인 뒤 → done, POST',posts());
  // 같은 runId 재호출 — 재수행 0
  r=await drive({flowDir,runId:'a1',from:'S04',runtime:api,approvals,state:store,sink,log:lg});assert.equal(r.status,'done');assert.equal(posts(),1);
  // 3) 새 runId — standing이라 묻지 않고 실제로 수행
  r=await drive({flowDir,runId:'a2',from:'S04',runtime:api,approvals,state:store,sink,log:lg});assert.equal(r.status,'done');assert.equal(posts(),2);log('새 실행(standing) → 묻지 않음, POST',posts());
  // 4) 허용 밖 경로·리다이렉트 — 서버에 도달하지 않거나(허용 밖) 따라가지 않는다(리다이렉트 대상 호출 0)
  const before=hits.length;
  const out1=await api.perform({...s4,api:{...s4.api,endpoint:`${origin}/admin/{orgId}?format=<형식>`}},{index:map.index,runId:'x'});
  assert.equal(out1.reason,'access-denied');assert.equal(hits.length,before);
  const out2=await createApiRuntime({fetch:(u,i)=>fetch(u,i),params:{path:{orgId:'o1',docId:'redir'},query:{format:'pdf'},headers:{'x-target-org':'o1'}}}).perform(s4,{index:map.index,runId:'x'});
  assert.equal(out2.reason,'redirect-refused');assert.equal(hits.filter(h=>h.path==='/evil').length,0);
  assert.equal(hits.filter(h=>h.path.startsWith('/admin')).length,0);log('허용 밖 경로·리다이렉트 → 거부, /evil·/admin 호출 0');
  // 5) 운영 명령 — 범위 안 비읽기 단계의 관문. 승인이 없으면 명령(=POST) 0회
  const opStore=createStore(tmp('pace-t04-e2e-opstate-'));
  const op=async({from},{checkpoint})=>{checkpoint(from,'in-progress');const res=await api.perform(s4,{index:map.index,runId:'op'});if(res.ok)checkpoint(from,'done',res.values);return {};};
  const p0=posts();
  r=await driveOperation({flowDir,runLabel:'전송 실행',runId:'op1',operation:op,runtime:{},approvals:[],state:opStore,sink});
  assert.equal(r.status,'needs-approval');assert.equal(posts(),p0);
  const once=approvalFor(flowDir,'S04','once',2);
  r=await driveOperation({flowDir,runLabel:'전송 실행',runId:'op1',operation:op,runtime:{},approvals:[once],state:opStore,sink});
  assert.equal(r.status,'done');assert.equal(posts(),p0+1);
  r=await driveOperation({flowDir,runLabel:'전송 실행',runId:'op1',operation:op,runtime:{},approvals:[once],state:opStore,sink});
  assert.equal(r.status,'done');assert.equal(posts(),p0+1);log('운영 명령: 승인 없음 POST 0 → 승인 뒤 1회 → 재호출 0');
  // 값이 새지 않았다(응답 값은 sink로만 — 상태·로그에는 건수뿐)
  const all=[...filesOf(store.baseDir),...filesOf(opStore.baseDir)].map(f=>readFileSync(f,'utf8')).join('')+logs.join('');
  assert.ok(!all.includes('완료'),'상태·로그에 응답 값이 없다');
  log('상태·로그 파일 검사 — 응답 값 0건');
});

test('S-8 브라우저 흐름(Orca): 늦은 덮개 닫기·입력·클릭·지연된 결과 대기·추출 전달, 값은 sink에만', {skip:available?false:'Orca 브라우저 CLI를 쓸 수 없어 건너뜀(마감 증거는 Orca에서 실행한 결과)'}, async()=>{
  const {flowDir}=makePlaybook('http://127.0.0.1:9');
  const page=orca('tab','create','--url',PAGE).browserPageId;pages.push(page);
  orca('wait','--page',page,'--selector','#q');
  orca('viewport','--page',page,'--width','320','--height','240','--scale','1');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,600);   // 늦은 덮개가 뜬 뒤
  const browser=createOrcaBrowser({page});
  const web=createWebRuntime({browser,params:{조회어:'가상 조회어'},waitMs:6000,pollMs:150,dismiss:{'.notice-modal':'button#close'}});
  const store=createStore(tmp('pace-t04-e2e-bstate-'));
  const sunk=[];const sink=async(d,n,v)=>{sunk.push([d,n,v]);};
  const logs=[];const lg=e=>logs.push(JSON.stringify(e));
  // 덮개가 떠 있는지 확인(조건 성립)
  assert.equal(browser.evalJs("!!document.querySelector('.notice-modal')"),true);
  const t0=Date.now();
  const r=await drive({flowDir,runId:'b1',from:'S01',to:'S01',runtime:web,approvals:[],state:store,sink,log:lg});
  assert.equal(r.status,'done');assert.deepEqual(r.completed,['S01']);assert.equal(r.counts.S01,1);
  assert.deepEqual(sunk,[['result-sheet','조회 결과',RRN]]);   // 값은 sink에만 갔다
  assert.equal(browser.evalJs("!!document.querySelector('.notice-modal')"),false);   // 덮개가 닫혔다
  log('브라우저 흐름 done',Date.now()-t0,'ms — 덮개 닫음·지연 결과(400ms) 대기 후 sink에 1건');
  // 반환·상태·로그에 값 없음
  const all=filesOf(store.baseDir).map(f=>readFileSync(f,'utf8')).join('')+logs.join('')+JSON.stringify(r);
  assert.ok(!hasSecret(all),'값 원문이 반환·상태·로그에 있다');
  log('반환·상태·로그 검사 — 값 0건');
  // 같은 runId 재호출은 완료라 다시 수행하지 않는다
  const n=sunk.length;
  const r2=await drive({flowDir,runId:'b1',from:'S01',to:'S01',runtime:web,approvals:[],state:store,sink,log:lg});
  assert.equal(r2.status,'done');assert.equal(sunk.length,n);
  // 기대 불충족: 결과가 끝내 안 오는 페이지(?never) — 대기 안에 결과가 안 오면 expect-failed로 멈추고 다음 단계는 부르지 않는다
  const page2=orca('tab','create','--url',PAGE+'?never').browserPageId;pages.push(page2);   // 새 탭 — 결과 전 상태에서 다시 시작
  orca('wait','--page',page2,'--selector','#q');orca('viewport','--page',page2,'--width','320','--height','240','--scale','1');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,600);
  const impatient=createWebRuntime({browser:createOrcaBrowser({page:page2}),params:{조회어:'가상 조회어'},waitMs:100,pollMs:50,dismiss:{'.notice-modal':'button#close'}});
  const r3=await drive({flowDir,runId:'b2',from:'S01',runtime:impatient,approvals:[],state:store,sink,log:lg});
  assert.equal(r3.status,'expect-failed');assert.equal(r3.step,'S01');assert.deepEqual(r3.completed,[]);
  log('결과가 대기 안에 안 옴 → expect-failed, 다음 단계 호출 0');
});
