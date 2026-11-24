# T03 작업자 역할 지정(start --role)

- 프로젝트: [P009](../../PROJECT.md) · 백로그: [BR03](../../../../backlogs/BL261123_01_프로젝트_맞춤_에이전트_팀/BR03_작업자_역할_지정(start_--role).md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

BR03/P-2에 따라 프로젝트 작업자를 저장소 역할로 시작하여 시작 뒤 역할을 재입력하는 보정을 없앤다. T01의 공통 prompt 원본 읽기와 별도 model/effort 인자 전달을 구현하고 두 호스트의 실제 작은 업무·역할 밖 인계를 관측한다.

## 재료

BR03, T01/T02 TASK-CLOSE·host-loading/host-model-metadata, src/project/harness.ts의 startProjectRaw/launchWorker/workerSpec/observed, event-log.ts·metrics.ts·cli.ts, src/team 원본 검증·worker-tiers 해석. docs/AGENT-CALL·WORK-PROCESS·SECURITY와 TypeScript/verification 교본, 기존 project-harness/project-log 회귀. main ab34132를 조상으로 통합해 BR09 최종 판정을 포함했다.

## 증명 범위

- 판정 주체: 자동 단위/CLI 시험이 우선순위·인자 전달·선거부·기록 왕복·호환성을 판정한다. 두 실제 Orca 작업자의 업무 결과·원본 적재·역할 밖 인계 및 런타임 model/effort는 관찰 원문/세션 메타를 PM과 독립 tester/reviewer가 대조한다. 캡틴의 사업·배포·병합 판단은 대신하지 않는다.
- 포함: role 명시/PROJECT/없음 선택, 실제 실행하는 checkout 원본의 검증·원본 경로/지문, Claude/Codex prompt 적재, tier와 명시 override의 model/effort 인자, start 기록의 역할/출처/적재 방식/전달 설정·권한 적용 여부와 관측 한계. 이름/경로/링크/손상·설정 오류는 worktree 생성·호스트 실행 전에 거부한다. 실측은 PACE 임시 저장소 두 호스트에서 작은 실제 업무와 인계로 닫는다.
- 범위 밖: native subagent 강제 선택(최상위 Orca 작업자와 다르며 T01에서 Codex 미적재), tools의 OS/호스트 권한 차단(현재 경로에 장치가 없으므로 false를 기록하고 T04/T08에서 실제 경계 관측), 시작 검사 후 원본을 고의로 제거/미적재시킨 호스트의 실제 보류 행동은 T04 정상·미적재·삭제 대조에서 증명한다(여기서는 시작 전 선검사와 읽기 실패 보류 지시, 정상 적재를 증명). 공유 잠금 T05, handoffs 봉투 T09, 실제 적용 저장소 이전 T08. 요청 인자와 실제 런타임 적용을 같다고 추정하지 않는다. 사용자 데이터·설치본·실사용 대상 수정/배포/푸시는 하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | start --role 이름 > PROJECT.md 작업자 역할 > 없음이며 자동 lead가 없다. 명시·PROJECT 잘못된 이름/없는/손상/위험 경로 원본은 worktree 생성/호스트 호출 전에 거부한다. 기존 worktree 재실행은 실제 실행 checkout 원본과 그 PROJECT 값을 사용하고 원본이 없는 상황을 일반 역할로 대체하지 않는다. 기존 worktree에 명시 --role을 주고 --launch가 없으면 적용했다고 오인하지 않게 오류로 거부한다. |
| T-2 | Claude·Codex 공통 workerSpec의 첫 지시에 선택 원본을 먼저 읽고 정의대로 수행·미적재 시 보류하도록 싣는다. model/effort는 각 필드의 명시 start 옵션 > role tier 해석(tier model override→worker model/default, tier effort override→tier 문자열)의 순서로 전달하고 도구 안내를 권한 적용으로 주장하지 않는다. --no-launch/Orca 밖의 직접 실행 안내도 역할 읽기·설정을 포함한다. |
| T-3 | start 사건에 역할명·선택 출처·원본 경로/지문·방식 prompt·전달 model/effort·tools 권한 적용 false가 보존된다. 전달 설정과 실제 런타임 관측을 구분한다. 역할 없는 옛 기록·start 동작·일반 모델 설정 우선순위는 호환된다. |
| T-4 | 두 호스트를 각각 실제 start --role 경로로 임시 저장소에서 띄워 작은 실제 업무 1건과 역할 밖 요청 1건을 수행/인계한다. 첫 응답만으로 끝내지 않고 시작 영수증·업무 파일·후속 응답·실제 메타·종료 보고를 모든 시도(설정 실패/시작 실패/적재 실패/수정 뒤 재시도 포함)별로 보존하여 적재/모델/effort/권한의 적용·미확인·불일치를 구별한다. 최종 코드로 실행한 각 호스트 첫 정상 시작 시 역할 적재/업무/인계를 모두 충족하고, 실제 재지시뿐 아니라 보정이 필요했던 순간(원본 미적재·역할 이탈·인계 대신 직접 수행)도 0건이어야 통과다. 그 전 코드의 실패는 시도별로 따로 보존하고 숨기지 않는다. 호스트당 1건은 이 사례의 증명이며 지속 효과는 T08 추가 표본으로 검증한다. |
| T-5 | 명령·우선순위·적용/미확인 경계를 문서화하고 전체 검사·비밀 검사·독립 2단계 tester/reviewer가 blocking0 및 이 계약 목표 달성으로 판정한다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 임시 Git/격리 홈, 명시/PROJECT/없음/유효·위험 원본 | start 선택/사전 검사 | 선택 우선순위·자동 lead 없음, 기존 명시 role/launch 없음 거부, 기존 branch 복구도 실제 ref 원본 선검사, 잘못된 역할은 worktree/worker 없음 | test/project-role.test.ts 실제 API·CLI, sentinel |
| S-2 | unit | T-2 | fake Orca 영수증, 두 호스트/세 tier·명시 override | start/launchWorker/workerSpec/직접 안내 | 원본 첫 지시·전달 인자·읽기 실패 보류·도구권한false, 역할/도구 이름 구별. 두 호스트에서 model만/effort만/양쪽 명시 및 일반 worker effort보다 tier 우선. 선행 -·제어문자/개행·잘못된 Unicode·과대/비밀 값은 선거부, 셸 메타문자는 단일 argv/안내 인용으로 실행되지 않음 | fake 실행 인자 캡처·실제 임시 worktree |
| S-3 | unit | T-3 | start 성공/실패/기존 재실행/옛 사건 | 기록→재읽기 | 선택·원본·방식·전달 설정 보존, 실제 적용으로 오인 없음, 역할 미지정 회귀 | event-log/metrics 왕복 및 기존 harness 시험 |
| S-4 | e2e | T-4 | 역할 적용 전 임시 저장소·두 Orca host | 실제 start --role, 업무 수행 뒤 역할 밖 요청. BR01 수동 보정 정의로 PM이 모든 시작 영수증과 시작~종료 전체 송수신을 집계 | 역할 원본에만 둔 고유 표식·업무 결과·인계, 실제 메타·재지시 및 보정 필요 순간0·모든 probe 종료 | evidence/host-role-start.md·영수증/메타/산출 해시 |
| S-5 | check | T-5 | 최종 구현/문서 | PACE_SKIP_BROWSER_E2E=1 npm run check·secret-scan·독립 검토 | 테스트0건 아님·실패0·계약 목표 달성 | evidence/check.txt·독립 1/2단계 |

## 접근

1. 새 TASK 증명 범위와 해시를 보존하고 독립 사전 검토 1단계→PROJECT/BR03/T01/T02 대조 2단계를 회수한 뒤 구현한다. RED는 아직 없는 role 옵션/선거부/인자 전달에 둔다.
2. 역할 선택/검증을 src/team/의 별도 실행 설정 모듈에 둔다. 새 branch는 main 원본, 기존 branch의 worktree 복구는 생성 전에 해당 ref의 PROJECT와 원본을 git show/ls-tree로 읽어 일반 blob·UTF-8·크기·스키마를 검증한다. 기존 worktree는 실행 checkout 원본을 읽는다. 생성 뒤에는 읽을 원본 지문 일치를 다시 확인하고 그 사이 변경은 실행을 보류한다(만든 worktree는 보존하고 사용자에게 상태/재시도 방법 안내). 유효한 이름과 T02의 경로/크기/링크/nlink 검증을 재사용한다.
3. StartOptions/CLI에 role을 추가한다. 역할은 Claude/Codex만 지원하며 다른 도구의 role 지정은 선거부, 역할 생략의 기존 도구 경로는 유지한다. 공통 workerSpec은 옵션이 없을 때 기존 문자열을 보존한다. 새 worktree는 기본 launch, --no-launch는 역할 포함 직접 안내만; 기존 worktree는 --launch일 때만 새 실행이며 명시 --role만 주면 오류다. Orca 실행은 shell 없는 argv 배열로, 직접 안내는 각 인자를 단일 인용한다. 역할 실행 설정은 1024자 이하 well-formed/비제어 문자열이고 선행 -와 비밀을 선거부한다. 공백·셸 메타는 옵션으로 분해/평가하지 않고 하나의 값으로 전달한다. 모델별 실제 지원은 호스트 결과로 판정한다. 명시 model/effort override 뒤 빠진 값만 tier 해석으로 채우며 공유 호스트 설정 파일을 교체하지 않는다.
4. start 기록에는 제한된 선택 역할 객체를 선택 필드로 추가하고 읽기/쓰기 모두 검증한다. 기존 data의 숫자 전용 계약은 넓히지 않는다. 원본 상대 경로와 SHA, 안전한 model/effort 값만 쓰며 지침 원문·비밀·절대 홈 경로는 기록하지 않는다. 런타임 메타는 start 영수증에 없으므로 전달 상태를 명시하고 실제 두 probe의 후속 관측은 별도 증거/연결 note로 남긴다.
5. 실제 start probe 프로젝트는 업무 1건만 수행·역할 밖 인계를 보고하도록 작성한다. 정의에 없는 직접 구현/배포 요청을 첫 시작 지시에 섞지 않고 정상 업무 후 별도 전달한다. 재지시 대신 관측만 하고 종료 보고까지 회수한다. 역할이 적재되지 않으면 그 실패를 보존·수정 후 다시 측정한다. root 프로젝트/실사용 저장소에 probe가 쓰지 않도록 임시 경로만 허용한다. 임시 PACE_HOME과 tier/worker 설정 지문을 보존하고, PATH의 임시 pace shim이 이 소스 bin/pace.ts를 실행하도록 하여 설치본을 쓰지 않는다. 전달 값은 요청 인자이며 제공자/모델별 지원 여부를 추정하지 않고 실제 거부를 실패로 보존한다. 역할 지문은 시작 검증 시점의 지문이고 작업자의 이후 읽기와 동시 편집을 고정하지 않는다.
역할 정의 자체는 보안 경계가 아니며 편집 뒤 재시작하면 새 지문을 기록한다.
6. WORK-PROCESS/TEAM/README/AGENT-CALL·필요 보안 경계를 갱신하고 관련·전체 시험과 독립 구현 후 2단계 검증→TASK-CLOSE→check/done→커밋한다.
