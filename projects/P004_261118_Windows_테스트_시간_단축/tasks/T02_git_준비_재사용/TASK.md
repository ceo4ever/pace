# T02 git 준비 재사용

- 프로젝트: [P004](../../PROJECT.md) · 백로그: [BL261118_01_Windows_테스트_시간_단축](../../../../backlogs/BL261118_01_Windows_테스트_시간_단축/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

검증 대상 Git 동작을 보존하면서 반복되는 저장소 준비의 프로세스 기동을 줄인다(P-2). 범위는 BR02이며 초기화/커밋 자체를 검증하는 경로는 바꾸지 않는다.

## 재료

- T01 TASK-CLOSE와 정상 원시 시간: 기준 3회 중앙값 1425.464초, 963건(954 통과·실패 0·skip 9). 정상 보조 파일 중 project-harness 540.390초·agent-chain 59.379초이며 단일/부하 조건의 보조 관측임을 유지한다.
- `test/project-harness.test.ts:45` repoFixture는 각 호출에 init·config 3회·add·첫 commit과 동일 AGENTS/docs 파일을 준비한다(호출 위치 66곳, 루프 횟수와 다름). `test/agent-chain.test.ts:41` repo도 동일 파일·첫 commit을 반복한다.
- `test/helpers.ts`의 프로세스별 소유 tempRoot·경로 검증·exit 정리와 `sessionFreeEnv`를 재사용한다. `.pace/test-map.json`에서 helpers는 common이므로 이 보수적인 전체 전환 성격을 유지한다.
- 기준: AGENTS.md, docs/README.md 환경·보안, pace-project-dev testing·reviewer 및 typescript/verification 색인. 공유 가변 시험 상태를 피하고 실패/부분 준비를 다음 시험의 정상 원본으로 쓰지 않는다.
- T01 인계: 중첩 playbook guard의 공용 TMP 전후 비교 간섭은 유력 가설이며 T03에서 해결한다. T02는 그 시험/skip/실행 동시성을 바꾸지 않는다. 전체 검사에서 관측되면 원문 보존 후 판단을 올린다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 동일 형태·같은 Node 시험 파일 프로세스 안에서 커밋된 원본을 한 번 준비하고 모든 호출(첫 호출 포함)이 독립 파일 복사본을 받는다. 작업 파일·Git config/index/ref/object의 변경이 동료 복사본·캐시 원본에 전파되지 않는다(P-2). |
| T-2 | project-harness와 agent-chain의 공통 준비만 전환한다. 기존 시험 이름·단언·검증 대상 init/commit/worktree/오류 주입과 실제 CLI·Git 경계를 보존한다. 준비 실패나 지원하지 않는 연결형 Git 원본은 캐시하지 않는다(P-2). |
| T-3 | 준비 비용의 대조 측정과 T01 방식의 계측 없는 전체 검사 관측을 기록하고 기존 963건의 이름/판정·skip 및 추가 도우미 시험의 차이를 설명한다. 단회 전체 시간 차이를 통계적으로 확정한 개선율로 주장하지 않는다(P-2·P-6). |

## 테스트

<!-- 기준마다 한 줄 이상. 유형: unit(테스트 코드) · e2e(화면·프로세스 시나리오, e2e/S-n.md 또는 E2E 테스트 코드) · check(문서·설정 확인). 가장 싼 충분한 계층을 고른다 -->

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 커밋된 최소 원본과 복사본 3개 | 한 복사본의 작업 파일·config·ref/commit·기존 loose object를 변경 | 다른 복사본과 새 복사본/원본의 내용·HEAD·object가 유지, 준비 callback 1회 | 새 test/git-fixture.test.ts, 실제 Git·직접 파일 변경으로 확인 |
| S-2 | unit | T-2 | 준비 callback 실패 또는 연결/비소유/비어 있지 않은 대상 | 생성 요청 후 다음 정상 요청 | 실패/부분 원본 재사용 없음, 허용 밖 덮어쓰기 없음, 정상 재시도 독립 | 새 도우미 시험·원문 |
| S-3 | e2e | T-2 | 기존 두 파일과 새 도우미 시험 | 실제 Node 시험 실행 | 기존 이름·단언과 실제 CLI/Git 판정 보존, 추가 시험도 통과 | test/project-harness.test.ts·agent-chain.test.ts·git-fixture.test.ts |
| S-4 | check | T-3 | 동일 최소 준비 callback·새 소유 경로 | 기존 반복 준비와 캐시 복사를 교대 순서로 여러 번 비교 | 준비 횟수/소요 시간·cold/warm·표본 수·범위 제한을 공개 | 태스크 benchmark-fixture.ts와 evidence JSON |
| S-5 | e2e | T-3 | 같은 PC·도구·임시 격리·spec 출력 | T01 measure.ts --runs 1 --label t02 실행 | 실제 전체 검사 종료 0·기존 시험 판정 보존, 새 시험 수와 단회 시간 차이 공개 | 계측 없는 npm run check 원문·환경·인벤토리 |
| S-6 | e2e | T-2 | guard의 두 TMP 목록 관측 사이에 별도 프로세스가 공용 TMP 폴더 생성 | 수정 전·격리 preload 후보로 동일 guard 실행 | 수정 전 원래 누수 단언 실패, 격리 후보는 동료 폴더를 자기 누수로 오인하지 않고 3건 통과 | diagnose-guard.ts peer 및 peer isolated, TAP·생성 PID/경로 trace |
| S-7 | e2e | T-2 | 격리 후보의 guard 자신의 TMP에 동일 접두사 폴더 누수 주입 | 원래 저장 경계 guard 실행 | 원래 누수 단언이 실제로 실패, 검사 약화 없음 | diagnose-guard.ts own isolated, TAP·trace |
| S-8 | e2e | T-2·T-3 | 실제 wrapper가 중첩 19개 파일 실행 | 기존 per-process temp helper preload로 모든 파일 임시 공간 격리 | 기존 시험·단언·skip 보존, 실제 중첩 실행 성공, 실패 시 내부 TAP 전체 확인 가능 | wrapper 실행 및 전체 S-5 원문 |

## 접근

- 공용 도우미 `reusableGitFixture(prepare)`를 test/helpers.ts에 추가한다. 원본은 프로세스별 소유 tempDir에 지연 생성하고 검증 뒤 읽기 전용으로 취급하며, 모든 호출에 .git 포함 cpSync 복사본을 준다. Git clone/shared object·hardlink는 쓰지 않는다. 비어 있는 소유 디렉터리만 대상이며 symlink·worktree .git 파일·alternates·절대 worktree/hooks 연결 등 자기완결 원본이 아닌 형태는 거부한다. 초기 준비/복사 실패로 정상 캐시를 등록하지 않는다.
- prepare는 원본 경로와 첫 대상 경로를 받는다. project-harness는 첫 대상의 private HOME/pace bin 문맥을 원본의 **정확한 경로**에만 등록한다. tempRoot/dirname 전체를 문맥 키로 써서 다른 fixture를 첫 HOME으로 가로채지 않는다. 기존 실제 대상의 private HOME/bin 생성과 Git/CLI 호출은 유지한다. agent-chain은 기존 동일 파일과 첫 커밋만 prepare로 옮긴다.
- 원본의 실제 HEAD를 읽기 전용 Git 확인으로 검증한다(원본 private HOME, 사용자 설정 변경 없음). 원본과 호출 대상은 기존 helper 정리 범위 안에만 두며 exit 정리는 기존 정책을 따른다. 원본 초기화는 형태별·파일 프로세스별 한 번이며 다중 Node 파일 프로세스 사이에 가변 디렉터리를 공유하지 않는다.
- 추가 도우미 시험을 test-map의 node-test 단위에 등록한다. helpers common 규칙은 제거하지 않는다. 비어 있지 않은/unborn 초기화와 경로 거부를 검증하는 dashboard-init 등은 이번 전환 대상에서 제외한다.
- 미니 준비 벤치마크는 동일 callback의 직접 반복 준비와 캐시 복사를 교대해 비용 위치만 비교한다. 전체 관측은 코드/도구 고정 후 다른 검사·진단과 겹쳐 돌리지 않고 1회 수행한다. 원문에서 기존 이름/판정과 새 시험을 구분한다. 최종 절반 판정은 후속 최종 3회 중앙값으로 한다.

## 사용자 승인 선행 범위와 수정 전 재검토

2026-11-18 캡틴 승인(main 전달)으로 T03 예정 중 playbook 중첩 실패의 조사·필요 최소 수정만 T02 마감 앞으로 옮긴다. T-1~T-3 및 S-5 종료 0은 유지한다. T03의 동시성 4·8 비교와 선택값 전체 5회 검증은 T02 뒤에 수행한다. 원래 실패한 전체 관측과 Git 준비 벤치를 보존하고 후속 성공 관측에는 실패 수정도 포함됨을 공개한다.

제안 수정은 `test/playbook-maker.test.ts`의 중첩 Node argv에 기존 `test/helpers.ts`를 절대 file URL의 `--import`로 지정하여 각 Node 파일 프로세스가 기존 소유 tempRoot·수명 정리를 사용하게 하는 것이다. guard의 목록 비교·누수 단언, 19개 파일 목록·건수 확인, skip 정책은 바꾸지 않는다. wrapper 실패 메시지는 stdout·stderr 전체를 담아 이후 내부 실패의 정확한 이름을 보존한다. 제품·외부 도구 동작은 바꾸지 않는다.

`diagnose-guard.ts`와 `guard-interference.mjs`는 수정 전 좁은 진단 도구다. 기존 guard의 첫 TMP 목록을 읽은 직후 동기 자식 프로세스가 알려진 폴더 하나를 생성하고, 원래 목록을 그대로 반환한다. peer는 공용 루트, own은 guard의 현재 tmpdir에 생성한다. 기록된 생성 PID·위치로 누수 소유를 구별한다. isolated 옵션은 소스 수정 없이 기존 helper를 preload하는 후보 실험이다. 실제 검사 argv 수정은 이 추가 접근의 독립 사전 검토 뒤에 한다. 자연 중첩 재현은 별도 원문으로 보존하며, 통제 재현이 원래 T02 단회 내부 원인을 확정한 것으로 주장하지 않는다.
