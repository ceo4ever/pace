// 에이전트 지도(agent/) 생성기·최신성 검사·민감 형식·접근 범위·해시 분류 검사
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,cpSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {buildFlow,checkAgentFresh,reviewHash} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {checkAccess,contentHash,formatOk,sourceHashOf} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {captureRecord,approveStep,sha256Hex} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const FIX=join(here,'..','fixtures','playbook','sample-flow');
const BUILD=join(here,'..','..','skills','pace-playbook-maker','tools','build.mjs');
const tmps=[];
after(()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const rd=dir=>JSON.parse(readFileSync(join(dir,'steps.json'),'utf8'));
const wr=(dir,d)=>writeFileSync(join(dir,'steps.json'),JSON.stringify(d,null,1)+'\n');
const text=(dir,f)=>readFileSync(join(dir,f),'utf8');
const jsonOf=(dir,f)=>JSON.parse(text(dir,f));
const rehash=d=>{d.valueReview.contentHash=contentHash(d);return d;};   // 사람이 검토를 마친 뒤 --review-hash 값을 적는 일
const stepOf=(d,id)=>d.steps.find(s=>s.id===id);
function flow(mut){
  const dir=mkdtempSync(join(tmpdir(),'agent-'));tmps.push(dir);
  cpSync(FIX,dir,{recursive:true});
  if(mut){const d=rd(dir);mut(d,dir);wr(dir,d);}
  return dir;
}
const err=dir=>{try{buildFlow(dir);return null;}catch(e){return e.message;}};

test('S-2 agentView 흐름은 agent/ 3종을 만들고 index 단계 목록·S0n.json 필드·html 박스 수가 맞는다', ()=>{
  const dir=flow();
  assert.equal(buildFlow(dir),4);
  const idx=jsonOf(dir,'agent/index.json');
  assert.deepEqual(idx.steps.map(s=>s.id),['S01','S02','S03','S04']);
  assert.deepEqual(idx.steps.map(s=>[s.html,s.json]),['S01','S02','S03','S04'].map(i=>[`${i}.html`,`${i}.json`]));
  assert.equal(idx.sourceHash,sourceHashOf(text(dir,'steps.json')));
  assert.equal(idx.start,'새 탭이 열려 있다.');
  assert.equal(idx.agentSchema,1);
  assert.deepEqual(readdirSync(join(dir,'agent')).sort(),['S01.html','S01.json','S02.html','S02.json','S03.html','S03.json','S04.html','S04.json','index.json']);
  const s2=jsonOf(dir,'agent/S02.json');
  assert.deepEqual(s2.screen,{url:'^/box$',require:['table.list'],forbid:['.notice-modal']});
  assert.equal(s2.elements.length,2);
  assert.deepEqual(s2.shot,{path:'shots/S02.jpg',sha256:sha256Hex(readFileSync(join(dir,'shots/S02.jpg')))});
  assert.deepEqual(s2.locate,{primary:'find',secondary:'box',onConflict:'stop',report:['step','element','reason','sourceHash','shotSha256']});
  assert.equal(s2.sourceHash,idx.sourceHash);
  assert.equal((text(dir,'agent/S02.html').match(/class="b"/g)||[]).length,2);
  assert.equal((text(dir,'agent/S01.html').match(/class="b"/g)||[]).length,0);
  assert.ok(!/<script/i.test(text(dir,'agent/S02.html')));
  // 사람용 생성물은 그대로 생성된다
  assert.ok(existsSync(join(dir,'flow.html'))&&existsSync(join(dir,'flow/overview.md')));
  // agentView가 꺼진 흐름은 agent/가 생기지 않는다
  const off=flow(d=>{delete d.agentView;});
  assert.equal(buildFlow(off),4);assert.ok(!existsSync(join(off,'agent')));
});

test('S-2b 지도 읽기 시뮬레이션: index+S0n.json만으로 대상·행동·추출·성공·진입·다음 단계가 고정 기대값과 같다', ()=>{
  const dir=flow();buildFlow(dir);
  const idx=jsonOf(dir,'agent/index.json');
  const walk=idx.steps.map(s=>jsonOf(dir,`agent/${s.json}`));
  assert.deepEqual(walk.map(s=>s.next),['S02','S03','S04',null]);
  assert.deepEqual(walk.map(s=>s.enter),['새 탭이 열려 있다.','S01 성공','S02 성공','S03 성공 + 승인']);   // 모든 단계 enter 보존
  const s2=walk[1];
  assert.equal(s2.elements[0].find,'input#from');assert.equal(s2.elements[0].action,'읽기');assert.equal(s2.elements[0].expect,'날짜 형식');
  assert.deepEqual(s2.extract[0],{name:'목록 행',where:{selector:'viewer:table.list'},format:'문자열',sensitivity:'masked',deliverTo:'result-sheet',verify:'행 수 = 응답 건수'});
  assert.equal(s2.success,'행 수가 응답 건수와 같다.');
  const s4=walk[3];
  assert.equal(s4.api.method,'POST');assert.equal(s4.api.successStatus,'202');assert.deepEqual(s4.api.response,[{path:'result.status',type:'선택값'}]);
  assert.equal(s4.api.request.find(q=>q.role==='target').name,'x-target-org');
  assert.deepEqual(s4.extract[0].where,{apiPath:'result.status'});
  assert.equal(s4.success,'전송 완료 문구가 보인다.');assert.equal(s4.escalate,'확인 창이 뜨지 않는다.');
  const html=text(dir,'agent/S04.html');
  assert.ok(html.includes('result.status')&&html.includes('x-target-org')&&html.includes('API 명세'));
  assert.ok(!html.includes('<img'),'캡처 없는 API 단계 html에 이미지가 없다');
  assert.ok(text(dir,'agent/S02.html').includes('result-sheet'));
  // masked·restricted는 deliverTo가 필요하다
  const e=err(flow(d=>{delete stepOf(d,'S02').extract[0].deliverTo;rehash(d);}));
  assert.match(e,/deliverTo가 필요/);
});

test('S-2c API 단계: success/escalate가 비면 생성 거부, 상태 코드·응답이 모두 없어도 거부', ()=>{
  assert.match(err(flow(d=>{stepOf(d,'S04').success='';rehash(d);})),/success·escalate/);
  assert.match(err(flow(d=>{delete stepOf(d,'S04').escalate;rehash(d);})),/success·escalate/);
  assert.match(err(flow(d=>{delete stepOf(d,'S04').api.successStatus;delete stepOf(d,'S04').api.response;stepOf(d,'S04').extract=[];rehash(d);})),/successStatus 또는 response/);
  // 응답 본문 없이 상태 코드로 성공하는 업무는 허용
  const ok=flow(d=>{delete stepOf(d,'S04').api.response;stepOf(d,'S04').extract=[];rehash(d);});
  assert.equal(err(ok),null);
  // 옛 표기(capture:false + 문구)만 있는 API 단계는 agentView 흐름에서 거부
  assert.match(err(flow(d=>{const s=stepOf(d,'S04');delete s.api;delete s.extract;s.captureNote='API 단계 — 응답을 관찰한다';rehash(d);})),/옛 표기/);
});

test('S-2d·S-2g 대상·권한: endpoint 변경은 actionHash만, origin·경로 이탈·합의 필드 변경은 거부·재확인', ()=>{
  const base=flow();buildFlow(base);
  const baseS4=jsonOf(base,'agent/S04.json');
  // ① allowedPaths 안 경로(자리표시 이름만 다름): 생성 통과, actionHash만 바뀌고 contentHash는 그대로
  const d0=rd(base);const h0=contentHash(d0);
  const a=flow(d=>{stepOf(d,'S04').api.endpoint='https://app.example.test/organizations/{org}/documents/{doc}/send?format=<형식>';});
  assert.equal(err(a),null);assert.equal(contentHash(rd(a)),h0);
  assert.notEqual(jsonOf(a,'agent/S04.json').actionHash,baseS4.actionHash);
  // ② 다른 origin
  assert.match(err(flow(d=>{stepOf(d,'S04').api.endpoint='https://other.example.test/organizations/{orgId}/documents/{docId}/send?format=<형식>';})),/allowedOrigins/);
  // ④ 같은 origin의 allowedPaths 밖 경로
  assert.match(err(flow(d=>{stepOf(d,'S04').api.endpoint='https://app.example.test/organizations/{orgId}/admin?format=<형식>';})),/allowedPaths/);
  // ③·⑤ 합의 필드만 고치면 contentHash 불일치(재확인 요구), 재확인(rehash) 뒤 통과
  assert.match(err(flow(d=>{d.allowedOrigins=['https://app.example.test','https://app2.example.test'];})),/검토 뒤.*바뀌었다/);
  assert.match(err(flow(d=>{d.allowedPaths.push('/organizations/{orgId}/documents/{docId}/resend');})),/검토 뒤.*바뀌었다/);
  assert.equal(err(flow(d=>{d.allowedPaths.push('/organizations/{orgId}/documents/{docId}/resend');rehash(d);})),null);
  // 대상 지정 query/header(role:target) 추가·삭제·이름 변경은 재확인 요구(음성), find 변경은 해시 불변·통과(양성)
  assert.match(err(flow(d=>{stepOf(d,'S04').api.request.find(q=>q.role==='target').name='x-other-org';})),/검토 뒤.*바뀌었다/);
  assert.match(err(flow(d=>{stepOf(d,'S04').api.request=stepOf(d,'S04').api.request.filter(q=>q.role!=='target');})),/검토 뒤.*바뀌었다/);
  const f=flow(d=>{stepOf(d,'S03').elements[0].find='text:문서 제목';stepOf(d,'S03').extract[0].where={selector:'text:문서 제목'};});
  assert.equal(contentHash(rd(f)),h0);
  assert.equal(err(f),null);
});

test('S-2f 접근 범위 판정 경계: 유사 호스트·포트·접두사·상위 이동·인코딩·역슬래시·userinfo·fragment·query 값', ()=>{
  const o=['https://app.example.test'],p=['/organizations/{orgId}/documents/{docId}/send'];
  const keys=new Set(['format']);
  const bad=u=>checkAccess(u,{allowedOrigins:o,allowedPaths:p,requestKeys:keys}).length>0;
  const base='https://app.example.test/organizations/{orgId}/documents/{docId}/send';
  assert.equal(bad(base),false);
  assert.equal(bad(base+'?format=<형식>'),false);
  assert.equal(bad(base.replace('app.example.test','app.example.test.evil.test')),true,'유사 호스트');
  assert.equal(bad(base.replace('https://app.example.test','https://app.example.test:8443')),true,'포트 다름');
  assert.equal(bad(base.replace('https:','http:')),true,'스킴 다름');
  assert.equal(bad(base+'/extra'),true,'경로 접두사만 같다');
  assert.equal(bad('https://app.example.test/organizations/{orgId}/documents'),true,'세그먼트 부족');
  assert.equal(bad('https://app.example.test/organizations/a/documents/b/send'),false,'자리표시 자리의 값');
  assert.equal(bad('https://app.example.test/organizations/{orgId}/documents/{docId}/../../admin'),true,'상위 이동');
  assert.equal(bad('https://app.example.test/organizations/{orgId}/documents/%2e%2e/admin/send'),true,'인코딩된 상위 이동');
  assert.equal(bad('https://app.example.test/organizations/a%2Fb/documents/c/send'),true,'인코딩된 구분자');
  assert.equal(bad('https://app.example.test/organizations/a\\b/documents/c/send'),true,'역슬래시');
  assert.equal(bad('https://user:pw@app.example.test/organizations/a/documents/b/send'),true,'userinfo');
  assert.equal(bad(base+'#frag'),true,'fragment');
  assert.equal(bad(base+'?format=pdf'),true,'query 값이 자리표시가 아니다');
  assert.equal(bad(base+'?other=<값>'),true,'선언되지 않은 query 키');
  assert.equal(bad('not a url'),true);
  // 자리표시가 든 origin 항목은 호스트 라벨 하나에만 일치
  const tenant={allowedOrigins:['https://<tenant>.example.test'],allowedPaths:p,requestKeys:keys};
  assert.equal(checkAccess('https://acme.example.test/organizations/a/documents/b/send',tenant).length,0);
  assert.ok(checkAccess('https://a.b.example.test/organizations/a/documents/b/send',tenant).length>0);
});

// 서로 다른 위치의 요소 3개를 가진 캡처 단계 한 개짜리 흐름을 만든다(approveStep으로 승인 기록 생성)
function capturedFlow({title='제목',purpose='목적',elements,boxes,masked=[],view={vw:1000,vh:800,dpr:1}}){
  const dir=mkdtempSync(join(tmpdir(),'agent-cap-'));tmps.push(dir);
  const shots=join(dir,'shots');cpSync(join(FIX,'shots'),shots,{recursive:true});
  const shot=readFileSync(join(shots,'S02.jpg'));writeFileSync(join(shots,'S01.jpg'),shot);
  const step={id:'S01',title,risk:'read',tool:'t.mjs',purpose,enter:'진입',identify:{anchors:['식별']},elements,maskRequire:[],success:'성공 문장',escalate:'멈춤 문장',screen:{url:'^/x$',require:['body'],forbid:[]},status:'captured'};
  const info={masked:masked.length,errors:[],frames:{},perRule:{},missing:[],boxes,elementsMasked:Object.fromEntries(elements.map(e=>[e.n,masked.includes(e.n)])),view};
  const rec=captureRecord({info,post:{ok:true,reasons:[]},step,shotSha256:sha256Hex(shot)});
  const d={title:'표본',updated:'2026-11-16',purpose:'표본 흐름',mask:['td'],allowedOrigins:['https://app.example.test'],allowedPaths:['/x'],agentView:true,
    valueReview:{date:'2026-11-16',reviewer:'검토자',note:'표본',contentHash:'0'.repeat(64)},steps:[approveStep(step,rec,{approvedSha:rec.shotSha256})]};
  rehash(d);wr(dir,d);return dir;
}
const EL3=[{n:1,label:'가',find:'#a',action:'읽기',wait:'없음',expect:'ㄱ',onChange:'멈춘다'},{n:2,label:'나',find:'#b',action:'읽기',wait:'없음',expect:'ㄴ',onChange:'멈춘다'},{n:3,label:'다',find:'#c',action:'읽기',wait:'없음',expect:'ㄷ',onChange:'멈춘다'}];
const BX3={1:{x:10,y:20,w:100,h:30},2:{x:200,y:20,w:50,h:30},3:{x:10,y:400,w:300,h:60}};

test('S-2e 서로 다른 위치 요소 3개: n→find→box→번호 박스 위치가 손으로 적은 고정 기대값과 같다', ()=>{
  const dir=capturedFlow({elements:EL3,boxes:BX3});buildFlow(dir);
  const s=jsonOf(dir,'agent/S01.json');
  assert.deepEqual(s.elements.map(e=>[e.n,e.find,e.box.x,e.box.y,e.box.w,e.box.h,e.box.vw,e.box.vh]),
    [[1,'#a',10,20,100,30,1000,800],[2,'#b',200,20,50,30,1000,800],[3,'#c',10,400,300,60,1000,800]]);
  const html=text(dir,'agent/S01.html');
  const boxes=[...html.matchAll(/data-n="(\d)" style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%"/g)].map(m=>[m[1],+m[2],+m[3],+m[4],+m[5]]);
  assert.deepEqual(boxes,[['1',1,2.5,10,3.75],['2',20,2.5,5,3.75],['3',1,50,30,7.5]]);   // x/vw, y/vh, w/vw, h/vh (%)
  assert.ok(html.includes('aspect-ratio:1000/800'));
});

test('S-2e HTML 이스케이프: 위험 문자열은 텍스트로만 나오고 실행 가능한 노드·속성이 생기지 않는다', ()=>{
  const evil='<img src=x onerror=alert(1)>"\'<script>1</script>';
  const dir=capturedFlow({title:evil,purpose:evil,elements:EL3.map(e=>({...e,label:evil,expect:evil})),boxes:BX3});
  buildFlow(dir);
  const html=text(dir,'agent/S01.html');
  assert.ok(!html.includes('<img src=x'),'이스케이프 빠짐');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/onerror=alert\(1\)>/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g,'')));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&lt;script&gt;'));
  // 지도 json은 원문 문자열 그대로(JSON 이스케이프)
  assert.equal(jsonOf(dir,'agent/S01.json').title,evil);
});

