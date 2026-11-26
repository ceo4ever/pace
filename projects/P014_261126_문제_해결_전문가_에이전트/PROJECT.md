# P014 문제 해결 전문가 에이전트

- 상태: 진행
- 규모: L(태스크 6개 — BR0n = T0n, 표는 실행 순서)
- 출처: [BL261125_01_문제_해결_전문가_에이전트](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BACKLOG.md)
- 브랜치: `project/P014` · worktree: `../pace.wt/P014/`
- 작업자: codex
- 작업자 역할: pace-project-lead
- 팀 측정: v1
- 시작: 2026-11-26

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
프로젝트 상태: 정의 → 진행(출처로 착수 결정 뒤) → 병합 대기(finish) → 완료(merge) · 보류.
태스크 상태(태스크 표): 대기 · 진행 · 완료 · 보류.
규모별 생략:
- 작은 일(버그·문구, diff를 한 문장으로 말할 수 있음): 프로젝트를 만들지 않고 바로 커밋한다.
- 태스크 없는 프로젝트: "태스크" 절을 지운다. TASK.md의 "테스트" 표를 "기준" 아래에 옮겨 쓰고, e2e/·evidence/는 이 프로젝트 폴더에 둔다. 마감은 PROJECT-CLOSE.md 하나.
- 태스크 있는 프로젝트: 모든 절을 쓴다. "설계"는 이때만.
범위·기준은 다른 문서를 다시 쓰지 않고 링크한다.
-->

## 목적

