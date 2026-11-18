# T05 느린 시험 함수 직접 호출

- 프로젝트: [P004](../../PROJECT.md) · 백로그: [BL261118_01](../../../../backlogs/BL261118_01_Windows_테스트_시간_단축/BACKLOG.md)
- 상태: 진행
- 사전 검토: v1

## 목적

BR05/P-5의 로직 검증용 반복 CLI 호출을 기존 함수 직접 호출로 바꾼다. 실제 CLI 진입·파싱/종료/출력·실제 Git/프로세스·장애 주입 경계는 대표 시험으로 유지한다. 전환한 시험의 결함 검출력을 보존하고 최종 새 전체3회로 P-6을 별도 판정한다. 불필요하게 전환 범위를 넓히지 않는다.

## 재료

- BR05, PROJECT P-5/P-6 및 [T04 마감](../T04_빠른_검사_명령/TASK-CLOSE.md). 기준HEAD46fdf68. Telegram 주입 단계와 함수 전환 구현은 완료했고 독립 사후 코드/집중 증거 검토를 통과했다. 전체3회는 Windows 래퍼 경로 문자열 비교 실패로 무효이며 T-2 전체/T-3/P-6은 미충족이다. 해당 시점 계획은 `evidence/task-before-wrapper-plan.md`에 보존했다.
- 이전 계획은 `evidence/task-before-function-plan.md`, 무효2세트·모든 진단/도구 오류/정정·작은 검사status1/순서실수는 원문으로 보존한다. 성공한 stdio-full-load도 진단 전용이며 새 최종3회에 섞지 않는다. 최초 stale-lock 실패는 원인 미확정으로 유지하고 추가 비재현 진단을 하지 않는다.
- T03 보조 profile의 하네스 파일521886.9579ms 중 후보는 EIO 복구68.938초, done 게이트/동기화26.838초, BL 생명주기27.741초다. `evidence/function-candidate-analysis.json`에 이름/본문SHA/호출/단언 수를 연결했다. 단일 과거 profile은 후보 선정 근거이며 전환 효과의 수치 예측이나 병렬 벽시계 합산 근거가 아니다.
- `src/cli.ts`의 공개 `main(argv): Promise<number>`는 제품의 실제 project 분기를 실행한다. 새 제품API나 파서를 만들지 않는다. test/install-autostart.test.ts의 직접 main 호출 선례가 있지만, 이번에는 호출별60초 감시와 부모 환경을 보호하기 위해 시험용 재사용 Node 자식에서 main을 부른다.
- AGENTS.md·docs/README.md, 개발 스킬 testing/reviewer/security, TypeScript·verification 교본을 따른다. 브레인 검색은 하네스/격리 경계를 제공했지만 확정된 함수 전환 설계는 없었다.
- 함수계획 사전 fail B1/B2 원문은 `evidence/pre-review-function-round3.md`, 실패한 TASK는 `evidence/task-function-plan-failed.md`다. 실제 project 경로의 정적 상태/출력 대조는 `evidence/project-main-state-audit.md`와 실제 소스SHA/import 그래프에 연결한다. 모든 CLI의 전역 부재나 범용 재사용 안전성을 주장하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 아래3개 로직 시험의 반복 runCli를 실제 main 함수 호출로 전환하고, EIO의 실제 NODE_OPTIONS 주입 CLI4회 및 대표 CLI 목록을 유지한다. 동일 대상의 전환 전후 좁은 시간·자식 재사용 근거/한계를 기록하며, 효과가 작거나 없으면 추가 전환을 멈춰 판단을 올린다(P-5). |
| T-2 | 원래 단언/이름/분기·실제Git·장애 주입/skip을 보존하고 같은 결함 변이가 전환 전후 실제 단언에서 실패한다. 어댑터의 호출별60초·예외·cwd/env/출력 복원·소유 자식 정리를 확인한다. 기존970건+T04 신규25건+어댑터 신규1건,996건 중987통과·실패취소0·skip9와 기존 판정/사유를 보존한다(P-5/P-6). |
| T-3 | 최종 고정 소스의 원래 비계측 npm run check 새 연속3회 모두 종료0·실패취소0·동일 범위/도구/격리이며, 도구 summary의 반올림 전 중앙값×2 <= T01 중앙1425464.3327ms다. 원문 교차 계산·시작종료SHA·독립tester/reviewer로 검증하고 미달/불확실/실패 시 마감하지 않는다(P-6). |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1·T-2 | 대상3개 | 전환 전1회/후1회 동일 이름필터 실행 | 원래 단언·분기·실제Git 통과, 시간과 범위 공개 | 원문/환경/벽시계/SHA, 탐색1쌍으로 전체기여 단정 금지 |
| S-2 | unit | T-2 | 소유 제품 사본의 M1/M2 및 유지 경로M3 | 같은 변이를 전환 전/후 해당 시험 실행 | 원래 단언번호·식/메시지·원래행 매핑이 동일한 실패, 앞선 단언 도달·설정/컴파일 오류 아님 | M2는 BL생명주기와 EIO 복구의 직접전환 경로 양쪽 확인, 실제 import한 소유 cli.ts 경로/SHA 기록 |
| S-3 | unit | T-1·T-2 | 블록별·fixture별 소유 자식, main/worktree cwd·오류 | 정상호출 및 실제CLI/직접호출에 같은 UsageError/기타예외/HarnessError 입력 | 같은fixture PID재사용·다른HOME 새자식세대·cwd/상태 복원·상태코드/출력 동등·오류후정상호출 | 신규 검증1건, done/finish/merge 실제 상태는 S-1/S-5 원래 단언도 함께 검증 |
| S-4 | check | T-2 | 변경 전후 소스/대표CLI | 허용된 기계 변환 및 SHA 비교 | 다른 하네스 블록/단언 불변·T03 기존95개 중93개 불변/Telegram 예외 보존·runner/common helper 불변 | 원래 블록의 async/await/runDirect 치환 예상본문과 byte 비교, 잘못된 변경 음성검사 |
| S-5 | e2e | T-1·T-2 | 실제 하네스 파일 | 직접 호출+기존CLI+hook/Git+실패주입을 함께 실행 | 기존73건+어댑터1건 통과·skip 불변·소유 자식 종료 | 파일 전체 원문·실제반환/파일/Git 단언 |
| S-6 | e2e | T-2·T-3 | 최종609개 실행 소스 고정 | T01 도구로 override/profile 없는 새3회 | 각996/987/실패취소0/skip9·기존 이름/판정/사유 동일·valid3·새중앙×2<=기준 | 새label/evidence·609SHA/HEAD/상태·각 원문 대조 |
| S-7 | check | T-1~3 | diff·원문·변이·최종3회 | 새 맥락 tester/reviewer 두 단계 대조 | 함수전환/대표CLI/검출력/최종목표 각각 통과 | main 배정, 원문/판정 보존 후 close/check/done/커밋 |
| S-8 | e2e | T-2 | Windows Git Bash 경로 시험 최소 수정 | 실제 command-v를 같은 Bash에서 Windows 변환하고 예상 설치 파일과 대조, 파일 전체 실행 및 소유 사본의 다른 파일 오지정 RED | /tmp·/c 별칭 허용·native realpath와 dev/ino 일치, 다른 파일은 새 경로 단언 실패; 기존 버전/훅/인자 검증·이름/skip 유지 | 별칭 대조 원문·실제 수정 SHA/정확 diff·음성 실패 단언·전체 파일 결과 보존 |

