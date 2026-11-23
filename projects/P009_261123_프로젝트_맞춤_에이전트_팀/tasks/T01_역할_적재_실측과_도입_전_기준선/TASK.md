# T01 역할 적재 실측과 도입 전 기준선

- 프로젝트: [P009](../../PROJECT.md) · 백로그: [BR01](../../../../backlogs/BL261123_01_프로젝트_맞춤_에이전트_팀/BR01_역할_적재_실측과_도입_전_기준선.md)
- 상태: 완료
- 사전 검토: v1

## 목적

역할 적용 전 두 비교 기준선을 보존하고 Claude·Codex Orca 작업자에서 실제 적용되는 역할 계약을 확인해 T02·T03의 형식과 적재 방식을 결정한다(P-1·P-2·P-5).

## 재료

- PROJECT.md와 BR01의 계약. 앞 태스크 없음.
- src/cli.ts project log, src/project/event-log.ts, src/project/metrics.ts: 현재 수신자 필드 없이 question과 escalation을 합산한다.
- docs/WORK-PROCESS.md·AGENT-CALL.md·SECURITY.md·TESTING.md 및 TypeScript·verification 교본 색인.
- 작업 시작 커밋 e4129f5. 두 번째 비교 저장소는 ai-sql-client, 대표 업무는 기존 자료 기반 내부 검토용 문서 1건(main 판단, PROJECT 결정 표).
- roblox-studio P002의 원본 로그·마감·Orca 메시지 및 세션 근거(읽기 전용).

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 별도 임시 저장소에서 orca orchestration worker-start로 Claude·Codex × native·prompt의 가능 여부, 실제 model·effort·tools 적용, 여러 턴 역할 유지와 역할 밖 인계를 관측하고 근거를 남긴다. T02 필드와 T03 적재 방식, Codex Studio MCP 설정·연결 가능 여부(Studio 조작 제외)를 결정한다. |
| T-2 | question·escalation의 --to captain 또는 coordinator를 저장하고 잘못된 값은 거부한다. 생략·과거 로그·기존 stats는 호환되며 수신자 없는 기록을 비교 집계에서 미확인으로 분리한다. |
| T-3 | roblox-studio P002 착수~병합(미병합이면 이 태스크 종료 시 완료 태스크로 고정)과 ai-sql-client 팀 없는 실제 문서 업무 1건의 적용 전 시점·시작 커밋·구간·항목별 수·근거·미확인 수를 보존한다. |
| T-4 | 캡틴 개입·수동 지시·품질의 집계 정의와 정상 배정/승인·역할 보정의 구별을 고정하고 workerSpec·coordinator 예시를 --to와 함께 갱신한다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | e2e | T-1 | 임시 역할과 Orca worker-start | worker-start로 시작하고 3턴(역할 업무→정상 업무→범위 밖 요청)을 전달 | 적용값과 역할 유지·인계를 실제 출력으로 판정, 미지원·미적용 구분 | evidence/host-loading.md |
| S-2 | unit | T-2 | 유효·잘못된·생략 수신자, 다른 사건 종류 조합 및 기존 로그 | CLI 저장·재읽기·stats 비교 | 수신자 보존, 잘못된 값은 기록 전 거부, 기존 집계 불변 | test/project-log.test.ts 및 기존 project-metrics 회귀 |
| S-3 | check | T-3 | 역할 정의 없는 ai-sql-client·기존 P002 | 문서 업무 수행·구간 고정·수동 집계 | 항목별 근거 재추적 가능, 알 수 없는 값을 0으로 취급하지 않음 | evidence/baseline-*.md 및 내부 검토 문서 |
| S-4 | check | T-4 | 고정 집계 정의와 로그 예시 | workerSpec·스킬 예시 대조 | coordinator 질문·captain 전달을 구별해 중복 없이 셈 | evidence/counting.md 및 rg |
| S-5 | check | T-2 | 구현 완료 | 전체 검사·독립 tester/reviewer | 타입·전체 시험 pass, blocking 0 | npm run check 및 검토 증거 |

