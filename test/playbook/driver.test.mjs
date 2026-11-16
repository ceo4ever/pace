// 자율 주행 라이브러리(drive·driveOperation·recordApproval) 검사 — 가짜 runtime·합성 값만 쓴다.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {drive,driveOperation,recordApproval,approvalCheck} from '../../skills/pace-playbook-maker/tools/driver.mjs';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {createStore} from '../../skills/pace-playbook-maker/tools/orca-adapter.mjs';
import {FIX} from './t03-helpers.mjs';

const tmps=[];
after(()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const mkdir=()=>{const d=mkdtempSync(join(tmpdir(),'drv-'));tmps.push(d);return d;};
const rd=(dir,f)=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const stepJson=(dir,id)=>rd(dir,`agent/${id}.json`);
// 흐름 복사 + steps.json 변형 + 재생성. 기본: S03을 읽기로 바꿔 S01~S03은 자율, S04(gate 있음)만 승인 대상이다.
function mk(mut,{readS03=true}={}){
  const dir=mkdir();cpSync(FIX,dir,{recursive:true});
  const d=rd(dir,'steps.json');
  if(readS03)d.steps.find(s=>s.id==='S03').risk='read';
  if(mut)mut(d);
  d.valueReview.contentHash=contentHash(d);
  writeFileSync(join(dir,'steps.json'),JSON.stringify(d,null,1)+'\n');
  buildFlow(dir);
  return dir;
}
const VALUES={S02:{'목록 행':['행1','행2']},S03:{'문서 제목':'제목1'},S04:{'전송 결과':'완료'}};
function fake(o={}){
  const c={perform:{},judge:0,lookup:0,settle:0,order:[],keys:[]};
  const eff={};
  const rt={
    async judgeScreen(s){c.judge++;return o.judge?o.judge(s):true;},
    async perform(s,ctx){
      c.perform[s.id]=(c.perform[s.id]||0)+1;c.order.push(s.id);c.keys.push(ctx&&ctx.attemptKey);
      if(o.perform){const r=await o.perform(s,c.perform[s.id],eff);if(r!==undefined)return r;}
      eff[s.id]=(eff[s.id]||0)+1;
      return {ok:true,values:VALUES[s.id]||{}};
    },
    ...(o.lookup?{async lookup(s){c.lookup++;return o.lookup(s,eff);}}:{}),
    ...(o.settle?{async settle(s){c.settle++;return o.settle(s,eff);}}:{})
  };
  return {c,eff,rt};
}
const mkSink=()=>{const got=[];return {got,fn:async(dest,name,v)=>{got.push([dest,name,v]);}};};
const apOf=(dir,id,scope='standing',extra={})=>{const s=stepJson(dir,id);return {id:`ap-${id}-${scope}-${Math.random().toString(36).slice(2,6)}`,stepId:id,actionHash:s.actionHash,sourceHash:s.sourceHash,scope,by:'user',date:'2026-11-16',...extra};};
const run=(dir,f,o={})=>{const sink=o.sink||mkSink();return drive({flowDir:dir,runId:o.runId??'run-1',runtime:f.rt,approvals:o.approvals||[],state:o.state,sink:sink.fn,log:o.log,from:o.from});};
const stateOf=store=>store.readJson('drive-state.json');
const seedState=(store,runId,steps,consumed=[])=>store.writeJson('drive-state.json',{version:1,runs:{[runId]:{steps}},consumed},{scanAs:{}});
const hs=(dir,id)=>{const s=stepJson(dir,id);return {actionHash:s.actionHash,sourceHash:s.sourceHash};};

test('S-2b 같은 runId는 재개(완료 건너뛰기), 새 runId는 같은 지도·해시여도 실제로 수행한다', async()=>{
  const dir=mk();const store=createStore(mkdir());
  const f=fake();const ap=[apOf(dir,'S04')];
  let r=await run(dir,f,{state:store,approvals:ap,runId:'run-A'});
  assert.equal(r.status,'done');assert.deepEqual(r.completed,['S01','S02','S03','S04']);
  assert.deepEqual(f.eff,{S01:1,S02:1,S03:1,S04:1});
  // 같은 runId — 완료 행동 재수행 0
  r=await run(dir,f,{state:store,approvals:ap,runId:'run-A'});
  assert.equal(r.status,'done');assert.deepEqual(f.eff,{S01:1,S02:1,S03:1,S04:1});assert.equal(Object.values(f.c.perform).reduce((a,b)=>a+b,0),4);
  // 새 runId — 모두 다시 수행(아무것도 안 하고 완료로 보고하는 결함 차단)
  r=await run(dir,f,{state:store,approvals:ap,runId:'run-B'});
  assert.equal(r.status,'done');assert.deepEqual(f.eff,{S01:2,S02:2,S03:2,S04:2});
  // 상태에 해시 결합·건수만
  const st=stateOf(store);assert.equal(st.runs['run-A'].steps.S02.extractCount,2);assert.equal(st.runs['run-A'].steps.S02.status,'done');
  assert.equal(st.runs['run-A'].steps.S02.actionHash,stepJson(dir,'S02').actionHash);
  // runId 없음은 거부
  await assert.rejects(()=>drive({flowDir:dir,runtime:f.rt,approvals:ap,sink:async()=>{}}),/runId/);
});

test('S-2 지도가 낡았으면 stale-map이고 runtime 호출 0이다', async()=>{
  const ap=d=>[apOf(d,'S04')];
  const check=async(dir,label)=>{const f=fake();const r=await run(dir,f,{approvals:ap(dir)});assert.equal(r.status,'stale-map',label);assert.equal(f.c.judge+Object.keys(f.c.perform).length,0,label);};
  // 정상은 시작한다
  const ok=mk();const f0=fake();assert.equal((await run(ok,f0,{approvals:ap(ok)})).status,'done');
  // steps.json 수정
  const a=mk();const d=rd(a,'steps.json');d.steps[0].tool='other.mjs';writeFileSync(join(a,'steps.json'),JSON.stringify(d,null,1)+'\n');await check(a,'steps 수정');
  // 캡처 교체
  const b=mk();writeFileSync(join(b,'shots/S02.jpg'),Buffer.concat([readFileSync(join(b,'shots/S02.jpg')),Buffer.from('x')]));await check(b,'캡처 교체');
  // agent/* 수기 수정
  const c=mk();const p=join(c,'agent/S03.json');writeFileSync(p,readFileSync(p,'utf8').replace('"문서 제목"','"고친 이름"'));await check(c,'수기 수정');
});

test('S-3 읽기는 자율, 비읽기는 지도 규칙(gate)과 해시에 묶인 승인 기록이 모두 맞아야 자율이다', async()=>{
  // gate 없는 비읽기(S03 private): 유효한 외부 기록이 있어도 no-map-rule로 멈춘다
  const g=mk(null,{readS03:false});
  let f=fake();let r=await run(g,f,{approvals:[apOf(g,'S03'),apOf(g,'S04')]});
  assert.equal(r.status,'needs-approval');assert.equal(r.step,'S03');assert.equal(r.reason,'no-map-rule');
  assert.equal(f.c.perform.S03,undefined);assert.deepEqual(r.completed,['S01','S02']);
  // 승인 없음 — S04에서 멈추고 gate 문구를 돌려주며 S04 perform 0
  const dir=mk();
  f=fake();r=await run(dir,f,{});
  assert.equal(r.status,'needs-approval');assert.equal(r.step,'S04');assert.equal(r.reason,'needs-approval');assert.match(r.gate,/승인 한마디/);assert.equal(f.c.perform.S04,undefined);
  // 단계 다름 · actionHash 다름 · sourceHash 다름 · 사용자 아님
  const bad=[apOf(dir,'S04','standing',{stepId:'S03'}),apOf(dir,'S04','standing',{actionHash:'0'.repeat(64)}),apOf(dir,'S04','standing',{sourceHash:'1'.repeat(64)}),apOf(dir,'S04','standing',{by:'agent'})];
  for(const a of bad){f=fake();r=await run(dir,f,{approvals:[a]});assert.equal(r.status,'needs-approval');assert.equal(f.c.perform.S04,undefined);}
  // once — 한 번 쓰고 소모(상태 보관 필요)
  const store=createStore(mkdir());const once=apOf(dir,'S04','once');
  f=fake();r=await run(dir,f,{approvals:[once],state:store,runId:'a'});assert.equal(r.status,'done');assert.equal(f.eff.S04,1);
  r=await run(dir,f,{approvals:[once],state:store,runId:'b'});assert.equal(r.status,'needs-approval');assert.equal(f.eff.S04,1);
  // once는 id 없이는 쓸 수 없다
  assert.equal(approvalCheck({id:'S04',risk:'send',gate:'g',actionHash:'a',sourceHash:'b'},[{by:'user',stepId:'S04',actionHash:'a',sourceHash:'b',scope:'once'}]).ok,false);
  // standing — 다음 주행도 자율, 승인 뒤 행동·원본이 바뀌면 다시 멈춤
  const st=createStore(mkdir());const standing=apOf(dir,'S04','standing');
  f=fake();await run(dir,f,{approvals:[standing],state:st,runId:'a'});
  r=await run(dir,f,{approvals:[standing],state:st,runId:'b'});assert.equal(r.status,'done');assert.equal(f.eff.S04,2);
  const dir2=mk(d=>{d.steps.find(s=>s.id==='S04').api.method='PUT';});   // 행동(api) 변경 → actionHash 변경
  f=fake();r=await run(dir2,f,{approvals:[standing]});assert.equal(r.status,'needs-approval');assert.equal(f.c.perform.S04,undefined);
  const dir3=mk(d=>{d.purpose+=' 변경';});   // 원본 변경 → sourceHash 변경
  f=fake();r=await run(dir3,f,{approvals:[standing]});assert.equal(r.status,'needs-approval');
  // recordApproval — 값 없이 저장, 형식 오류는 거부
  const s2=createStore(mkdir());const a1=apOf(dir,'S04','standing');
  assert.equal(recordApproval({store:s2,approval:a1}),1);assert.equal(recordApproval({store:s2,approval:apOf(dir,'S04','once')}),2);
  const saved=s2.readJson('approvals.json');assert.equal(saved.length,2);assert.deepEqual(Object.keys(saved[0]).sort(),['actionHash','by','date','id','scope','sourceHash','stepId']);
  assert.throws(()=>recordApproval({store:s2,approval:{...a1,by:'agent'}}),/승인 기록/);
  assert.throws(()=>recordApproval({store:s2,approval:{...a1,actionHash:'x'}}),/승인 기록/);
  assert.throws(()=>recordApproval({store:s2,approval:{...apOf(dir,'S04','once'),id:''}}),/id/);
  assert.equal(s2.readJson('approvals.json').length,2);
});

test('S-4 되돌릴 수 없는 행동의 결과 불명 — lookup으로 판정하고 맹목 재시도는 없다', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  // 실행 뒤 던짐 + lookup done → 완료로 보고, 재수행 0
  let f=fake({perform:(s,n,eff)=>{if(s.id==='S04'){eff.S04=1;throw new Error('끊김');}},lookup:(s,eff)=>eff[s.id]?'done':'not-done'});
  let r=await run(dir,f,{approvals:ap});
  assert.equal(r.status,'undelivered');assert.equal(f.eff.S04,1);assert.equal(f.c.perform.S04,1);assert.equal(f.c.lookup,1);
  // 시간 초과(미실행) + not-done + settled → 그 단계만 다시 수행, 효과 1회
  f=fake({perform:(s,n)=>{if(s.id==='S04'&&n===1)return {ok:false,timeout:true};},lookup:(s,eff)=>eff[s.id]?'done':'not-done',settle:()=>'settled'});
  r=await run(dir,f,{approvals:ap});
  assert.equal(r.status,'done');assert.equal(f.eff.S04,1);assert.equal(f.c.perform.S04,2);assert.equal(f.c.perform.S01,1);assert.equal(f.c.settle,1);
  assert.notEqual(f.c.keys.at(-1),f.c.keys.at(-2));   // 시도마다 attemptKey가 다르다
  // 재수행도 시간 초과면 같은 호출 안에서 더 시도하지 않고 멈춘다
  f=fake({perform:(s)=>{if(s.id==='S04')return {ok:false,timeout:true};},lookup:()=>'not-done',settle:()=>'settled'});
  r=await run(dir,f,{approvals:ap});
  assert.equal(r.status,'unknown-outcome');assert.equal(f.c.perform.S04,2);assert.equal(f.eff.S04,undefined);
  // lookup unknown → 멈춤, lookup 없음 → 멈춤
  f=fake({perform:(s)=>{if(s.id==='S04')throw new Error('x');},lookup:()=>'unknown'});
  r=await run(dir,f,{approvals:ap});assert.equal(r.status,'unknown-outcome');assert.equal(f.c.perform.S04,1);
  f=fake({perform:(s)=>{if(s.id==='S04')throw new Error('x');}});
  r=await run(dir,f,{approvals:ap});assert.equal(r.status,'unknown-outcome');assert.equal(f.c.perform.S04,1);
  // 읽기 단계의 실패는 불명이 아니라 실패 — 되돌릴 수 없는 행동이 아니므로 조회하지 않는다
  f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:'step-failed'};},lookup:()=>'done'});
  r=await run(dir,f,{approvals:ap});assert.equal(r.status,'step-failed');assert.equal(r.step,'S02');assert.equal(f.c.lookup,0);assert.equal(f.c.perform.S03,undefined);
});