## 접근

### 전환 대상과 CLI 보존

test/project-harness.test.ts의 세 블록 안 runCli만 괄호로 묶은 await runDirect로 바꾼다. callback은 async (ctx)로 바꾸고 블록 시작에 직접호출scope 생성·ctx.after 정리·로컬 runDirect binding만 넣는다. 원래 단언·문구·fixture·분기·실제Git 호출은 유지한다.

| 대상 | 프로파일 | 전환 범위 | 실제 프로세스 유지 |
|---|---:|---|---|
| P025 v2: 병합 기록 EIO는 소유 임시 파일을 정리하고 복구 명령으로 완료한다 | 68.938초 | metrics/dashboard × worktree/branch-only 준비·finish·복구/병합 runCli | NODE_OPTIONS fs.renameSync EIO 주입 runPace4회, Git/worktree/hook/선언 셸, 임시잔존/최종상태 단언 |
| done: check 통과 때만 상태·백로그·커밋 칸을 한 번에 맞추고, 실패하면 아무것도 바꾸지 않는다 | 26.838초 | 게이트·파일/표/백로그 동기화 runCli25개 literal | Git 커밋/hook, 무변경/출력/태스크/commit 칸 단언 |
| BL 생명주기: finish와 실제 merge에서만 완료하며 미리보기는 변경하지 않는다 | 27.741초 | worktree/branch-only/direct 상태/미리보기 runCli | 실제 Git merge/commit/hook/셸과 BL/dashboard 일치 단언 |

