// 기본 실행기(createApiRuntime·createWebRuntime) 검사 — 가짜 fetch·DOM 스텁·가짜 시계, 합성 값만 쓴다.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApiRuntime,createWebRuntime,loadMap} from '../../skills/pace-playbook-maker/tools/driver.mjs';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {FIX} from './t03-helpers.mjs';
import {Doc,El} from './dom-stub.mjs';

const tmps=[];
after(()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const dir=mkdtempSync(join(tmpdir(),'drvrt-'));tmps.push(dir);cpSync(FIX,dir,{recursive:true});buildFlow(dir);
const map=loadMap(dir);
const S04=map.steps.find(s=>s.id==='S04');
const ctx={index:map.index,runId:'r'};

// ---- API 실행기(S-6) ----
const good={method:'x',path:{orgId:'o1',docId:'d1'},query:{format:'pdf'},headers:{'x-target-org':'o1'}};
function fakeFetch(o={}){
  const calls=[];
  const fn=async(url,init)=>{
    calls.push({url,init});
    if(o.throw)throw new Error('연결 실패 ZZ-값');
    const r=o.responses?.[calls.length-1]??o.response??{status:202,body:{result:{status:'완료'}}};
    return {status:r.status,type:r.type||'basic',json:async()=>{if(r.badJson)throw new Error('x');return r.body;}};
  };
  return {calls,fn};
}
const api=(f,params=good,extra={})=>createApiRuntime({fetch:f.fn,params,...extra});

test('S-6 허용 안 호출은 1회·선언된 응답 경로 값만 반환한다', async()=>{
  const f=fakeFetch();
  const r=await api(f).perform(S04,ctx);
  assert.equal(r.ok,true);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].url,'https://app.example.test/organizations/o1/documents/d1/send?format=pdf');
  assert.equal(f.calls[0].init.method,'POST');assert.equal(f.calls[0].init.redirect,'manual');
  assert.deepEqual(r.values,{'전송 결과':'완료'});
  // 응답에 선언 밖 필드가 있어도 선언된 경로 값만 나온다
  const f2=fakeFetch({response:{status:202,body:{result:{status:'완료',extra:'ZZ-값'},other:1}}});
  assert.deepEqual((await api(f2).perform(S04,ctx)).values,{'전송 결과':'완료'});
});

test('S-6 허용 밖은 fetch 호출 0이고 거부한다', async()=>{
  const cases=[
    ['origin 밖',{...S04,api:{...S04.api,endpoint:'https://evil.example.test/organizations/{orgId}/documents/{docId}/send?format=<형식>'}},good],
    ['경로 밖',{...S04,api:{...S04.api,endpoint:'https://app.example.test/other/{orgId}?format=<형식>'}},good],
    ['선언 밖 query 키',{...S04,api:{...S04.api,endpoint:'https://app.example.test/organizations/{orgId}/documents/{docId}/send?format=<형식>&debug=<값>'}},good],
    ['값이 박힌 query',{...S04,api:{...S04.api,endpoint:'https://app.example.test/organizations/{orgId}/documents/{docId}/send?format=pdf'}},good],
  ];
  for(const [label,step,params] of cases){const f=fakeFetch();const r=await api(f,params).perform(step,ctx);assert.equal(r.ok,false,label);assert.equal(r.reason,'access-denied',label);assert.equal(f.calls.length,0,label);}
  // 채운 경로 값이 상위 이동·구분자를 만들면 거부
  for(const bad of ['..','a/b']){const f=fakeFetch();const r=await api(f,{...good,path:{orgId:bad,docId:'d1'}}).perform(S04,ctx);assert.equal(r.ok,false,bad);assert.equal(f.calls.length,0,bad);}
  // 선언 밖 body 키·헤더
  let f=fakeFetch();let r=await api(f,{...good,body:{secret:'x'}}).perform(S04,ctx);assert.equal(r.reason,'undeclared-key');assert.equal(f.calls.length,0);
  f=fakeFetch();r=await api(f,{...good,headers:{...good.headers,'x-extra':'1'}}).perform(S04,ctx);assert.equal(r.reason,'undeclared-key');assert.equal(f.calls.length,0);
  // 자리 값 누락
  f=fakeFetch();r=await api(f,{...good,path:{orgId:'o1'}}).perform(S04,ctx);assert.equal(r.reason,'param-missing');assert.equal(f.calls.length,0);
  // API 단계가 아님
  f=fakeFetch();r=await api(f).perform({id:'S01',elements:[]},ctx);assert.equal(r.reason,'not-api-step');
  // 허용 목록이 비어 있으면 모두 거부
  f=fakeFetch();r=await api(f).perform(S04,{index:{allowedOrigins:[],allowedPaths:[]},runId:'r'});assert.equal(r.reason,'access-denied');assert.equal(f.calls.length,0);
});