test('S-4 상태로 재개 — 수행 전 in-progress는 lookup부터, 오래된 done은 건너뛰지 않고, 불명 뒤 같은 runId로 이어 간다', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  const base=()=>({S01:{status:'done',...hs(dir,'S01'),extractCount:0},S02:{status:'done',...hs(dir,'S02'),extractCount:2},S03:{status:'done',...hs(dir,'S03'),extractCount:1}});
  // 수행 전 기록 뒤 끊김(in-progress) + lookup done → perform 0, 앞 단계도 다시 돌지 않음
  let store=createStore(mkdir());seedState(store,'r',{...base(),S04:{status:'in-progress',...hs(dir,'S04'),attempt:1}});
  let f=fake({lookup:()=>'done'});let r=await run(dir,f,{approvals:ap,state:store,runId:'r'});
  assert.equal(r.status,'undelivered');assert.deepEqual(f.c.perform,{});assert.equal(f.c.lookup,1);assert.deepEqual(r.completed,['S01','S02','S03','S04']);
  assert.equal(stateOf(store).runs.r.steps.S04.status,'done');assert.equal(stateOf(store).runs.r.steps.S04.irreversible.evidence,'lookup');
  // in-progress + not-done + settle 없음 → in-flight(재수행 0), settled면 그 단계만 1회
  store=createStore(mkdir());seedState(store,'r',{...base(),S04:{status:'in-progress',...hs(dir,'S04'),attempt:1}});
  f=fake({lookup:()=>'not-done'});r=await run(dir,f,{approvals:ap,state:store,runId:'r'});
  assert.equal(r.status,'in-flight');assert.deepEqual(f.c.perform,{});
  f=fake({lookup:()=>'not-done',settle:()=>'settled'});r=await run(dir,f,{approvals:ap,state:store,runId:'r'});
  assert.equal(r.status,'done');assert.deepEqual(f.c.perform,{S04:1});assert.equal(f.eff.S04,1);
  // 해시가 다른 done(오래된 기록)은 건너뛰지 않는다
  store=createStore(mkdir());seedState(store,'r',{...base(),S02:{status:'done',actionHash:'f'.repeat(64),sourceHash:stepJson(dir,'S02').sourceHash,extractCount:2}});
  f=fake();r=await run(dir,f,{approvals:ap,state:store,runId:'r'});
  assert.equal(r.status,'done');assert.equal(f.c.perform.S02,1);assert.equal(f.c.perform.S01,undefined);
  // 불명으로 멈춘 뒤 같은 runId로 부르면 앞 단계는 다시 안 돌고 S04는 lookup부터
  store=createStore(mkdir());let late=false;
  f=fake({perform:(s)=>{if(s.id==='S04')return {ok:false,timeout:true};},lookup:()=>late?'done':'not-done',settle:()=>'in-flight'});
  r=await run(dir,f,{approvals:ap,state:store,runId:'u'});assert.equal(r.status,'in-flight');assert.equal(f.c.perform.S04,1);
  assert.equal(stateOf(store).runs.u.steps.S04.status,'unknown');
  late=true;const before={...f.c.perform};
  r=await run(dir,f,{approvals:ap,state:store,runId:'u'});
  assert.equal(r.status,'undelivered');assert.deepEqual(f.c.perform,before);   // 어떤 perform도 다시 안 불림
  // from — 지정한 단계부터
  f=fake();r=await run(dir,f,{approvals:ap,from:'S03'});assert.equal(r.status,'done');assert.deepEqual(f.c.order,['S03','S04']);
});

