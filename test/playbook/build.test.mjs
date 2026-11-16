import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const step=(id,o={})=>({id,title:'제목'+id,purpose:'목적',risk:'read',tool:'t.mjs',enter:'진입',identify:{anchors:['a']},elements:[{n:1,label:'버튼',find:'role=button',action:'click',wait:'x',expect:'y',onChange:'z'}],...o});
const tmps=[];
after(()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const mk=d=>{const dir=mkdtempSync(join(tmpdir(),'flow-'));tmps.push(dir);writeFileSync(join(dir,'steps.json'),JSON.stringify(d));return dir;};
const read=(dir,f)=>readFileSync(join(dir,f),'utf8');

test('S-1 risks·gate·lanes·base를 steps.json에서 읽어 반영한다', ()=>{
  const dir=mk({title:'T',updated:'2026-01-01',base:'references/x',lanes:{a:'가',b:'나'},risks:{danger:{label:'위험행위',color:'#b91c1c'}},
    steps:[step('S01',{lane:'both'}),step('S02',{risk:'danger',gate:'승인자 OK 필요',lane:'a'})]});
  assert.equal(buildFlow(dir),2);
  const ov=read(dir,'flow/overview.md');
  assert.match(ov,/위험행위 · \*\*승인자 OK 필요\*\*/);
  assert.match(ov,/공통\(가·나\)/);
  assert.match(ov,/references\/x\/flow\/S0n\.md/);
  assert.match(read(dir,'flow/S02.md'),/위험: 위험행위 · \*\*승인자 OK 필요\*\* · 대상: 가/);
  const html=read(dir,'flow.html');
  assert.match(html,/승인 관문/);
  assert.match(html,/위험행위/);
});

test('S-2 risks·lanes·gate가 없으면 읽기뿐이고 대상 칸·관문이 없다', ()=>{
  const dir=mk({title:'T',updated:'d',steps:[step('S01')]});
  buildFlow(dir);
  const ov=read(dir,'flow/overview.md');
  assert.match(ov,/\| 단계 \| 제목 \| 위험 \|/);
  assert.doesNotMatch(ov,/대상/);
  assert.match(read(dir,'flow/S01.md'),/위험: 읽기 /);
  assert.doesNotMatch(read(dir,'flow/S01.md'),/대상:|\*\*승인/);
  assert.doesNotMatch(read(dir,'flow.html'),/승인 관문|대상 구분/);
  assert.match(ov,/`flow\/S0n\.md`/);
});

test('S-3 없어진 단계 파일은 재생성 때 지운다', ()=>{
  const dir=mk({title:'T',updated:'d',steps:[step('S01'),step('S02')]});
  buildFlow(dir);
  assert.ok(existsSync(join(dir,'flow/S02.md')));
  writeFileSync(join(dir,'steps.json'),JSON.stringify({title:'T',updated:'d',steps:[step('S01')]}));
  buildFlow(dir);
  assert.deepEqual(readdirSync(join(dir,'flow')).sort(),['S01.md','overview.md']);
});

test('S-4 생성기 소스에 서비스 문구가 없다', ()=>{
  const src=readFileSync(join(here,'..','..','skills','pace-playbook-maker','tools','build.mjs'),'utf8');
  for(const w of ['발급해','정발','수발','홈택스','아마란스'])assert.ok(!src.includes(w),w);
});

test('S-5 미정의 위험 등급·중복 id는 오류', ()=>{
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('S01',{risk:'sign'})]})),/정의되지 않은 위험 등급/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('S01'),step('S01')]})),/중복 단계 id/);
});

test('S-5b 프로토타입 키 위험 등급·잘못된 id·없는 lane·잘못된 색상은 오류', ()=>{
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('S01',{risk:'constructor'})]})),/정의되지 않은 위험 등급/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('../escape')]})),/id 형식/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('A1')]})),/id 형식/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',lanes:{a:'가'},steps:[step('S01',{lane:'zz'})]})),/lanes에 없는 lane/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',risks:{x:{label:'x',color:'red;}</style>'}},steps:[step('S01',{risk:'x'})]})),/#hex/);
});

test('S-14 mask 형식 검증: 문자열 배열·컴파일 가능한 re:만 허용', ()=>{
  for(const mask of ['td',[],[1],['re:('],['']])
    assert.throws(()=>buildFlow(mk({title:'T',updated:'d',mask,steps:[step('S01')]})),/mask/);
  assert.equal(buildFlow(mk({title:'T',updated:'d',mask:['td','re:\\d+'],steps:[step('S01')]})),1);
});

const FIXTURE=join(here,'..','fixtures','playbook','sample-flow');
test('S-6 가상 흐름 fixture: gate는 S04 하나, 위험 등급은 read·send·private, 생성된다', ()=>{
  const d=JSON.parse(readFileSync(join(FIXTURE,'steps.json'),'utf8'));
  assert.deepEqual(d.steps.filter(s=>s.gate).map(s=>s.id),['S04']);
  assert.equal(d.steps.find(s=>s.id==='S04').risk,'send');
  assert.deepEqual([...new Set(d.steps.map(s=>s.risk))].sort(),['private','read','send']);
  const dir=mk(d);
  assert.equal(buildFlow(dir),4);
  assert.ok(read(dir,'flow/S04.md').includes('**사람의 보내기 승인 한마디 필요**'));
  assert.ok(read(dir,'flow/overview.md').includes('**목록 읽기** (S02~S03)'));
});