test('S-3c 승인→저장→생성→최신성 검사 연결, 같은 해시를 일반 문자열 경로에 넣으면 거부', ()=>{
  const dir=capturedFlow({elements:EL3,boxes:BX3,masked:[1,2,3]});
  assert.equal(buildFlow(dir),1);
  assert.deepEqual(checkAgentFresh(dir),{ok:true,applicable:true,problems:[]});
  const d=rd(dir);
  assert.match(d.steps[0].captureRecord.shotSha256,/^[0-9a-f]{64}$/);
  const bad=flow(x=>{x.purpose=x.steps[1].shotHash;});
  assert.match(err(bad),/민감 형식 거부/);
  assert.match(err(bad),/purpose \(/);
  assert.ok(!err(bad).includes(rd(bad).steps[1].shotHash),'오류에 값이 없다');
});

test('S-3d·S-3f 좌표의 출처는 captureRecord 하나: 외부 box·view·내부 수정은 거부, find 교환·복구는 stale 표시', ()=>{
  assert.match(err(flow(d=>{stepOf(d,'S02').elements[0].box={x:1,y:1,w:1,h:1};})),/elements\[0\]\.box는 steps\.json에 쓰지 않는다/);
  assert.match(err(flow(d=>{stepOf(d,'S02').view={vw:1,vh:1,dpr:1};})),/view는 steps\.json에 쓰지 않는다/);
  assert.match(err(flow(d=>{stepOf(d,'S02').captureRecord.boxes['1'].x=0;})),/recordHash가 captureRecord와 다르다/);
  assert.match(err(flow(d=>{delete stepOf(d,'S02').captureRecord;})),/captureRecord가 없다/);
  assert.match(err(flow(d=>{delete stepOf(d,'S02').shotHash;})),/shotHash가 없다/);
  // find 교환 → 둘 다 stale
  const swap=flow(d=>{const e=stepOf(d,'S02').elements;[e[0].find,e[1].find]=[e[1].find,e[0].find];});
  assert.equal(err(swap),null);
  assert.deepEqual(jsonOf(swap,'agent/S02.json').elements.map(e=>[e.box,e.stale]),[[null,true],[null,true]]);
  // 한 요소만 복구 변경 → 그 요소만 stale
  const one=flow(d=>{stepOf(d,'S02').elements[0].find='input#from-new';});
  assert.equal(err(one),null);
  const els=jsonOf(one,'agent/S02.json').elements;
  assert.deepEqual([els[0].box,els[0].stale],[null,true]);assert.equal(els[1].stale,undefined);assert.equal(els[1].box.x,40);
  // 바뀌지 않은 원본은 stale 없음
  const keep=flow();buildFlow(keep);
  assert.ok(jsonOf(keep,'agent/S02.json').elements.every(e=>e.box&&!e.stale));
});

test('S-4 최신성 검사: steps.json·캡처·생성물 변경은 낡음, 재생성 뒤 통과, agentView 없는 폴더는 해당 없음', ()=>{
  const dir=flow();buildFlow(dir);
  assert.equal(checkAgentFresh(dir).ok,true);
  // CLI도 같은 계약(종료코드)
  const cli=(...a)=>spawnSync(process.execPath,[BUILD,'--dir',dir,...a],{encoding:'utf8'});
  assert.equal(cli('--check-agent').status,0);
  // steps.json 한 글자 변경(위치 필드 — contentHash는 그대로라 생성은 되지만 agent/는 낡았다)
  const d=rd(dir);stepOf(d,'S01').tool='reader2.mjs';wr(dir,d);
  let r=checkAgentFresh(dir);
  assert.equal(r.ok,false);assert.ok(r.problems.some(p=>/steps\.json이 바뀌었다/.test(p)));
  const c=cli('--check-agent');assert.equal(c.status,1);assert.match(c.stderr,/낡음/);
  buildFlow(dir);assert.equal(checkAgentFresh(dir).ok,true);
  // 캡처 파일 교체·삭제
  const shot=join(dir,'shots/S02.jpg');const orig=readFileSync(shot);
  writeFileSync(shot,Buffer.concat([orig,Buffer.from('x')]));
  assert.ok(checkAgentFresh(dir).problems.some(p=>/shotHash가 실제 캡처와 다르다/.test(p)));
  assert.match(err(dir),/shotHash가 실제 캡처와 다르다/);
  unlinkSync(shot);
  assert.ok(checkAgentFresh(dir).problems.some(p=>/shots\/S02\.jpg가 없다/.test(p)));
  writeFileSync(shot,orig);assert.equal(checkAgentFresh(dir).ok,true);
  // 생성물을 손으로 고침
  writeFileSync(join(dir,'agent/S03.json'),text(dir,'agent/S03.json').replace('"문서 제목"','"고친 이름"'));
  assert.ok(checkAgentFresh(dir).problems.some(p=>/S03\.json이 정본과 다르다/.test(p)));
  buildFlow(dir);assert.equal(checkAgentFresh(dir).ok,true);
  // agentView 없는 폴더
  const off=flow(x=>{delete x.agentView;});buildFlow(off);
  assert.deepEqual(checkAgentFresh(off),{ok:true,applicable:false,problems:[]});
  assert.match(spawnSync(process.execPath,[BUILD,'--dir',off,'--check-agent'],{encoding:'utf8'}).stdout,/검사 대상 아님/);
});

test('S-4b 파일 집합: 단계 삭제의 옛 파일·관리 밖 파일은 낡음, 재생성은 옛 관리 파일만 정리하고 관리 밖 파일은 생성 거부', ()=>{
  const dir=flow();buildFlow(dir);
  // 단계 S04 삭제(스키마에서 마지막 단계 제거)
  const d=rd(dir);d.steps=d.steps.filter(s=>s.id!=='S04');d.run=undefined;rehash(d);wr(dir,d);
  const r=checkAgentFresh(dir);
  assert.ok(r.problems.some(p=>/S04\.(json|html)은 없어진 단계의 옛 파일/.test(p)),r.problems.join('|'));
  buildFlow(dir);
  assert.deepEqual(readdirSync(join(dir,'agent')).sort(),['S01.html','S01.json','S02.html','S02.json','S03.html','S03.json','index.json']);
  assert.equal(checkAgentFresh(dir).ok,true);
  // 관리 밖 파일
  writeFileSync(join(dir,'agent/extra.txt'),'x');
  assert.ok(checkAgentFresh(dir).problems.some(p=>/extra\.txt은 관리 밖 파일/.test(p)));
  assert.match(err(dir),/관리 밖 파일/);
  assert.ok(existsSync(join(dir,'agent/extra.txt')),'지우지 않는다');
  unlinkSync(join(dir,'agent/extra.txt'));
  assert.equal(err(dir),null);
});

test('S-6 민감 형식: 형식마다 거부·오류에 값 없음, 꺼진 흐름은 영향 없음, 인코딩·토큰류·자리표시 경계', ()=>{
  const cases={
    주민번호:'900101-1234567',카드:'1234-5678-9012-3456',계좌형:'1002123456789',전화:'010-1234-5678',이메일:'qa-user@example.org',
    // 합성 비밀 표본은 조각으로 이어 붙여 만든다(저장소 비밀 검사가 리터럴로 오인하지 않게)
    토큰:['Zk3pQ9vL','2mX8rT5w','Y1nB7cD4','fG6h'].join(''),JWT형태:['eyJhbGci','OiJIUzI1NiJ9','.eyJzdWIiOiIx','MjM0NTY3ODkwIn0','.abcdefghijk'].join(''),자격증명:['pass','word=','hunter2','value'].join('')
  };
  for(const [kind,value] of Object.entries(cases)){
    const dir=flow(d=>{d.purpose='설명 '+value;});
    const m=err(dir);
    assert.match(m,/민감 형식 거부/,kind);assert.match(m,/purpose/,kind);
    assert.ok(!m.includes(value),`${kind}: 오류에 값이 있다`);
    // agentView가 꺼진 같은 흐름은 영향 없다
    const off=flow(d=>{d.purpose='설명 '+value;delete d.agentView;});
    assert.equal(buildFlow(off),4,kind);
  }
  // 민감 형식이 기존 검증 오류 메시지로 새지 않는다(기존 validate가 값을 오류에 넣는 tool 필드)
  const leak=err(flow(d=>{stepOf(d,'S01').tool='x.mjs (900101-1234567)';}));
  assert.match(leak,/민감 형식 거부/);assert.ok(!leak.includes('900101-1234567'));
  // 인코딩된 이메일(URL query)
  const enc=err(flow(d=>{stepOf(d,'S04').api.endpoint='https://app.example.test/organizations/{orgId}/documents/{docId}/send?format=a%40b.test';}));
  assert.match(enc,/민감 형식 거부/);assert.ok(!enc.includes('a%40b.test'));
  // 정상: 자리표시 URL·자리표시 헤더·자격증명 이름만 있는 명세
  assert.equal(err(flow(d=>{stepOf(d,'S04').api.request.push({name:'authorization',in:'header',role:'param',form:'<인증값>'});stepOf(d,'S04').purpose='Authorization: <인증값> 헤더를 보낸다';rehash(d);})),null);
  // 정상 식별자(긴 단어형)는 토큰으로 오탐하지 않는다
  assert.equal(err(flow(d=>{stepOf(d,'S01').elements[0].find='#customer_transaction_history_form-input';rehash(d);})),null);
});

test('S-6 패턴 필드: 리터럴 이메일·전화는 거부, 순수 패턴은 통과, 리터럴 6자리 숫자는 거부', ()=>{
  assert.match(err(flow(d=>{d.mask.push('re:qa-user@example\\.org');})),/mask\[2\] \(이메일\)/);
  assert.match(err(flow(d=>{d.mask.push('re:010-1234-5678');})),/mask\[2\] \(전화\)/);
  assert.match(err(flow(d=>{d.mask.push('re:12345678');})),/mask\[2\]/);
  assert.match(err(flow(d=>{stepOf(d,'S02').revealInputs[0].value='^2026-11-16-qa@x\\.org$';})),/revealInputs\[0\]\.value/);
  assert.equal(err(flow(d=>{d.mask.push('re:\\d{3}-\\d{4}');d.mask.push('re:[\\w.]+@[\\w.]+');})),null);
});

test('S-6 valueReview·형식 문법·목록 밖 필드·해시 경로', ()=>{
  assert.match(err(flow(d=>{delete d.valueReview;})),/valueReview가 필요/);
  assert.match(err(flow(d=>{d.valueReview.note=' ';})),/note가 비어/);
  assert.match(err(flow(d=>{d.valueReview.contentHash='abc';})),/해시 형식 아님/);
  // 형식 선언: 형식 이름은 통과(수집은 막지 않는다), 실값 모양은 거부
  for(const fmt of ['주민번호','계좌번호','카드번호','전화번호','이메일','YYYY-MM-DD','선택값 | 문자열','<입력 형식>'])
    assert.equal(formatOk(fmt),true,fmt);
  for(const fmt of ['"홍길동"','abc','12345','주민번호 900101',''])assert.equal(formatOk(fmt),false,fmt);
  assert.equal(err(flow(d=>{stepOf(d,'S03').extract[0].format='주민번호';rehash(d);})),null);
  assert.match(err(flow(d=>{stepOf(d,'S03').extract[0].format='"홍길동"';rehash(d);})),/format은 형태 문법/);
  // 같은 실값 모양을 서술 필드에 넣으면 거부
  assert.match(err(flow(d=>{stepOf(d,'S03').purpose='값은 900101-1234567';})),/민감 형식 거부/);
  // where.box 직접 지정은 지원하지 않는다
  assert.match(err(flow(d=>{stepOf(d,'S03').extract[0].where={box:{x:1,y:1,w:1,h:1}};rehash(d);})),/box는 지원하지 않는다/);
  // 번호 요소와 이어지지 않는 selector·캡처 단계의 restricted
  assert.match(err(flow(d=>{stepOf(d,'S03').extract[0].where={selector:'#nowhere'};rehash(d);})),/번호 요소의 find와 같지 않다/);
  assert.match(err(flow(d=>{stepOf(d,'S03').extract[0].sensitivity='restricted';stepOf(d,'S03').extract[0].deliverTo='result-sheet';rehash(d);})),/restricted 추출은 둘 수 없다/);
  // 목록 밖 필드는 지도에 없다
  const dir=flow(d=>{stepOf(d,'S02').secretNote='지도에 나가면 안 된다';d.unknownTop='x';rehash(d);});
  buildFlow(dir);
  for(const f of readdirSync(join(dir,'agent')))assert.ok(!text(dir,`agent/${f}`).includes('지도에 나가면 안 된다')&&!text(dir,`agent/${f}`).includes('unknownTop'));
  // 요소 번호 중복
  assert.match(err(flow(d=>{stepOf(d,'S02').elements[1].n=1;})),/n이 중복/);
  // next가 배열 순서와 다르면 거부, 같으면 무시
  assert.match(err(flow(d=>{stepOf(d,'S01').next='S04';})),/next가 배열 순서와 다르다/);
  assert.equal(err(flow(d=>{stepOf(d,'S01').next='S02';})),null);
});

test('S-7 지도 출력 문자열 경로 집합이 명세 표와 같고, 단계 json은 8KB 이하', ()=>{
  const dir=flow();buildFlow(dir);
  const paths=new Set();
  const walk=(v,p)=>{if(typeof v==='string')paths.add(p);else if(Array.isArray(v))v.forEach(x=>walk(x,p+'[]'));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))walk(x,p?`${p}.${k}`:k);};
  for(const f of readdirSync(join(dir,'agent')).filter(f=>f.endsWith('.json'))){
    walk(jsonOf(dir,`agent/${f}`),f==='index.json'?'index':'step');
    if(/^S\d+\.json$/.test(f))assert.ok(Buffer.byteLength(text(dir,`agent/${f}`))<=8192,`${f} 크기`);
  }
  // 명세 표(원본 투영 + 생성기 도출)에서 나올 수 있는 출력 경로 — 손으로 적은 허용 집합
  const allowed=new Set(['index.generated','index.title','index.purpose','index.resultTo','index.allowedOrigins[]','index.allowedPaths[]','index.risks.read','index.risks.send','index.risks.private','index.lanes.forward','index.lanes.cancel','index.frames.viewer.selector','index.frames.side.selector','index.rules[]','index.onChangeProcedure[]','index.start','index.run[].label','index.run[].command','index.run[].covers[]','index.run[].note','index.events[].when','index.events[].then',
    'index.steps[].id','index.steps[].title','index.steps[].risk','index.steps[].gate','index.steps[].html','index.steps[].json','index.steps[].shot.path','index.steps[].shot.sha256','index.steps[].actionHash','index.sourceHash',
    'step.generated','step.id','step.title','step.purpose','step.risk','step.gate','step.lane','step.enter','step.identify.title','step.identify.anchors[]','step.tool','step.toolNote','step.command','step.capturePage','step.screen.url','step.screen.require[]','step.screen.dismiss[].when','step.screen.dismiss[].click','step.screen.forbid[]',
    'step.elements[].name','step.elements[].find','step.elements[].action','step.elements[].expect','step.elements[].wait','step.elements[].onChange',
    'step.extract[].name','step.extract[].where.selector','step.extract[].where.apiPath','step.extract[].format','step.extract[].sensitivity','step.extract[].deliverTo','step.extract[].verify',
    'step.api.method','step.api.endpoint','step.api.request[].name','step.api.request[].in','step.api.request[].role','step.api.request[].form','step.api.response[].path','step.api.response[].type','step.api.successStatus',
    'step.success','step.escalate','step.events[].when','step.events[].then','step.next','step.locate.primary','step.locate.secondary','step.locate.onConflict','step.locate.report[]','step.shot.path','step.shot.sha256','step.actionHash','step.sourceHash']);
  const extra=[...paths].filter(p=>!allowed.has(p));
  assert.deepEqual(extra,[],`명세 표에 없는 출력 경로: ${extra.join(', ')}`);
});