test('S-6 3xx 리다이렉트는 따라가지 않고 거부한다(두 번째 요청 0)', async()=>{
  for(const resp of [{status:302,body:{}},{status:301,body:{}},{status:200,type:'opaqueredirect',body:{}}]){
    const f=fakeFetch({response:resp});const r=await api(f).perform(S04,ctx);
    assert.equal(r.ok,false);assert.equal(r.reason,'redirect-refused');assert.equal(f.calls.length,1);
  }
});

test('S-6 상태·응답 경로 검증과 오류 처리 — 오류 본문은 반환하지 않는다', async()=>{
  let f=fakeFetch({response:{status:200,body:{result:{status:'완료'}}}});
  let r=await api(f).perform(S04,ctx);assert.equal(r.reason,'status-mismatch');   // successStatus 202
  f=fakeFetch({response:{status:202,body:{nothing:1}}});r=await api(f).perform(S04,ctx);assert.equal(r.reason,'schema-mismatch');
  f=fakeFetch({response:{status:202,badJson:true}});r=await api(f).perform(S04,ctx);assert.equal(r.reason,'schema-mismatch');
  // 연결 실패·시간 초과는 결과 불명(timeout) — 메시지는 반환하지 않는다
  f=fakeFetch({throw:true});r=await api(f).perform(S04,ctx);assert.equal(r.ok,false);assert.equal(r.timeout,true);assert.ok(!JSON.stringify(r).includes('ZZ-값'));
  // 오류 응답 본문은 값이 섞일 수 있어 반환하지 않는다
  f=fakeFetch({response:{status:500,body:{error:'ZZ-값'}}});r=await api(f).perform(S04,ctx);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('ZZ-값'));
  // lookup·settle은 주입한 것을 그대로 노출
  const lk=async()=>'done',st=async()=>'settled';const rt=createApiRuntime({fetch:fakeFetch().fn,params:good,lookup:lk,settle:st});assert.equal(rt.lookup,lk);assert.equal(rt.settle,st);
});

// ---- 웹 실행기(S-7) ----
// 표현식 문자열을 DOM 스텁 위에서 실행하는 가짜 browser와 가짜 시계
function env({url='/box'}={}){
  const doc=new Doc();let t=0;const timers=[];const events=[];
  const ev=expr=>new Function('document','location','getComputedStyle','Event','innerWidth','innerHeight','return '+expr)(doc,{pathname:url,hash:''},e=>({visibility:e.hiddenVis?'hidden':'visible'}),class{constructor(type){this.type=type;}},800,600);
  const at=(ms,fn)=>timers.push({due:t+ms,fn,done:false});
  const sleep=ms=>{t+=ms;for(const x of timers)if(!x.done&&x.due<=t){x.done=true;x.fn();}};
  const add=(parent,tag,o={},hook)=>{const e=new El(tag,o);e.dispatchEvent=x=>{events.push([o.id||tag,x.type]);};e.focus=()=>{};if(hook)hook(e);parent.appendChild(e);return e;};
  return {doc,browser:{evalJs:ev},sleep,at,add,events,now:()=>t};
}
const step=(o={})=>({id:'S02',sourceHash:'a'.repeat(64),shot:{sha256:'b'.repeat(64)},screen:{url:'^/box$',require:['table.list'],forbid:['.notice-modal']},
  elements:[{n:1,name:'시작일',find:'input#from',action:'입력, 날짜 형식'},{n:2,name:'조회',find:'button#go',action:'클릭'},{n:3,name:'표',find:'table.list',action:'읽기'}],
  extract:[{name:'목록 행',where:{selector:'table.list'}}],...o});
