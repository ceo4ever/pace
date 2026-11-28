# T01 TASK 묶음 지정과 사전 판정

- 프로젝트: [P017](../../PROJECT.md) · 백로그: [BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

TASK에 구현 후 reviewer 필요·생략을 사실 질문으로 미리 적고, 사전 reviewer가 그 판단과 기준 범위(변경 영향 경로 한정, fin-link P047)를 판정하게 한다. 계약 정본은 [BR01](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BR01_TASK_묶음_지정과_사전_판정.md) 범위·완료 기준이며 여기서 다시 쓰지 않는다(P-1).

## 재료

- 형식 검사: `src/project/pre-review.ts:64-75`(`proofScopeIssues`), 게이트 `:206-208`(`reviewIssues` — check·done이 `harness.ts:1389`·`:1399`에서 부름).
- 예약 지점: `src/agent/verify-cli.ts:333`(`reserveReviewCall`) — 기존 구조 검사 `:336-340`은 예약 **뒤**다. `src/agent/review-hand.ts:180-183` 구조 검사는 예약 `:206` 앞이다.
- 옛 기록 재판정: `src/agent/review-budget.ts:88-100`(`legacyStructureOnly` → `proofScopeIssues`), `verify-cli.ts:132`(재검토 기준점)도 같은 함수를 쓴다.
- 사전 질문: `src/agent/structured-review.ts:16-23`, 범주 밖 → note `:154-158`. v2 증명 범위 규칙 `src/agent/verify.ts:91-98`(확대 요구 should_fix `:93`).
- 템플릿 `templates/project/TASK.md`·`TASK-CLOSE.md`, 고정 시험 `test/project-templates.test.ts`.
- 리뷰 절 게이트는 주석을 지운 뒤 비었는지만 본다(`harness.ts:1406-1411`) — 템플릿 리뷰 절에 보이는 표를 두면 빈 절이 통과하므로 회차 칸은 주석 안 서식으로 둔다(Q2, harness 불변).

## 증명 범위

- 판정 주체: 자동 테스트(`node --test`) + 행동 평가는 tester가 실제 `pace agent verify`(Codex) 원문으로 판정
- 구현 후 reviewer: 필요 — 흐름(C) check·done 게이트와 사전 verify·review-hand의 허가 분기가 바뀐다
- 포함(변경 영향 경로): 새 줄의 형식 검사(게이트·사전 verify·review-hand 예약 전 거부), 사전 질문 범주 두 개와 v2 지시 문구, 두 템플릿 주석·줄, `legacyStructureOnly` 결과 불변
- 범위 밖: 사후 질문·판정(T02), 배정 절차·스킬·docs·팀 문서(T03), `harness.ts`·`call-hook.ts` 수정 — 기존 동작은 기존 회귀 시험(`npm run check`). 행동 평가는 한 제공자·고정 입력 표본이라 일반화 한계를 TASK-CLOSE에 적는다

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 새 TASK 템플릿의 `## 증명 범위`에 `- 구현 후 reviewer:` 줄 하나와 경계(A)·상태(B)·흐름(C) 사실 질문 주석, 포함=변경 영향 경로·범위 밖=기존 동작 안내가 있고 절 제목 목록은 그대로다. TASK-CLOSE 리뷰 주석에 tester·reviewer 판정 또는 `reviewer 생략 — 이유`와 회차별 요청·회수 시각 서식이 있다 |
| T-2 | v2 TASK의 줄 없음·중복·`필요`·`생략` 외 값·빈 이유마다 형식 문제를 내고 올바른 `필요 — 이유`·`생략 — 이유`와 legacy TASK는 문제 없다. check·done(`reviewIssues`)이 같은 문제를 보고한다 |
| T-3 | 사전 `pace agent verify`와 `review-hand`가 형식 문제 TASK를 실행기 호출·`call` 행·고정본 없이 거부하고, 올바른 줄이면 예약·실행으로 넘어간다 |
| T-4 | `legacyStructureOnly`의 판정이 바뀌지 않는다 — 줄 없는 v2 옛 fail 기록은 구조 전용이 아니고, 증명 범위 누락 기록은 여전히 구조 전용이다 |
| T-5 | 사전 질문에 필요·생략 판단과 기준 넓힘 하위 확인이 있어 그 지적이 질문 밖 note로 낮아지지 않는다. 인수 사례 (가) `생략`+영속 쓰기 지적 → fail, (나) `필요`로 고친 판 지적 없음 → pass, (다) 넓힌 기준 지적 → blocking 유지·fail, (라) 좁힌 판의 기존 경로 반례 should_fix → pass |
| T-6 | 행동 평가: (가)·(나)·(다) 고정 입력을 실제 `pace agent verify`(Codex)에 돌려 (가)·(다)는 해당 범주 유효 blocking으로 fail, (나)는 그 지적 없음으로 갈리는지 tester가 판정한다 |
| T-7 | 프로젝트 기록(`projects/P017_*`·`.pace/memory/**`)과 하네스 관리 파일(`backlogs/dashboard/data.js`, done이 고치는 백로그 `BACKLOG.md`·BR 현황 — `harness.ts:1270-1280` 관리 집합)을 뺀 바꾼 경로가 `templates/project/**`·`src/project/pre-review.ts`·`src/agent/**`(`call-hook.ts` 제외)·`test/**`뿐이다 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 두 템플릿 | TASK: 증명 범위 안 줄 1개·질문 11개 키워드·포함/범위 밖 안내, `## ` 제목 목록 대조, 생성 TASK에 줄 1개. TASK-CLOSE: 리뷰 절 **주석 안**에 tester 판정·reviewer 판정·`reviewer 생략 —`, 그리고 tester 행과 reviewer 행 **각각**에 회차·요청 시각·회수 시각 칸, 요청 시각=PM 검증 요청·회수 시각=판정 결과 수신 안내 | 모두 있음(역할별 칸을 따로 단언), 제목 불변, 리뷰 절에서 주석을 지우면 빈 절(게이트 불변) | `test/project-templates.test.ts` |
| S-2 | unit | T-2 | 모의 TASK 8종 | `reviewerLineIssues`·`reviewIssues` | 줄 없음·중복·모르는 값·빈 이유·절 밖 줄은 문제, 필요·생략·legacy는 없음. 증명 범위 절 자체가 없으면 기존 구조 문제만 | `test/pre-review.test.ts` |
| S-3 | unit | T-2 | 워크트리 소스 CLI, v2 태스크 줄 없음 | `project check`와 `project done` | 둘 다 같은 형식 문제로 실패, 줄을 넣으면 그 문제 없음 | `test/project-harness.test.ts` |
| S-4 | unit | T-3 | 형식 문제 4종 / 올바른 줄 | 사전 verify, review-hand | 문제: 거부, 실행기 0회·call 행 0·고정본 없음. 올바른 줄: verify는 실행기 대역이 **진입하는 시점에** 이번 호출의 call 행이 이미 원장에 있음+실행기 1회, review-hand는 call 행+고정본+`hand` 응답 | `test/agent-verify.test.ts`·`test/agent-review-hand.test.ts` |
| S-5 | unit | T-4 | 옛 fail 기록 2개(줄 없음 / 증명 범위 없음) | 예산 읽기 | 앞은 판정 회차로, 뒤는 호출로만 센다(rounds·calls 고정값) | `test/agent-review-log.test.ts` |
| S-6 | unit | T-5 | 모의 검토 원문 | `assessStructuredReview('pre')`, 사전 프롬프트 | (가)·(다) 해당 범주 유효 blocking·fail, (나) 그 범주 지적 없음·pass, (라) 그 지적 유효 should_fix·pass. 범주가 질문 안(note 아님), 지시대로 쓴 impact·위치가 강등되지 않음. 프롬프트에 사실 질문 11개·필요/생략 규칙·작성자 넓힘 blocking/검토자 확대 should_fix 구분 | `test/agent-structured-review.test.ts` |
| S-7 | e2e | T-6 | 고정 TASK 3개, 사례마다 새 임시 저장소·`PACE_HOME` | `./bin/pace.ts agent verify`(Codex) | 구현 후 tester가 원자료를 BR01 인수 사례 (가)(나)(다)와 대조해 판정한다. 원자료·판정은 evidence에 남긴다 | tester, `evidence/behavior-*` |
| S-8 | check | T-7 | 구현 커밋 후보(커밋 + 인덱스) | `main...HEAD`·`--cached` 변경 경로와 diff | 구현 후 tester가 원자료를 BR01 바꾼 경로 기준과 대조해 판정한다. 원자료·판정은 evidence에 남긴다 | tester, TASK-CLOSE |

## 접근

`pre-review.ts`에 `reviewerLineIssues(task)`를 `proofScopeIssues`와 **별도로** 두고(D4 — 옛 기록 재판정 의미 불변), 증명 범위 구조가 이미 깨졌으면 `[]`를 내 기존 구조 누락 경로(예약 뒤 호출만 남김)를 그대로 둔다. `reviewIssues`·사전 verify(예약 전으로 이동한 별도 검사)·review-hand가 부른다. 문법: `^- 구현 후 reviewer:[ \t]*(필요|생략)[ \t]*[—-][ \t]*\S`, 주석·fence 밖 `## 증명 범위` 안에서 정확히 한 줄. `structured-review.ts` pre에 `reviewer`·`breadth` 하위 확인을 더하고 `verify.ts` v2 규칙에 사실 질문 11개, `생략`+"예" blocking(해당 없는 위험 예측 요구는 아님), 작성자 넓힘 blocking(위치는 넓힌 `T-n`)·검토자 확대 요구 should_fix 구분과, 강등되지 않을 필드(필요·생략: `impact: goal`·위치 `TASK.md:줄`·시나리오에 "예"인 사실 질문, 넓힘: `impact: criterion`·넓힌 `T-n`)를 넣는다. 영향받는 v2 시험 고정본에 줄을 더한다.