전 과정 `new → start → task → check → finish → merge`는 전체를 실제 runCli로 유지해 new/start/task/check/finish/merge/list의 파싱·출력·종료를 검증한다. done은 `CRLF 기존 5칸 태스크 표`, `BL 출처: 같은 번호 태스크 생성·done BR/BACKLOG 동기화와 실패 무변경` 및 commit gate 사례의 실제 CLI를 유지한다. CRLF 설치본, 작업자 우선순위/오타·launch/manual/Orca, Git 실패 주입, 의존성 감사, 보안/링크/종료, 마지막 동시 프로젝트 시나리오도 전환하지 않는다. 실제73블록 중70개를 유지하는 목록/SHA는 `evidence/cli-retention-catalog.json`이다. EIO 주입4회는 직접 함수나 성공 대역으로 바꾸지 않는다.

### 시험용 직접 호출 프로세스

- 새 test/project-call.ts와 test/project-call-process.ts만 추가한다. *.test.ts 파일 수는 그대로다. src/bin/scripts/설치기는 변경하지 않는다. LLM/Orca 작업자가 아닌 일반 Node 시험 자식이다.
- 각 전환 블록에 독립 scope를 만든다. 같은 블록 안에서도 HOME fixture가 바뀌면 기존 자식의 정상 close 후 새 fixture 자식을 만든다. 다른 블록/HOME에는 모듈 캐시를 공유하지 않는다. 같은fixture의 main↔worktree 호출 사이에서만 자식을 재사용한다. 초기 fork도 첫 요청의 sessionFreeEnv/HOME/USERPROFILE/PACE_HOME/cwd로 실행해 실제 main import 시점의 문맥을 고정한다. 이는 정상적인 명시 fixture 전환이며 오류 뒤 자동 재시작이 아니다.
- 자식은 기존 main을 한 번 import하고 IPC 요청마다 main(["project",...args])를 직접 await한다. CLI 진입 파일을 매 요청 실행하거나 파서를 복제하지 않는다. main 반환은 그대로 status이며, 던진 예외는 bin/pace.ts와 같은 `pace: ${(error as Error).message}\n` stderr 및 UsageError2/나머지1로 매핑한다. UsageError는 실제 import한 cli.ts와 같은 클래스다. main이 이미 처리해 반환한 HarnessError1을 중복 변환하지 않는다.
- 정상 제품 결과는 status/stdout/stderr와 signal:null/error:undefined로 runCli 계약을 맞춘다. 현재 세 블록이 사용하는 필드는 status/stdout/stderr임을 감사에 연결한다. timeout·IPC·overflow·예기치 않은 process.exit/자식 종료는 정상 제품1로 바꾸지 않고 별도 명명된 시험 도구 실패로 throw한다. 해당 scope는 폐기 상태가 되고 후속 요청도 보이는 실패로 끝내며 같은 요청을 재시작하지 않는다.
- 요청 env는 기존 runPace와 동일하다. 요청마다 cwd/env/stream write/exitCode를 저장하고 finally 복원 완료 후 응답한다. 실제cwd의 native 정규화·HOME/PACE_HOME/소유cli.ts URL과 요청값 일치를 확인한다. Windows 짧은/긴 경로 문자열을 혼합 비교하지 않는다. 복원은 boolean·소유 경로로만 확인하고 env 원값을 남기지 않는다. 겹친 요청은 거부한다. projectCommand가 호출 때 cwd를 읽고 설정/선언/Repo를 새로 읽는 실제 경로는 정적 대조에 연결하며, 실제 done/finish/merge 상태는 전환된 기존 단언으로 검증한다.
- 출력은 자식의 process.stdout.write/stderr.write를 요청 구간에서 캡처한다. 대상 경로의 출력은 projectCommand/formatReport 및 구조화된 spawnSync 반환을 통해 이 경로로 모이며 fs.writeSync(1/2)/stdio inherit를 사용하지 않는다는 정적 대조를 연결한다. 부모 pipe에 예상 밖 raw 출력이 있으면 다음 요청에 섞거나 무시하지 않고 도구 실패로 처리한다. 정상 request 응답은 finally 복원 뒤에만 보내고, 늦은 출력/종료도 scope 종료 검사에서 실패로 보이게 한다.
- 부모가 첫 자식 초기화/ready부터 포함한 호출60초 deadline을 감시한다. timeout/비정상 종료/IPC 불확실이면 소유 자식을 종료하고 실패시키며 자동 재시작/재시도하지 않는다. 출력은 기존 spawnSync 기본과 같은 stdout/stderr 각각1MiB 상한으로 초과를 실패 처리한다. Git/선언 명령의 제품 제한은 유지한다. 임의 자손 완전 회수는 보장하지 않는다.
- registerTestChild로 추적하고 각 블록 ctx.after에서 정상 종료/실제 close를 확인한 뒤 부모 임시root를 정리한다. 블록/fixture 수준 생존 한도는 전체 게이트 안에 두되 요청60초는 늘리지 않는다. 사용자/다른 시험 프로세스를 열거·종료하지 않는다.
- 기존 runCli helper는 그대로 둔다. 새 runDirect의 task 성공 사후처리만 기존과 같은 legacy v1 마커 제거를 소유 fixture TASK에 적용한다. 제품 검토 게이트는 바꾸지 않는다.

