// 어댑터 라이브러리(보호 저장소·수행 관찰·캡처 → 대기 → 승인) — 가짜 브라우저 (T03 S-4)
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createStore,observeStep,captureStep,approvePending,rejectPending,createOrcaBrowser} from '../../skills/pace-playbook-maker/tools/orca-adapter.mjs';
import {sha256Hex,CaptureRefused} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
import {FIX,cleanup,tmp,readJson,writeJson} from './t03-helpers.mjs';

after(cleanup);
const RRN=['900101','1234567'].join('-');
const PW=['pass','word=','hunter2','value'].join('');
const OVERLAY_OK={masked:2,errors:[],frames:{viewer:{ok:true},side:{ok:true}},perRule:{'td.owner':1},missing:[],boxes:{1:{x:40,y:80,w:120,h:24},2:{x:40,y:140,w:720,h:300}},elementsMasked:{1:false,2:true},view:{vw:800,vh:600,dpr:1}};

// runCapture·observeStep이 부르는 browser 계약을 흉내 낸다(식 안의 표지로 종류 판별)
// leak 기본값 'clean': 식의 검사 대상(TG)마다 검사함·노출 0을 돌려준다. 배열·null을 주면 그대로 돌려준다.
function fakeBrowser({shotDir,overlay=OVERLAY_OK,post={ok:true,reasons:[]},observe={ar:[true,true],er:[true]},leak='clean'}={}){
  const calls=[];let n=0;
  const clean=expr=>{const m=/TG=(\[.*?\]);\n/.exec(expr);return (m?JSON.parse(m[1]):[]).map(t=>({name:t.n,checked:true,exposed:0}));};
  return {calls,
    evalJs(expr){
      const kind=expr.includes('const A=')?'observe':expr.includes('const CSS=')?'leak':expr.includes('f.post()')?'post':expr.includes('f.cleanup()')?'cleanup':'overlay';
      calls.push(kind);
      return kind==='observe'?observe:kind==='leak'?(leak==='clean'?clean(expr):leak):kind==='post'?post:kind==='cleanup'?true:overlay;
    },
    screenshot(){calls.push('screenshot');const p=join(shotDir,`raw-${++n}.jpg`);copyFileSync(join(FIX,'shots','S02.jpg'),p);return p;},
    discard(p){calls.push('discard');if(existsSync(p))writeFileSync(p,'');require_unlink(p);},
    sleep(){}
  };
}
import {unlinkSync} from 'node:fs';
const require_unlink=p=>{try{unlinkSync(p);}catch{/* 이미 없음 */}};

// 승인 이력이 없는 S02 단계가 있는 흐름 폴더 + 대기 폴더 + 원본 스크린샷 폴더
function setup(){
  const flowDir=tmp('pace-t03-flow-'),pendingDir=tmp('pace-t03-pending-'),shotDir=tmp('pace-t03-raw-');
  const d=readJson(join(FIX,'steps.json'));
  const s2=d.steps.find(s=>s.id==='S02');
  for(const k of ['captureRecord','shotHash','recordHash','status','verified'])delete s2[k];
  s2.status='todo';
  writeJson(join(flowDir,'steps.json'),d);
  return {flowDir,flow:createStore(flowDir),pending:createStore(pendingDir),pendingDir,shotDir,step:s2,doc:{mask:d.mask}};
}