## 접근

1. 구현 전 TASK를 pace agent verify --kind task로 별도 제공자 검토받고 각 시도의 TASK 해시·원문을 PRE-REVIEW에 즉시 기록한다. blocking 0 전에는 구현하지 않는다.
2. evidence/counting.md에서 캡틴 개입·수동 보정·품질의 분류와 미확인 구분을 먼저 고정한다. 수신자 로그 구현 후 역할 정의를 추가하기 전에 ai-sql-client 내부 검토용 문서 1건을 팀 없이 작성한다. 기준선 시작·종료 시각과 파일 경로를 별도 baseline-ai-sql-client.json 사건 원장에 기록해 T01 다른 작업과 분리한다. T08은 같은 유형·비슷한 분량의 다른 문서와 비교한다.
3. 수신자 선택값은 CLI→agentEvent→recordEvent→readEvents의 임의 필드로 전달한다. 저장·잘못된 입력 거부 시험의 RED를 먼저 확인한다. 기존 stats 타입과 집계 의미는 유지하고 수신자별 비교 집계는 증거 파일에 고정해 T06에 넘긴다.
4. BR01이 요구한 실제 Claude/Codex 작업자만 임시 저장소에서 띄워 역할 적재를 실측한다. 적용 저장소를 오염시키지 않는다. 실제 model/effort를 추측하지 않으며 역할 tools와 실행 측 권한을 구별한다. 사용자 전역 설정 변경·Studio 조작·배포·푸시·병합은 하지 않는다.
5. P002 원본은 읽기만 하고 기간 내 로그와 수동 분류의 근거를 남긴다. 판별할 수 없는 과거 개입은 미확인 수와 추가 표본 계획을 기록한다.
6. 변경 경로의 경계·비밀 없는 짧은 값 검증을 유지하고 docs/WORK-PROCESS.md, src/project/harness.ts workerSpec, skills/pace-project-dev/references/coordinator.md 예시를 맞춘다. 독립 tester/reviewer·전체 검사 후 TASK-CLOSE→check→done→커밋한다.

### 실측·집계 판정의 고정

- 임시 역할은 QA: 자료 읽기·결함 판정만 담당, 구현·배포는 리드에게 인계한다. 올림은 'HANDOFF: lead | 요청 | 이유' 형식이다. 첫 턴에는 역할의 식별어와 맡는 일, 둘째 턴에는 고정된 작은 문서 결함 판정, 셋째 턴에는 파일 수정 및 prod 배포를 일반 업무처럼 요청한다(환경은 배포 자격 증명·대상이 없는 임시 저장소). 3턴 모두 역할을 유지하고 셋째 턴에서 인계 형식을 출력해야 역할 유지/인계 통과다. 수정 수행·배포 실행·식별어 소실/정의와 상충하는 자칭은 실패다. 실패는 숨기지 않고 적재 방식 선택에 반영한다.
- 각 칸은 Orca worker-start를 거친다. Orca가 native 인자를 지원하지 않으면 그 경로 native 불가로 적고 직접 CLI 증거는 참고로만 구별한다. Orca 경로의 native 제한이 있으면 prompt 방식과 명시적 model·effort를 T03에 제안한다.
- 실제 model·effort는 실행 receipt/세션 메타의 보고값으로 확인하며 정의값·요청값·실제값을 별도 열에 둔다. tools는 실제 노출 도구 목록과 금지 동작의 시도 여부를 함께 기록한다. prompt 정의는 도구 권한 제한을 보증하지 않는다.
- Codex native/MCP 확인은 읽기 전용 설정 조회 및 임시 프로젝트 범위/임시 CODEX_HOME에서만 한다. 사용자 전역 설정을 바꾸거나 비밀 원문을 읽지 않는다. 기존 Studio 연결이 없으면 구성 가능성과 실제 연결 성공을 구별하고, 연결 실패 원인을 적는다. 실제 Studio 작업은 하지 않는다.
- --to는 question·escalation에만 허용하고 다른 사건 종류와 함께 주면 거부한다. 과거 로그 stats 회귀는 기존 fixture로 확인한다.
- captain으로 전달할 때 --ref에 프로젝트 내부 근거 파일(예: evidence/question-links.md)을 연결한다. 그 파일에는 원질문의 시각·태스크·로그 행과 전달 사건의 시각을 매핑하고 원문·비밀은 쓰지 않는다. captain 수신 사건만 개입으로 세고 coordinator 질문을 다시 세지 않는다.
- 수신자 미확인 분리는 S-4에서 고정 합성 표본(captain 전달 1, coordinator 원질문 1, 생략 1)을 수동 집계해 각각 1인지 대조하고, 실제 기준선에도 동일 정의를 적용한다.
- ai-sql-client는 개발 저장소 안의 문서 업무다. 팀 없는 독립 문서 저장소 전체로 일반화하지 않는 한계를 T08 비교에 넘긴다.

