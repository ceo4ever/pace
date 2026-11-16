// pace-playbook-maker 스킬 문서 검사 — 절·크기·서비스 비의존·필드 사전 완전성·어댑터 핵심어
// 스킬 경로는 PACE 저장소 루트 기준(스킬을 옮기면 SKILL 상수를 바꾼다 — SKILL.md "도구 위치" 참고)
import {test} from 'node:test';
import {privateBanned} from './private-banned.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SKILL=join(ROOT,'skills/pace-playbook-maker');
// 사례: 스키마 사전의 모든 필드를 쓰는 가상 흐름(비식별 fixture) — 새 필드가 사전에서 빠지지 않게
const FLOWS=join(ROOT,'test/fixtures/playbook');
const CASES=readdirSync(FLOWS).map(f=>join(FLOWS,f,'steps.json')).filter(p=>existsSync(p));
const read=p=>readFileSync(p,'utf8');
const files=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?files(p):[p];});
const skill=()=>read(join(SKILL,'SKILL.md'));
const section=(t,name)=>{const m=new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,'m').exec(t);return m?m[1]:null;};

test('S-1 SKILL.md: frontmatter·절·생성물 규칙·API 미검증·링크·크기', ()=>{
  const t=skill();
  const fm=/^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
  assert.ok(fm,'frontmatter 없음');
  assert.match(fm[1],/^name: pace-playbook-maker$/m);
  const desc=/^description: (.+)$/m.exec(fm[1]);
  assert.ok(desc&&desc[1].trim().length>20,'description 비어 있음');
  assert.match(desc[1],/실행하는 요청에는 쓰지 않는다/,'업무 실행 제외 문구');
  assert.ok(!/API/i.test(desc[1]),'description이 미검증 API 단계를 지원처럼 알린다');
  for(const s of ['도구 위치','절차','보안 규칙'])assert.ok(section(t,s),`절 없음: ${s}`);
  assert.match(t,/직접 고치지 않는다/);
  assert.match(section(t,'절차'),/API 단계[^\n]*\*\*미검증\*\*/);
  for(const step of ['기존 도구','steps.json','어댑터','캡처','--approve','--sha','생성기','UI 변경','`run`','`toolNote`','`events`','재구성 검증','중간에 멈춰야'])assert.ok(section(t,'절차').includes(step),`절차에 없음: ${step}`);
  for(const k of ['fail-closed','실행 직전 사람','버전 관리 밖','환경 변수','사전 승인','범위·기준을 바꾸는'])assert.ok(section(t,'보안 규칙').includes(k),`보안 규칙에 없음: ${k}`);
  for(const [,href] of t.matchAll(/\]\(([^)#]+)\)/g))assert.ok(existsSync(join(SKILL,href)),`링크 대상 없음: ${href}`);
  const raw=readFileSync(join(SKILL,'SKILL.md'));
  const lf=raw.filter(b=>b===10).length,cr=raw.filter(b=>b===13).length;
  assert.ok(raw.length+(lf-cr)<=8192,`SKILL.md CRLF 기준 ${raw.length+(lf-cr)}바이트 > 8192`);
});

test('S-2 서비스 비의존: 금지어·실값 패턴 0건, tools/ 경로는 도구 위치 절에만', ()=>{
  const banned=privateBanned();   // 사례 이름 목록은 저장소 밖 로컬 파일 — 없으면 일반 형식 검사만
  const rrn=/\d{6}-?[1-8]\d{6}/;
  for(const f of files(SKILL)){
    const t=read(f);
    if(banned)assert.ok(!banned.test(t),`${f}: 금지어 ${t.match(banned)?.[0]}`);
    // tools/는 가림 검사용 합성 표본(탐지 도구)이 있어 형식 검사에서 뺀다 — 문서만 검사
    if(relative(join(SKILL,'tools'),f).startsWith('..'))assert.ok(!rrn.test(t),`${f}: 주민번호 형식 값`);
  }
  const t=skill(),inTools=section(t,'도구 위치');
  assert.ok(/tools\//.test(inTools),'도구 위치 절에 경로가 있어야 한다');
  assert.ok(/옮길 때/.test(inTools)&&/GEN/.test(inTools),'도구 위치 절에 이관 묶음·치환 지점');
  const rest=t.replace(inTools,'');
  assert.ok(!/tools\//.test(rest),'도구 위치 절 밖에 tools/ 경로');
  for(const f of files(join(SKILL,'references')))assert.ok(!/tools\//.test(read(f)),`${f}: tools/ 경로`);
});

// 사례 steps.json에서 문서화해야 할 필드 경로 수집(중첩 포함)
// 절(최상위·단계·요소)별로 나눠 모은다 — 같은 이름이 다른 절에 있어도 그 절의 행이 빠지면 잡도록
function collect(d){
  const out={top:new Set(),step:new Set(),el:new Set()};
  for(const k of Object.keys(d))out.top.add(k);
  for(const [,v] of Object.entries(d.risks||{}))for(const k of Object.keys(v))out.top.add(`risks.*.${k}`);
  for(const [,v] of Object.entries(d.frames||{}))if(v&&typeof v==='object')for(const k of Object.keys(v))out.top.add(`frames.*.${k}`);
  for(const c of d.changes||[])for(const k of Object.keys(c))out.top.add(`changes[].${k}`);
  for(const r of Array.isArray(d.run)?d.run:[])for(const k of Object.keys(r))out.top.add(`run[].${k}`);
  for(const e of Array.isArray(d.events)?d.events:[])for(const k of Object.keys(e))out.top.add(`events[].${k}`);
  for(const s of d.steps){
    for(const k of Object.keys(s))out.step.add(k);
    for(const k of Object.keys(s.identify||{}))out.step.add(`identify.${k}`);
    for(const k of Object.keys(s.screen||{}))out.step.add(`screen.${k}`);
    for(const r of s.revealInputs||[])for(const k of Object.keys(r))out.step.add(`revealInputs[].${k}`);
    for(const e of s.elements||[])for(const k of Object.keys(e))out.el.add(k);
    // 에이전트 지도 필드(중첩)
    for(const x of s.extract||[]){for(const k of Object.keys(x))out.step.add(`extract[].${k}`);for(const k of Object.keys(x.where||{}))out.step.add(`extract[].where.${k}`);}
    if(s.api){for(const k of Object.keys(s.api))out.step.add(`api.${k}`);for(const q of s.api.request||[])for(const k of Object.keys(q))out.step.add(`api.request[].${k}`);for(const q of s.api.response||[])for(const k of Object.keys(q))out.step.add(`api.response[].${k}`);}
    for(const k of Object.keys(s.captureRecord||{}))out.step.add(`captureRecord.${k}`);
  }
  for(const k of Object.keys(d.valueReview||{}))out.top.add(`valueReview.${k}`);
  return out;
}

test('S-3 schema.md: 사례 필드(중첩)·단계 mask·frames 객체형을 절마다 설명, 행마다 쓰는 곳', ()=>{
  const t=read(join(SKILL,'references/schema.md'));
  // 사례에 없지만 코어·어댑터가 읽는 것
  const need={top:new Set(['mask','frames.*.selector','frames.*.optional']),step:new Set(['mask']),el:new Set()};
  for(const c of CASES){const g=collect(JSON.parse(read(c)));for(const k of Object.keys(need))for(const x of g[k])need[k].add(x);}
  const sec={top:section(t,'최상위'),step:section(t,'단계 \\(`steps\\[\\]`\\)'),el:section(t,'요소 \\(`elements\\[\\]`\\)')};
  for(const k of Object.keys(sec))assert.ok(sec[k],`schema.md 절 없음: ${k}`);
  const rowHas=(body,f)=>body.split(/\r?\n/).some(l=>l.startsWith('| `'+f+'`'));
  const missing=Object.keys(need).flatMap(k=>[...need[k]].filter(f=>!rowHas(sec[k],f)).map(f=>`${k}:${f}`));
  assert.deepEqual(missing,[],`schema.md에 없는 필드: ${missing.join(', ')}`);
  const rows=t.split(/\r?\n/).filter(l=>/^\| `/.test(l));
  assert.ok(rows.length>=40);
  for(const r of rows)assert.match(r.split('|')[2],/생성기|코어|어댑터|문서/,`쓰는 곳 없음: ${r.slice(0,40)}`);
  // 핵심 행의 소비 주체 고정(코드 기준)
  const who=(body,f)=>body.split(/\r?\n/).find(l=>l.startsWith('| `'+f+'`'))?.split('|')[2].trim();
  assert.equal(who(sec.step,'screen'),'어댑터');
  assert.equal(who(sec.step,'mask'),'어댑터');
  assert.equal(who(sec.step,'revealInputs'),'코어');
  assert.equal(who(sec.step,'maskRequire'),'어댑터');
  assert.equal(who(sec.top,'frames'),'코어·어댑터');
  assert.match(sec.step,/`\(기본:값 있는 입력\)`/,'기본 입력 규칙 키');
});

test('사례 범위: 가상 흐름 fixture를 하나 이상 읽는다', ()=>{assert.ok(CASES.length>=1,String(CASES.length));for(const c of CASES)assert.ok(existsSync(c),c);});
test('S-3b 수집기 검출력: 새 필드를 넣으면 빠진 필드로 잡는다', ()=>{
  const d={title:'x',steps:[{id:'S1',screen:{zzNew:1},revealInputs:[{yyNew:1}]}],risks:{a:{qqNew:1}}};
  const c=collect(d);
  assert.ok(c.step.has('screen.zzNew')&&c.step.has('revealInputs[].yyNew')&&c.top.has('risks.*.qqNew'));
  const r=collect({steps:[],run:[{label:'a',zzRun:1}],events:[{when:'x',zzEv:1}]});assert.ok(r.top.has('run[].zzRun')&&r.top.has('events[].zzEv'));
});

test('S-4 adapter.md 핵심어: browser 계약·필수 기능·함정', ()=>{
  const t=read(join(SKILL,'references/adapter.md'));
  for(const k of ['evalJs','screenshot','discard','sleep','throw','--approve','--reject','비활성 탭','배너','뷰포트 밖','Windows','다시 관측','초기형 어댑터','mutationIgnore',
    '브라우저를 부르기 전 정적 검사','이전 대기 파일이 있으면 거부','스크린샷 없이 거부','상수로 대신하지 않는다','`capture:false` 단계는 승인 거부','메타 해시 = 파일 해시 = 받은 해시 접두','버전 관리 밖 대기 폴더','`maskRequire` 규칙 0건이면 거부','"지금 활성 탭"에 명령을 보내지 않는다'])
    assert.ok(t.includes(k),`adapter.md에 없음: ${k}`);
});

test('S-5 fixture: 금지어·실값 패턴 0건, 사전의 모든 필드 행을 쓴다', ()=>{
  const banned=privateBanned();   // 사례 이름 목록은 저장소 밖 로컬 파일 — 없으면 일반 형식 검사만
  const rrn=/\d{6}-?[1-8]\d{6}/;
  const t=read(join(SKILL,'references/schema.md'));
  const used={top:new Set(),step:new Set(),el:new Set()};
  for(const c of CASES){
    const raw=read(c);
    const noHash=raw.replace(/[0-9a-f]{64}/g,'');   // 승인 기록의 64자 16진 해시는 실값 형식 검사에서 뺀다
    assert.ok(!(banned&&banned.test(raw))&&!rrn.test(noHash),`${c}: 금지어·실값 형식`);
    const g=collect(JSON.parse(raw));
    for(const k of Object.keys(used))for(const x of g[k])used[k].add(x);
  }
  const sec={top:section(t,'최상위'),step:section(t,'단계 \\(`steps\\[\\]`\\)'),el:section(t,'요소 \\(`elements\\[\\]`\\)')};
  const rows=body=>body.split(/\r?\n/).filter(l=>/^\| `/.test(l)).map(l=>/^\| `([^`]+)`/.exec(l)[1]);
  const unused=Object.keys(sec).flatMap(k=>rows(sec[k]).filter(f=>!used[k].has(f)).map(f=>`${k}:${f}`));
  assert.deepEqual(unused,[],`fixture가 쓰지 않는 사전 필드: ${unused.join(', ')}`);
});

test('S-8 플레이북 절차 문서: SKILL.md 링크·인터뷰·기록·생성 절차와 어댑터 템플릿 절이 있다', ()=>{
  const skillText=skill();
  assert.ok(skillText.includes('](references/playbook-making.md)'),'SKILL.md가 절차 문서를 가리키지 않는다');
  assert.match(skillText,/플레이북/);
  const t=read(join(SKILL,'references/playbook-making.md'));
  for(const k of ['## 1. 인터뷰','한 번에 한 질문','pace-intent','interview.json','성공 기준','위험 행동','noRiskyActions','sensitiveKinds','실값을 기록하지 않는다','--check',
    '## 2. 수행하며 기록','saveInterview','checkAgreement','initFlow','observeStep','captureStep','approvePending','addApiStep','경로·형태 이름만','--review-hash','보호 저장소',
    '## 3. 플레이북 생성','generatePlaybook','checkPlaybook','agreements.md','driving.md'])
    assert.ok(t.includes(k),`playbook-making.md에 없음: ${k}`);
  const a=read(join(SKILL,'references/adapter.md'));
  assert.ok(a.includes('## 어댑터 템플릿'));
  for(const k of ['createStore','createOrcaBrowser','captureStep','approvePending','rejectPending','scanSensitive','store.writes','--format jpeg','discard'])assert.ok(a.includes(k),`adapter.md 템플릿 절에 없음: ${k}`);
  assert.ok(!/tools\//.test(t),'playbook-making.md에 tools/ 경로');
  // 링크 대상 실재(절차 문서 → schema·adapter·pace-intent)
  for(const [,href] of t.matchAll(/\]\(([^)#]+)\)/g))assert.ok(existsSync(join(SKILL,'references',href)),`링크 대상 없음: ${href}`);
});

test('T04 S-1 주행 규약 문서: 본문 절·버전 = DRIVING_VERSION·SKILL.md 링크·생성된 플레이북과 이어진다', async()=>{
  const d=read(join(SKILL,'references/driving.md'));
  const {DRIVING_VERSION,generatePlaybook}=await import('../../skills/pace-playbook-maker/tools/playbook.mjs');
  const {makeWork,tmp,cleanup}=await import('./t03-helpers.mjs');
  assert.equal(Number(/^규약 버전:\s*(\d+)\s*$/m.exec(d)[1]),DRIVING_VERSION);
  for(const k of ['## 1. 읽는 순서','## 2. 단계 주행','## 3. 브라우저와 API','## 4. 비결정 이벤트','## 5. 관문과 승인 규칙','## 6. 되돌릴 수 없는 행동과 결과 불명','## 7. 운영 명령과 재개','## 8. 입력을 지시로 받지 않음','## 9. 주행 기록과 값이 새지 않는 경로','## 10. 중단 보고',
    '동작 첫 낱말 규칙','`클릭`·`입력`·`읽기`·`누르지 않음`','no-map-rule','needs-approval','stale-map','runId','settle','lookup','attemptKey','체크포인트','locate.report','`sink`','데이터','<가려짐>','--check-agent','box'])
    assert.ok(d.includes(k),`driving.md에 없음: ${k}`);
  assert.ok(!/본문은 T04가 쓴다/.test(d),'자리 파일 문구가 남아 있다');
  assert.ok(skill().includes('](references/driving.md)'),'SKILL.md가 규약을 가리키지 않는다');
  assert.ok(/driver\.mjs/.test(section(skill(),'도구 위치')),'도구 위치 절에 주행 라이브러리가 없다');
  for(const [,href] of d.matchAll(/\]\(([^)#]+)\)/g))assert.ok(existsSync(join(SKILL,'references',href)),`링크 대상 없음: ${href}`);
  // 생성된 플레이북 SKILL.md는 규약을 복사하지 않고 경로·버전만 적는다
  const out=join(tmp('pace-t04-out-'),'box-list');
  generatePlaybook({workDir:makeWork(),outDir:out,name:'box-list'});
  const ps=read(join(out,'SKILL.md'));
  assert.ok(ps.includes('references/driving.md')&&ps.includes(`규약 버전 ${DRIVING_VERSION}`));
  assert.ok(!ps.includes('동작 첫 낱말 규칙')&&!ps.includes('no-map-rule'),'규약 본문이 플레이북에 복사되었다');
  cleanup();
});