test('S-4 보호 저장소: 민감 형식 내용은 쓰기 전에 거부하고 파일이 생기지 않으며, 비이미지 바이트·저장소 밖 경로도 거부', ()=>{
  const dir=tmp(),store=createStore(dir);
  assert.throws(()=>store.writeJson('a.json',{note:`값 ${RRN}`}),/민감 형식 거부/);
  assert.throws(()=>store.writeText('b.md',`본문 ${PW}`),/민감 형식 거부/);
  assert.throws(()=>store.writeBytes('c.bin',Buffer.from('x')),/이미지/);
  assert.throws(()=>store.writeJson('../밖.json',{a:1}),/저장소 밖/);
  assert.deepEqual(store.list(),[]);assert.deepEqual(store.writes,[]);
  const m=(()=>{try{store.writeJson('a.json',{note:RRN});}catch(e){return e.message;}})();
  assert.ok(!m.includes(RRN));
  // 정상은 쓰고 경로를 기록한다
  store.writeJson('ok/x.json',{n:1});store.writeText('ok/y.md','평범한 글');store.writeBytes('ok/z.jpg',Buffer.from([0xff,0xd8,0xff]));
  assert.deepEqual(store.writes,['ok/x.json','ok/y.md','ok/z.jpg']);
  assert.deepEqual(store.list(),['ok/x.json','ok/y.md','ok/z.jpg']);
  // 해시 필드는 구조 경로에서 허용(64자 16진), 일반 경로의 같은 값은 거부
  const h=sha256Hex('x');
  store.writeJson('h.json',{steps:[{shotHash:h}]});
  assert.throws(()=>store.writeJson('h2.json',{purpose:h}),/민감 형식 거부/);
});

test('S-4 observeStep: 정상은 불리언 관찰만 반환, 액션 실패·관찰 실패·브라우저 오류는 ok:false', ()=>{
  const shotDir=tmp();
  const ok=observeStep({browser:fakeBrowser({shotDir}),actions:[{type:'fill',find:'#q',value:'<기간>'},{type:'click',find:'#go'}],expects:[{find:'#result',state:'visible'}]});
  assert.deepEqual(ok,{ok:true,failed:[]});
  const act=observeStep({browser:fakeBrowser({shotDir,observe:{ar:[true,false],er:[true]}}),actions:[{type:'fill',find:'#q'},{type:'click',find:'#nope'}],expects:[{find:'#result',state:'visible'}]});
  assert.deepEqual(act,{ok:false,failed:[{kind:'action',index:1}]});
  const exp=observeStep({browser:fakeBrowser({shotDir,observe:{ar:[true],er:[false]}}),actions:[{type:'click',find:'#go'}],expects:[{find:'#result',state:'filled'}]});
  assert.deepEqual(exp,{ok:false,failed:[{kind:'expect',index:0}]});
  const boom=observeStep({browser:{evalJs(){throw new Error('x');}},actions:[],expects:[]});
  assert.equal(boom.ok,false);
});

