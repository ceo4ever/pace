// 플레이북 생성·검사 (T03 S-5·S-5b·S-6)
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,writeFileSync,cpSync,mkdirSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {generatePlaybook,checkPlaybook,DRIVING_VERSION} from '../../skills/pace-playbook-maker/tools/playbook.mjs';
import {buildFlow,checkAgentFresh} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {validInterview,fixtureInterview,alignFlow,makeWork,cleanup,tmp,readJson,writeJson,SKILL} from './t03-helpers.mjs';
import {tmpdir} from 'node:os';
import {checkAgreement} from '../../skills/pace-playbook-maker/tools/playbook.mjs';
import {saveInterview,checkInterview} from '../../skills/pace-playbook-maker/tools/interview.mjs';

after(cleanup);
const RRN=['900101','1234567'].join('-');
const gen=(work,name='box-list')=>{const out=join(tmp('pace-t03-out-'),name);generatePlaybook({workDir:work,outDir:out,name});return out;};
const tryGen=(work,name='box-list')=>{const out=join(tmp('pace-t03-out-'),name);try{generatePlaybook({workDir:work,outDir:out,name});return {out,err:null};}catch(e){return {out,err:e.message};}};
const files=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(d,e.name)).map(x=>e.name+'/'+x):[e.name]).sort();
const flowOf=work=>join(work,'flows','sample-flow');

test('S-5 정상: 승인 완료 흐름에서 플레이북 폴더가 만들어지고 SKILL.md에 합의가 담기며 checkPlaybook을 통과한다', ()=>{
  const out=gen(makeWork());
  const skill=readFileSync(join(out,'SKILL.md'),'utf8');
  assert.match(skill,/^---\nname: box-list\ndescription: .{20,}\n---/);
  for(const s of ['가상 서비스의 보관함 목록 조회까지(전송 제외)','목록 행 수가 응답 건수와 같다','전송 — 되돌릴 수 없음 · 관문: 사람의 보내기 승인 한마디 필요','box(web) https://app.example.test — 인증: env-token(BOX_TOKEN)','목록 행(문자열, masked) → result-sheet','종류: 주민번호','주 1회','공지 창이 늦게 뜬다','S01: auth','기간(YYYY-MM-DD) ← user'])
    assert.ok(skill.includes(s),`SKILL.md에 없음: ${s}`);
  assert.ok(skill.includes('[index.json](references/flows/sample-flow/agent/index.json)')&&skill.includes('[flow.html](references/flows/sample-flow/flow.html)'));
  // 흐름 색인은 단계 지도 파일 경로까지 모두 적고(탐색 없이 바로 읽기 — T06 측정), 적힌 경로는 모두 실재한다
  const ids=readJson(join(out,'references','flows','sample-flow','steps.json')).steps.map(s=>s.id);
  assert.ok(ids.length>1);
  for(const id of ids)assert.ok(skill.includes(`[${id}.json](references/flows/sample-flow/agent/${id}.json)`),`단계 지도 경로 없음: ${id}`);
  for(const m of skill.matchAll(/\]\((references\/[^)]+)\)/g))assert.ok(existsSync(join(out,m[1])),`색인 경로가 없다: ${m[1]}`);
  // 생성 머리말의 --dir은 최종 위치 자리표시다 — 임시 작업 폴더(사용자 이름이 든 절대 경로)가 남지 않는다(T06 유출 검사에서 드러남)
  for(const md of readdirSync(join(out,'references','flows','sample-flow','flow'))){
    const t=readFileSync(join(out,'references','flows','sample-flow','flow',md),'utf8');
    assert.ok(t.includes('--dir <플레이북 폴더>/references/flows/sample-flow'),`머리말 자리표시 없음: ${md}`);
    assert.ok(!t.includes(tmpdir())&&!t.includes(tmpdir().replace(/\\/g,'/'))&&!/pace-playbook-[A-Za-z0-9]{6}[\\/]/.test(t),`임시 경로가 남음: ${md}`);
  }
  assert.ok(skill.includes(`규약 버전 ${DRIVING_VERSION}`)&&skill.includes('`pace-playbook-maker` 스킬의 `references/driving.md`'));
  assert.ok(skill.includes('[references/history.md](references/history.md)'));
  assert.deepEqual(checkPlaybook(out),{ok:true,problems:[]});
  // 흐름 지도는 그 폴더에서도 최신
  assert.deepEqual(checkAgentFresh(join(out,'references','flows','sample-flow')),{ok:true,applicable:true,problems:[]});
});