### 검출력과 감사

- M1: 소유 제품 사본 doneTaskRaw의 `if (!report.ok) return report` 보호를 제거해 막힘 입력의 무변경 단언이 전환 전후 실패하는지 확인한다.
- M2: applyMerge의 FF 뒤 최종 writeBacklogState 호출만 생략한다. BL생명주기의 merge 뒤 완료 단언과 EIO의 복구 후 직접 merge가 담당하는 최종 BL완료 단언을 전환 전후 각각 확인한다. 이 표본으로 EIO 블록의 실제 직접전환 경로도 검증한다.
- M3: writeFileAtomic의 소유tmp 정리 finally를 생략해 원래 EIO 실제 주입의 tmp 잔존 단언을 전환 전후 확인한다. 이는 유지한 실제CLI 경로의 검출력 보존 증거이며 직접전환 표본으로 세지 않는다. fault.mjs나 정상 반환을 성공 대역으로 바꾸지 않는다.
- 각 변이는 소유 사본에서1회씩 전환 전후 실행한다. 새 fs API 래핑/관측기를 만들지 않는다. 변이/소스/argv/실제 import cli.ts URL/SHA를 기록해 원본이 아닌 변이 사본을 실행했는지 확인한다. 같은 실패는 원래 블록 내 assert 번호·식/메시지·변환 전 행 매핑이 일치함으로 판정하고 실제 전후 stack의 바뀐 행도 함께 보존한다. 절대행이 달라졌다고 다른 단언을 같은 것으로 치거나 앞선 설정 오류를 검출로 치지 않는다. 앞선 단언을 지나 목표 단언에 도달했는지 확인한다.
- 감사 도구는 원래3블록의 runCli 호출 구간을 괄호/문자열을 구분해 찾아 정확한 await runDirect/async callback·정해진 블록별scope/ctx.after 삽입만 기계 변환한 예상본문과 비교한다. assert를 임의 정규화하거나 지우지 않는다. helper import·legacy 후처리와 신규 검증1건은 정한 위치/SHA로 연결한다. 다른70개 하네스 블록 byte는 동일해야 한다. 다른 블록/단언/다른 파일 변경과 await 불가 중첩 콜백을 거부하는 음성검사를 한다.
- Telegram 수정의 정확한 SHA/블록밖 동일·원래4개 단언·지연/rollback 변이 증거도 계속 연결한다. 새 함수 전환이 원래 잠금 실패를 해결한다는 주장은 하지 않는다.

