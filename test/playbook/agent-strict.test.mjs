// 지도 생성기의 엄격성: 중첩 객체 허용 키·승인 증거 의미 검증·실행 정보 투영 (독립 검토에서 재현된 결함 회귀)
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {canonicalJson,sha256Hex} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const FIX=join(here,'..','fixtures','playbook','sample-flow');
const tmps=[];
after(()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const stepOf=(d,id)=>d.steps.find(s=>s.id===id);
const rehash=d=>{d.valueReview.contentHash=contentHash(d);return d;};
// 승인 기록을 고친 뒤 recordHash를 다시 계산해(해시 일치만으로는 통과하면 안 되는 위조) 저장한다
const reseal=s=>{s.recordHash=sha256Hex(canonicalJson(s.captureRecord));};
function flow(mut){
  const dir=mkdtempSync(join(tmpdir(),'agent-strict-'));tmps.push(dir);cpSync(FIX,dir,{recursive:true});
  if(mut){const d=JSON.parse(readFileSync(join(dir,'steps.json'),'utf8'));mut(d);writeFileSync(join(dir,'steps.json'),JSON.stringify(d,null,1)+'\n');}
  return dir;
}
const err=dir=>{try{buildFlow(dir);return null;}catch(e){return e.message;}};
const J=(dir,f)=>JSON.parse(readFileSync(join(dir,f),'utf8'));

test('중첩 객체: 허용 키 밖 필드는 지도로 새지 않고 거부(extract.where·api·request·response·screen·extract 항목)', ()=>{
  // 독립 검토 재현: where에 정의되지 않은 value를 끼우면 S02.json에 남던 결함
  const bad=err(flow(d=>{stepOf(d,'S02').extract[0].where.value=7;rehash(d);}));
  assert.match(bad,/extract\[0\]\.where\.value는 허용 필드가 아니다/);
  // 같은 자리에 실값 모양 숫자를 넣으면 민감 형식으로 먼저 거부(값은 오류에 없다)
  const sens=err(flow(d=>{stepOf(d,'S02').extract[0].where.value=1234567890123;rehash(d);}));
  assert.match(sens,/민감 형식 거부/);assert.ok(!sens.includes('1234567890123'));
  assert.match(err(flow(d=>{stepOf(d,'S02').extract[0].secret='x';rehash(d);})),/extract\[0\]\.secret는 허용 필드가 아니다/);
  assert.match(err(flow(d=>{stepOf(d,'S04').api.extra='x';rehash(d);})),/api\.extra는 허용 필드가 아니다/);
  assert.match(err(flow(d=>{stepOf(d,'S04').api.request[0].sample='x';rehash(d);})),/request\[0\]\.sample는 허용 필드가 아니다/);
  assert.match(err(flow(d=>{stepOf(d,'S04').api.response[0].example='x';rehash(d);})),/response\[0\]\.example는 허용 필드가 아니다/);
  assert.match(err(flow(d=>{stepOf(d,'S02').screen.sample='x';rehash(d);})),/screen\.sample는 허용 필드가 아니다/);
  assert.match(err(flow(d=>{d.frames.viewer={selector:'iframe#v',note:'x'};rehash(d);})),/frames\.viewer\.note는 허용 필드가 아니다/);
});

test('승인 증거는 생성 때도 의미로 검증: post:false·elementsMasked 누락·가림 필수 0건은 해시를 다시 계산해도 거부', ()=>{
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.post=false;reseal(s);})),/captureRecord: post가 true가 아니다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');delete s.captureRecord.elementsMasked;reseal(s);})),/captureRecord: elementsMasked 형식 오류/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.elementsMasked={1:false};reseal(s);})),/elementsMasked 키가 boxes와 다르다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.elementsMasked['2']=false;reseal(s);})),/추출 대상 요소가 캡처에서 가려지지 않았다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.masking.perRule['td.owner']=0;reseal(s);})),/가림 필수 규칙이 캡처에서 0건/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.boxes['1'].w=-5;reseal(s);})),/box 값이 올바르지 않다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.view.vw=0;reseal(s);})),/view 값이 올바르지 않다/);
});