test('S-4c 조회가 미완료여도 원래 요청이 진행 중일 수 있으면 재수행하지 않는다(settle 확인 전 멈춤)', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  const service={effects:0,pending:false};
  const rt=o=>fake({
    perform:(s)=>{if(s.id==='S04'){service.pending=true;return {ok:false,timeout:true};}},
    lookup:()=>service.effects?'done':'not-done',
    settle:()=>o==='inflight'?'in-flight':(service.pending=false,'settled')
  });
  // in-flight — 재수행 0, 멈춤. 그 뒤 원래 요청이 성공하면 같은 runId 재개에서 lookup done으로 완료, 효과 1
  const store=createStore(mkdir());
  let f=rt('inflight');let r=await run(dir,f,{approvals:ap,state:store,runId:'x'});
  assert.equal(r.status,'in-flight');assert.equal(f.c.perform.S04,1);
  service.effects=1;service.pending=false;
  r=await run(dir,f,{approvals:ap,state:store,runId:'x'});assert.equal(r.status,'undelivered');assert.equal(f.c.perform.S04,1);assert.equal(service.effects,1);
  // settled + not-done → 재수행 1회(원래 요청이 끝났음이 확인됨), 서비스 쪽 부작용 총 1회
  service.effects=0;
  const f2=fake({perform:(s)=>{if(s.id==='S04'){if(!service.pending&&!service.tried){service.tried=true;return {ok:false,timeout:true};}service.effects+=1;return {ok:true,values:VALUES.S04};}},lookup:()=>service.effects?'done':'not-done',settle:()=>'settled'});
  r=await run(dir,f2,{approvals:ap});assert.equal(r.status,'done');assert.equal(service.effects,1);assert.equal(f2.c.perform.S04,2);
});