test('S-4 캡처→대기→승인: 정상은 shots/S02.jpg·captureRecord·shotHash·recordHash를 쓰고 대기·원본이 남지 않으며 대기 메타에는 숫자·해시뿐', ()=>{
  const {flowDir,flow,pending,shotDir,step,doc}=setup();
  const b=fakeBrowser({shotDir});
  const cap=captureStep({browser:b,pending,doc,step,frames:{viewer:'iframe#viewer',side:{selector:'iframe#side',optional:true}}});
  assert.equal(cap.stepId,'S02');assert.match(cap.sha,/^[0-9a-f]{12}$/);
  assert.deepEqual(pending.list(),['S02.jpg','S02.json']);
  assert.ok(b.calls.includes('discard'));assert.deepEqual(readdirSync(shotDir),[],'원본 스크린샷이 남았다');
  // 대기 메타: 숫자·불리언·해시·식별자뿐(화면 글자 없음)
  const meta=pending.readJson('S02.json');
  const strings=[];const walk=(v,k)=>{if(typeof v==='string')strings.push([k,v]);else if(v&&typeof v==='object')for(const [kk,x] of Object.entries(v))walk(x,kk);};
  walk(meta,'');
  assert.ok(strings.every(([k,v])=>/^(stepId|shotSha256|contextSha|recordHash)$/.test(k)||k==='finds'||/^[0-9]+$/.test(k)||/^[#.\w:\[\]-]+$/.test(v)),JSON.stringify(strings));
  const ap=approvePending({pending,flow,stepId:'S02',sha:cap.sha,now:'2026-11-16'});
  assert.equal(ap.stepId,'S02');
  const d=readJson(join(flowDir,'steps.json')),s=d.steps.find(x=>x.id==='S02');
  assert.equal(s.status,'captured');assert.equal(s.verified,'2026-11-16');
  assert.equal(s.shotHash,sha256Hex(readFileSync(join(flowDir,'shots','S02.jpg'))));
  assert.equal(s.captureRecord.shotSha256,s.shotHash);assert.match(s.recordHash,/^[0-9a-f]{64}$/);
  assert.equal(s.captureRecord.elementsMasked['2'],true);
  assert.deepEqual(pending.list(),[],'승인 뒤 대기 파일이 남았다');
  assert.deepEqual(flow.writes.sort(),['shots/S02.jpg','steps.json']);
});

test('S-4 캡처 단계 거부: 사후 검사 실패·오버레이 오류·가림 필수 0건·추출 미가림·수행 관찰 실패는 대기·원본 0개', ()=>{
  const run=(opts,extra={})=>{
    const {pending,shotDir,step,doc}=setup();
    const b=fakeBrowser({shotDir,...opts});
    let err=null;
    try{captureStep({browser:b,pending,doc,step:extra.step?extra.step(step):step,...(extra.args||{})});}catch(e){err=e;}
    return {err,b,pending,shotDir};
  };
  const cases=[
    ['post 실패',{post:{ok:false,reasons:['dom_changed']}},{},/캡처 중 화면이 바뀌어 거부/],
    ['오버레이 오류',{overlay:{...OVERLAY_OK,errors:['x']}},{},/마스킹 오버레이 오류/],
    ['가림 필수 0건',{overlay:{...OVERLAY_OK,perRule:{'td.owner':0}}},{step:s=>({...s,maskRequire:['td.owner']})},/가림 필수 규칙이 0건/],
    ['추출 미가림',{overlay:{...OVERLAY_OK,elementsMasked:{1:false,2:false}}},{},/가려지지 않았다/],
    ['같은 값이 대상 밖에 노출',{leak:[{name:'목록 행',checked:true,exposed:2}]},{},/대상 밖 2곳에 가려지지 않고 보인다/],
    ['값 노출 검사를 읽지 못함(fail-closed)',{leak:null},{},/값 노출 검사 결과를 읽지 못했다/],
    ['빈 결과(대상별 결과 없음, fail-closed)',{leak:[]},{},/값 노출 검사 결과가 없다/],
    ['불완전 결과([{}])',{leak:[{}]},{},/값 노출 검사 결과가 없다/],
    ['대상 없음·값 없음은 검사하지 못함',{leak:[{name:'목록 행',checked:false,reason:'empty'}]},{},/값 노출을 검사하지 못했다\(값 없음\)/],
    ['개수 해석 불가',{leak:[{name:'목록 행',checked:true,exposed:'2'}]},{},/해석하지 못했다/]
  ];
  for(const [name,opts,extra,re] of cases){
    const {err,pending,shotDir}=run(opts,extra);
    assert.ok(err instanceof CaptureRefused,name);assert.match(err.message,re,name);
    assert.deepEqual(pending.list(),[],`${name}: 대기 파일이 남았다`);
    assert.deepEqual(readdirSync(shotDir),[],`${name}: 원본이 남았다`);
  }
  // 수행·관찰 실패: 스크린샷을 찍기 전에 거부
  const {err,b,pending}=run({observe:{ar:[true,false],er:[true]}},{args:{actions:[{type:'fill',find:'#q'},{type:'click',find:'#no'}],expects:[{find:'#r',state:'visible'}]}});
  assert.equal(err.code,'observe_failed');assert.ok(!b.calls.includes('screenshot'));assert.deepEqual(pending.list(),[]);
  // 캡처 금지 단계
  const cf=run({},{step:s=>({...s,capture:false})});
  assert.equal(cf.err.code,'capture_false');
});

test('S-4 승인 거부: 해시 불일치·대기 없음·캡처 금지 단계는 steps.json·shots를 바꾸지 않고, rejectPending이 대기를 지운다', ()=>{
  const {flowDir,flow,pending,shotDir,step,doc}=setup();
  const before=readFileSync(join(flowDir,'steps.json'),'utf8');
  assert.throws(()=>approvePending({pending,flow,stepId:'S02',sha:'abcdef12'}),e=>e.code==='approve_no_pending');
  const cap=captureStep({browser:fakeBrowser({shotDir}),pending,doc,step});
  assert.throws(()=>approvePending({pending,flow,stepId:'S02',sha:'0'.repeat(12)}),e=>e.code==='approve_hash');
  assert.throws(()=>approvePending({pending,flow,stepId:'S02',sha:'abc'}),e=>e.code==='approve_hash');
  assert.throws(()=>approvePending({pending,flow,stepId:'S02',sha:undefined}),e=>e.code==='approve_hash');
  assert.equal(readFileSync(join(flowDir,'steps.json'),'utf8'),before);assert.equal(existsSync(join(flowDir,'shots')),false);
  assert.deepEqual(pending.list(),['S02.jpg','S02.json'],'거부 뒤에도 대기는 남아 다시 승인하거나 반려할 수 있다');
  // 대기 이미지를 바꾸면(메타 해시와 불일치) 거부
  pending.writeBytes('S02.jpg',Buffer.from([0xff,0xd8,0xff,0x00]));
  assert.throws(()=>approvePending({pending,flow,stepId:'S02',sha:cap.sha}),e=>e.code==='approve_hash');
  // 캡처 금지 단계 승인 거부
  const d=readJson(join(flowDir,'steps.json'));d.steps.find(x=>x.id==='S02').capture=false;writeJson(join(flowDir,'steps.json'),d);
  const {pending:p2,shotDir:sd2,doc:doc2,step:st2}=setup();
  const cap2=captureStep({browser:fakeBrowser({shotDir:sd2}),pending:p2,doc:doc2,step:st2});
  assert.throws(()=>approvePending({pending:p2,flow,stepId:'S02',sha:cap2.sha}),e=>e.code==='approve_capture_false');
  rejectPending({pending,stepId:'S02'});assert.deepEqual(pending.list(),[]);
});

test('createOrcaBrowser는 page가 없으면 거부한다(지정한 탭만 다룬다)', ()=>{
  assert.throws(()=>createOrcaBrowser({}),/page/);
  const b=createOrcaBrowser({page:'p',exe:process.execPath,tries:1});
  assert.equal(typeof b.evalJs,'function');assert.equal(typeof b.screenshot,'function');assert.equal(b.page,'p');
});

test('T06 S-14 recaptureStep(복구 재캡처)은 최초 캡처와 같은 값 노출 관문을 거치고, 통과하면 기록·이미지를 돌려주고 원본을 지운다', async()=>{
  const {recaptureStep}=await import('../../skills/pace-playbook-maker/tools/orca-adapter.mjs');
  const {shotDir,step,doc}=setup();
  // 노출이 있으면 스크린샷 전에 거부
  const bad=fakeBrowser({shotDir,leak:[{name:'목록 행',checked:true,exposed:1}]});
  assert.throws(()=>recaptureStep({browser:bad,doc,step}),e=>e instanceof CaptureRefused&&e.code==='value_exposed');
  assert.ok(!bad.calls.includes('screenshot'));
  // 결과 없음도 거부(fail-closed)
  assert.throws(()=>recaptureStep({browser:fakeBrowser({shotDir,leak:null}),doc,step}),e=>e.code==='value_exposed');
  // 통과: 기록·이미지, 원본 스크린샷은 지운다
  const ok=fakeBrowser({shotDir});
  const r=recaptureStep({browser:ok,doc,step});
  assert.equal(r.record.shotSha256,sha256Hex(r.bytes));
  assert.ok(ok.calls.indexOf('leak')<ok.calls.indexOf('screenshot'),'노출 검사가 먼저다');
  assert.ok(ok.calls.includes('discard'));
});