const rt=(e,o={})=>createWebRuntime({browser:e.browser,sleep:e.sleep,waitMs:1000,pollMs:100,params:{시작일:'2026-01-01'},...o});
// 기본 화면: 입력칸·조회 버튼(누르면 hook)·표(이전 내용 선택)
function page(e,{before='이전 결과',onClick}={}){
  const input=e.add(e.doc.body,'input',{id:'from',value:''});
  const tbl=e.add(e.doc.body,'table',{attrs:{class:'list'},text:before});
  const btn=e.add(e.doc.body,'button',{id:'go'},b=>{b.click=()=>onClick&&onClick(tbl);});
  return {input,tbl,btn};
}

test('S-7 화면 판정 — url·require·forbid, 늦은 덮개는 닫는 방법이 있을 때만 닫고 통과한다', async()=>{
  let e=env();page(e);
  assert.equal(await rt(e).judgeScreen(step()),true);
  e=env({url:'/login'});page(e);assert.equal(await rt(e).judgeScreen(step()),false);   // url 불일치
  e=env();e.add(e.doc.body,'div',{});assert.equal(await rt(e).judgeScreen(step()),false);   // require 없음
  // forbid 보임 + 닫기 방법 없음 → false(이벤트 문구는 자동 해석하지 않는다)
  e=env();page(e);e.add(e.doc.body,'div',{attrs:{class:'notice-modal'}});assert.equal(await rt(e).judgeScreen(step()),false);
  // 닫기 방법 있음 → 한 번 닫고 통과
  e=env();page(e);let clicked=0;const modal=e.add(e.doc.body,'div',{attrs:{class:'notice-modal'}});
  e.add(e.doc.body,'button',{id:'close'},b=>{b.click=()=>{clicked++;modal.remove();};});
  assert.equal(await rt(e,{dismiss:{'.notice-modal':'button#close'}}).judgeScreen(step()),true);assert.equal(clicked,1);
  // 닫아도 계속 뜨면 false(한 번만 닫는다)
  e=env();page(e);clicked=0;e.add(e.doc.body,'div',{attrs:{class:'notice-modal'}});e.add(e.doc.body,'button',{id:'close'},b=>{b.click=()=>{clicked++;};});
  assert.equal(await rt(e,{dismiss:{'.notice-modal':'button#close'}}).judgeScreen(step()),false);assert.equal(clicked,1);
});

test('S-7 첫 낱말 규칙 밖 동작·지원 안 하는 선택자는 아무것도 하기 전에 거부한다', async()=>{
  let e=env();page(e);
  let r=await rt(e).perform(step({elements:[{n:1,name:'시작일',find:'input#from',action:'입력'},{n:2,name:'b',find:'button#go',action:'드래그'}]}));
  assert.deepEqual([r.ok,r.reason],[false,'action-unsupported']);assert.deepEqual(e.events,[]);   // 앞 요소도 건드리지 않았다
  r=await rt(e).perform(step({elements:[{n:1,name:'a',find:'text:제목',action:'읽기'}]}));assert.equal(r.reason,'find-unsupported');
  r=await rt(e).perform(step({elements:[{n:1,name:'a',find:'frame:table.list',action:'읽기'}]}));assert.equal(r.reason,'find-unsupported');
  // 누르지 않음은 아무것도 하지 않는다
  r=await rt(e).perform(step({elements:[{n:1,name:'a',find:'button#go',action:'누르지 않음'}],extract:[]}));assert.equal(r.ok,true);
  // 자리표시 값 없음
  r=await createWebRuntime({browser:e.browser,sleep:e.sleep,params:{}}).perform(step());assert.equal(r.reason,'param-missing');
});