test('S-4b 운영 명령 — 승인 전 호출 0, 체크포인트로 이어 가기, 중복 0, 판정 불가는 멈춤', async()=>{
  const dir=mk(d=>{d.run[0].covers=['S02','S04'];});
  const label='목록 읽기';
  const ap=[apOf(dir,'S04')];
  const ids=['S02','S03','S04'];
  const effects={};
  // 가상 운영 명령: from부터 to까지 단계마다 체크포인트. crashAt 단계(비가역)에서는 효과를 낸 뒤 반환 없이 던진다.
  const mkOp=o=>{const calls=[];const fn=async({from,to},{checkpoint})=>{
    calls.push({from,to});
    for(const id of ids.slice(ids.indexOf(from),ids.indexOf(to)+1)){
      checkpoint(id,'in-progress');
      if(o&&o.crashAt===id&&!o.done){o.done=true;if(o.effect)effects[id]=(effects[id]||0)+1;throw new Error('끊김');}
      effects[id]=(effects[id]||0)+1;
      checkpoint(id,'done',VALUES[id]);
    }
    return {};
  };return {fn,calls};};
  const go=(o={})=>driveOperation({flowDir:dir,runLabel:label,runId:o.runId??'op-1',operation:o.operation,runtime:o.runtime||{},approvals:o.approvals??ap,state:o.state,sink:async()=>{},maxResumes:o.maxResumes});
  // 승인이 안 맞으면 명령을 부르지 않는다(명령 안 위험 행동도 관문)
  let op=mkOp();let r=await go({operation:op.fn,approvals:[]});
  assert.equal(r.status,'needs-approval');assert.equal(r.step,'S04');assert.match(r.gate,/승인 한마디/);assert.equal(op.calls.length,0);
  // 정상 — 한 번 호출로 끝
  for(const k of Object.keys(effects))delete effects[k];
  op=mkOp();let store=createStore(mkdir());
  r=await go({operation:op.fn,state:store});assert.equal(r.status,'done');assert.equal(op.calls.length,1);assert.deepEqual(effects,{S02:1,S03:1,S04:1});
  // 같은 runId 재호출은 완료라 명령 호출 0, 새 runId는 다시 수행
  r=await go({operation:op.fn,state:store});assert.equal(r.status,'done');assert.equal(op.calls.length,1);
  r=await go({operation:op.fn,state:store,runId:'op-2'});assert.equal(r.status,'done');assert.equal(op.calls.length,2);
  // 3단계(S04, 비가역)에서 효과 뒤 끊김 + lookup done → 명령 재호출 0·중복 0
  for(const k of Object.keys(effects))delete effects[k];
  op=mkOp({crashAt:'S04',effect:true});store=createStore(mkdir());
  r=await go({operation:op.fn,state:store,runtime:{lookup:async()=>effects.S04?'done':'not-done'}});
  assert.equal(r.status,'undelivered');assert.equal(op.calls.length,1);assert.equal(effects.S04,1);assert.deepEqual(stateOf(store).runs['op-1'].steps.S04.status,'done');
  // 효과 전에 끊김 + not-done + settled → 첫 미완료 단계부터만 재개(처음부터 다시 안 돎), 효과 1
  for(const k of Object.keys(effects))delete effects[k];
  op=mkOp({crashAt:'S04'});store=createStore(mkdir());
  r=await go({operation:op.fn,state:store,runtime:{lookup:async()=>effects.S04?'done':'not-done',settle:async()=>'settled'}});
  assert.equal(r.status,'done');assert.deepEqual(op.calls,[{from:'S02',to:'S04'},{from:'S04',to:'S04'}]);assert.deepEqual(effects,{S02:1,S03:1,S04:1});
  // not-done + settle in-flight → 재호출 0, 멈춤
  for(const k of Object.keys(effects))delete effects[k];
  op=mkOp({crashAt:'S04'});store=createStore(mkdir());
  r=await go({operation:op.fn,state:store,runtime:{lookup:async()=>'not-done',settle:async()=>'in-flight'}});
  assert.equal(r.status,'in-flight');assert.equal(op.calls.length,1);assert.equal(effects.S04,undefined);
  // lookup unknown / lookup 없음 → 멈춤
  op=mkOp({crashAt:'S04'});r=await go({operation:op.fn,state:createStore(mkdir()),runtime:{lookup:async()=>'unknown'}});assert.equal(r.status,'unknown-outcome');assert.equal(op.calls.length,1);
  op=mkOp({crashAt:'S04'});r=await go({operation:op.fn,state:createStore(mkdir()),runtime:{}});assert.equal(r.status,'unknown-outcome');assert.equal(op.calls.length,1);
  // 프로세스가 끊긴 뒤(새 호출) — 상태 파일의 in-progress로 이어 감: 명령 호출 전에 lookup
  store=createStore(mkdir());seedState(store,'op-1',{S02:{status:'done',delivered:true,...hs(dir,'S02')},S03:{status:'done',delivered:true,...hs(dir,'S03')},S04:{status:'in-progress',...hs(dir,'S04')}});
  op=mkOp();r=await go({operation:op.fn,state:store,runtime:{lookup:async()=>'done'}});assert.equal(r.status,'undelivered');assert.equal(op.calls.length,0);
  // 없는 운영 명령
  r=await driveOperation({flowDir:dir,runLabel:'없음',runId:'z',operation:async()=>{},runtime:{},approvals:ap,sink:async()=>{}});assert.equal(r.status,'no-operation');
});

