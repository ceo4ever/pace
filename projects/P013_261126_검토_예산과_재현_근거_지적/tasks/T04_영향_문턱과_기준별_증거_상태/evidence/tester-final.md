# T04 최종 독립 tester r3

- 판정: pass — 이번에 위임된 독립 시험 범위. 실제 외부 제공자 호출·선언 전체 검사의 완료 판정은 포함하지 않는다.
- 실행 환경: Node v24.22.3, 격리 사본, 새 tester 맥락. 구현자 결론은 입력으로 받지 않았고 명령과 별도 fixture를 직접 실행했다.
- 독립 목표 대조: 맞음. 계약이 새로 시작된 뒤 이전 증거 공백으로 전체 검토가 생략되지 않아야 하며, 보완 가능한 공백·판독 실패·안전 미확인을 구별해야 한다. 이 판단을 TASK.md 열람 전에 기록했다. TASK.md를 처음부터 받지 않는 두 단계 독립 호출 전체를 수행했다고 주장하지 않는다.
- 목표 달성: 위임 범위 달성. 전체 T-5의 실제 제공자·전체 검사 부분은 별도 증거가 필요하다.

## 대상과 사본

`impl-diff.patch` SHA-256:

```text
f257d164bc0e1c536534c7a0c9cfda51f433b4bde587aa7423d00ab53b453176
```

`shasum -a 256` 실측이 요청값과 일치했다. `git apply --reverse --check <T04 evidence/impl-diff.patch>`도 종료 0으로, 선언 패치의 적용 결과가 현재 사본에 존재함을 확인했다. 이 명령은 파일을 변경하지 않는다. 패치 해시는 사본 전체의 해시가 아니다.

사본에는 별도 선언된 선행 T09 보완도 포함돼 있다. `git diff`에서 `review-recovery.ts`의 진단 실패 연결·종료 선택, `review-followup.ts`의 원장 진단 연결, `decision-rights.md`의 즉시 상위 보류·A-1 종료 보완을 확인했다. 지정 시험에는 원장 진단 뒤 남은 공동 예산이 있어도 상위 보류하는 경우, unknown에는 보류하고 다음 유효 실패를 연결하는 경우, 다른 대상 pass가 원래 실패 연결을 지우지 않는 경우가 포함돼 통과했다. T04 패치만의 단독 사본으로 오인하지 않았다.

## 직접 실행 결과

| 명령 | 종료 | 결과 |
|---|---|---|
| `npm run typecheck` | 0 | tsc 통과 |
| `node --test test/{agent-review-followup,agent-review-log,agent-structured-review,agent-verify,pre-review,project-dev-skill}.test.ts` | 0 | 123 pass, 0 fail, 0 skip |
| `node --test /tmp/t04-r3-independent.test.ts` | 0 | 별도 작성한 독립 재현 8 pass, 0 fail, 0 skip |

실제 제공자 실행기는 주입하지 않았다. 아래 fixture의 실행기는 문자열을 반환하는 가짜 실행기이며 `verifyCommand`·`reviewNoteCommand`의 실제 명령 처리와 파일 기록 경로를 호출한다. 위험 입력은 설명 문자열로만 취급했다. 원본 구현·테스트·계약 파일은 편집하지 않았다.

## 기준과 독립 관측

| 기준 | 관측과 판정 |
|---|---|
| T-1 | pass. 지정 시험에서 minor는 should_fix, 유효한 T-1 영향은 fail, 존재하지 않는 기준은 unknown, 재현 수단 없는 비안전 지적은 차단하지 않음을 확인했다. 보고 영향과 기계 등급·이유를 함께 단언한다. |
| T-2 | pass. 안전 경로 input·reached·result·location 각각의 누락이 unknown이며 완전한 설명만 blocking인 시험이 통과했다. 별도 fixture에서는 유효 F ID의 안전 지적에 경로가 없을 때 `safety_unverified`임을 추가 단언하고, 후속 호출이 전체 목표 대조로 시작함을 확인했다. |
| T-3 | pass. present/absent/unverified, 한 기준·전체 누락, 관측 없는 present, 여분 ID와 자료 판독 불가를 지정 시험으로 확인했다. 독립 fixture에서 새 기준 목록 T-1/T-3을 채택하면 옛 T-1/T-2 unknown을 재검토 기준점으로 사용하지 않고 출력도 새 목록과 일치했다. |
| T-4 | pass. 독립 8건에서 정상 증거 보완, 전체 판정 유지, 계약 재시작, 형식 원장 누락 거부, 실제 A-3 분리를 직접 확인했다. 구버전 판정·고아 기록 복구·T09 한정 확인 회귀도 지정 시험에 포함돼 통과했다. |
| T-5 중 위임 범위 | pass. 타입 검사·지정 123개·독립 8개 통과. 실제 외부 호출과 전체 검사는 사용자 지시에 따라 수행하지 않았으며 이 보고서로 그 부분을 대체하지 않는다. |