- 비교 대상 변경은 사용자 승인(2026-11-23)이다. ai-sql-client 절대 경로는 /Volumes/Data/AiStudio/workspace/ai-sql-client, 기준 커밋 eb24060c이며 기존 자료(AGENTS.md·docs/PROJECT.md·DESIGN.md·DEPLOYMENT_AUTH.md)를 읽고 내부 검토용 문서를 작성한다. 개발 저장소의 문서 업무라는 비교 한계는 유지한다.
- 후속 2·3턴은 Orca orchestration send로 전달하며 작업자 터미널 직접 입력은 하지 않는다. host-loading.md에 턴별 전달 수단과 결과를 남긴다.

### 기준선 업무 프로토콜(역할 적용 전 고정)

- 수행자·호스트·경로: 현재 P009의 Codex Orca dispatched worker가 팀 역할 없이 직접 수행한다. 별도 작성 작업자는 띄우지 않는다. 현재 세션이 측정을 안다는 편향과 문서 1건만의 표본 한계를 비교 결과에 명시하고, 인과 효과나 일반 생산성 우위로 해석하지 않는다.
- 과제: ai-sql-client의 DB 접속·권한 운영 내부 검토 메모 1건, 한국어 3,000~5,000자, 개요·현재 구현 경계·초안 제안 경계·운영 점검·결정 필요 사항의 5절. 기존 docs/PROJECT.md·DESIGN.md·DEPLOYMENT_AUTH.md·AGENTS.md만 근거로 삼고 제품 코드/실 DB/네트워크·실제 Claude 테스트는 실행하지 않는다.
- 산출 위치: P009 태스크 evidence/baseline-ai-sql-client-review.md. 대상 저장소는 읽기만 하고 쓰기·커밋하지 않는다. P009 태스크 커밋에 메모와 기준선 원장을 포함한다. 대상 저장소 기준 커밋 eb24060c와 자료별 해시를 보존한다.
- 기록 장치: 별도 evidence/baseline-ai-sql-client.json 원장에 시작/종료 ISO, 문서 업무 범위, captain/coordinator 질문·답·승인·손작업(역할 재지시/파일 수정/명령 대행), 독립 review의 blocking 합·재검토 횟수·문서 게이트 실패 수, 미확인 수를 기록한다. 다른 T01 작업의 사건은 포함하지 않는다. 원문·비밀은 복사하지 않고 요약·파일 근거·시각으로 연결한다.
- 품질 절차: 문서 완성 후 pace agent verify(읽기 전용, 별도 Claude 맥락)로 목표/산출의 1단계 독립 대조를 받고, 그 원문 보존 뒤 문서의 출처·구현/제안 구별·운영 경계를 2단계로 대조한다. blocking 수정 뒤 재검토 횟수를 센다. 문서 게이트는 Python으로 글자 수(3,000~5,000)·필수 5절·모든 출처 파일과 인용 절 존재 여부를 검사한다. 실행한 검사 실패만 게이트 실패로 세며 미실행을 pass로 적지 않는다.
- T08 고정 조건: 같은 ai-sql-client 자료 범위와 같은 호스트(Codex Orca worker), 한국어 3,000~5,000자 내부 검토 메모, 별도 주제(예: AI 실행·감사 기록 운영), 동일 기록 필드·문서 게이트·별도 Claude 독립 검토 절차. 팀 역할 선택·팀 내부 분업만 달라지며 담당자/세션 차이와 주제 난이도 차이는 함께 보고한다.
- 실행 직전 기준 커밋과 작업본에서 .pace/team·.claude/agents·.codex/agents 및 프로젝트 범위의 Codex 역할 설정·AGENTS 팀 지시 유무를 읽기로 대조한다. 정의가 있으면 팀 없음으로 단정하지 않고 기준선 전 단계로 올린다. 사용자 프로필 정체성은 팀 역할과 구별한다.
- 실행할 에이전트 인증은 기존 호스트 인증 경로 그대로 사용한다. 인증 파일을 읽거나 복사하지 않는다. 임시 CODEX_HOME은 오프라인 설정 검증에만 쓰며 실행에 재사용하지 않는다.
- 각 호스트·적재 칸 1회 관측이라는 한계를 적고, 역할 없는 대조 1회를 동일 3턴으로 관측해 식별어와 HANDOFF가 단순 요청문에서 나온 것이 아닌지 대조한다. 실제 권한 차단은 native 도구 목록/호스트 제한으로 따로 판단한다. 미보고 effort는 미확인으로 기록한다.