test('S-5 값은 sink로만 흐르고 반환·상태·로그·중단 보고에 없다(이유·오류 메시지·sink 오류 포함)', async()=>{
  const LEAKVAL='ZZ-값-9f3k2';
  const dir=mk();const ap=[apOf(dir,'S04')];
  const logs=[];const log=e=>logs.push(JSON.stringify(e));
  const all=(r,store,label)=>{const t=JSON.stringify(r)+logs.join('')+(store.exists('drive-state.json')?readFileSync(store.path('drive-state.json'),'utf8'):'');assert.ok(!t.includes(LEAKVAL),label);};
  // 정상 + 선언 밖 값
  let store=createStore(mkdir());let sink=mkSink();
  let f=fake({perform:(s,n,eff)=>{if(s.id==='S02'){eff.S02=1;return {ok:true,values:{'목록 행':[LEAKVAL,'b'],'선언밖':LEAKVAL}};}}});
  let r=await run(dir,f,{approvals:ap,state:store,sink,log});
  assert.equal(r.status,'done');all(r,store,'정상');assert.equal(r.counts.S02,2);
  assert.deepEqual(sink.got.filter(g=>g[0]==='result-sheet'&&g[1]==='목록 행').map(g=>g[2]),[[LEAKVAL,'b']]);
  assert.ok(!sink.got.some(g=>g[1]==='선언밖'));assert.ok(sink.got.every(g=>['목록 행','문서 제목','전송 결과'].includes(g[1])));
  // 값이 섞인 reason → 코드로 바뀜
  store=createStore(mkdir());f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:`읽기 실패: ${LEAKVAL}`,report:undefined};}});
  r=await run(dir,f,{approvals:ap,state:store,log});assert.equal(r.status,'step-failed');assert.equal(r.reason,'<가려짐>');all(r,store,'reason');
  assert.equal(stateOf(store).runs['run-1'].steps.S02.reason,'<가려짐>');
  // 던진 오류 메시지(비가역) → 로그·상태에 없음
  store=createStore(mkdir());f=fake({perform:(s)=>{if(s.id==='S04')throw new Error(`실패 ${LEAKVAL}`);},lookup:()=>'unknown'});
  r=await run(dir,f,{approvals:ap,state:store,log});assert.equal(r.status,'unknown-outcome');all(r,store,'throw');
  // sink 오류 메시지
  store=createStore(mkdir());f=fake();
  r=await drive({flowDir:dir,runId:'s',runtime:f.rt,approvals:ap,state:store,sink:async()=>{throw new Error(`전달 실패 ${LEAKVAL}`);},log});
  assert.equal(r.status,'sink-failed');all(r,store,'sink');
  // 선언된 값이 없으면 멈춤
  f=fake({perform:(s)=>{if(s.id==='S03')return {ok:true,values:{}};}});r=await run(dir,f,{approvals:ap});assert.equal(r.status,'step-failed');assert.equal(r.reason,'missing-value');
  // 전달 위치가 없으면 멈춤(resultTo·deliverTo 모두 없음)
  const nod=mk(d=>{delete d.resultTo;for(const s of d.steps)for(const x of s.extract||[])if(x.sensitivity==='public')delete x.deliverTo;});
  f=fake();sink=mkSink();r=await run(nod,f,{approvals:[apOf(nod,'S04')],sink});
  assert.equal(r.status,'no-destination');assert.equal(r.step,'S03');assert.deepEqual(sink.got.map(g=>g[1]),['목록 행']);   // 위치 없는 값은 어디에도 전달되지 않는다
  // 상태 쓰기는 쓰기 전 검사 — 민감 형식이 섞이면 거부된다(값을 쓰지 않는다)
  store=createStore(mkdir());f=fake();
  const rrn=['900101','1234567'].join('-');
  await assert.rejects(()=>run(dir,f,{approvals:ap,state:store,runId:`run-${rrn}`}));
  assert.ok(!store.exists('drive-state.json'));
});