test('S-7b 필수 출력 키(표와 별도로 손으로 적음): 표·도출 규칙이 함께 틀려도 누락을 잡는다', ()=>{
  const dir=flow();buildFlow(dir);
  const idx=jsonOf(dir,'agent/index.json');
  for(const k of ['agentSchema','generated','sourceHash','start','steps','allowedOrigins','allowedPaths'])assert.ok(k in idx,`index.${k}`);
  for(const id of ['S02','S03']){
    const s=jsonOf(dir,`agent/${id}.json`);
    for(const k of ['enter','screen','elements','locate','next','sourceHash','actionHash','shot','view','extract','success'])assert.ok(k in s,`${id}.${k}`);
  }
  assert.ok('api' in jsonOf(dir,'agent/S04.json'));
  assert.ok(!('shot' in jsonOf(dir,'agent/S04.json')));
});

test('S-7c 해시 분류: 서술·합의 필드 변경은 contentHash가 바뀌고 위치·행동 필드 변경은 그대로(독립 기대값)', ()=>{
  const h0=contentHash(rd(flow()));
  const changed=m=>{const d=rd(flow());m(d);return contentHash(d)!==h0;};
  // 서술
  assert.equal(changed(d=>{d.title+='x';}),true);assert.equal(changed(d=>{stepOf(d,'S02').success+='x';}),true);
  assert.equal(changed(d=>{stepOf(d,'S02').elements[0].label+='x';}),true);assert.equal(changed(d=>{stepOf(d,'S02').extract[0].name+='x';}),true);
  // 합의
  assert.equal(changed(d=>{stepOf(d,'S02').risk='send';}),true,'risk');
  assert.equal(changed(d=>{d.resultTo='other-sheet';}),true,'resultTo');
  assert.equal(changed(d=>{d.allowedOrigins=['https://x.example.test'];}),true,'allowedOrigins');
  assert.equal(changed(d=>{d.allowedPaths=['/y'];}),true,'allowedPaths');
  assert.equal(changed(d=>{stepOf(d,'S02').extract[0].deliverTo='x';}),true,'deliverTo');
  assert.equal(changed(d=>{stepOf(d,'S02').extract[0].sensitivity='public';}),true,'sensitivity');
  assert.equal(changed(d=>{stepOf(d,'S02').extract[0].format='숫자';}),true,'extract.format');
  assert.equal(changed(d=>{stepOf(d,'S04').api.request[0].form='문자열';}),true,'api.request.form');
  // 위치·행동·토큰(복구가 사람 없이 고칠 수 있는 값)
  assert.equal(changed(d=>{stepOf(d,'S02').elements[0].find='#new';}),false,'find');
  assert.equal(changed(d=>{stepOf(d,'S02').screen.url='^/box2$';}),false,'screen.url');
  assert.equal(changed(d=>{stepOf(d,'S02').screen.require=['x'];}),false,'screen.require');
  assert.equal(changed(d=>{stepOf(d,'S01').tool='x.mjs';stepOf(d,'S01').command='node x.mjs';}),false,'tool·command');
  assert.equal(changed(d=>{stepOf(d,'S04').api.endpoint='https://app.example.test/organizations/{a}/documents/{b}/send';stepOf(d,'S04').api.method='PUT';}),false,'api.endpoint·method');
  assert.equal(changed(d=>{stepOf(d,'S04').api.request[0].name='fmt';}),false,'param 요청 이름');
  assert.equal(changed(d=>{stepOf(d,'S02').extract[0].where={selector:'x'};}),false,'extract.where');
  assert.equal(changed(d=>{stepOf(d,'S02').shotHash='0'.repeat(64);}),false,'shotHash');
  // actionHash: 행동 필드 변경은 바뀐다
  const base=flow();buildFlow(base);const a0=jsonOf(base,'agent/S04.json').actionHash;
  const mutated=flow(d=>{stepOf(d,'S04').api.method='PUT';});buildFlow(mutated);
  assert.notEqual(jsonOf(mutated,'agent/S04.json').actionHash,a0);
  // 같은 단계를 덮는 run의 command·covers 변경도 덮인 단계의 actionHash에 반영
  const withRun=d=>{d.run=[{label:'운영',command:'node run.mjs <page>',covers:['S02','S04']}];rehash(d);};
  const r1=flow(withRun);buildFlow(r1);
  const r2=flow(d=>{withRun(d);d.run[0].command='node run2.mjs <page>';rehash(d);});buildFlow(r2);
  const r3=flow(d=>{withRun(d);d.run[0].covers=['S02','S03'];rehash(d);});buildFlow(r3);
  assert.notEqual(jsonOf(r1,'agent/S03.json').actionHash,jsonOf(r2,'agent/S03.json').actionHash,'command 변경');
  assert.notEqual(jsonOf(r1,'agent/S04.json').actionHash,jsonOf(r3,'agent/S04.json').actionHash,'covers 변경으로 S04가 덮이지 않음');
  assert.equal(jsonOf(r1,'agent/S01.json').actionHash,jsonOf(r2,'agent/S01.json').actionHash,'덮이지 않은 단계는 불변');
});

test('--review-hash CLI는 contentHash를 출력하고, 생성은 그 값을 적어야 통과', ()=>{
  const dir=flow(d=>{d.purpose+=' 수정';});
  assert.match(err(dir),/검토 뒤.*바뀌었다/);
  const out=execFileSync(process.execPath,[BUILD,'--dir',dir,'--review-hash'],{encoding:'utf8'}).trim();
  assert.equal(out,reviewHash(dir));
  const d=rd(dir);d.valueReview.contentHash=out;wr(dir,d);
  assert.equal(err(dir),null);
});
