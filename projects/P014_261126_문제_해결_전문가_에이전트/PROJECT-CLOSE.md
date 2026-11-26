# P014 문제 해결 전문가 에이전트 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-27

## 목표 달성 판정

달성. 반복 실패의 신호·기회·상위 검토에서 지정 PM이 독립 해결안과 검증 계획을 얻는 실제 경로를 확인했다. 이후의 결정·적용·독립 검토는 정본 절차, 고정 행동 평가와 선행 도구 검사로 대조했다. 조기와 상위 정상 진입점에서 각각 지정 역할과 모델의 실제 호출을 확인했다. 별도 프로젝트 마감 호출은 실제 Codex gpt-6.2-astra/medium이며 같은 P014 원장 행과 반환을 연결했다. 기획자는 합의한 범위와 근거를 허브에 돌려주고, 두 역할 모두 팀 정의와 결정 경계를 대조했다.

정본과 증거에서 문제 해결자 TS 22개, 백로그 기획자 BP 12개를 확인했다. 34개가 모두 충족이며 미등록·보류·누락은 각각 0건이다. 현재 기획자 원본의 LF 정규화 SHA-256 `a43bf47fe13f26bdf2543696292870782985f65e04a0735a9e0b08948de65aeb`는 P012 증거와 같다. [문제 해결자 원본](../../.pace/team/agents-xhigh/pace-troubleshooter.md) [백로그 기획자 원본](../../.pace/team/agents/pace-backlog-planner.md) 기존 P012의 문제 해결자 미등록 중간 상태는 아래 TS 등록·실행 근거로 종결한다. 실제 운영에서의 반복 감소 및 적용 효과는 병합 이후의 비교 대상이다. 기존 회귀 41개와 새 호출 사례 12개를 평가했다. D01의 추가 안내 없는 실행은 두 번 제한 시간을 넘겼고 한 번 행동 판정을 통과하지 못했다. 각 분기의 재검증 기준·담당을 쓰라는 안내로 보강한 뒤 같은 상황과 채점 기준에서 통과했다. D01은 최초 질문만으로 해당 행동을 검출하는 범위가 좁고, P014 이전 D01의 비교 기준선은 확보하지 않았다.

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 문제 해결자 | pace-troubleshooter | TS-01 v1 | 충족 | [BR02 신호 1과 예산](tasks/T02_조기_호출_도구_신호와_문턱/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-02 v1 | 충족 | [BR02 시험 파일 문턱](tasks/T02_조기_호출_도구_신호와_문턱/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-03 v1 | 충족 | [BR02 같은 영역 재발](tasks/T02_조기_호출_도구_신호와_문턱/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-04 v1 | 충족 | [BR02 겉만 고침](tasks/T02_조기_호출_도구_신호와_문턱/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-05 v1 | 충족 | [BR02 권고와 음성 대조](tasks/T02_조기_호출_도구_신호와_문턱/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-06 v1 | 충족 | [T03](tasks/T03_에이전트_호출_기록/TASK-CLOSE.md) [BR07 호출 기록·참조](tasks/T07_호스트_호출_기록과_외부_검토_연동/evidence/requirements.md) [P014 실제 전문가 영수증](evidence/p12-expert-receipt.json) [실제 반환](evidence/p12-expert-response.md) [호출 원장](calls/log.jsonl) |
| 문제 해결자 | pace-troubleshooter | TS-07 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-08 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-09 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-10 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-11 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-12 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-13 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-14 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-15 v1 | 충족 | [BR06 정의·모델·관문](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-16 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-17 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-18 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-19 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-20 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-21 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 문제 해결자 | pace-troubleshooter | TS-22 v1 | 충족 | [BR04 절차·실행](tasks/T04_호출_절차_연결/evidence/requirements.md) |
| 백로그 기획자 | pace-backlog-planner | BP-01 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-02 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-03 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-04 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-05 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-06 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-07 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-08 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-09 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-10 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |
| 백로그 기획자 | pace-backlog-planner | BP-11 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) · 기본 등급 권고 대조 |
| 백로그 기획자 | pace-backlog-planner | BP-12 v1 | 충족 | [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md) |

[P014 실제 전문가 영수증](evidence/p12-expert-receipt.json) [실제 반환](evidence/p12-expert-response.md) [호출 원장](calls/log.jsonl)

## 기준 대조

| # | 결과 | 근거 |
|---|---|---|
| P-1 | 통과 | [T01](tasks/T01_xhigh_등급과_호환_코드/TASK-CLOSE.md) [T02](tasks/T02_조기_호출_도구_신호와_문턱/TASK-CLOSE.md) [T03](tasks/T03_에이전트_호출_기록/TASK-CLOSE.md) [T04](tasks/T04_호출_절차_연결/TASK-CLOSE.md) [T05](tasks/T05_workerSpec_호출_지시와_golden_시험/TASK-CLOSE.md) [T06](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/TASK-CLOSE.md) [T07](tasks/T07_호스트_호출_기록과_외부_검토_연동/TASK-CLOSE.md)의 BR별 설계·기준 대조. |
| P-2 | 통과 | [T01](tasks/T01_xhigh_등급과_호환_코드/TASK-CLOSE.md) [T06](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/TASK-CLOSE.md)의 기존 등급과 xhigh 및 지정 모델·effort. |
| P-3 | 통과 | [T01](tasks/T01_xhigh_등급과_호환_코드/TASK-CLOSE.md)의 구판 판독·동기화·교번과 실행 경고 또는 차단. |
| P-4 | 통과 | [T06](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/TASK-CLOSE.md) [정본 역할 표지와 생성을 대조](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/requirements.md)의 보조 역할 경계. |
| P-5 | 통과 | [두 호스트 실제값](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/evidence/runtime-gate.json)과 모델 거부·시간 초과 대조. |
| P-6 | 통과 | [T06](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/TASK-CLOSE.md)의 고정 과거 사례 두 건, high 비교군, 작성자와 다른 판정, 사례별 시간·토큰. |
| P-7 | 통과 | [T03](tasks/T03_에이전트_호출_기록/TASK-CLOSE.md) [T07](tasks/T07_호스트_호출_기록과_외부_검토_연동/TASK-CLOSE.md) [P014 실제 전문가 영수증](evidence/p12-expert-receipt.json) [실제 반환](evidence/p12-expert-response.md) [호출 원장](calls/log.jsonl)의 시도별 고정 형식·외부 참조·집계 호환. |
| P-8 | 통과 | [T02](tasks/T02_조기_호출_도구_신호와_문턱/TASK-CLOSE.md)의 수렴 근거, 신호 1~4, 양성·음성 시험. |
| P-9 | 통과 | [T05](tasks/T05_workerSpec_호출_지시와_golden_시험/TASK-CLOSE.md) [T04](tasks/T04_호출_절차_연결/TASK-CLOSE.md) [세 기회 기록](tasks/T04_호출_절차_연결/evidence/joint-route-w05.json)의 호출 주체·소진·중복/예산 및 조기 기록 분리. |
| P-10 | 통과 | [T04](tasks/T04_호출_절차_연결/TASK-CLOSE.md) [외부 판정 발동](tasks/T04_호출_절차_연결/evidence/external-upper-replay.md) [P013 T09 기존 관문](../P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/TASK-CLOSE.md)의 우선 중단, A-1/A-3과 두 번째 실패 보고. |
| P-11 | 통과 | [조기 정상 진입점](tasks/T04_호출_절차_연결/evidence/actual-early.json) [상위 정상 진입점](tasks/T04_호출_절차_연결/evidence/actual-upper.json) [근본 검토 원본](tasks/T04_호출_절차_연결/evidence/root-evidence-original.json)의 지정 호출·원장 ID·응답. |
| P-12 | 통과 | [P014 실제 전문가 영수증](evidence/p12-expert-receipt.json) [실제 반환](evidence/p12-expert-response.md) [호출 원장](calls/log.jsonl) [P012 T04 기획자 요건 대조](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md)와 위 TS·BP 공동 대조. |
| P-13 | 통과 | [T03](tasks/T03_에이전트_호출_기록/TASK-CLOSE.md) [T05](tasks/T05_workerSpec_호출_지시와_golden_시험/TASK-CLOSE.md) [선언 전체 검사](tasks/T04_호출_절차_연결/evidence/full-check.txt) [행동 회귀](tasks/T04_호출_절차_연결/evidence/eval-summary.md)의 기존 판정·집계·golden·스킬 회귀. 설치 후속이 포함된 최종 후보의 전체 선언 검사는 finish의 필수 재검사에서 판정하며, 그 후보와 검사 상태는 팀 마감 영수증으로 확인한다. [설치 후속 검사](evidence/security-rollback-check.txt) [팀 마감 영수증](TEAM-FINISH.json) |

## 독립 목표 대조

Claude의 1단계는 결과와 원장만으로 두 실제 호출의 반환을 확인하고 도구·정책 계약은 미확인으로 구분했다. 첫 2단계는 제한 시간 안에 반환하지 못했다. 같은 제공자의 새 맥락에 작업 문서와 근거를 다시 넘겼고, 2단계는 계약에서 정한 증명 범위에 목표가 맞고 달성됐다고 판단했다. 1단계에서 유보했던 역할별 적용표와 P014 호출 본문 지문을 확인했다. 마지막 제품 전체 검사는 finish에 연결했고, D01의 추가 안내 및 운영 검증의 한계를 위에 적었다. [1단계](evidence/goal-stage1.md) [첫 2단계 제한 시간](evidence/goal-stage2-first-attempt.json) [2단계](evidence/goal-stage2.md)

## 태스크 결과

| 태스크 | 결과 |
|---|---|
| [T01](tasks/T01_xhigh_등급과_호환_코드/TASK-CLOSE.md) | 전용 xhigh와 구판 판독·동기화 및 모델 설정 호환 |
| [T02](tasks/T02_조기_호출_도구_신호와_문턱/TASK-CLOSE.md) | 노출 근거가 있는 신호 1~4와 한계·음성 대조 |
| [T03](tasks/T03_에이전트_호출_기록/TASK-CLOSE.md) | 시도별 호출 원장·수동 입력·독립 집계와 기존 지표 보존 |
| [T04](tasks/T04_호출_절차_연결/TASK-CLOSE.md) | 조기·소진·상위·결정 절차, 두 실제 발동과 호출, 행동 회귀 |
| [T05](tasks/T05_workerSpec_호출_지시와_golden_시험/TASK-CLOSE.md) | 시작 지시의 세 분기, golden 및 선택 재발 표지 호환 |
| [T06](tasks/T06_문제_해결_구성원_정의·지침·실제_적용_관문·eval/TASK-CLOSE.md) | 전문 역할, 양쪽 실제 모델·effort, 거부·보류와 능력 비교 |
| [T07](tasks/T07_호스트_호출_기록과_외부_검토_연동/TASK-CLOSE.md) | Claude 훅·Codex 수동 대체와 외부 검토 원장 연결 |

## 보안

소스·기록의 최종 비밀 검사와 독립 판단을 사용했다. 초기 판단의 구버전 호출 훅 실패 종료와 로컬 사용자 경로 노출을 보완했다. 별도 패치의 호스트 오류 격리와 정확한 관리 문자열 교체·제거를 임시 홈에서 검증했다. 타입 검사와 설치·호출 집중 42개가 통과했고 후속 독립 검토는 blocking 0, should_fix 0을 확인했다. 호스트별 실측·비밀 검사 제외 범위 및 남은 설치 한계는 연결한 근거에 있다. [초기 독립 검토](evidence/security-initial.md) [후속 독립 검토](evidence/security-delta.md) [처리와 검사](evidence/security-disposition.md) [보안 검사](evidence/security-scan.txt)

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `src/core/worker-tiers.ts` | 반영 | T01의 xhigh와 옛 설정 호환. |
| `src/team/` | 반영 | 등급 해석과 두 native 생성 경로. |
| `src/project/role-record.ts · event-log.ts · team-input.ts` | 반영 | 옛 독해의 기록 필드 호환과 새 역할 경로. |
| `src/agent/` | 반영 | 호출·업무 검토 신호, 선택 재발 표지, 외부 기록 경계. |
| `src/project/event-log.ts · agent-calls.ts · metrics` | 반영 | 별도 호출 원장과 중복 없는 지표. |
| `src/setup/ · src/agent/review-hand.ts` | 반영 | 호스트 훅과 외부 기록 링크. |
| `src/project/harness.ts` | 반영 | 정확한 관리 기록 경로와 시작 지시. |
| `test/fixtures/worker-spec-before-role.txt` | 반영 | 기존 golden과 추가 지시 대조. |
| `docs/WORK-PROCESS.md · docs/TEAM-METRICS.md · docs/SECURITY.md` | 반영 | 원장 형식·집계 한계·민감 경로. |
| `docs/TEAM.md` | 반영 | 등급, 호스트 수단 선택과 실제 적용 관문. |
| `.pace/team/agents-xhigh/pace-troubleshooter.md · .claude/agents/ · .codex/agents/` | 반영 | 원본과 양쪽 native 생성물. |
| `.pace/team/required-roles.json` | 반영 | 조건부 필수 역할 표지와 비참여 측정. |
| `skills/pace-team/references/required-roles.md` | 반영 | TS-01~22 등록 및 기존 BP 유지. |
| `skills/pace-project-dev/SKILL.md` | 반영 | 멈춤 경계와 호출 정본 연결. |
| `skills/pace-project-dev/references/reviewer.md` | 반영 | 호출·증거·선택 재발 표지. |
| `skills/pace-project-dev/references/coordinator.md` | 반영 | B·공동·백로그·상위 근본 검토. |
| `skills/pace-project-dev/evals/scenarios.md` | 반영 | W01~W12 추가와 이전 회귀 확인. |
| 브레인(.pace/brain/) | 반영 | 조기 자문이 구조 진단을 만들 때의 영향과 지정 모델·호출 ID의 재사용 근거를 반영했다. [검토 반복 실패 하네스](../../.pace/brain/pages/concept/검토-반복-실패-하네스.md) |

## 남은 일

- 병합은 main에서 사람이 후보 SHA를 대조한 뒤 승인한다. 설치본 반영과 배포는 인계 범위다.
- 실제 호출 전후의 동일 실패 부류와 횟수를 다음 운영 프로젝트에서 대조한다. 정본의 호출 모델·기회와 지표의 계측 차이를 함께 기록한다. 선택형 재개 정책과 별도 도구 개선은 기존 후속으로 남긴다.

## 회고

조기/공동/상위 간 각 기회의 동일 시도 ID, 실제 설정과 요청값, 행동 계획과 실제 발동을 구분해 검증했다. 두 실제 호출은 한 격리 저장소의 별도 세션이었고, 후보 응답에서 인접 경로를 읽은 범위를 보존했다. 제품의 원장·검토 회귀와 운영 효과는 도구와 실제 사용자 관측 범위에 따라 별도로 본다.

| 구분 | 입력 | 요약 |
|---|---|---|
| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 문제 해결자 정의와 조건부 참여, 보고된 반복 후보를 기록했다. 관측이 부족한 기존 역할의 합침이나 제외를 결정하지 않았다. |

## 지표

[지표 집계](METRICS.md)

직전 P013 대비 태스크 9→7개, 작업 시간 453.7→248.2분, 작업자 출력 토큰 1,372,996→774,384개, 기록된 blocking 30→1건이다. 이 수치는 P014 마감 전 조회이며 규모와 도구 및 원장 수집의 차이가 있다. 작업 경로의 토큰으로 사람별·역할별 총량을 확정하지 않는다. 호출 원장에 관측된 역할명이나 호스트 값은 실제 호출의 증거이며, 팀 회고의 역할 측정은 같은 기간의 참여 증거를 별도로 요구한다.

## 배포

해당 없음.