test('S-7 box와 find 위치가 어긋나면 locate.report 항목으로 중단하고 아무것도 누르지 않는다', async()=>{
  const el=(box,extra={})=>({n:1,name:'조회',find:'button#go',action:'클릭',box,...extra});
  const box={x:40,y:80,w:120,h:24,vw:800,vh:600,dpr:1};
  // 일치 → 수행
  let e=env();let clicked=0;e.add(e.doc.body,'button',{id:'go',rect:{left:40,top:80,width:120,height:24}},b=>{b.click=()=>clicked++;});
  let r=await rt(e).perform(step({elements:[el(box)],extract:[]}));assert.equal(r.ok,true);assert.equal(clicked,1);
  // 어긋남 → conflict + 보고 항목, 클릭 0
  e=env();clicked=0;e.add(e.doc.body,'button',{id:'go',rect:{left:600,top:400,width:120,height:24}},b=>{b.click=()=>clicked++;});
  r=await rt(e).perform(step({elements:[el(box)],extract:[]}));
  assert.deepEqual([r.ok,r.reason,clicked],[false,'conflict',0]);
  assert.deepEqual(r.report,{step:'S02',element:1,reason:'moved',sourceHash:'a'.repeat(64),shotSha256:'b'.repeat(64)});
  // 요소 없음 → conflict(missing)
  e=env();r=await rt(e).perform(step({elements:[el(box)],extract:[]}));assert.equal(r.reason,'conflict');assert.equal(r.report.reason,'missing');
  // 증거가 낡은 box(stale)는 대조하지 않는다
  e=env();clicked=0;e.add(e.doc.body,'button',{id:'go',rect:{left:600,top:400,width:120,height:24}},b=>{b.click=()=>clicked++;});
  r=await rt(e).perform(step({elements:[el(box,{stale:true})],extract:[]}));assert.equal(r.ok,true);assert.equal(clicked,1);
});

test('S-7 기대·대기 — 지연된 정상 결과는 성공, 이전 결과가 그대로면 expect-failed', async()=>{
  // 입력·클릭·지연된 새 결과(300ms) → 성공, 값은 values로만
  let e=env();let p=page(e,{onClick:tbl=>e.at(300,()=>{tbl.textContent='새 결과';})});
  let r=await rt(e).perform(step());
  assert.equal(r.ok,true);assert.deepEqual(r.values,{'목록 행':'새 결과'});assert.equal(p.input.value,'2026-01-01');
  assert.deepEqual(e.events.filter(x=>x[0]==='from').map(x=>x[1]),['input','change']);
  assert.ok(e.now()>=300&&e.now()<1000);
  // 클릭만 성공하고 결과가 끝내 안 옴(이전 결과 그대로) → expect-failed
  e=env();p=page(e);r=await rt(e).perform(step());
  assert.deepEqual([r.ok,r.reason],[false,'expect-failed']);assert.ok(e.now()>=1000);assert.equal(r.values,undefined);
  // 결과 칸이 비어 있고 끝내 안 채워짐 → expect-failed
  e=env();p=page(e,{before:''});r=await rt(e).perform(step());assert.equal(r.reason,'expect-failed');
  // 같은 값이어도 새로 읽은 것으로 인정해야 하면 지문 비교를 끈다
  e=env();p=page(e);r=await rt(e,{freshness:false}).perform(step());assert.equal(r.ok,true);assert.deepEqual(r.values,{'목록 행':'이전 결과'});
  // 이전 상태가 없던(없다가 생긴) 결과 칸은 생기면 성공
  e=env();e.add(e.doc.body,'input',{id:'from',value:''});e.add(e.doc.body,'button',{id:'go'},b=>{b.click=()=>e.at(200,()=>e.add(e.doc.body,'table',{attrs:{class:'list'},text:'생김'}));});
  r=await rt(e).perform(step({elements:[{n:1,name:'시작일',find:'input#from',action:'입력'},{n:2,name:'조회',find:'button#go',action:'클릭'}]}));assert.equal(r.ok,true);
});