test('화면 판정 실패는 screen-mismatch로 멈추고 locate.report 항목을 낸다', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  const f=fake({judge:(s)=>s.id!=='S02'});
  const r=await run(dir,f,{approvals:ap});
  assert.equal(r.status,'screen-mismatch');assert.equal(r.step,'S02');
  assert.deepEqual(Object.keys(r.report).sort(),['element','reason','shotSha256','sourceHash','step']);
  assert.equal(r.report.shotSha256,stepJson(dir,'S02').shot.sha256);assert.equal(r.report.sourceHash,stepJson(dir,'S02').sourceHash);
  assert.equal(f.c.perform.S02,undefined);assert.equal(f.c.perform.S03,undefined);
});

test('기대 불충족·충돌·단계 실패는 그 단계에서 멈추고 다음 단계 호출 0이며 중단 보고를 그대로 전한다', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  for(const [reason,status] of [['expect-failed','expect-failed'],['conflict','conflict'],['param-missing','step-failed']]){
    const report={step:'S02',element:1,reason:'moved',sourceHash:stepJson(dir,'S02').sourceHash,shotSha256:stepJson(dir,'S02').shot.sha256};
    const f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason,report};}});
    const store=createStore(mkdir());
    const r=await run(dir,f,{approvals:ap,state:store});
    assert.equal(r.status,status);assert.equal(r.step,'S02');assert.equal(f.c.perform.S03,undefined);assert.equal(f.c.judge,2);   // S01·S02 판정만
    assert.deepEqual(r.report,report);
    const rec=stateOf(store).runs['run-1'].steps.S02;assert.equal(rec.status,'stopped');assert.equal(rec.reason,reason);
  }
});

test('경계: 수행 전 거절은 불명이 아닌 실패, 모르는 범위·판정기 없음은 멈춤, 수행 뒤 값 처리 실패는 다시 수행하지 않는다', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  // 비가역 단계에서 수행 전 거절(executed:false) — lookup 없이 step-failed
  let f=fake({perform:(s)=>{if(s.id==='S04')return {ok:false,reason:'access-denied',executed:false};},lookup:()=>'done'});
  let r=await run(dir,f,{approvals:ap});assert.equal(r.status,'step-failed');assert.equal(r.reason,'access-denied');assert.equal(f.c.lookup,0);
  // 모르는 from/to — 처음부터 다시 도는 것으로 바뀌지 않는다
  f=fake();r=await run(dir,f,{approvals:ap,from:'S99'});assert.equal(r.status,'bad-range');assert.deepEqual(f.c.perform,{});
  f=fake();r=await run(dir,f,{approvals:ap,from:'S03'});assert.equal(r.status,'done');
  r=await drive({flowDir:dir,runId:'t',runtime:f.rt,approvals:ap,sink:async()=>{},to:'S99'});assert.equal(r.status,'bad-range');
  // screen이 있는데 판정기가 없으면 멈춘다(화면을 모르는 채 진행하지 않는다)
  const noJudge={perform:async()=>({ok:true,values:{}})};
  r=await drive({flowDir:dir,runId:'n',runtime:noJudge,approvals:ap,sink:async()=>{}});assert.equal(r.status,'screen-mismatch');assert.equal(r.step,'S01');
  // 비가역 단계가 실행된 뒤 sink가 실패 → 상태는 불명으로 남고, 같은 runId 재호출은 lookup부터이며 다시 수행하지 않는다
  const store=createStore(mkdir());let fail=true;
  const flaky=async(d,n,v)=>{if(fail&&n==='전송 결과')throw new Error('전달 실패');};
  f=fake({lookup:()=>'done'});
  r=await drive({flowDir:dir,runId:'k',runtime:f.rt,approvals:ap,state:store,sink:flaky});assert.equal(r.status,'sink-failed');assert.equal(stateOf(store).runs.k.steps.S04.status,'unknown');
  fail=false;r=await drive({flowDir:dir,runId:'k',runtime:f.rt,approvals:ap,state:store,sink:flaky});assert.equal(r.status,'undelivered');assert.equal(f.c.perform.S04,1);assert.equal(f.eff.S04,1);
  // lookup이 없으면 불명으로 멈추고 역시 다시 수행하지 않는다
  const st2=createStore(mkdir());fail=true;f=fake();
  await drive({flowDir:dir,runId:'k2',runtime:f.rt,approvals:ap,state:st2,sink:flaky});
  r=await drive({flowDir:dir,runId:'k2',runtime:f.rt,approvals:ap,state:st2,sink:flaky});assert.equal(r.status,'unknown-outcome');assert.equal(f.c.perform.S04,1);
});

test('경계: 운영 명령 — once 승인은 실행이 끝나면 소모되고, 체크포인트 없이 끝낸 비가역 단계는 다시 부르지 않고 판정한다', async()=>{
  const dir=mk(d=>{d.run[0].covers=['S02','S04'];});
  const ids=['S02','S03','S04'];const eff={};
  const good=async({from,to},{checkpoint})=>{for(const id of ids.slice(ids.indexOf(from),ids.indexOf(to)+1)){checkpoint(id,'in-progress');eff[id]=(eff[id]||0)+1;checkpoint(id,'done',VALUES[id]);}return {};};
  const go=(o)=>driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:o.runId,operation:o.op,runtime:o.runtime||{},approvals:o.approvals,state:o.state,sink:async()=>{}});
  const once=apOf(dir,'S04','once');const store=createStore(mkdir());
  let r=await go({runId:'a',op:good,approvals:[once],state:store});assert.equal(r.status,'done');
  r=await go({runId:'a',op:good,approvals:[once],state:store});assert.equal(r.status,'done');assert.equal(eff.S04,1);   // 같은 실행의 재호출은 승인 없이도 끝난 상태
  r=await go({runId:'b',op:good,approvals:[once],state:store});assert.equal(r.status,'needs-approval');assert.equal(eff.S04,1);   // 새 실행은 once가 소모되어 다시 묻는다
  // 체크포인트 없이 정상 반환 — 비가역 S04는 실행됐을 수 있으니 명령을 다시 부르지 않고 lookup으로 판정(없으면 멈춤)
  let calls=0;const lazy=async({from})=>{calls++;};
  r=await go({runId:'c',op:lazy,approvals:[apOf(dir,'S04')],state:createStore(mkdir())});
  assert.equal(r.status,'unknown-outcome');assert.equal(calls,1);
  // 읽기 단계만 남은 범위는 체크포인트 없이 끝나도 다시 부른다(최대 재개 횟수까지)
  const dir2=mk(d=>{d.run[0].covers=['S02','S03'];});calls=0;
  r=await driveOperation({flowDir:dir2,runLabel:'목록 읽기',runId:'d',operation:async()=>{calls++;},runtime:{},approvals:[],state:createStore(mkdir()),sink:async()=>{},maxResumes:2});
  assert.equal(r.status,'unknown-outcome');assert.equal(calls,3);
});