test('S-6 산출물 목록: 기대한 파일뿐이고 interview.json·대기 파일 같은 작업 중간 파일이 없다', ()=>{
  const out=gen(makeWork());
  const list=files(out);
  assert.deepEqual(list.filter(f=>!f.startsWith('references/flows/')),['SKILL.md','references/history.md']);
  const flow=list.filter(f=>f.startsWith('references/flows/sample-flow/')).map(f=>f.slice('references/flows/sample-flow/'.length));
  for(const must of ['steps.json','shots/S02.jpg','shots/S03.jpg','agent/index.json','agent/S01.json','agent/S02.html','flow.html','flow/overview.md','flow/S04.md'])assert.ok(flow.includes(must),`흐름에 없음: ${must}`);
  assert.ok(!list.some(f=>/interview\.json|pending/.test(f)));
  assert.match(readFileSync(join(out,'references','history.md'),'utf8'),new RegExp(`규약 버전 ${DRIVING_VERSION}`));
  // 작업 폴더는 건드리지 않는다(재생성은 복사본에서)
  assert.ok(!existsSync(join(flowOf(makeWork()),'agent')));
});

test('S-5 driving.md 자리 파일: 머리말 버전이 DRIVING_VERSION과 같고 플레이북이 규약 본문을 복사하지 않는다', ()=>{
  const text=readFileSync(join(SKILL,'references','driving.md'),'utf8').replace(/\r\n/g,'\n');   // Windows 체크아웃(core.autocrlf)은 CRLF다
  assert.match(text,new RegExp(`^# 자율 주행 규약\\n\\n규약 버전: ${DRIVING_VERSION}\\n`));
  const out=gen(makeWork());
  assert.ok(!readFileSync(join(out,'SKILL.md'),'utf8').includes('본문은 T04가 쓴다'));
});

test('S-5 인터뷰 불완전·인터뷰 없음·흐름 없음·이름 오류·outDir 존재는 거부하고 outDir를 만들지 않는다', ()=>{
  const miss=makeWork(fixtureInterview({success:[]}));
  let r=tryGen(miss);assert.match(r.err,/인터뷰 기록이 완전하지 않다 — 빠진 항목: success/);assert.equal(existsSync(r.out),false);
  const noRisk=fixtureInterview();delete noRisk.riskyActions;
  r=tryGen(makeWork(noRisk));assert.match(r.err,/riskyActions/);assert.equal(existsSync(r.out),false);
  const noIv=makeWork();rmSync(join(noIv,'interview.json'));
  r=tryGen(noIv);assert.match(r.err,/interview\.json이 없다/);assert.equal(existsSync(r.out),false);
  const noFlow=makeWork();rmSync(join(noFlow,'flows'),{recursive:true});
  r=tryGen(noFlow);assert.match(r.err,/흐름이 없다/);assert.equal(existsSync(r.out),false);
  r=tryGen(makeWork(),'Bad_Name');assert.match(r.err,/name은 소문자/);assert.equal(existsSync(r.out),false);
  const exist=join(tmp(),'there');mkdirSync(exist);
  assert.throws(()=>generatePlaybook({workDir:makeWork(),outDir:exist,name:'box-list'}),/outDir가 이미 있다/);
});