test('T05 S-9 createApiRuntime.observe — 마지막 응답의 필드 경로 이름과 상태 코드만(값·식별자 모양이 아닌 키·민감 키 제외)', async()=>{
  const FAKE=['900101','1234567'].join('-');
  const body={result:{state:'ZZ-값',items:[{id:7,note:'ZZ-값'}],[FAKE]:'x','a b':1},meta:{count:2}};
  const f=fakeFetch({response:{status:202,body}});
  const rt=api(f);
  assert.deepEqual(rt.observe(),{shape:[],httpStatus:null});
  const r=await rt.perform(S04,ctx);   // result.status가 없다 → schema-mismatch
  assert.equal(r.reason,'schema-mismatch');
  const o=rt.observe();
  assert.deepEqual([...o.shape].sort(),['meta.count','result.items[].id','result.items[].note','result.state']);
  assert.equal(o.httpStatus,202);
  assert.ok(!JSON.stringify(o).includes('ZZ-값')&&!JSON.stringify(o).includes(FAKE));
  // 상태 불일치도 코드만 남는다
  const f2=fakeFetch({response:{status:503,body:{error:'ZZ-값'}}});const rt2=api(f2);
  assert.equal((await rt2.perform(S04,ctx)).reason,'status-mismatch');assert.deepEqual(rt2.observe(),{shape:[],httpStatus:503});
});

test('T05 S-1 createWebRuntime — 지도에 선언된 screen.dismiss를 호출자 주입 없이 적용한다', async()=>{
  const e=env();page(e);let clicked=0;const modal=e.add(e.doc.body,'div',{attrs:{class:'promo'}});
  e.add(e.doc.body,'button',{id:'x'},b=>{b.click=()=>{clicked++;modal.remove();};});
  const st=step({screen:{url:'^/box$',require:['table.list'],forbid:['.promo'],dismiss:[{when:'.promo',click:'button#x'}]}});
  assert.equal(await rt(e).judgeScreen(st),true);assert.equal(clicked,1);
  // 선언이 없으면 닫지 않고 멈춘다
  const e2=env();page(e2);e2.add(e2.doc.body,'div',{attrs:{class:'promo'}});
  assert.equal(await rt(e2).judgeScreen(step({screen:{url:'^/box$',require:['table.list'],forbid:['.promo']}})),false);
});

test('T05 검토1-⑦ 선언된 응답 경로가 모두 있어야 성공이고, 웹은 읽기 대상을 관찰했을 때만 expectChecked', async()=>{
  const st={...S04,extract:[],api:{...S04.api,response:[{path:'result.status',type:'선택값'},{path:'result.extra',type:'선택값'}]}};
  let f=fakeFetch({response:{status:202,body:{result:{status:'완료'}}}});
  assert.equal((await api(f).perform(st,ctx)).reason,'schema-mismatch');   // result.extra 없음
  f=fakeFetch({response:{status:202,body:{result:{status:'완료',extra:'x'}}}});
  const r=await api(f).perform(st,ctx);assert.equal(r.ok,true);assert.equal(r.expectChecked,true);
  // 웹: 읽기 대상이 있으면 true, 클릭만 있으면 false(기대 결과를 관찰하지 않았다)
  const e=env();page(e,{onClick:tbl=>e.at(200,()=>{tbl.textContent='새 결과';})});
  assert.equal((await rt(e).perform(step())).expectChecked,true);
  const e2=env();e2.add(e2.doc.body,'button',{id:'go'},b=>{b.click=()=>{};});
  const only=await rt(e2).perform(step({elements:[{n:1,name:'조회',find:'button#go',action:'클릭'}],extract:[]}));
  assert.equal(only.ok,true);assert.equal(only.expectChecked,false);
});