test('경계: 운영 명령이 실패를 정상 반환(failedAt)으로 알려도 비가역 단계는 lookup으로 판정한다', async()=>{
  const dir=mk(d=>{d.run[0].covers=['S02','S04'];});
  const eff={};let n=0;
  // 1) S04 진행 표시 뒤 효과를 내고 failedAt:'S04'로 정상 반환 → lookup done → 재호출 0
  const op1=async({from},{checkpoint})=>{n++;checkpoint('S02','in-progress');checkpoint('S02','done',VALUES.S02);checkpoint('S03','in-progress');checkpoint('S03','done',VALUES.S03);checkpoint('S04','in-progress');eff.S04=(eff.S04||0)+1;return {failedAt:'S04'};};
  const base={flowDir:dir,runLabel:'목록 읽기',runtime:{lookup:async()=>eff.S04?'done':'not-done',settle:async()=>'settled'},approvals:[apOf(dir,'S04')],sink:async()=>{}};
  let r=await driveOperation({...base,runId:'f1',operation:op1,state:createStore(mkdir())});
  assert.equal(r.status,'undelivered');assert.equal(n,1);assert.equal(eff.S04,1);
  // 2) 읽기 단계 S02에서 실패하고 failedAt:'S02'로 정상 반환(비가역 단계는 시작 전) → 다시 부른다
  n=0;let first=true;
  const op2=async({from},{checkpoint})=>{n++;if(first){first=false;return {failedAt:'S02'};}for(const id of ['S02','S03','S04']){checkpoint(id,'in-progress');checkpoint(id,'done',VALUES[id]);}return {};};
  r=await driveOperation({...base,runId:'f2',operation:op2,state:createStore(mkdir())});
  assert.equal(r.status,'done');assert.equal(n,2);
});

test('독립 검토 1차 반영: settle 뒤 재조회·once 실행 예약·보고 선별·전달 상태·운영 명령 시도 기록', async()=>{
  const dir=mk(d=>{d.run[0].covers=['S02','S04'];});const ap=()=>[apOf(dir,'S04')];
  // 1) settled 뒤 재조회 — 확인하는 사이 원래 요청이 성공했으면 재수행하지 않는다(drive)
  const svc={effects:0};
  let f=fake({perform:(s)=>{if(s.id==='S04')return {ok:false,timeout:true};},lookup:()=>svc.effects?'done':'not-done',settle:()=>{svc.effects=1;return 'settled';}});
  let r=await run(dir,f,{approvals:ap()});assert.equal(r.status,'undelivered');assert.equal(f.c.perform.S04,1);assert.equal(f.c.lookup,2);
  // 2) 운영 명령도 같다 + 시도 기록: in-progress 체크포인트가 attempt를 올리고 attemptKey를 준다
  const ids=['S02','S03','S04'];const keys=[];const eff={};
  const op=async({from},{checkpoint,attemptKey})=>{for(const id of ids.slice(ids.indexOf(from))){checkpoint(id,'in-progress');keys.push(attemptKey(id));if(id==='S04')throw new Error('끊김');eff[id]=1;checkpoint(id,'done',VALUES[id]);}};
  const store=createStore(mkdir());svc.effects=0;
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'o',operation:op,runtime:{lookup:async()=>svc.effects?'done':'not-done',settle:async()=>{svc.effects=1;return 'settled';}},approvals:ap(),state:store,sink:async()=>{}});
  assert.equal(r.status,'undelivered');assert.deepEqual(keys,['o:S02:1','o:S03:1','o:S04:1']);assert.equal(stateOf(store).runs.o.steps.S04.attempt,1);
  // 되돌릴 수 없는 범위에서 명령이 계속 실패해도 한 번만 다시 부른다
  let calls=0;
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'o2',operation:async()=>{calls++;throw new Error('x');},runtime:{},approvals:ap(),state:createStore(mkdir()),sink:async()=>{}});
  assert.equal(r.status,'unknown-outcome');assert.equal(calls,2);
  // 3) once 예약 — 값 전달이 실패해도 다른 실행이 같은 once를 쓰지 못한다(drive)
  const st=createStore(mkdir());const once=apOf(dir,'S04','once');
  f=fake();r=await drive({flowDir:dir,runId:'a',runtime:f.rt,approvals:[once],state:st,sink:async(d,n)=>{if(n==='전송 결과')throw new Error('x');}});
  assert.equal(r.status,'sink-failed');
  f=fake();r=await run(dir,f,{approvals:[once],state:st,runId:'b'});assert.equal(r.status,'needs-approval');assert.equal(f.eff.S04,undefined);
  // 운영 명령: A 단계 완료·B 단계 불명으로 멈춘 뒤 새 실행은 같은 once로 A를 다시 수행하지 못한다
  const o1=apOf(dir,'S04','once');const st2=createStore(mkdir());
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'p',operation:op,runtime:{},approvals:[o1],state:st2,sink:async()=>{}});
  assert.equal(r.status,'unknown-outcome');
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'q',operation:op,runtime:{},approvals:[o1],state:st2,sink:async()=>{}});
  assert.equal(r.status,'needs-approval');
  // 4) 중단 보고 — 지도에서 만든 필드만, 이유는 허용 어휘만(값 모양의 코드는 가림)
  const NASTY='abc-12345-xyz';
  f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:'conflict',report:{element:1,reason:NASTY,extra:NASTY,sourceHash:'0'.repeat(64),shotSha256:NASTY}};}});
  r=await run(dir,f,{approvals:ap()});
  assert.deepEqual(r.report,{step:'S02',element:1,reason:'<가려짐>',sourceHash:stepJson(dir,'S02').sourceHash,shotSha256:stepJson(dir,'S02').shot.sha256});
  assert.ok(!JSON.stringify(r).includes(NASTY));
  f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:NASTY};}});r=await run(dir,f,{approvals:ap()});assert.equal(r.reason,'<가려짐>');
  // 5) 운영 명령 전달 상태 — sink 실패·sink 없음·값 없음은 done이 아니다, 같은 실행의 재호출도 마찬가지(명령은 다시 부르지 않는다)
  const full=async({from,to},{checkpoint})=>{for(const id of ids.slice(ids.indexOf(from),ids.indexOf(to)+1)){checkpoint(id,'in-progress');checkpoint(id,'done',VALUES[id]);}};
  let n=0;const counting=async(a,b)=>{n++;return full(a,b);};
  const st3=createStore(mkdir());
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'u',operation:counting,runtime:{},approvals:ap(),state:st3,sink:async()=>{throw new Error('x');}});
  assert.equal(r.status,'undelivered');assert.equal(n,1);
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'u',operation:counting,runtime:{},approvals:ap(),state:st3,sink:async()=>{}});
  assert.equal(r.status,'undelivered');assert.equal(n,1);
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'v',operation:full,runtime:{},approvals:ap(),state:createStore(mkdir())});   // sink 없음
  assert.equal(r.status,'undelivered');
  const got=[];
  r=await driveOperation({flowDir:dir,runLabel:'목록 읽기',runId:'w',operation:full,runtime:{},approvals:ap(),state:createStore(mkdir()),sink:async(d,nm,v)=>{got.push(nm);}});
  assert.equal(r.status,'done');assert.deepEqual([...got].sort(),['목록 행','문서 제목','전송 결과'].sort());
});