test('생성 머리말에 실제 --dir을 적는다', ()=>{
  const dir=mk({title:'T',updated:'d',steps:[step('S01')]});
  buildFlow(dir);
  assert.match(read(dir,'flow/S01.md'),/`node <PACE 설치본 app>\/skills\/pace-playbook-maker\/tools\/build\.mjs --dir [^`\n]+`로 만든다\(`<PACE 설치본 app>`은 PACE 데이터 폴더의 `app`/);
});

test('capture:false 단계는 캡처 금지로 표시한다', ()=>{
  const dir=mk({title:'T',updated:'d',steps:[step('S01',{capture:false,captureNote:'개인정보 화면'})]});
  buildFlow(dir);
  assert.match(read(dir,'flow/S01.md'),/캡처 금지 — 개인정보 화면/);
  assert.match(read(dir,'flow.html'),/캡처 금지 — 개인정보 화면/);
});

// P008/T07 — 운영 한 명령(run)·도구 설명(toolNote)·비결정 이벤트(events)
const steps3=()=>[step('S01'),step('S02'),step('S03'),step('S04')];
test('T-1 run: 운영 실행 절과 범위 단계 파일에만 한 줄, run 없으면 절 없음', ()=>{
  const dir=mk({title:'T',updated:'d',run:[{label:'A 회사',command:'node a.mjs --x',covers:['S02','S03'],note:'노트'},{label:'B 회사',command:'node b.mjs',covers:['S02','S04']}],steps:steps3()});
  buildFlow(dir);
  const ov=read(dir,'flow/overview.md'),html=read(dir,'flow.html');
  assert.match(ov,/## 운영 실행/);assert.match(ov,/A 회사.*S02~S03.*`node a\.mjs --x`.*노트/);assert.match(ov,/B 회사.*S02~S04/);
  assert.match(html,/운영 실행/);assert.match(html,/node b\.mjs/);
  assert.doesNotMatch(read(dir,'flow/S01.md'),/운영:/);
  assert.match(read(dir,'flow/S03.md'),/운영: `A 회사` 명령 안에서 실행/);assert.match(read(dir,'flow/S03.md'),/운영: `B 회사` 명령 안에서 실행/);
  assert.match(read(dir,'flow/S04.md'),/운영: `B 회사`/);assert.doesNotMatch(read(dir,'flow/S04.md'),/`A 회사`/);
  const none=mk({title:'T',updated:'d',steps:steps3()});buildFlow(none);
  assert.doesNotMatch(read(none,'flow/overview.md'),/운영 실행/);assert.doesNotMatch(read(none,'flow.html'),/운영 실행/);assert.doesNotMatch(read(none,'flow/S02.md'),/운영:/);
});
test('T-1 run 검사: 없는 id·역순·label 중복·빈 command·형식 오류는 생성 실패', ()=>{
  const bad=run=>assert.throws(()=>buildFlow(mk({title:'T',updated:'d',run,steps:steps3()})),/run/);
  bad([{label:'a',command:'x',covers:['S02','S09']}]);
  bad([{label:'a',command:'x',covers:['S03','S02']}]);
  bad([{label:'a',command:'x',covers:['S02','S03']},{label:'a',command:'y',covers:['S02','S03']}]);
  bad([{label:'a',command:' ',covers:['S02','S03']}]);
  bad([{label:'',command:'x',covers:['S02','S03']}]);
  bad({label:'a',command:'x',covers:['S02','S03']});
  bad([{label:'a',command:'x',covers:['S02']}]);
});
test('T-2 tool은 경로·CLI만, 설명은 toolNote', ()=>{
  for(const tool of ['a.mjs (fn)','a.mjs — 설명','a.mjs + b.mjs','a.mjs（fn）'])assert.throws(()=>buildFlow(mk({title:'T',updated:'d',steps:[step('S01',{tool})]})),/tool/,tool);
  const dir=mk({title:'T',updated:'d',steps:[step('S01',{tool:'orca tab create'}),step('S02',{tool:'a.mjs',toolNote:'openUi → readMenu'})]});
  buildFlow(dir);
  assert.match(read(dir,'flow/S02.md'),/\*\*도구\*\*: `a\.mjs` — openUi → readMenu/);
  assert.match(read(dir,'flow/S01.md'),/\*\*도구\*\*: `orca tab create`\n/);
  assert.match(read(dir,'flow.html'),/a\.mjs<\/code> — openUi → readMenu/);
});
test('T-3 events: 개요·html 절, 지정 단계 파일에만, 없는 단계 id는 실패', ()=>{
  const dir=mk({title:'T',updated:'d',events:[{when:'앱이 탭을 연다',then:'자기 탭으로 닫는다',steps:['S02']},{when:'공지가 늦게 뜬다',then:'맨 위만 닫고 다시'}],steps:steps3()});
  buildFlow(dir);
  const ov=read(dir,'flow/overview.md');
  assert.match(ov,/## 비결정 이벤트/);assert.match(ov,/앱이 탭을 연다 → 자기 탭으로 닫는다 \(S02\)/);assert.match(ov,/공지가 늦게 뜬다 → 맨 위만 닫고 다시/);
  assert.match(read(dir,'flow.html'),/비결정 이벤트/);
  assert.match(read(dir,'flow/S02.md'),/## 이 단계의 비결정 이벤트\n- 앱이 탭을 연다 → 자기 탭으로 닫는다/);
  assert.doesNotMatch(read(dir,'flow/S03.md'),/비결정 이벤트/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',events:[{when:'x',then:'y',steps:['S09']}],steps:steps3()})),/events/);
  assert.throws(()=>buildFlow(mk({title:'T',updated:'d',events:[{when:'',then:'y'}],steps:steps3()})),/events/);
  const none=mk({title:'T',updated:'d',steps:steps3()});buildFlow(none);assert.doesNotMatch(read(none,'flow/overview.md'),/비결정 이벤트/);
});