검토·테스트가 반복 실패하거나 겉만 고친 수정이 이어질 때, 워크트리 PM·허브 PM이 **초기에** 작성자와 독립된 새 맥락의 문제 해결 전문가 `pace-troubleshooter`(최상위 모델 `xhigh` 등급)를 부른다. 이 전문가는 해결안과 검증 계획을 내고, 결정은 PM·허브가, 수정은 구현자가 한다. 함께 모든 팀 에이전트 호출을 시도 단위로 `log.jsonl`에 기록해 모델·effort 최적화의 근거로 삼는다.
상위 목적은 owner가 자리를 비워도 프로젝트가 자율로 끝까지 가고, 품질을 지키면서 검토·검사 반복(P001 사전 검토 14회, P005 T04 9·11회)에 시간과 토큰을 낭비하지 않는 것이다([백로그 목표](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BACKLOG.md#목표)). 대조: "반복 낭비"는 작성자 자기 진단을 독립 원인 판별과 조기 호출로 바꿔 줄이고, "자율"은 P013 사다리에 호출을 연결하되 owner에게는 실제 선택(A-1·A-3)만 올려 지킨다.

## 재료

- 백로그 [BL261125_01](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BACKLOG.md)과 BR01~BR06 — 범위·완료 기준·결정의 정본이다. 이 문서는 다시 쓰지 않고 링크한다. 실행 순서와 선행은 BACKLOG 관련·순서와 결정·기록 2026-11-26 17:40 행을 따른다.
- 착수 전 검토 경과: 새 기준 전체 검토 fail([cross-5](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/reviews/2026-11-26-cross-5-prestart-1.json)) → 공동 시도 1·2([결정](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/reviews/2026-11-26-joint-1-decision.md)) → [진단](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/reviews/2026-11-26-diagnosis-2.md) → [upper_review 1](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/reviews/2026-11-26-upper-review-1.md) 이관 → Codex 재검증 pass, blocking 0([cross-9](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/reviews/2026-11-26-cross-9-pass.json)). 그 note 2건은 BR03·BR04의 "태스크 설계 때 확정할 항목"에 들어 있다.
- owner 결정 원문과 출처:
  - BACKLOG 결정·기록 2026-11-25 14:55 행: Codex 모델 `gpt-6.2-astra`(owner 지정), 전용 `xhigh` 등급 추가, 해결안·검증 계획 제시까지(결정은 PM, 수정은 구현자). Claude 최상위 `claude-fable-5-2`는 같은 행에 "제우스 추천"으로 적혀 있고, BR06이 두 모델을 고정 요건으로 등록한다.
  - 16:13 행과 [owner 원문](../../backlogs/BL261125_01_문제_해결_전문가_에이전트/evidence/owner-call-log-2026-11-25.md): 기본 effort Claude `high`·Codex `medium`(상향은 실측으로 판단), 에이전트 호출마다 `log.jsonl`에 에이전트·모델·effort·실행 시간·토큰.
  - 2026-11-26 11:20 행: 상위 근본 검토 "a로 해줘". [종료점 원문](../P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/evidence/owner-endpoint.md): "a) 문제를 정리해서 보고 해줘" — 두 번째 `upper_review` 뒤 fail이면 owner A-1 정리 보고.
  - [owner 정정](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/owner-decisions-2026-11-25.md#p013-t02-후속-정정): 해야만 하는 수정은 처리하고 사후 보고한다. 같은 문서의 Q3·Q5·O1=b·C1=a도 근거다.
- 선행(모두 main 병합 — P011·P012·P013):
  - 결정 권한 정본은 `skills/pace-project-dev/references/decision-rights.md`다.
  - 필수 역할 정본은 `skills/pace-team/references/required-roles.md`다. 문제 해결자 요건 표는 비어 있고, 등록은 이 프로젝트의 몫이다. 표지는 `.pace/team/required-roles.json`이고, 기획자 대조표는 [P012 T04 requirements-trace](../P012_261125_pace-team_신규·갱신_모드와_필수_역할/tasks/T04_백로그_기획_에이전트/evidence/requirements-trace.md)다.
  - 검토 예산·복구 코드는 `src/agent/review-budget.ts:9`·`review-recovery.ts`·`review-followup.ts:436-443`·`review-hand.ts:243`, 측정은 `src/project/review-metrics.ts`다.
- 코드 위치(BR 본문이 `file:line`을 정본으로 든다):
  - 등급: `src/core/worker-tiers.ts:7`, 역할 종류 `src/team/model.ts:5`, 자동 배정 `src/team/store.ts:92`, 생성물 `src/team/sync.ts:24-25`, 역할 해석 `src/team/worker-role.ts:74`.
  - 검토 신호: `src/agent/review-log.ts:20` `DIAGNOSE_AFTER`, `src/agent/verify-cli.ts:109`·`:553`, `src/agent/structured-review.ts:50-61`.
  - 사건 기록: `src/project/event-log.ts:8` `LOG_TYPES`.
  - 시작 지시: `src/project/harness.ts:683` `workerSpec`, golden 시험 `test/project-role.test.ts`·`test/fixtures/worker-spec-before-role.txt`.
  - 훅 등록: `src/setup/install.ts`.

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/synthesis/pace-agent-acp-실측.md` — ACP 어댑터 실측 (스파이크): claude-agent-acp 0.81.1 실측 — 읽기 전용·권한 거부, resume, effort, mcpServers, 훅, 이벤트. codex-acp·한도 문구·약관은 미확인
  - `.pace/brain/pages/synthesis/pace-agent-호출-함정-실측.md` — pace agent 호출 함정 (실측): codex exec·codex-acp 읽기 전용 미강제, codex-acp 기본 모델 오류 text, ACP 빈 응답, 설치본이 낡으면 자식에 부트가 실림
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스(정의 작성 때 추가): 예산 단위·일반 산출물의 반복 실패 단계와 실측(P001 14회 등)
  - `.pace/brain/pages/flow/저장소-팀-설계와-갱신-흐름.md` — 저장소 팀 설계와 갱신 흐름(정의 작성 때 추가): 필수 역할 정본의 등록·충족 대조, 동기화 검사와 적재 확인
  - `.pace/brain/pages/synthesis/platform-hook-behavior.md` — 도구별 세션 시작 훅 동작(정의 작성 때 추가): T03 호출 기록 훅 실측의 출발점

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01~BR06의 완료 기준이 각각 T01~T06에서 충족된다. 각 BR의 "태스크 설계 때 확정할 항목"은 그 태스크 설계에서 확정·기록된다 | 각 TASK-CLOSE 기준 대조 |
| P-2 | `xhigh` 등급의 기본 매핑이 Claude `claude-fable-5-2`·effort `high`, Codex `gpt-6.2-astra`·effort `medium`이다. 사용자 override가 우선한다. high·medium·low의 해석과 생성물 바이트, 새 구성원 자동 배정은 바뀌지 않는다. `xhigh`는 명시한 구성원만 쓴다 | T01 시험(`npm run check`), `pace worker show` 출력 |
| P-3 | 옛 판독기(병합 전 커밋의 `readWorkerTiers`·`loadTeam` 또는 옛 설치본)가 새 저장소·새 `PACE_HOME`을 읽어도 기존 등급 해석·`team sync --check`·팀 측정이 깨지지 않는다. 생성물이 번갈아 바뀌지도 않는다. (나)안을 골랐다면 재설치 안내·차단이 동작한다 | T01 옛 판독기 시험 |
| P-4 | `pace-troubleshooter`(역할 종류 reviewer, `xhigh`)의 원본과 생성물이 있다. 조건부 필수 역할 표지가 적용돼 있다. `pace team list`·`pace team sync --check --json`이 차이·오류 없이 통과한다. 정의는 해결안·검증 계획만 반환하고 수정·커밋·결정 대행·pass/fail 판정을 하지 않으며, `pace agent verify`를 대체하지 않는다 | T06 명령 출력, 원본·반환 계약 대조 |
| P-5 | 실제 적용 관문: Claude·Codex 양쪽에서 정한 호출 수단으로 `pace-troubleshooter`를 실제로 부르고, 런타임 model·effort가 요청값(P-2)과 같다는 관측 증거가 있다. 차하위 모델 실행은 충족이 아니다. 정한 모델 거부 처리(대체 또는 보류)가 요청값·실제값을 남기며 동작한다. 미달 시 절차(이 기준의 충족이 아님): done하지 않고 대체 경로를 2개까지 시도하며, 그 뒤에도 미달이면 "미확인"으로 기록하고 A-1을 요청한다(BR06) | T06 관문 증거(호스트 세션 기록 등 런타임 관측) |
| P-6 | 능력 eval: 원문이 남은 과거 반복 실패 사례 2건 이상을 해결 이전 상태에서 새 맥락으로 실행한다. 대조군은 기존 high 등급이다. 통과 문턱과 판정 기준은 실행 전에 고정한다. 작성자가 아닌 쪽이 판정하고 문턱을 넘는다. 사례별 실행 시간·토큰이 남아 effort 상향 여부를 판단할 수 있다 | T06 eval 증거(고정 기준·원응답·판정 근거) |
| P-7 | 호출 기록: 실제 에이전트 시도 1회마다 `log.jsonl` 행 1개가 남는다. 행에는 에이전트·모델·effort·실행 시간·토큰과 요청값·실제값·측정 출처가 있다. 없는 값은 null·미확인이며 0이 아니다. 검토 호출은 원장 판정 `ref`를 갖는다. 실패·중단·대체 시도도 자체 행이다. 백로그 단계 호출은 설계한 위치에 남는다. 호출 집계와 검토 원장 집계는 한 합계에서 이중으로 더해지지 않는다. 미채택 프로젝트에서 호출 기록이 팀 마감·회고를 시작시키지 않는다 | T03 시험과 도구·호스트 경로 실측, 훅 실측 증거 |
| P-8 | 신호 1~4가 도구 출력 또는 기록에 호출 권고(종류·단위·근거 회차)로 나온다. 문턱과 근거는 설계 문서에 있고, 신호 1 일반 산출물 문턱은 과거 원장에서 잰 수렴 비율로 정한다. 음성 대조가 성립한다: 문턱 직전, 기록 밖 시험 실행, 같은 파일의 무관한 지적에서는 신호가 나오지 않는다. 신호 3은 ID나 줄이 바뀐 같은 영역 재발을 잡는다 | T02 시험·설계 문서 |
| P-9 | 호출 주체 분기: 예산 안 조기 신호에서는 워크트리 PM이 부른다. 예산 소진(`budget_exhausted`·종료 16)이면 워크트리 PM은 부르지 않고 허브에 인계하고, 허브가 공동 시도에서 부른다. 같은 기회의 중복 호출은 0이고, 이어지는 기회마다 1회는 막히지 않는다. 조기 호출 반환은 프로젝트 기록에만 남고 `review-note --diagnosis`로 남지 않는다. `workerSpec`에 조기 호출·소진 인계·`upper_review` 인계 지시가 있고, 인계는 `verify`와 `review-record` 두 출력을 모두 가리킨다. 신호 4 반환 항목을 실어도 기존 판정 계산·원장 기록은 같다 | T05 golden·스키마 시험, T04 eval·호출 기록 |
| P-10 | `upper_review`와 종료점: 워크트리 PM은 수정을 멈추고 허브에 인계한다. 허브는 새 맥락 전문가를 상위 목적·owner 원문·계약·설계·백로그 해석 입력으로 부른다. 결정은 세 경로다: 해야만 하는 수정이면 허브 진행·사후 보고, 목표·범위·완료 기준 변경이면 A-1, 필수 검증 생략·완화나 잔여 blocking 수용이면 A-3. 두 번째 `upper_review` 뒤 fail이면 추가 재검증 없이 owner A-1 정리 보고가 나온다. 보고에는 대상·단위, 회차별 추이, 두 근본 검토의 원인·해결안, 남은 실패 재현 근거, 선택지(기준 조정/보류/한 번 더)와 허브 추천·이유가 있다. owner 결정 전에는 진행하지 않는다. 도구 동작은 BL04 BR09 시험을 인용한다 | T04 스킬 문서·eval 판정, BR09 시험 인용 |
| P-11 | 실제 호출 관측: 조기 신호와 `upper_review` 각각을 정상 진입점에서 재현한다. 지정 호출 주체가 새 맥락의 `pace-troubleshooter`를 지정 최상위 모델로 불러 해결안·검증 계획을 받는다. 증거는 호출 주체, 실제 실행 모델(호출 기록 값), BR03 호출 기록, 반환이 연결된 프로젝트 기록·근본 검토 기록이다. 실행 모델이 다르거나 값이 없으면 충족이 아니다 | T04 실행 증거 → PROJECT-CLOSE |
| P-12 | 공동 목표 종결: PROJECT-CLOSE 목표 달성 판정에 최종 대조표가 있다. 대조표는 BR02·BR03·BR04·BR06 소관 요건 ID 대조표, BR06·BR03 반영 뒤 실제 `pace-troubleshooter`를 한 번 불러 BR03 형식 호출 기록이 `log.jsonl`에 남은 결과(시점 해석은 결정 메모 (1) — 허브 확정), P-11 관측, P012 T04 기획자 대조표를 합친다. 두 역할(문제 해결자·백로그 기획자)의 모든 요건 ID가 충족이고 미등록·보류·누락이 0이다. 미달 시 절차(이 기준의 충족이 아님): 기준 미달 마감 여부를 A-1로 요청한다 | PROJECT-CLOSE 대조표·증거 경로 |
| P-13 | 회귀 없음: 기존 stats·팀 측정 출력이 같은 입력에서 같다. BL04 판정 계산과 원장이 그대로다. 기존 golden의 나머지 문장, P011 문구 고정 시험, 스킬 eval S1~S9 새 차수가 통과한다. 선언된 전체 검사가 통과한다 | `npm run check`, T03·T05 비교 시험, T04 eval 재실행 |

## 설계

태스크와 BR은 1:1이다(BR0n = T0n). 각 태스크의 범위·제외·완료 기준은 해당 BR을 정본으로 따른다. 분할 원칙은 문서와 민감 경로 코드를 섞지 않는 것이다(BACKLOG 2026-11-26 17:40 행). 요건 행 등록은 T02(호출 신호)·T03(호출 기록)·T04(호출 절차)·T06(정의~실제 적용 관문)이 한다. T01·T05는 등록하지 않고 판정 근거가 될 시험만 낸다.

**실행 순서**: T01 → T02 → T03 → T06 → T05 → T04. 태스크 표도 이 순서로 둔다. 선행은 다음과 같다.

- T06은 T01 뒤에 한다.
- T05는 T02·T06 뒤에 한다.
- T04는 T02·T03·T05·T06 뒤에 한다.
- BR에 적힌 "BRxx 병합 뒤"는 한 브랜치 안에서 "선행 태스크 done 커밋 뒤"로 읽는다(아래 결정 메모 — 허브 확정).

**태스크별 설계 확정 항목**(BR의 "태스크 설계 때 확정할 항목" 절은 해당 태스크로 넘긴다):

| T | BR의 "태스크 설계 때 확정할 항목"(넘김) | 범위 안 설계 선택 |
|---|---|---|
| T01 | 해당 절 없음 | 옛 설치본 호환 방식(가) 별도 파일·키 분리(기본안) / (나) 재설치 순서 강제 — (나)면 게이트 실행본 명시. BR06 인계(호환 방식·등급 승격 위치·설정 명령) |
| T02 | 해당 절 없음 | 신호 1 일반 산출물 문턱(과거 원장 수렴 비율·결합 조건 비교), 신호 2 기록 위치와 세는 실행, 신호 3 "같은 영역 재발" 비교 기준, 신호 4 대리 지표 |
| T03 | 시도 식별·중복·도착 순서(B2, 훅 실측 뒤). Codex 자동 기록을 관측할 수 없을 때의 수동 경로 증거. 분량 재비교(S4) | 새 사건 종류 또는 확장, 훅 등록 위치, 백로그 단계 기록 위치, `미확인`·`미보고` 관계 |
| T06 | 능력 판정 기준 보강(B3 — 실행 전 고정). 호출 수단 조합 | 호출 수단 실측(설계 첫 단계, 두 후보 모두), 호출 주체별 수단 표, 모델 거부 처리((가) 대체 / (나) 보류) |
| T05 | BL261118_02 인계(S5) | 신호 4 반환 항목 방식(기존 `category` 재사용 / 선택 필드 추가) |
| T04 | BL04 BR09 시험 인용 목록, 실제 호출 증거의 진입점(`verify` / 외부 `review-record`)과 eval로만 확인할 경로, 분량 재비교(S4), BL261118_02 인계(S5) | 백로그 단계 호출 기록 위치(T03 결과 사용), 새 eval 시나리오(약 10개)와 S1~S9 재실행 |

**보안 영향**(`docs/SECURITY.md` 민감 경로 표 + `references/security.md` 체크리스트를 해당 태스크 설계에 적용한다):

- T01: `src/core/worker-tiers.ts`·`src/team/`이 민감 경로다(개인 등급 설정·팀 원본·native 생성물 쓰기). 링크·크기 검사와 관리 표지 규칙을 유지하고, 거부 경로를 시험한다.
- T03: 훅 등록을 바꾸면 `src/setup/`이 민감 경로다(사용자 홈 도구 설정 쓰기). 시험은 실제 홈을 건드리지 않고 임시 `PACE_HOME`을 쓴다. 설치는 main에서만 한다. 기록 값은 비밀 후보·제어문자·음수를 거부하고, 프롬프트·응답 원문은 남기지 않는다.
- T02: 신호 2 기록을 `src/test-runner/`에 두면 그곳도 민감 경로다.
- T05: `src/project/harness.ts`는 `workerSpec`만 바꾼다. start·finish·merge 경로가 바뀌지 않음을 diff와 기존 시험으로 확인한다.
- T06: 실제 외부 모델 호출(Claude·Codex)이 있다. eval 입력과 원응답 증거에 비밀이 없음을 확인하고, 해결 이전 상태는 별도 checkout이나 사본에서 실행해 작업본을 바꾸지 않는다.

**호환**:

- 기존 high·medium·low 생성물 바이트를 바꾸지 않는다.
- 옛 판독기가 새 값을 손상으로 읽지 않게 한다(T01).
- 기존 `log.jsonl`·stats·팀 측정 의미를 보존한다(T03).
- BL04 고정 스키마·판정 계산·원장을 보존한다(T05).
- P011 문구 고정 시험(`test/project-dev-skill.test.ts`)과 기존 golden의 나머지 문장을 깨지 않는다.

**경계**:

- BL261118_02(대기)와 같은 파일을 고친다(`src/project/harness.ts`, `src/cli.ts`·`src/agent/contract.ts`). 착수 시점이 겹치면 직렬화한다(허브 결정 2026-11-26 17:40).
- 다음은 이 프로젝트 밖이다.
  - `upper_review` 판정·차단·종료 코드와 근본 검토 기록 형식은 BL04 BR09(P013 T09)의 몫이다. 인용만 한다.
  - 조건부 역할 미사용 처리는 BL261125_02 BR02의 몫이다.
  - 종료 보고 뒤 "한 번 더"·범위 재개 기록 경로는 Q1=b에 따라 후속 백로그로 발의한다(허브 메모리 `idea`).
  - 다른 구성원의 모델·effort 최적화는 별도 주제다.
  - 반복 감소 효과(호출 전후 반복 횟수 비교)는 이 프로젝트의 마감 기준이 아니다. 병합 뒤 다음 실제 프로젝트에서 비교해 보고한다(BR04 "병합 뒤 후속", 메모리 todo). PROJECT-CLOSE 목표 달성 판정은 이 효과를 미확인·한계로 적는다(`references/goal-review.md` 마감).
  - PACE 코드 변경이 필요한 새 호출 수단은 새 백로그로 낸다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/core/worker-tiers.ts` | T01 — `xhigh` 등급, 도구별 기본 모델·effort 예외, 설정 키·오류 문구 |
| `src/team/` | T01 — `xhigh` 해석·생성물 매핑·옛 판독기 호환(파일은 호환 방식 설계에서 정함) |
| `src/project/role-record.ts`·`src/project/event-log.ts`·`src/project/team-input.ts` | T01 — 정확한 xhigh 원본 경로 검증과 구판 호환 시작 행의 저장·복원 |
| `src/agent/` | T02 — 신호 1~4 호출 권고 출력(위치는 설계). T05가 필요하면 `src/agent/structured-review.ts` 신호 4 반환 항목. T02 신호 2 기록이 `src/test-runner/`·`src/project/`에 가면 그 파일도 바꾼다 |
| `src/project/event-log.ts` | T03 — 호출 기록 사건 종류·필드·수동 기록 허용. 설계에 따라 `src/cli.ts`·`src/agent/contract.ts`·`src/setup/install.ts`(훅 등록)·`src/project/metrics*.ts`(별도 집계)도 바꾼다 |
| `src/project/harness.ts` | T05 — `workerSpec` 호출·인계 지시만 |
| `test/fixtures/worker-spec-before-role.txt` | T05 — no-role golden 갱신 |
| `docs/WORK-PROCESS.md` | T03 — 사건 형식·사건 작성 절. 집계 방식·한계는 필요하면 `docs/TEAM-METRICS.md`. 훅 등록이 바뀌면 `docs/SECURITY.md` |
| `docs/TEAM.md` | T06 — tier 표에 `xhigh`, 두 예외(effort·모델 해석 순서), 호환 방식, 호출 수단 표 |
| `.pace/team/agents-xhigh/pace-troubleshooter.md` | T06 — 새 팀 원본(생성물 `.claude/agents/`·`.codex/agents/`는 `pace team sync`가 만든다) |
| `.pace/team/required-roles.json` | T06 — `pace-troubleshooter` 조건부 필수 역할 표지 |
| `skills/pace-team/references/required-roles.md` | T02·T03·T04·T06 — 문제 해결자 요건 행(신호·기록·절차·정의~관문). 역할 안내 문서는 필요하면 `skills/pace-team/` 안에서 고친다 |
| `skills/pace-project-dev/SKILL.md` | T04 — §6 멈춤 조건의 호출 절차 |
| `skills/pace-project-dev/references/reviewer.md` | T04 — 반복 실패·수정 확인과 상위 검토 절의 호출·인계, 신호 4 반환 안내 |
| `skills/pace-project-dev/references/coordinator.md` | T04 — 허브의 B 절차 원인 판별·공동 시도·백로그 검토·`upper_review` 호출 |
| `skills/pace-project-dev/evals/scenarios.md` | T04 — 새 호출 시나리오와 S1~S9 새 차수 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | xhigh 등급과 호환 코드 | 완료 | |
| T02 | 조기 호출 도구 신호와 문턱 | 대기 | |
| T03 | 에이전트 호출 기록 | 대기 | |
| T06 | 문제 해결 구성원 정의·지침·실제 적용 관문·eval | 대기 | |
| T05 | workerSpec 호출 지시와 golden 시험 | 대기 | |
| T04 | 호출 절차 연결 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-26 20:07 | 정의 작성 |
| 2026-11-26 20:12 | 착수 결정 — 출처: BL261125_01 착수 전 재검토 pass(Codex 재검증 blocking 0, `reviews/2026-11-26-cross-9-pass.json`, BACKLOG 17:57 행)와 owner 착수 지시(2026-11-26, 허브 전달) "BL261125_01 재검토하고 진행해줘.", 작업자 도구 선택 "b"(Codex, 허브 전달). 작업자 codex, 역할 pace-project-lead, 태스크 6개(BR0n = T0n) |
| 2026-11-26 20:12 | 실행 순서 T01 → T02 → T03 → T06 → T05 → T04(BACKLOG 관련·순서, 17:40 행 — 선행: T06←T01, T05←T02·T06, T04←T02·T03·T05·T06). 작업자가 표의 대기 중 맨 앞부터 열기 때문에 태스크 표를 이 순서로 둔다. 번호·이름은 BR과 1:1로 유지한다(선례 P009) |
| 2026-11-26 20:12 | 정의 작성자 해석(허브 확정 2026-11-26 — 세 건 모두 그대로). (1) BR의 "BRxx 병합 뒤" 선행은 한 브랜치에서 "선행 태스크 done 커밋 뒤"로 읽는다. 공동 목표 종결의 실제 `pace-troubleshooter` 호출(P-12)은 main 병합 전 worktree의 PROJECT-CLOSE에서 한다. (2) T03이 훅 등록(`src/setup/`)을 바꿔도 설치는 main에서만 한다. worktree 실측은 임시 `PACE_HOME`과 `./bin/pace.ts`로 하고, 설치본 반영은 병합 뒤 허브가 한다. T01 (나)안의 게이트 실행본 문제와 같은 축이다. (3) S4 분량 재비교로 T03·T04를 나누면, finish가 BR·태스크·진행 현황 1:1을 검사하므로 허브가 main에서 새 BR을 먼저 기획해 worktree에 반영해야 한다 |
| 2026-11-26 20:21 | T01은 별도 xhigh 원본과 전용 생성물 표지를 사용한다 (main 판단). 구판 sync 호환과 두 호스트 start 검증을 함께 만족하도록 BR01 범위에 `src/project/role-record.ts`의 정확 경로 허용 한 건을 추가한다. |
| 2026-11-26 20:26 | T01 시작 기록 호환 (main 판단). R1은 구판의 팀 측정이 새 원본 경로를 직접 쓴 start 행을 거부한다고 지적했다. 재현을 확인해 `role-record.ts`의 정확 경로 검증과 `event-log.ts`·`team-input.ts`의 구판 호환 저장·양쪽 판독 복원만 BR01에 포함한다. |