### 측정과 마감

1. 새 TASK 해시를 같은 독립 사전 reviewer에게 전달해 blocking0 뒤 구현한다. 전환 전 대상3건1회를 먼저 보존한다. 전환 후 같은 필터1회·변이 전후·어댑터 검증·실제 하네스 파일 전체를 끝낸다. 효과가 없거나 검출/격리를 보존하지 못하면 추가 전환이나 새 전체 측정 없이 main에 올린다.
2. 실행 소스는 helper2개가 늘어난609개다. 하네스·Telegram·아래 Windows 래퍼 시험의 정확한 예외3파일 및 helper2개 외 기존 byte를 유지한다. 기존95개 중92개 byte 불변과3개 허용 diff를 확인한다. T05 comparator는 T03 다섯 회 각각의 기존970건 이름/판정/skip, T04 신규25건, 어댑터 신규1건을 원문으로 검증한다. case 이름/측정SHA를 연결하고 원래 T04 도구/환경/로그는 바꾸지 않는다.
3. 새 고유label로 시작종료 HEAD/Git 상태·609SHA·도구SHA를 고정한다. 원래 npm run check, Node24.22.3/npm11.19.1/같은Windows PC·회차별TMP/TEMP/TMPDIR/PACE_HOME 격리, profile/concurrency override 없이 T01 도구 --runs3을 사용한다. 다른 시험/진단/tsc/실행소스 편집을 겹치지 않는다. 읽기/증거 기록·호스트 부하와 snapshot의 연속 감시 아님을 공개한다.
4. 비정상 회차/범위 오류는 기존 측정기의 중단을 사용해 원문을 보존하고 main에 묻는다. 진행 회차를 임의로 끊지 않는다. 완료 뒤 valid/범위/SHA 불일치나 중앙값 초과도 미달이다. 자동 재선택·과거 성공 합산·진단/finish 대체 표본 사용은 금지한다.
5. 유효 새3회가 P-6을 충족하면 대상을 더 넓히지 않는다. 다른 결과면 근거/최소 다음 후보를 main에 올린다. 독립 사후 양쪽 검토 통과 뒤 TASK-CLOSE/check/done/커밋한다. finish 전체 검사는 별도 게이트로 유지하며 앞뒤 동일 검사 중복을 하지 않는다. 병합/설치/푸시/외부 전송은 수행하지 않는다.

### Windows 래퍼 시험의 파일 정체성 단언 보완