test('S-5 파생물만 낡은 경우는 재생성해 통과하고, 승인 증거가 무효(캡처 교체·기록 수정·확인 해시)면 거부한다', ()=>{
  // 작업 폴더의 agent/·flow.html이 낡았거나 손으로 고쳐졌어도 steps.json·승인 캡처에서 다시 만들어 통과
  const stale=makeWork();
  buildFlow(flowOf(stale));
  writeFileSync(join(flowOf(stale),'agent','S03.json'),readFileSync(join(flowOf(stale),'agent','S03.json'),'utf8').replace('"문서 제목"','"손으로 고친 이름"'));
  writeFileSync(join(flowOf(stale),'flow.html'),'<html>낡음</html>');
  const out=gen(stale);
  assert.ok(!readFileSync(join(out,'references/flows/sample-flow/agent/S03.json'),'utf8').includes('손으로 고친 이름'));
  assert.ok(!readFileSync(join(out,'references/flows/sample-flow/flow.html'),'utf8').includes('낡음'));
  // 캡처 교체
  const swapped=makeWork();
  const shot=join(flowOf(swapped),'shots','S02.jpg');writeFileSync(shot,Buffer.concat([readFileSync(shot),Buffer.from('x')]));
  let r=tryGen(swapped);assert.match(r.err,/shots\/S02\.jpg가 없다|shotHash가 실제 캡처와 다르다/);assert.equal(existsSync(r.out),false);
  // 기록 수정(해시는 그대로)
  const tamper=makeWork();
  const d=readJson(join(flowOf(tamper),'steps.json'));d.steps.find(s=>s.id==='S02').captureRecord.boxes['1'].x=1;writeJson(join(flowOf(tamper),'steps.json'),d);
  r=tryGen(tamper);assert.match(r.err,/recordHash가 captureRecord와 다르다/);assert.equal(existsSync(r.out),false);
  // 확인 뒤 서술이 바뀜(valueReview 불일치)
  const reviewed=makeWork();
  const d2=readJson(join(flowOf(reviewed),'steps.json'));d2.purpose+=' 바뀜';writeJson(join(flowOf(reviewed),'steps.json'),d2);
  r=tryGen(reviewed);assert.match(r.err,/검토 뒤/);assert.equal(existsSync(r.out),false);
  // agentView가 아닌 흐름·base 불일치
  const off=makeWork();const d3=readJson(join(flowOf(off),'steps.json'));delete d3.agentView;writeJson(join(flowOf(off),'steps.json'),d3);
  r=tryGen(off);assert.match(r.err,/agentView 흐름이 아니다/);
  const baseBad=makeWork();const d4=readJson(join(flowOf(baseBad),'steps.json'));d4.base='x/y';writeJson(join(flowOf(baseBad),'steps.json'),d4);
  r=tryGen(baseBad);assert.match(r.err,/base가 references\/flows\/sample-flow가 아니다/);assert.equal(existsSync(r.out),false);
});

test('S-5 checkPlaybook: name 불일치·description 문제·SKILL 크기·깨진 링크·민감 형식·작업 중간 파일·낡은 지도를 각각 보고', ()=>{
  const out=gen(makeWork());
  const copy=(mut)=>{const d=join(tmp('pace-t03-chk-'),'box-list');cpSync(out,d,{recursive:true});mut(d);return checkPlaybook(d);};
  const skill=d=>join(d,'SKILL.md');
  const edit=(d,fn)=>writeFileSync(skill(d),fn(readFileSync(skill(d),'utf8')));
  assert.deepEqual(copy(()=>{}),{ok:true,problems:[]});
  assert.match(copy(d=>edit(d,t=>t.replace('name: box-list','name: other-name'))).problems.join('|'),/name이 폴더 이름과 다르다/);
  assert.match(copy(d=>edit(d,t=>t.replace('name: box-list','name: Box_List'))).problems.join('|'),/name 형식 오류/);
  assert.match(copy(d=>edit(d,t=>t.replace(/^description: .+$/m,'description: 짧다'))).problems.join('|'),/description은 한 줄 20~1024자/);
  assert.match(copy(d=>edit(d,t=>t.replace(/^description: .+$/m,'description: '+'가'.repeat(1100)))).problems.join('|'),/description은 한 줄 20~1024자/);
  assert.match(copy(d=>edit(d,t=>t+'\n'+'가'.repeat(9000))).problems.join('|'),/8192바이트/);
  assert.match(copy(d=>edit(d,t=>t+'\n[없는 파일](references/nowhere.md)\n')).problems.join('|'),/링크 대상이 없다: references\/nowhere\.md/);
  const sens=copy(d=>edit(d,t=>t+`\n값 ${RRN}\n`));
  assert.match(sens.problems.join('|'),/SKILL\.md: 민감 형식/);assert.ok(!sens.problems.join('|').includes(RRN));
  assert.match(copy(d=>writeFileSync(join(d,'interview.json'),'{}')).problems.join('|'),/작업 중간 파일이 산출물에 있다: interview\.json/);
  assert.match(copy(d=>{mkdirSync(join(d,'pending'));writeFileSync(join(d,'pending','S02.json'),'{}');}).problems.join('|'),/작업 중간 파일/);
  assert.match(copy(d=>writeFileSync(join(d,'references/flows/sample-flow/agent/S03.json'),'{}')).problems.join('|'),/지도가 낡았다/);
  assert.match(copy(d=>rmSync(join(d,'references/flows/sample-flow'),{recursive:true})).problems.join('|'),/흐름이 없다/);
  assert.equal(checkPlaybook(join(tmp(),'nothing')).ok,false);
});