test('독립 검토 2차 반영: 보고의 요소 번호는 지도에 선언된 번호만, 조회로 확인한 완료도 값 미전달이면 undelivered', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  const FAKE=['1002','123','456789'].join('');   // 합성 계좌형 숫자
  let f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:'conflict',report:{element:Number(FAKE),reason:'moved'}};}});
  let r=await run(dir,f,{approvals:ap});assert.equal(r.report.element,null);assert.ok(!JSON.stringify(r).includes(FAKE));
  f=fake({perform:(s)=>{if(s.id==='S02')return {ok:false,reason:'conflict',report:{element:2,reason:'moved'}};}});   // S02에 선언된 번호
  r=await run(dir,f,{approvals:ap});assert.equal(r.report.element,2);
  // 조회 done인 비가역 단계에 선언된 값이 있으면 done으로 숨기지 않는다 — 단계는 done이라 같은 실행의 재호출은 다시 수행하지 않고 이어 간다
  const store=createStore(mkdir());
  f=fake({perform:(s)=>{if(s.id==='S04')throw new Error('x');},lookup:()=>'done'});
  r=await run(dir,f,{approvals:ap,state:store,runId:'u'});
  assert.equal(r.status,'undelivered');assert.equal(r.step,'S04');assert.equal(stateOf(store).runs.u.steps.S04.status,'done');assert.equal(stateOf(store).runs.u.steps.S04.delivered,false);
  r=await run(dir,f,{approvals:ap,state:store,runId:'u'});assert.equal(r.status,'undelivered');assert.equal(r.step,'S04');assert.equal(f.c.perform.S04,1);   // 재호출에서도 미전달은 숨겨지지 않고 다시 수행하지도 않는다
});

test('T05 overlay — 그 실행에만 덧씌운 단계 json을 쓰고 정본 지도는 읽기만 한다(해시 필드 그대로)', async()=>{
  const dir=mk();const ap=[apOf(dir,'S04')];
  const seen=[];
  const rt={async judgeScreen(){return true;},async perform(s){seen.push([s.id,(s.elements||[]).map(e=>e.find).join(','),s.actionHash]);return {ok:true,values:VALUES[s.id]||{}};}};
  const ov={S02:{...stepJson(dir,'S02'),elements:stepJson(dir,'S02').elements.map((e,j)=>j===0?{...e,find:'#patched'}:e)}};
  const store=createStore(mkdir());
  let r=await drive({flowDir:dir,runId:'o1',runtime:rt,approvals:ap,state:store,sink:async()=>{},to:'S02',overlay:ov});
  assert.equal(r.status,'done');
  assert.ok(seen.find(x=>x[0]==='S02')[1].startsWith('#patched'));assert.equal(seen.find(x=>x[0]==='S02')[2],stepJson(dir,'S02').actionHash);
  // overlay 없는 다음 실행은 정본(원래 선택자)을 읽는다
  seen.length=0;
  r=await drive({flowDir:dir,runId:'o2',runtime:rt,approvals:ap,state:store,sink:async()=>{},to:'S02'});
  assert.ok(!seen.find(x=>x[0]==='S02')[1].includes('#patched'));
});