test('실행·복구에 필요한 정보가 지도에 있다: tool·command·frames·rules·onChangeProcedure·대기/다르면', ()=>{
  const dir=flow();buildFlow(dir);
  const s1=J(dir,'agent/S01.json');
  assert.equal(s1.tool,'reader.mjs');assert.equal(s1.command,'node reader.mjs login --page <page>');
  const idx=J(dir,'agent/index.json');
  assert.deepEqual(idx.frames,{viewer:{selector:'iframe#viewer'},side:{selector:'iframe#side',optional:true}});
  assert.deepEqual(idx.rules,['보내기 전에는 사람의 승인 한마디를 받는다.','화면 값은 기록하지 않는다.']);
  assert.deepEqual(idx.onChangeProcedure,['멈춘다.','화면 식별을 대조한다.','명세를 고치고 다시 생성한다.']);
  const html=readFileSync(join(dir,'agent/S02.html'),'utf8');
  assert.ok(html.includes('<th>대기</th>')&&html.includes('<th>다르면</th>')&&html.includes('표가 보인다'));
  assert.ok(readFileSync(join(dir,'agent/S01.html'),'utf8').includes('node reader.mjs login'));
  // 서술 필드(onChangeProcedure)를 바꾸면 재확인이 필요하다
  assert.match(err(flow(d=>{d.onChangeProcedure.push('몰래 추가한 절차');})),/검토 뒤.*바뀌었다/);
});

test('독립 검토 재현 2차: 기록 구조의 추가 키·객체 키의 민감 형식·computeAgent 단독 호출·캡처 단계의 screen 누락', async ()=>{
  const {computeAgent}=await import('../../skills/pace-playbook-maker/tools/agent-map.mjs');
  // captureRecord.view의 추가 키는 해시를 다시 계산해도 거부(허용 키 밖)
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.view.screenText='합성 임의 문자열';reseal(s);})),/view에 허용되지 않은 키가 있다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.extra=1;reseal(s);})),/기록에 허용되지 않은 키가 있다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S02');s.captureRecord.boxes['1'].text='x';reseal(s);})),/box에 허용되지 않은 키가 있다/);
  // 객체 키(frames 별칭)에 든 민감 형식은 지도에 실리기 전에 거부
  const k=err(flow(d=>{d.frames['synthetic@example.test']='iframe#x';rehash(d);}));
  assert.match(k,/민감 형식 거부/);assert.ok(!k.includes('synthetic@example.test'));
  assert.match(err(flow(d=>{d.frames['잘못된 별칭']='iframe#x';rehash(d);})),/frames 별칭 형식 오류|민감 형식/);
  // computeAgent를 직접 부르는 경로도 민감 형식 검사를 건너뛰지 않는다
  const dir=flow(d=>{stepOf(d,'S01').command='node x.mjs --id 123456789012';rehash(d);});
  const d=JSON.parse(readFileSync(join(dir,'steps.json'),'utf8'));
  assert.throws(()=>computeAgent(d,dir,readFileSync(join(dir,'steps.json'),'utf8')),/민감 형식 거부/);
  // 캡처 단계에서 screen 판정 정보가 빠지면 생성 거부
  assert.match(err(flow(d=>{delete stepOf(d,'S02').screen;rehash(d);})),/캡처 단계는 screen\.url·require\(1개 이상\)·forbid가 필요/);
  assert.match(err(flow(d=>{stepOf(d,'S02').screen.require=[];rehash(d);})),/캡처 단계는 screen/);
  // 화면 식별(identify)이 지도에 전달된다
  const ok=flow();buildFlow(ok);
  assert.deepEqual(J(ok,'agent/S02.json').identify,{title:'보관함',anchors:['목록 표가 보인다','제목이 보관함이다']});
});

test('숫자 값도 민감 형식 검사 대상: title 등에 숫자 실값을 넣으면 거부, 캡처 좌표 숫자는 정상', ()=>{
  const m=err(flow(d=>{d.title=1234567890123;rehash(d);}));
  assert.match(m,/민감 형식 거부/);assert.ok(!m.includes('1234567890123'));
  assert.match(err(flow(d=>{stepOf(d,'S02').elements[0].expect=9001011234567;rehash(d);})),/민감 형식 거부/);
  assert.equal(err(flow()),null);
});

test('독립 검토 재현 3차: 문자열 자리의 객체·정규식에 숨은 이메일은 출력 스키마·이스케이프 해제 검사로 거부', ()=>{
  // 문자열 필드 자리에 객체를 넣어 숫자 예외를 타고 지도에 실리던 경로
  const o=err(flow(d=>{stepOf(d,'S02').elements[0].action={captureRecord:{view:123456789012}};rehash(d);}));
  assert.ok(o&&!o.includes('123456789012'),'값이 오류에 있거나 거부되지 않았다');
  assert.match(o,/허용되지 않은 필드·타입|민감 형식|find·action이 필요/);
  assert.match(err(flow(d=>{stepOf(d,'S02').title=['목록',{x:1}];rehash(d);})),/허용되지 않은 필드·타입/);
  assert.match(err(flow(d=>{stepOf(d,'S02').success=42;rehash(d);})),/허용되지 않은 필드·타입/);
  // 화면 URL 정규식의 구두점 이스케이프에 숨은 이메일
  const m=err(flow(d=>{stepOf(d,'S02').screen.url='^/users/alice@example\.test$';}));
  assert.match(m,/민감 형식 거부/);assert.ok(!m.includes('alice@example'));
  // 선택자에 숨은 전화번호
  assert.match(err(flow(d=>{stepOf(d,'S03').elements[0].find='a[href="tel:010\-1234\-5678"]';rehash(d);})),/민감 형식 거부/);
  // 정상 표본은 출력 스키마를 통과한다
  assert.equal(err(flow()),null);
});

