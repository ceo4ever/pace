# T06 팀 측정과 회고

- 프로젝트: [P009](../../PROJECT.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

팀이 사용자의 일을 줄였는지 같은 정의와 구간으로 판단할 측정 장치와 회고 입력을 만든다. 수신 의도·질문 사건 수를 도달이나 전체 손작업으로 오인하지 않고, 역할 지정 자동화/팀 도입/정의 수정의 비교를 구분한다. 실제 두 저장소 효과와 스킬을 통한 회고 실행은 T08에서 관측한다.

## 재료

- BR06 전체, BR01의 유일한 요청 도달 정의와 두 비교 구간, BR09 하네스 연결, PROJECT P-5.
- T09 마감과 441c1d3: requestId별 도달·종류/에이전트 수·열린 위임은 구현됐으나 실패 시도 수/팀 비교/회고 게이트는 없다. reported actor/ref와 로컬 본문 한계, 실제 호스트 감사 T08 이관을 유지한다.
- T01 evidence/baseline-roblox.json·baseline-ai-sql-client.json·baseline-roblox-reachability-v2.json. 두 v1 파일의 키/구간 형태가 다르며 roblox의 로그 blocking31과 실제 판정48은 다른 근거다. 원본을 수정하지 않는다.
- src/project/event-log.ts·metrics.ts·tokens.ts·metrics-report.ts·metrics-document.ts·harness.ts, templates/project/PROJECT·PROJECT-CLOSE. 기존 토큰 수집은 cwd/구간 기준이며 역할별 세션 결합은 없다.
- docs/README·WORK-PROCESS·HANDOFF·SECURITY, TypeScript/verification 교본, 브레인의 프로젝트 지표/요청 단위 도달·legacy 근거. T09의 통과 근거를 효과 실측으로 승격하지 않는다.

## 증명 범위

- 판정 주체: 자동/API·실제 source CLI와 임시 Git의 고정 기대값이 집계·거부·출력·finish 구조를 판정한다. PM은 독립 tester/reviewer의 두 단계 목표/계약 대조와 실행 근거를 합쳐 마감한다. 실제 업무 규모/출처·손집계 완전성·같은 업무 여부와 인과 효과는 사람이 원자료로 대조하며 T08에서 판단한다.
- 포함: BR01 요청 분류/중복 제거와 실패 시도·사용자 승인/종류별 손작업·정상 배정/수동 지시/코디네이터 자체 답·품질·역할 시간/출력의 출처와 누락, 기준선 v1 입력 호환·비교 목적 분리, 팀 회고 행/입력과 finish 검증, METRICS 출력·옛 의미/보안 보존.
- 범위 밖: 실제 두 저장소 전후 효과·팀 수정 실행·live 사용자 진위·역할별 세션 추적 새 수집기(이유: BR06은 장치/입력 계약, BR08이 실증). 기존 cwd 기반 토큰을 역할 실측으로 포장하지 않는다. 원문 Git 보존/일반 세션 수집·외부 발송·배포·병합은 하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 역할/참여 기록이 있는 임시 프로젝트의 stats JSON·텍스트·METRICS에 팀 항목을 낸다. 요청 ID 공유로 ① 답만 ② 실패 뒤 성공1·실패시도1 ③ 실패만 ④ to:owner 로그만 미확인과 수신자 없는 옛 사건을 구분한다. 기존 사건 수/FIFO는 바꾸지 않는다. |
| T-2 | 승인·손작업 종류·수동 역할 보정/계약 밖 지시·정상 배정·코디네이터 자체 답·품질·역할 시간/출력의 관측값과 총량 미확인을 구분한다. handoffs 위임/결과/종결 수는 재해석하지 않고 읽는다. 없는 수치/역할 결합/손작업 원장은0으로 꾸미지 않는다. |
| T-3 | T01 두 기준선 v1 형태와 같은 측정 입력으로 비교 JSON/문서를 낸다. 역할 자동화·팀 도입·정의 수정은 별도 목적/열이며 수정 전후를 도입 효과로 넣으면 거부한다. 같은 정의/구간 단위/업무/크기/호스트·근거가 없거나 표본/중요 수치가 부족하면 이유·추가 표본 계획을 동반한 미확인이다. 합성 대조에서는 개선·악화·미확인을 각각 검출한다. |
| T-4 | PROJECT-CLOSE의 팀 행과 TEAM-RETROSPECTIVE.json 계약을 문서화한다. 팀 finish는 검토한 변경을 먼저 커밋한 깨끗한 작업본에서 선언 영수증·회고·검사 대상과 최종 Git tree를 검증한다. 변경이 있으면 스테이징·커밋·로그 작성 전에 중단한다. 사용자 승인 대상은 검사한 후보에서 생성한 하네스 소유 마감 커밋이다. 채택과 과거 이력을 작업 브랜치와 기준 브랜치 양쪽에서 확인하고, 미채택 프로젝트의 기존 마감은 유지한다. BR07 회고 단계가 읽을 입력을 명시한다. |
| T-5 | 실제 source CLI의 역할 임시 프로젝트에서 stats→측정 snapshot/비교→회고 행→finish를 검증하고 안전/누락/호환·전체 검사를 통과한다. 독립 두 단계 tester/reviewer와 모든 실패 원문·처분을 보존한다. |

## 테스트

| ID | 기준 | 유형 | 시나리오·고정 기대값 |
|---|---|---|---|
| S-1 | T-1 | unit/e2e | 같은 요청 log+중계, 사용자 답만/실패→성공/실패만/의도만/옛 수신자 없음. 도달1/1/0/0·실패시도1·unknown 분리, coordinator 전달 ack/자체 답은 사용자0. 의도만 도달로 바꾸는 결함이 실패해야 한다 |
| S-2 | T-2 | unit | 명시 수치/손집계 근거의 정상·누락/partial/null·음수/문자열/비밀·링크/한도·범위 불일치. 원장 없이 전체 손작업0 금지. 정상 역할 배정/승인과 재지시 보정/추가 지시는 다른 열. 역할 근거 없는 cwd 토큰은 역할값 null |
| S-3 | T-2 | unit/e2e | T09 종류 수와 동일한 위임/결과/종결, coordinator 답 같은ID 중복 제거, 로그 품질과 명시 감사 품질의 출처 구분, 역할 관측 입력이 있으면 출처/도구별 시간·출력 표시하고 없으면 미확인 |
| S-4 | T-3 | unit | 두 실제 T01 v1 기준선의 최소 키/alias/구간을 원본 SHA 불변으로 수용한다. legacy 미확인/31vs48 경계를 노출하고 누락을 채워 넣지 않는다 |
| S-5 | T-3 | unit/e2e | 같은 조건/단위/업무/크기/호스트·충분한 표본 합성값의 감소/증가→개선/악화. null/소표본/다른 단위·호스트·기록 방식의 미대조→미확인+이유+추가 계획. before/after-change를 team-adoption 칸으로 요청→입력 오류/출력 없음 |
| S-6 | T-4 | unit/e2e | 새 marker/역할 지정 프로젝트의 팀 행·JSON 없음/빈 무변경 이유/정의 변경4건/밖 링크·symlink/손상은 finish 거부. 정상1~3·근거 있는0변경을 사전 커밋에서 확인하고 기존 미채택 마감의 자동 커밋과 훅 흐름을 대조한다. |
| S-6a | T-4 | e2e | 합성 Git에서 팀 작업본의 staged·unstaged·미추적 혼합 변경과 비공개 합성 자료가 있으면 HEAD·인덱스·로그·작업 파일·객체를 보존한다. 기준에만 있거나 이름이 바뀐 과거 팀 채택의 우회를 차단한다. 검토 자료를 직접 커밋한 깨끗한 작업본에서는 하네스 마감 경로만 새 커밋에 들어간다. 실제 검사한 부모·tree와 다른 대상의 승인·병합은 보류한다. 정상 마감 뒤에도 Git에 원문이 추가되지 않는다. |
| S-6b | T-4 | e2e | 깨끗한 후보를 읽은 뒤 검사 명령이 HEAD·인덱스·입력을 바꾸면 마감을 보류한다. 기존 실패 로그가 생긴 경우 PM이 원인을 고치고 필요한 기록을 직접 검토 커밋에 담아 같은 관문으로 재시도한다. |
| S-7 | T-1~5 | e2e | source CLI 임시 역할 프로젝트의 관측 입력→stats 정확값→METRICS 팀 절→비교 보고→회고 입력/행→실제 finish. source/ref와 지문/exit를 남기고 실제 인간/외부 서비스·원문은 사용하지 않는다 |
| S-8 | T-5 | check | 전체 PACE_SKIP_BROWSER_E2E=1 npm run check와 비밀 검사, T09/옛 metrics/log/역할·finish 회귀, 독립 첫 목표 판단 뒤 계약 대조. 첫 실패/미확인은 버리지 않는다 |

## 접근

### 집계와 보조 입력

src/project/team-metrics.ts·team-comparison.ts·team-retrospective.ts를 분리하고 collectDashboard/formatDashboard/formatMetricsDocument·CLI·finish에 붙인다. log.jsonl과 handoffs.jsonl은 사건 정본 그대로 두며 새 이벤트 스트림을 만들지 않는다. TEAM-MEASUREMENT.json은 측정 단위/비교 맥락과 감사한 수치의 짧은 **선언 snapshot**일 뿐 이벤트 로그나 업무 본문이 아니다.

team 항목은 실제 role 시작·handoff·to/requestId·명시 팀 측정 marker/보조 파일이 있을 때만 추가해 무관한 옛 stats JSON은 그대로 둔다. T09의 요청 분류를 재사용하고 사용자 경로 final failed 시도를 attemptId별로 따로 센다. unknown·수신자 없는 옛 질문은 합산해서 도달로 바꾸지 않는다. 코디네이터 대신 답은 명시 보조 근거/동일 요청의 사용자 미도달을 함께 대조하며 단순 by:coordinator answer(전달 답일 수 있음)를 자체 답으로 추정하지 않는다.

보조 파일은 version1, 비교 맥락(comparison), nullable counts/observed_counts·coverage·근거 locator, 선택 quality_audit, 역할별 reported observations만 받는다. 짧은 typed metadata·비밀/중복 키/UTF-8·32KiB·일반 단일 링크/조상 경계를 검사한다. 손작업3종(역할 재지시·직접 파일 수정·명령 실행), 계약 밖 지시, 정상 역할 배정, 사용자 승인 종류는 별도 열이다. 전체 범위 완료·명시 complete coverage와 실제 존재하는 짧은 근거 ref가 없으면 총량은 null이고 관측 하한만 보인다. 보조 숫자는 출처/신고·완전성 한계를 표시하며 자동 사용자 도달을 덮어쓸 수 없다. ref에는 원문/상세 답을 복사하지 않고 로컬 decision_reply ID/지문/위치만 연결한다.

role 시간/출력은 명시 역할 결합된 관측이 있을 때만 reported로 낸다. 기존 start.role은 요청/전달이고 기존 tokens는 cwd/구간 집계이므로 이것만으로 역할별 실제 사용량을 만들지 않는다. 선언 역할·프로젝트 worker 맥락 수치는 참고로 따로 보이고 역할 수치가 없으면 null/이유를 낸다. 도구별 출력·캐시 의미를 합치지 않는다. 품질은 기존 review 로그/게이트 수를 보존하고 선택 감사 합(예: T01의48)과 로그 합(31)을 다른 출처로 구별한다.

### 비교 입력과 출력

측정 snapshot은 T01 v1의 repository/condition/observed_at/period/counts/unknown 형식을 유지하며 comparison의 study/conditionCode/definition/unit/workType/sizeBand/host/sampleCount/추가 표본 계획 ref를 확장한다. stats JSON의 team.snapshot도 비교 입력으로 받는다. 실제 두 v1 baseline은 전용 adapter로 읽되 명시하지 않은 호스트·업무 크기·구간 단위·보조 감사 원장은 추정하지 않고 미확인 사유에 넣는다. raw baseline과 추가 reachability-v2 근거는 덮어쓰지 않고 지문·근거 수준을 남긴다. 비교용 보조 annotation이 필요하면 별도 입력으로 공급하고 출처를 표시한다.

`pace project compare-team --before <JSON> --after <JSON> --kind role-automation|team-adoption|definition-change [--json]`를 추가한다. role-automation은 message-role→start-role, team-adoption은 no-team→team, definition-change는 before-change→after-change만 대응한다. 목적/조건 혼합은2로 거부한다. 같은 repository/BR01 정의·닫힌 구간 단위·workType/sizeBand/host·품질 출처를 대조하고 미명시/미완료/소표본(각2건 미만)·중요 수치 null·미대조 기록 방식 차이는 미확인으로 낸다. 충분한 합성 대조의 관측 지표 증감만 개선/악화로 부르며 인과 효과·에이전트 순위라고 하지 않는다. 상충/동률도 미확인 사유로 남긴다. 모든 미확인 결과에는 이유와 같은 조건의 추가 표본/출처 대조 계획을 낸다. 실제 적합성·효과의 최종 판정은 T08 PM/현장 감사다.

### 팀 행과 회고 계약

PROJECT의 `- 팀 측정: v1`을 새 경계로 쓴다. 새 역할 적용 start는 marker를 넣고, 명시 보조 파일도 새 계약을 사용한다. 옛 marker/보조 파일 없는 프로젝트는 새 회고 필수 관문을 소급 적용하지 않는다. P009도 이 계약을 채택한다.

PROJECT-CLOSE `## 회고` 표에 `| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 요약 |`을 둔다. 파일은 version1·metricRef·unusedRoles(관측 없음 후보)·recurringFindings(code/count/refs)·definitionChanges(role/changeRef/reasonRef)1~3개 또는 noChangesReasonRef를 가진다. 업무 원문/상세 변경 제안은 넣지 않는다. finish는 같은 프로젝트의 고정 파일·typed 필드/한도·링크/비밀/근거 존재를 검사하고, 실제 의미·정의 수정 승인/실행은 사람이 판단한다. BR07 회고 단계는 이 입력과 METRICS 팀 절·명시 근거를 읽고 후보1~3개를 인터뷰/범위 확인으로 넘기며 자동 수정하지 않는다.

사용자 결정 B에 따라 PM이 검토한 마감 입력만 직접 골라 먼저 커밋한다. 팀 finish는 자동 중간 커밋 없이 양쪽 채택 및 이력과 깨끗한 상태를 첫 기록 전에 확인한다. 검사한 Git 커밋과 실제 읽은 입력을 고정하고, METRICS·상태·마감 영수증 등 하네스가 만든 경로만 최종 커밋 대상으로 삼는다. 미채택 프로젝트의 기존 명령을 유지한다.

문서는 docs/TEAM-METRICS.md와 정의서/WORK-PROCESS/TEAM/HANDOFF, 프로젝트 템플릿·coordinator 및 BR07 입력 안내를 갱신한다. P009 finish 전 남은 오래된 브레인 source 주장은 별도 실제 대조로 정리하며 timestamp만 올리지 않는다.

## 사전 R1의 선택과 고정 반례

- 비교의 주 지표는 사용자 도달 질문/종류별 손작업/계약 밖 지시의 관측 부담이다. 정상 역할 배정·필수 승인은 감소 최적화 대상이 아니다. blocking·재검토·게이트는 검토 피드백/비용이며 적다고 품질이 좋다고 판정하지 않는다. 자동 전체 개선/악화는 같은 품질 검토 범위/출처와 변함없는 가드 관측을 전제로 한 **관측 부담 증감**뿐이다. 품질 지표가 어느 방향으로든 바뀌거나 검토 범위가 미대조면 이유와 함께 미확인이다. S-5에 손작업↓+blocking↓와 손작업↓+품질 범위 변경→미확인을 넣는다. 2표본 문턱은 인과/통계 유의성 기준이 아니며 그 아래를 자동 미확인으로 두는 보수적 장치다.
- v1의 자유문/키 없음에서 conditionCode를 추정하지 않는다. 선택 `--before-context`/`--after-context`는 version1·원본 sourceSha256·명시 comparison/출처를 가진 별도 annotation이다. 원본 지문 불일치나 정의 수정 조건을 도입 조건으로 넣으면2다. annotation이 없으면 단위/조건 미명시로 미확인 보고를 낸다. 원본 숫자는 덮어쓰지 않는다. 선택 reachability 근거도 파일/지문으로 명시 공급하며, 원래 captain_questions(수신 의도/옛 수기 분류)을 자동 실제 도달로 바꾸지 않는다. 두 실제 v1은 source SHA 불변, ai-sql의 손작업 총량 null/관측0, roblox의 로그31/감사48을 고정 기대값으로 검증한다. legacy 영수증 미수집의 실패시도0은 실제0이 아닌 관측근거0/총량 미확인이다.
- total을 숫자로 낼 complete coverage는 declared reporter/확인자·실제 확인 근거 ref와 닫힌 동일 범위를 요구한다. 출처 없는 complete는 total null이다. 숫자가 있어도 라벨은 `신고된 complete·출처 대조 필요`이고 사람이 인증됐다고 하지 않는다. 보조 파일이 없을 때 손작업 관측값도 기본 null(수집 안 됨)이며, 명시 관측0과 구별한다. 역할 입력도 실제 결합 근거가 없으면 null이다. 다른 사람이 대신 적은 라벨은 인증이 아니므로 실제 판정은 T08 감사다.
- unusedRoles는 role/coverage(`observed-none` 또는 `unconfirmed`)/refs를 가진 후보 객체다. 기록 수집이 없으면 unconfirmed이며 미사용·삭제 사유로 자동 승격하지 않는다. recurringFindings의 count는 작성자가 근거로 신고한 수치로 표시하고 실제 로그/원자료와 의미 대조는 BR07 인터뷰에서 한다. 역할/숫자를 추정하는 자동 정의 삭제는 없다.
- 새 역할 start는 PROJECT marker와 함께 기존 start 사건 data에 `teamMetricsVersion:1`을 남긴다. finish는 marker/보조 파일/이 버전 start 중 하나라도 있으면 팀 회고 계약을 요구한다. marker만 지운 새 프로젝트의 우회를 S-6에서 거부한다. 그 기록이 없는 옛 role start는 소급하지 않는다. 모든 지침/원장 표지를 함께 지우는 악의적 이력 조작을 인증 방어로 보장하지 않는다.
- 코디네이터 자체 답은 보조 입력의 명시 requestId+확인 근거와 연결된 질문/미도달을 대조하여 요청별1회만 센다. 단순 전달 answer만 있는 경우 자체 답0(총 자체 답량은 미확인), 실제 사용자 답/도달이 있으면 대신 답으로 세지 않는 반례를 S-1/S-3에 넣는다.
- 비교 구간은 snapshot의 명시 기간과 단위다. 프로젝트 전체(start→merge)는 실제 merge가 없으면 미완료로 미확인이다. representative-task는 명시한 작업 구간/완료 근거를 사용한다. 집계는 이 구간으로 필터하며 T09 정본의 분류 우선순위를 공유한다. 범위 밖 요청/나중 영수증을 넣어 효과를 바꾸는 반례를 시험한다. 회고 metricRef의 고정 METRICS.md는 finish가 생성할 목적지로 검사하고 최초 생성 전 존재를 요구해 교착시키지 않는다. 다른 근거 ref는 실제 안전한 파일이어야 한다.
- S-8은 팀 없는 고정 legacy stats JSON을 바이트/구조 비교하며 이전 사건 수·FIFO를 지킨다. 브레인 오래된 source 대조는 별도 P009 finish 작업으로 남기며 T06 기준을 늘리지 않는다.
