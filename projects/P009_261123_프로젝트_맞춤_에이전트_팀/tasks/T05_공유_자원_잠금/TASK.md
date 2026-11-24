# T05 공유 자원 잠금

- 프로젝트: [P009](../../PROJECT.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

참여 작업자가 공유 자원을 동시에 쓰지 않도록 장치로 직렬화한다. 갱신 중단만으로 회수하지 않고 소유 프로세스 종료와 실제 자원 미사용을 모두 확인한다.

## 재료

직전 T04 마감의 남긴 것, src/team/store.ts의 경로 검사와 loadTeam, src/cli.ts의 team 명령, docs/TEAM.md·SECURITY.md·WORK-PROCESS.md, Git 공통 폴더와 PACE_HOME. 브레인 검색은 프로세스/자원 수명 결합을 보장하는 기존 구현을 찾지 못했다. 기존 review-log 잠금은 짧은 검토 원장용이므로 작업 자원 잠금으로 재사용하지 않는다.

## 증명 범위

- 판정 주체: 자동 단위/실제 CLI·프로세스·Git 임시 저장소 시험과 독립 reviewer/tester가 동시 실행·상태·파일 경계를 판정한다. 수동 자원 확인은 coordinator 또는 captain의 명시한 근거만 기록하며 자동 정답으로 추정하지 않는다.
- 포함: 참여 호출 사이 repo/machine 공유, 프로세스 PID+OS 시작 식별, 토큰 fencing·자동 갱신, 자원 확인기, 정상 해제와 비정상 회수의 안전, 모름의 보류, CLI와 원본 목록 호환, 보안 경계.
- 범위 밖: 비참여 직접 도구 호출 차단과 악의적 동시 파일 교체·같은 계정의 토큰 탈취 방어는 제공하지 않는다. 실제 Studio MCP 미사용 판정/직렬화는 T08에서 해당 저장소 확인 방법과 함께 관측한다. Windows 실기 접근이 없으면 모름으로 보류하고 실기를 별도 남긴다. 필수 안전 조건은 범위 밖으로 빼지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 엄격한 resources.md 목록(name·capacity=1·scope repo/machine·description·선택 probe argv)을 읽고 repo는 Git common dir, machine은 PACE_HOME에 잠금을 둔다. worktree/저장소 간 범위와 기존 팀 목록·sync·verify 호환을 지킨다. |
| T-2 | lock --by 담당 -- 명령 래퍼가 수명 동안 PID·시작 식별·무작위 획득 토큰과 자동 heartbeat를 유지한다. 다른 참여 호출은 거부/보류하며 오래된 토큰의 갱신·해제는 새 소유권을 바꾸지 않는다. |
| T-3 | heartbeat 만료만으로 회수하지 않는다. 소유자는 래퍼와 기록한 자식 프로세스 그룹 전체이며 하나라도 살아 있으면 거부, 종료 여부 또는 자원 상태 모름/사용 중은 보류, 소유자 종료+자원 free 확인만 회수한다. 확인기 없는 자원의 회수는 coordinator/captain의 근거 있는 확인과 소유자 종료 확인을 함께 요구한다. |
| T-4 | 해제도 자원 미사용 확인을 거치고, 래퍼 정상 종료 후 자원 사용이 남으면 잠금을 보존한다. 상태·보류 사유·확인 요청 및 회수 주체/근거가 남는다. 손상·링크·경합/중단·시작 확인 실패에 안전하게 보류한다. |
| T-5 | 실제 두 임시 worktree와 별도 저장소에서 공유·배타·안전 회수를 관측하고 전체 검사/비밀 검사·독립 tester/reviewer 두 단계를 통과한다. 문서·코디네이터 자원 요청 규칙을 갱신한다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit/e2e | T-1 | 두 worktree 및 별도 repo, 같은 임시 home | 목록과 lock 경로 조회·경합 | repo는 worktree 공유/다른 repo 분리, machine은 다른 repo도 공유; 일반 역할 resources 필드와 충돌 없음 | 실제 git/CLI 및 목록 오류·링크·예약명 시험 |
| S-2 | unit/e2e | T-2 | 살아 있는 래퍼와 자식 | 두번째 요청·갱신 중 관측·늦은 구 토큰 | 동시1, 자동갱신, 구 토큰 무효 | 실제 프로세스 sentinel·주입 시계/소유상태 |
| S-3 | unit | T-3 | stale, alive/dead/unknown × free/busy/unknown | 획득/회수 | dead+free만 회수, missing probe는 확인 없이는 hold | 시험용 가짜 확인기·소유자 관측 함수와 실제 래퍼 강제 종료+자식 생존→보류 및 자식 그룹 종료 |
| S-4 | unit/e2e | T-4 | 정상·비정상 종료, 자원 잔존/모름, 손상·경합 | unlock/renew/status/회수 | 토큰/owner 재대조, 쓰기와 감사 실패는 다음 실행 금지, 확인 근거 기록 | 부정 토큰·PID 재사용·파일 링크/크기/비밀·guard 중단 및 실제 자식 정상 종료+손자 생존+free probe→해제 안 됨 시험 |
| S-5 | check | T-5 | 최종 변경 | 관련·전체 검사와 독립 검토 | 실패0, 실제 임시 프로젝트 근거, 문서·보안 대조 | PACE_SKIP_BROWSER_E2E=1 npm run check 및 secret-scan |

## 접근

1. resources.md는 사람용 Markdown 설명과 단일 JSON fence의 version1/resources 배열로 둔다. name은 팀 이름 규칙, capacity1과 scope를 엄격 검증한다. resources.md는 예약 메타파일로 역할 목록에서 제외하고 같은 이름 new를 거부한다. probe는 신뢰한 저장소가 선언한 실행 파일+argv이며 shell 없이 timeout/출력 제한으로 실행한다. exit0=free,1=busy,그 외/실패=unknown, 출력은 저장하지 않는다. 실제 자원별 정확성은 선언 책임이며 T08 별도 관측이다.
2. 새 src/team/resources.ts·resource-lock.ts와 test/team-lock.test.ts. 공유 루트 아래 링크 없는 0700 디렉터리, 자원별 짧은 mkdir operation guard와 단일 0600 JSON 상태·감사를 사용한다. guard를 자동 회수하지 않는다(중단 시 보류·운영자 확인). 모든 read/renew/release/reclaim은 같은 guard와 토큰/상태 재대조를 거쳐 원자 교체한다. 감사 기록 실패 시 실행 전 보류한다. 사용자 파일을 지우거나 다른 토큰을 강제 해제하는 옵션은 없다.
3. 소유자는 짧게 끝나는 lock 명령이 아니라 자식을 기다리는 래퍼다. lock --by 이름 -- 명령을 기본으로 하고 명령 없는 lock은 전경 유지로 SIGINT/SIGTERM까지 소유한다. 자동 타이머 갱신 실패 시 자식 종료를 요청하고 잠금을 남기며 다음 실행은 회수 조건으로 막는다. 전달 신호/종료 뒤 외부 자원 미사용은 probe로 별도 확인하며 child exit 자체를 quiescence로 간주하지 않는다.
4. process identity는 PID와 OS 시작 표지(지원 OS의 /proc 또는 ps, Windows는 고정 PowerShell 조회)를 비교한다. ESRCH/조회 부재와 성공 조회의 다른 시작 표지는 원 소유자 종료, EPERM/조회 실패·미지원은 unknown이다. 자기 시작 식별을 얻지 못하면 획득/실행을 보류한다. 만료 시각은 관측 정보이고 생존한 프로세스의 잠금은 회수하지 않는다.
5. unlock은 token을 요구하며 외부 호출에서는 소유자 종료까지 확인한다. wrapper 내부 정상 완료 경로도 자기 토큰/시작 식별과 기록한 자식 process group 부재를 모두 확인한 뒤 free probe로만 해제한다. 직계 자식 정상 종료라도 손자가 그룹에 남으면 잠금을 보존하고 종료 요청을 보낸다; 실제 그룹 종료 확인 없이는 해제하지 않는다. probe 없음/unknown에는 종료 소유자에 한하여 --confirmed-by coordinator|captain --evidence 짧은 근거로 수동 자원 미사용 확인을 기록한다. 사용자 주체 진위를 인증하지 않으며 협력 프로토콜임을 공개한다. 자동 lock 회수는 dead+free만 허용한다. 상태 0=관측 성공, lock 0=명령 성공, 1=자원 잠김/명령 실패, 2=사용법/안전 보류로 정의한다.
6. 문서 TEAM·SECURITY·README·정의서와 skills/pace-project-dev/references/coordinator.md에 참여 자원 요청은 잠금으로 답하고 불확실성은 확인 요청하도록 쓴다. 기존 model/원본 읽기/역할 미지정 호환은 유지한다. 교본 typescript 및 verification의 외부 입력 가드·파일/프로세스 경계·독립 sentinel·음성 시험과 대조한다.


## 사전 검토 보완: 소유 프로세스 트리와 선언 일관성

B1: POSIX 명령은 별도 process group의 내부 Node bridge로 실행한다. bridge는 IPC 시작 허가를 받기 전에는 실제 명령을 실행하지 않으며 부모 연결이 끊기면 종료한다. 래퍼가 bridge PID·OS 시작 식별·process group을 잠금 상태에 먼저 영속 기록한 뒤 START를 보낸다. 기록 중단/누락은 unknown으로 보류한다. 원 소유자 종료는 래퍼의 PID/시작 식별 종료와 기록된 process group 부재가 모두 확인돼야 한다. 그룹 구성원이 하나라도 남으면 alive/hold이고, Windows처럼 그룹 전체 종료를 확인하지 못하면 unknown/hold다. 실행 명령은 이 그룹에 남는 참여 호출 계약이며 setsid/detach로 탈출하는 비참여 데몬을 격리하지는 않는다(기존 ProcessGroup과 같은 경계). SIGTERM/SIGINT와 갱신 실패에는 기록한 그룹에 종료 요청을 보내고 그룹 부재를 확인하기 전 해제하지 않는다. 실제 래퍼 SIGKILL+자식 생존+free 확인기에서도 회수 보류되는 결함 검출 시험을 추가한다.

S1: 현재 실행 worktree 선언을 읽되 Git common dir의 이름별 binding에 scope와 probe 포함 정의 지문을 최초 사용 시 기록한다. worktree에서 scope가 바뀌어 다른 잠금 위치를 고르는 우회도 binding 단계에서 먼저 거부한다. machine 공유 잠금도 같은 지문을 대조한다. 실행 중 및 과거 binding이 있는 정의 변경은 보류하고 명시적 운영자 검토 대상으로 둔다. 자동 scope 전환/이행은 제공하지 않는다.

S2: 중단 guard는 자동 삭제하지 않고 guard 소유 PID/시작 식별을 상태로 남긴다. 안전한 진행보다 보류가 우선이다. status 진단과 운영자가 소유 프로세스/그룹·자원 미사용·경합 종료를 확인하고 별도 승인 후 자기 저장소 guard를 정리하는 절차를 문서화한다. 제품에 무조건 강제 삭제 옵션을 추가하지 않는다. 실제 사용자 파일 정리는 이번 작업자가 수행하지 않는다.

S3/S4/S5: probe 없는 자원은 정상 명령 종료 뒤에도 잠금이 남는 것이 의도이며 status에서 확인 요청을 반환하고 소유자 종료 뒤 token+confirmed-by+근거로 회수하는 흐름을 시험한다. CLI 결과 JSON에는 outcome(acquired/busy/hold/released/completed/child_failed), childExitCode 및 signal을 구분해 종료 코드와 함께 제공한다. 수동 확인 감사는 확인 주체·짧은 근거 및 제공되는 ORCA_TERMINAL_ID/ORCA_RUN_ID 같은 호출 환경 식별자를 안전 형식으로 기록하되 진위 인증으로 주장하지 않는다. 같은 사용자 권한의 위조 방어/TTY 강제는 비대화형 코디네이터 경로를 막으므로 도입하지 않는다. ps 시작 식별은 초 단위 충돌 때 살아 있음으로 보류하는 보수적 한계를 공개한다. 커널 advisory lock 대안은 Node 표준 API 부재와 런타임 의존성 금지로 채택하지 않았다.


## 사전 재검토 보완: 정상 완료도 그룹 종료 필수

B1 재검토의 정상 해제 누락은 접근5와 S-4에 직접 반영했다. 정상/오류/신호/갱신 실패/외부 unlock/자동 회수 모든 경로의 종료 조건을 같게 적용한다. 내부 완료 경로만 래퍼 자신 생존을 허용하며 자식 그룹 부재+free는 생략하지 않는다. 손자 생존에는 그룹 SIGTERM을 요청하되 즉시 강제 해제하거나 종료 성공으로 추정하지 않고 hold를 반환한다.

단계 표지는 pre-start와 started다. pre-start에는 START가 전송되지 않았으므로 래퍼 종료 확인 후 명령 미시작으로 판정할 수 있다. started는 group 기록이 반드시 있으며 이를 모르면 hold다. 단계 기록→START 순서를 실제 bridge 시험으로 확인한다. 명령 없는 전경 모드는 그룹 사용자의 수명을 추적하지 않으므로 자동 회수하지 않고 래퍼 종료+수동 자원 확인을 요구한다.

binding 지문은 name·capacity·scope·probe argv만 포함하며 description은 제외한다. 최초 기록은 repo name guard 안 원자 wx로 한 번만 만들고 다른 정의는 보류한다. 정의 변경은 먼저 모든 관련 repo/machine 소유자/그룹 종료·자원 미사용과 참여 호출 중단을 운영자가 확인하고 별도 승인 후 관련 binding과 해당 상태를 보관/교체하는 수동 절차를 문서화한다. 자동 재바인딩/강제 해제 CLI는 제공하지 않는다. 불일치 거부와 승인된 절차를 시험용 임시 디렉터리에서 재현한다. 이 작업자는 실제 사용자 잠금/정의를 삭제하지 않는다. PGID 재사용도 살아 있음으로 보류하는 한계다.