test('독립 검토 재현 4차: 화면 판정·프레임이 바뀌면 이전 캡처 증거를 재사용하지 않고(stale), 기록 생성·승인 경로도 민감 형식을 거부', async ()=>{
  const {captureRecord,approveStep,sha256Hex:sha}=await import('../../skills/pace-playbook-maker/tools/capture-core.mjs');
  // 프레임 선택자 변경 → 모든 요소 stale, 그래도 생성은 된다(복구가 사람 없이 고칠 수 있는 위치 필드)
  const f=flow(d=>{d.frames.viewer='iframe#other';});
  assert.equal(err(f),null);
  assert.ok(J(f,'agent/S02.json').elements.every(e=>e.box===null&&e.stale===true));
  // 화면 판정 변경 → stale
  const u=flow(d=>{stepOf(d,'S02').screen.url='^/other$';});
  assert.equal(err(u),null);
  assert.ok(J(u,'agent/S02.json').elements.every(e=>e.stale===true));
  // 바뀌지 않은 단계(S03)의 증거는 유지(프레임 변경은 전역이라 S03도 stale — 보수적)
  const keep=flow();buildFlow(keep);
  assert.ok(J(keep,'agent/S03.json').elements.every(e=>e.box&&!e.stale));
  // 캡처 기록 생성·승인 경로의 민감 형식 거부(find에 이메일)
  const step={id:'S09',elements:[{n:1,find:'text:sample@example.com'}],maskRequire:[],extract:[]};
  const info={masked:0,errors:[],frames:{},perRule:{},missing:[],boxes:{1:{x:1,y:1,w:5,h:5}},elementsMasked:{1:false},view:{vw:800,vh:600,dpr:1}};
  assert.throws(()=>captureRecord({info,post:{ok:true,reasons:[]},step,shotSha256:sha('x')}),e=>e.code==='record_sensitive');
  assert.ok(!(()=>{try{captureRecord({info,post:{ok:true,reasons:[]},step,shotSha256:sha('x')});}catch(e){return e.message;}})().includes('sample@example.com'));
});

test('독립 검토 재현 5차: 기록의 키(perRule)도 민감 형식 검사, HTML에도 화면 판정·식별·이벤트·위치 정책이 실린다', async ()=>{
  const {captureRecord,approveStep,sha256Hex:sha}=await import('../../skills/pace-playbook-maker/tools/capture-core.mjs');
  const step={id:'S09',elements:[{n:1,find:'#a'}],maskRequire:[],extract:[]};
  const info={masked:1,errors:[],frames:{},perRule:{'sample@example.com':1},missing:[],boxes:{1:{x:1,y:1,w:5,h:5}},elementsMasked:{1:true},view:{vw:800,vh:600,dpr:1}};
  assert.throws(()=>captureRecord({info,post:{ok:true,reasons:[]},step,shotSha256:sha('x')}),e=>e.code==='record_sensitive');
  const ok=captureRecord({info:{...info,perRule:{'td.owner':1}},post:{ok:true,reasons:[]},step,shotSha256:sha('x')});
  const {recordHash,...payload}=ok;
  const bad={...payload,masking:{masked:1,perRule:{'sample@example.com':1}}};
  assert.throws(()=>approveStep(step,{...bad,recordHash:sha256Hex(canonicalJson(bad))},{approvedSha:sha('x')}),e=>e.code==='approve_sensitive');
  const dir=flow();buildFlow(dir);
  const html=readFileSync(join(dir,'agent/S02.html'),'utf8');
  assert.ok(html.includes('화면 판정')&&html.includes('^/box$')&&html.includes('table.list')&&html.includes('.notice-modal'));
  assert.ok(html.includes('화면 식별')&&html.includes('목록 표가 보인다'));
  assert.ok(html.includes('비결정 이벤트')&&html.includes('공지 창이 늦게 뜬다'));
  assert.ok(html.includes('위치 정책')&&html.includes('onConflict'.replace('onConflict','stop')));
});