- 함수 전환 뒤 무효 세트의 3회차에서 `test/install-windows-wrapper.test.ts`의 `실제 Windows Git Bash에서 래퍼와 커밋 훅이 동작한다`가 `/tmp/...`와 별도 Bash의 `/c/Users/...` 문자열 불일치로 실패했다. 뒤의 훅/인자 단계는 미도달이다. 역사적 실패에서 같은 물리 파일인지와 정확한 발생 조건은 미확정으로 유지한다. 함수 전환이나 과거 stale-lock/healer 실패와 인과관계를 주장하지 않는다.
- main 승인 소유 사본의 좁은1회는 원래 단언을 유지한 채 통과했고 두 Bash/Node 파일 정체성이 같았다. 이어 승인된 별칭 대조1회는 실제 command-v의 `/tmp`와 같은 예상 파일에서 만든 `/c`가 각각 해당 Bash에서 Windows로 변환된 뒤 native realpath/dev/ino가 같음을 확인했다. 같은 `/c` 형식의 다른 파일은 거부됐다. `evidence/wrapper-path-observation.md`, `wrapper-path-diagnostic/`, `wrapper-alias-comparison/`에 원문/SHA/한계가 있다. 이는 별칭 검증이며 과거 실패 재현이나 원인 확정이 아니다.
- 대상1블록 안의 PATH 설정과 실제 command-v 조회를 유지한다. 그 실제 조회 결과를 **같은 Bash 호출 안에서** `cygpath -aw`로 Windows 경로 변환해 stdout 첫 줄에 내보내고, 원래 `pace --version`을 이어 실행한다. 인자는 기존 환경 변수·셸의 인용 경계를 지키며 사용자 경로를 코드 문자열에 삽입하지 않는다. command-v 또는 변환 실패는 `&&` 연결로 종료 실패가 된다.
- 별도 Bash의 expectedBin 변환과 문자열 동일 단언을 제거하고, 관측한 첫 줄과 예상 `join(bin,'pace')`를 Node `realpathSync.native` 및 `statSync({bigint:true})`로 대조한다. 양쪽 실제 파일 확인·native 정규 경로 동일·dev/ino 동일을 명시 단언한다. 경로 정규화만 같게 보이도록 문자열을 자르거나 존재하지 않는 경로를 허용하지 않는다. 필요한 fs import 두 개만 추가한다.
- 원래 version.status0 및 마지막 버전 줄의 실제 Node CLI와의 비교, 실제 Git 커밋 훅의 거부/프로젝트 오류/pace 발견 단언, 특수문자 인자 전달 단언은 그대로 둔다. 시험 이름/Windows skip/timeout/다른 블록/제품/설치 스크립트/사용자 설정은 바꾸지 않는다. 시험 수996/987통과/skip9 기준과 측정 도구/격리 조건은 유지한다.
- 구현 뒤 먼저 Windows 래퍼 파일 전체1회를 실행한다. 별칭 대조는 이미 검증한 두 표기를 사용한 근거로 보존하고 자동 반복하지 않는다. 소유 시험 사본에서 command-v 관측 경로만 기존 설치의 다른 파일(app/bin/pace.ts)로 오지정해 새 경로 단언에서 실패하는 음성1회를 수행한다. 원래 버전 호출 자체는 유지하며 설정·컴파일 오류가 아닌 해당 단언 실패인지 원문으로 확인한다. 실제 구현의 같은 파일 허용과 다른 파일 거부를 연결한다.
- 정확한 원본/수정 SHA와 대상 블록밖 byte 동일·허용 import/셸/단언 diff를 감사 도구에 연결한다. 기존 함수/Telegram 감사는 바꾸지 않고 Windows 세 번째 예외를 정확히 추가한다. 새 TASK 해시의 같은 사전 reviewer 통과 전에는 원본 시험/실행 소스를 수정하지 않는다. 통과 뒤 위 집중 검증을 마치고 main이 새 전체3회 실행을 승인한 경우에만 새 고유label/609SHA로 측정한다. 이전 성공 회차를 재사용하지 않는다. 새 전체 실패도 즉시 원문 보존 후 main 질문이며 마감하지 않는다.