독립 fixture의 관측:

1. malformed unknown 뒤 정상 응답: `rereview_of=null`, 첫 전체 목표 대조 프롬프트, calls=2/rounds=1.
2. safety unknown 뒤 정상 응답: `safety_unverified`, 다음은 `rereview_of=null`, 첫 전체 판정. 안전 판단이 증거 보완 범위에 가려지지 않는다.
3. 정상 증거 보완: 첫 응답의 T-1=present/T-2=unverified, 자동 A-3 요청 없음. 다음 응답은 직전 기록을 참조하고 직전 기준 상태·바뀐 증거와 영향을 포함한 프롬프트로 pass.
4. A-1 재시작, 같은 기준 ID: 이전 unknown을 남긴 채 완료된 contract_reset의 offsets로 경계를 기록. 다음 응답은 `rereview_of=null`, 전체 목표 대조, calls=1/rounds=1. 직전 필수 반례가 재발하지 않았다.
5. A-1 재시작, 새 기준 ID: T-1/T-3으로 바꿔도 전체 판정이며 새 기준에 대해 pass.
6. 새 기준 목록 불일치: reset 없이 T-1/T-2를 T-1/T-3으로 바꿔도 이전 unknown을 선택하지 않음. 프롬프트에 T-3, 출력 목록도 T-1/T-3.
7. 형식 원장 누락: 임시 fixture의 format 행만 제거하면 종료 2, 필수 기준 기록 불일치 오류. 가짜 제공자 호출 횟수는 1 그대로여서 다음 호출 전에 거부함.
8. A-3: 증거 공백만으로 요청 없음. 명시적인 weaken 제안 후 A-3 요청과 owner 대기, 대기 중 호출 없음. 합성 user 결정 뒤 원문 참조를 별도 보존하고 최초 기록 bytes와 T-2=unverified는 그대로 유지.

A-1 독립 fixture는 승인 경계 이후 판정을 분리해서 검증하기 위해 합성 `contract_reset`을 기록했다. 실제 승인 진위나 승인 입력 검증을 그 fixture로 증명하지 않는다. 실제 계약 변경과 A-1 근거 일치를 확인하는 명령 경로는 지정 `agent-review-followup` 시험으로 별도 검증됐다.

## 검출력 확인

원본을 건드리지 않고 임시 디렉터리에 `src/`를 복사했다. 그 사본의 `verify-cli.ts`에서 evidence 기준점 검색 입력만 `budget.currentEntries`에서 전체 `entries`로 되돌려 직전 결함을 모사했다.

`node --test --test-name-pattern 'A-1 재시작' <임시 사본>/repro.test.ts` 종료 1. 기준 ID를 유지한 재시작 시험이 아래처럼 실패했다. 새 기준 ID 시험은 통과했다. 따라서 특히 같은 기준 목록으로 계약을 재시작하는 직전 필수 반례를 검출한다.

```text
actual: 'review-records/R1.json'
expected: null
```

## signals와 한계

- 위임 시험에서 제품 실패·불안정·skip은 관측하지 않았다.
- 독립 fixture 최초 실행 중 안전 finding ID를 허용 형식으로 수정하고 `safety_unverified` 자체를 단언했다. A-3 fixture의 tmp 경로 별칭도 realpath로 정규화했다. 이들은 독립 시험 준비 오류였고 제품 파일 수정은 없었다. 아래 보존한 최종 재현을 8/8로 다시 실행했다.
- 외부 호출·전체 검사는 이 결과의 보증 범위 밖이며 별도로 회수해야 한다.

## 독립 실행 원문

타입 검사 출력:

```text
> pace@0.1.2 typecheck
> tsc -p tsconfig.json
```

지정 시험 집계:

```text
✔ 모든 변경 대상에서 기존 올림 기준을 제거하고 결정 권한 정본을 연결한다 (5.847583ms)
ℹ tests 123
ℹ suites 0
ℹ pass 123
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3006.295416
```

독립 재현 출력:

```text
✔ malformed unknown 이후 첫 전체 판정 (12.022416ms)
✔ safety unknown 이후 첫 전체 판정 (11.197583ms)
✔ 정상 증거 보완은 T-2 공백만 재검토하고 별도 A-3 요청을 만들지 않는다 (8.681583ms)
✔ A-1 재시작은 옛 unknown을 배제한다; 기준 ID 변경=false (7.59475ms)
✔ A-1 재시작은 옛 unknown을 배제한다; 기준 ID 변경=true (3.496375ms)
✔ 기준 목록이 달라지면 옛 unknown을 재검토 기준점으로 선택하지 않는다 (5.025708ms)
✔ 형식 원장 누락은 다음 제공자 호출 전에 거부한다 (7.436709ms)
✔ A-3 실제 수용 선택은 증거 상태와 결정 원문을 별도로 보존한다 (21.827667ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 462.665417
```

독립 재현 스크립트 SHA-256: `7347b5f39a05d8704d5fbc56106a9b8507f315d0afb12e1c1b6cf2f4ff79f494`. 절대 import 경로는 검증한 격리 사본을 가리킨다. 다른 위치에서는 같은 대상 사본의 절대 경로로 바꿔 실행한다.

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyCommand,reviewNoteCommand} from '/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t04-r3-tester/isolated/src/agent/verify-cli.ts';
import {normalizeResult} from '/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t04-r3-tester/isolated/src/agent/contract.ts';
import {readLedger,ledgerPath,textHash} from '/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t04-r3-tester/isolated/src/agent/review-log.ts';
import {reviewHash} from '/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t04-r3-tester/isolated/src/project/pre-review.ts';
const criteria=(ids=['T-1','T-2'])=>'## 기준\n| # | 완료 기준 |\n|---|---|\n'+ids.map(id=>`| ${id} | ${id} 결과 보존 |`).join('\n')+'\n';
const evidence=(ids=['T-1','T-2'])=>ids.map(id=>({id,state:'present',observation:`독립 합성 관측 ${id}: 결과를 다시 읽었다`}));
const response=(rows=evidence(),findings=[])=>'```pace-review\n'+JSON.stringify({version:2,findings,criteria:rows})+'\n```\npass';
const finding={id:'F81',severity:'blocking',category:'safety',location:'src/store.ts:8',scenario:null,reproduction:null,confidence:'high',impact:'data_loss'};
function fixture(){
 const root=join(realpathSync(mkdtempSync(join(tmpdir(),'t04-r3-independent-'))),'projects/P013_test/tasks/T04_test');
 mkdirSync(join(root,'evidence'),{recursive:true});
 const target=join(root,'evidence/change.patch'), contract=join(root,'TASK.md');
 writeFileSync(target,'initial artifact\n');writeFileSync(contract,criteria());
 const prompts=[];
 async function verify(text){const out=[];const executor={agent:'codex',mode:'p',capabilities:{models:true,effort:true,systemPrompt:false,resume:false,writeAccess:true},async run(request){prompts.push(request.prompt);return normalizeResult(request,{text,provider:'openai'},{durationMs:1,enforcement:'fake'});}};
 const code=await verifyCommand(['--author-agent','claude','--target',target,'--purpose','증거 누락을 통과시키지 않고 첫 전체 판정을 보장한다'],{executors:()=>[executor],write:t=>out.push(t)});return {code,...JSON.parse(out.join(''))};}
 async function note(args){const out=[];const code=await reviewNoteCommand(['--target',target,'--summary','합성 독립 tester 근거',...args],{executors:()=>[],write:t=>out.push(t)});return {code,...JSON.parse(out.join(''))};}
 function reset(){const proof=join(root,'evidence/approval.md');writeFileSync(proof,'합성 A-1 승인 원문 참조');writeFileSync(target,'new agreement artifact\n');const row={type:'contract_reset',at:'2026-11-26T14:00:00+09:00',id:'independent-reset',stage:'post',target:'evidence/change.patch',hash:reviewHash(readFileSync(target,'utf8')),evidence:'evidence/approval.md',evidence_hash:textHash(readFileSync(proof,'utf8')),summary:'합성 승인된 계약 재시작',trigger:'synthetic-upper',contract:textHash(readFileSync(contract,'utf8')),finish:true,offsets:{'evidence/TASK.md':readLedger(target).length}};writeFileSync(join(root,'REVIEW-FOLLOWUPS.jsonl'),JSON.stringify(row)+'\n');}
 return {root,target,contract,prompts,verify,note,reset};
}
for(const [label,text] of [['malformed','외형이 없는 응답\npass'],['safety',response(evidence(),[finding])]])test(label+' unknown 이후 첫 전체 판정',async()=>{const h=fixture();const first=await h.verify(text);assert.equal(first.review.verdict,'unknown');if(label==='safety')assert.ok(first.evidence_action.gaps.includes('safety_unverified'));const next=await h.verify(response());assert.equal(next.review.rereview_of,null);assert.equal(next.review.verdict,'pass');assert.match(h.prompts[1],/1단계 독립 목표 대조/);assert.doesNotMatch(h.prompts[1],/직전 기준별 증거 상태/);assert.deepEqual([next.budget.calls,next.budget.rounds],[2,1]);});
test('정상 증거 보완은 T-2 공백만 재검토하고 별도 A-3 요청을 만들지 않는다',async()=>{const h=fixture();const first=await h.verify(response(evidence(['T-1'])));assert.equal(first.review.verdict,'unknown');assert.equal(first.followup,undefined);assert.deepEqual(first.assessment.evidence.criteria.map(x=>x.state),['present','unverified']);const next=await h.verify(response());assert.equal(next.review.rereview_of,first.review.record);assert.equal(next.review.verdict,'pass');assert.match(h.prompts[1],/직전 기준별 증거 상태/);assert.match(h.prompts[1],/바뀐 증거와 그 영향만/);});
for(const changedIds of [false,true])test('A-1 재시작은 옛 unknown을 배제한다; 기준 ID 변경='+changedIds,async()=>{const h=fixture();const first=await h.verify(response(evidence(['T-1'])));assert.equal(first.review.verdict,'unknown');if(changedIds)writeFileSync(h.contract,criteria(['T-1','T-3']));h.reset();const next=await h.verify(response(evidence(changedIds?['T-1','T-3']:['T-1','T-2'])));assert.equal(next.code,0);assert.equal(next.review.rereview_of,null);assert.equal(next.review.verdict,'pass');assert.deepEqual([next.budget.calls,next.budget.rounds],[1,1]);assert.match(h.prompts[1],/1단계 독립 목표 대조/);assert.doesNotMatch(h.prompts[1],/직전 기준별 증거 상태/);});
test('기준 목록이 달라지면 옛 unknown을 재검토 기준점으로 선택하지 않는다',async()=>{const h=fixture();await h.verify(response(evidence(['T-1'])));writeFileSync(h.contract,criteria(['T-1','T-3']));const next=await h.verify(response(evidence(['T-1','T-3'])));assert.equal(next.review.rereview_of,null);assert.equal(next.review.verdict,'pass');assert.deepEqual(next.assessment.evidence.criteria.map(x=>x.id),['T-1','T-3']);assert.match(h.prompts[1],/필수 기준 T-3/);});
test('형식 원장 누락은 다음 제공자 호출 전에 거부한다',async()=>{const h=fixture();await h.verify(response(evidence(['T-1'])));const entries=readLedger(h.target);assert.ok(entries.some(x=>x.type==='format'));writeFileSync(ledgerPath(h.target),entries.filter(x=>x.type!=='format').map(x=>JSON.stringify(x)).join('\n')+'\n');const next=await h.verify(response());assert.equal(next.code,2);assert.match(next.error.message,/필수 기준 기록과 검토 원장/);assert.equal(h.prompts.length,1);});
test('A-3 실제 수용 선택은 증거 상태와 결정 원문을 별도로 보존한다',async()=>{const h=fixture();const first=await h.verify(response(evidence(['T-1'])));const path=join(dirname(h.target),first.review.record);const before=readFileSync(path,'utf8');const proposal=join(rootOr(h),'evidence/proposal.json'),owner=join(rootOr(h),'evidence/owner.md');writeFileSync(proposal,JSON.stringify({choices:['공백 수용','보완 관측'],assessments:[{finding:'T-2',decision:'A-3',reason:'필수 증거 없이 진행을 선택한다'}]}));const req=await h.note(['--request-waiver','weaken','--choice','공백 수용','--file',proposal]);assert.equal(req.code,0,JSON.stringify(req));assert.equal(req.followup.decision,'A-3');const held=await h.verify(response());assert.equal(held.ran,false);assert.equal(h.prompts.length,1);writeFileSync(owner,'합성 사용자 결정: 공백 수용');const decision=await h.note(['--decision','--by','user','--choice','공백 수용','--file',owner]);assert.equal(decision.code,0);assert.equal(decision.entry.evidence,'evidence/owner.md');assert.equal(readFileSync(path,'utf8'),before);assert.equal(JSON.parse(before).assessment.evidence.criteria[1].state,'unverified');});
function rootOr(h){return h.root;}
```

pass