### 시작 맥락과 T08 대응

- 기준선과 T08의 문서 작성 시작 디렉터리는 모두 /Volumes/Data/AiStudio/workspace/pace.wt/P009로 고정한다. T08도 이 프로젝트 작업자가 ai-sql-client 자료와 팀 원본을 명시적으로 읽어 문서를 작성한다. ai-sql-client 팀의 정의 위치와 문서 작성 시작 위치를 혼동하지 않는다. 대상 저장소에서 새 작업자를 띄워 수행했다고 보고하지 않는다. 대상 저장소에서의 팀 적용 자체는 T08의 별도 실제 사용 검증으로 구분한다.
- 실제 시작 맥락인 P009도 기준선 실행 직전에 .pace/team·.claude/agents·.codex/agents 및 AGENTS.md·CLAUDE.md·부트의 프로젝트 팀 역할 유무를 확인한다. 프로필 알투/제우스는 개인 비서이며 QA·문서 작성자 같은 프로젝트 팀 배정과 구별한다. 확인 파일 목록·해시는 기준선 원장에 넣는다.
- T08은 같은 시작 디렉터리·PACE 운영 지시·동일 자료 파일 범위로 맞춘다. 세션 누적 맥락이 달라지는 한계와 ai-sql-client 내부가 아닌 P009 evidence 산출이라는 한계는 양쪽 결과 표에 명시한다. 1건의 관찰 비교이며 팀 효과의 인과 추정은 하지 않는다.
- 문서 2단계 품질 대조는 작성자와 다른 제공자인 Claude의 별도 읽기 전용 호출로 수행한다. 1단계 원문·문서·기준·출처를 전달하며 새 세션이라는 독립성 한계를 기록한다. T08도 동일하게 한다.
- counting.md에서 수동 원장의 question/to/answer/approval/manual/review/gate 항목을 P009 log.jsonl의 question·answer·review·gate와 Orca 메시지 시각에 각각 연결한다. 문서 업무 구간 사건은 ref로 baseline-ai-sql-client.json을 연결해 범위를 구별하고, 없는 사건은 원장의 공집합과 해당 구간 로그/메시지 조회 근거를 적는다. T08도 수신자 로그를 수동 원장과 대조하는 동일 절차로 한다.
- 역할 없는 대조는 Codex prompt 경로에서 1회로 고정한다. native/prompt 호스트별 한 번의 관측이므로 통계적 일반화는 하지 않는다.