test('독립 검토 재현 6차: 요소의 find·action 필수, 민감 키는 오류 경로에도 되쓰지 않음, capturePage·toolNote·lanes 투영', ()=>{
  assert.match(err(flow(d=>{delete stepOf(d,'S02').elements[0].action;rehash(d);})),/find·action이 필요하다/);
  assert.match(err(flow(d=>{stepOf(d,'S02').elements[1].find='';rehash(d);})),/find·action이 필요하다/);
  const m=err(flow(d=>{d.frames={'sample@example.com':{selector:'iframe#x',note:'x'}};}));
  assert.match(m,/민감 형식 거부/);assert.ok(!m.includes('sample@example.com'),'오류 경로에 민감 키가 있다');
  assert.match(err(flow(d=>{d.frames={'ok-alias':{'sample@example.com':'x'}};})),/<키>|<민감 키>/);
  const dir=flow();buildFlow(dir);
  assert.equal(J(dir,'agent/S01.json').capturePage,'로그인 팝업이면 팝업 탭을 활성화한 뒤 찾는다');
  assert.equal(J(dir,'agent/S01.json').toolNote,'login 함수');
  assert.deepEqual(J(dir,'agent/index.json').lanes,{forward:'정방향',cancel:'취소'});
  assert.ok(readFileSync(join(dir,'agent/S01.html'),'utf8').includes('캡처 탭'));
  // 서술 필드(capturePage)를 바꾸면 재확인이 필요하다
  assert.match(err(flow(d=>{stepOf(d,'S01').capturePage='바뀐 안내';})),/검토 뒤.*바뀌었다/);
});

test('독립 검토 재현 7차: purpose·captureNote·changes.what·api.response.type 변경도 재확인 요구', ()=>{
  const h=m=>err(flow(m));
  assert.match(h(d=>{stepOf(d,'S02').purpose+=' 바뀜';}),/검토 뒤.*바뀌었다/);
  assert.match(h(d=>{stepOf(d,'S01').captureNote+=' 바뀜';}),/검토 뒤.*바뀌었다/);
  assert.match(h(d=>{d.changes[0].what+=' 바뀜';}),/검토 뒤.*바뀌었다/);
  assert.match(h(d=>{stepOf(d,'S04').api.response[0].type='YYYY-MM-DD';}),/검토 뒤.*바뀌었다/);
  assert.equal(h(d=>{stepOf(d,'S04').api.response[0].type='YYYY-MM-DD';rehash(d);}),null);
});

test('독립 검토 재현 8차: 명령 옵션의 자격증명 값 거부(자리표시는 통과), 단계 목적이 지도에 실린다', ()=>{
  const m=err(flow(d=>{stepOf(d,'S01').command='node login.mjs --password syntheticSecret';rehash(d);}));
  assert.match(m,/민감 형식 거부/);assert.ok(!m.includes('syntheticSecret'));
  assert.equal(err(flow(d=>{stepOf(d,'S01').command='node login.mjs --password <비밀번호>';rehash(d);})),null);
  assert.equal(err(flow(d=>{stepOf(d,'S01').command='node login.mjs --password-file <경로>';rehash(d);})),null);
  const dir=flow();buildFlow(dir);
  assert.equal(J(dir,'agent/S02.json').purpose,'문서 목록을 읽는다.');
  assert.ok(readFileSync(join(dir,'agent/S02.html'),'utf8').includes('문서 목록을 읽는다.'));
});

test('독립 검토 재현 9차: 추출 selector는 모든 단계에서 번호 요소와 이어져야 하고, 비캡처 웹 단계도 최소 실행 정보가 필요', ()=>{
  assert.match(err(flow(d=>{stepOf(d,'S04').extract[0].where={selector:'.absent'};rehash(d);})),/API 단계는 apiPath만 쓴다/);
  assert.match(err(flow(d=>{const s=stepOf(d,'S01');s.extract=[{name:'x',where:{selector:'.absent'},format:'문자열',sensitivity:'public',verify:'확인'}];rehash(d);})),/번호 요소의 find와 같지 않다/);
  assert.equal(err(flow(d=>{const s=stepOf(d,'S01');s.extract=[{name:'x',where:{selector:'input#user'},format:'문자열',sensitivity:'public',verify:'확인'}];rehash(d);})),null);
  // 비캡처 웹 단계: tool·success·화면 판정 중 하나라도 없으면 거부
  assert.match(err(flow(d=>{delete stepOf(d,'S01').tool;rehash(d);})),/캡처하지 않는 웹 단계도 tool·success/);
  assert.match(err(flow(d=>{stepOf(d,'S01').success='';rehash(d);})),/캡처하지 않는 웹 단계도 tool·success/);
  assert.match(err(flow(d=>{stepOf(d,'S01').identify={anchors:[]};delete stepOf(d,'S01').screen;rehash(d);})),/캡처하지 않는 웹 단계도 tool·success/);
});