test('S-5b 합의 보존: 서로 다른 인터뷰는 생성물이 그 인터뷰대로 달라지고 다른 인터뷰의 문장은 없다(범위 포함)', ()=>{
  const A=fixtureInterview();
  const B=fixtureInterview({
    goal:'가상 영수증 폴더를 점검한다',scope:'가상 영수증 폴더의 월별 합계 확인까지',inputs:[{name:'월',form:'YYYY-MM',source:'file'}],
    outputs:[{name:'월 합계',format:'숫자',sensitivity:'masked',deliverTo:'report-sheet'},{name:'영수증 제목',format:'문자열',sensitivity:'public'},{name:'전송 결과',format:'선택값',sensitivity:'public'}],resultTo:'report-sheet',
    services:[{alias:'rcpt',kind:'api',origin:'https://rcpt.example.test',auth:{method:'secret-store',source:'RCPT_SECRET'}}],
    success:['월 합계가 영수증 합과 같다'],riskyActions:[{name:'영수증 삭제',irreversible:true,gate:'삭제 전 사람 확인'},{name:'민감 화면 열람',irreversible:false}],
    exceptions:['월말에 합계가 늦게 갱신된다'],frequency:'월 1회',privacy:{kinds:['계좌번호'],handling:'계좌는 가리고 합계만 전달한다'},humanPoints:[{step:'S02',reason:'external'}]});
  const wB=makeWork(B);alignFlow(wB,B);
  const outA=gen(makeWork(A)),outB=gen(wB,'rcpt-check');
  const read=d=>readFileSync(join(d,'SKILL.md'),'utf8')+(existsSync(join(d,'references','agreements.md'))?readFileSync(join(d,'references','agreements.md'),'utf8'):'');
  const ta=read(outA),tb=read(outB);
  const key=iv=>[iv.scope,iv.success[0],iv.riskyActions[0].gate,iv.exceptions[0],iv.frequency,iv.privacy.handling,iv.privacy.kinds[0],iv.services[0].auth.source,iv.services[0].origin,iv.outputs[0].name,iv.resultTo,iv.inputs[0].name,iv.humanPoints[0].reason];
  for(const k of key(A)){assert.ok(ta.includes(k),`A 생성물에 없음: ${k}`);assert.ok(!tb.includes(k),`B 생성물에 A의 문장이 있다: ${k}`);}
  for(const k of key(B)){assert.ok(tb.includes(k),`B 생성물에 없음: ${k}`);assert.ok(!ta.includes(k),`A 생성물에 B의 문장이 있다: ${k}`);}
  assert.match(readFileSync(join(outB,'SKILL.md'),'utf8'),/^---\nname: rcpt-check\n/);
  for(const d of [outA,outB])assert.ok(!files(d).some(f=>/interview\.json/.test(f)));
});

test('S-5 SKILL.md가 길어지면 세부 합의를 references/agreements.md로 옮기고 요약·링크를 남긴다(8KB 한도 유지)', ()=>{
  const big=fixtureInterview({exceptions:Array.from({length:110},(_,i)=>`예외 ${i+1}: 화면이 ${i+1}번째로 다르게 뜨면 멈추고 보고한다`)});
  const out=gen(makeWork(big));
  const skill=readFileSync(join(out,'SKILL.md'),'utf8');
  assert.ok(existsSync(join(out,'references','agreements.md')));
  assert.ok(skill.includes('[references/agreements.md](references/agreements.md)'));
  assert.ok(!skill.includes('예외 110:')&&readFileSync(join(out,'references','agreements.md'),'utf8').includes('예외 110:'));
  assert.ok(skill.includes('가상 서비스의 보관함 목록 조회까지(전송 제외)')&&skill.includes('전송 — 되돌릴 수 없음'),'범위·안전 규칙은 SKILL.md에 남는다');
  assert.deepEqual(checkPlaybook(out),{ok:true,problems:[]});
});
