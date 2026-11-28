# T02 사후 reviewer 묶음 점검 판정

- 프로젝트: [P017](../../PROJECT.md) · 백로그: [BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2


## 목적

사후 reviewer의 필수 판정 항목을 TASK 기준 `T-n`에서 경계(A)·상태(B)·흐름(C) 세 묶음 12항목으로 바꾼다. 실행 증거 부재로 생기는 unknown과 그로 인한 호출 소진을 없애고, 묶음 안 결함(교착·소급 변경·감사 누락·빈 시험)이 질문 안 지적으로 판정에 닿게 한다. 계약 정본은 [BR02](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BR02_사후_reviewer_묶음_점검_판정.md) 범위·완료 기준이며 여기서 다시 쓰지 않는다(P-1).

## 재료

- 질문·판정: `src/agent/structured-review.ts`(`questions.post`, `assessFinding`·`assessCriteria`·`assessStructuredReview`), 필수 항목 `src/agent/review-criteria.ts`(`reviewCriteria` — post는 루트 TASK.md의 기준 표를 읽는다).
- 프롬프트: `src/agent/verify.ts` `buildVerifyPrompt`. main 기준 1단계 지시 `verify.ts:70`·`:76`·`:81`, 범위를 좁히는 문장 `verify.ts:61`·`:62`·`structured-review.ts:111`·`verify-cli.ts:368`(진단 없는 수정 확인의 "지정한 지적과 적용한 수정의 영향만 판정한다. 수정 영향 밖의 다른 기존 지적은 note로 남긴다.").
- 예약·거부: `src/agent/verify-cli.ts`(`reserveReviewCall` 앞의 사전 거부 자리, 같은 해시 fail 재요청 거부는 지금 예약 뒤 `loadRereview`), `src/agent/review-hand.ts`(예약 전에 `loadRereview`).
- 옛 기록을 다시 판정하는 호출자: `review-followup.ts`·`verify-cli.ts`·`review-hand.ts`·`review-pre.ts`·`src/project/review-metrics.ts`·`src/project/pre-review.ts`·`src/agent/review-signals.ts`(조기 신호는 `findings`의 `location`·`effective`를 읽는다).
- 재생 입력 7개: 2026-11-28 BR02 규칙(바이너리 diff 절만 뺌)으로 다시 계산해 패치·TASK sha256 앞 16자리가 BR02 표와 모두 같음을 확인했다(경계(A) 합성 `88340aa38c20c93c` 포함). 모든 패치의 첫 줄이 `diff --git `이다.

## 증명 범위

- 판정 주체: 자동 테스트(`node --test`) + 재생은 실제 `pace agent verify`(Codex) 원문의 관측값 기록
- 구현 후 reviewer: 필요 — 흐름(C) 예약 전 거부 분기가 바뀐다
- 포함: 사후 단계(태스크 `evidence/…` 등 루트 TASK.md가 아닌 대상)의 필수 항목·답 형식·판정 계산, 사후 프롬프트(입력 TASK+diff, 1단계·범위 축소 문장 제거), 사후 대상 diff 판정과 예약 전 거부 두 가지, 조기 신호 입력 유지, 문구 고정 시험 갱신
- 범위 밖: 백로그·사전·scope 없는 일반 검토의 프롬프트와 판정, `review-admission.ts`, 예산 값·공동 시도·escalation, 이미 커밋된 사후 기록의 판정·통계 — 기존 동작 — 기존 회귀 시험(`npm run check`)과 아래 T-6의 고정 비교. 배정 절차·스킬·docs(T03). "tester 통과 diff에만 reviewer"는 절차라 도구가 확인하지 않는다(T03). diff 판정은 형식만 본다 — 헝크 없는 diff(이름 바꾸기·모드만)와 내용의 진위는 판정하지 않는다. 재생은 한 제공자·표본 7개라 일반화 한계를 TASK-CLOSE에 적는다

<!--
경계(A): 새 진입점 없음, 인가 판정 없음, 비밀 없음, 외부 전송·셸·삭제 없음(재생은 기존 `pace agent verify`).
상태(B): 아니오. 원장 행 형식·판독은 그대로다.
흐름(C): 예. 예약 전 거부 분기가 바뀐다.
-->

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 사후 프롬프트의 하위 확인이 묶음 경계·상태·흐름이고 필수 항목이 12개 점검 항목 ID(`RA-1~4`·`RB-1~4`·`RC-1~4`, 결정 권한·`B-n`·`C-n`과 겹치지 않음)다. `T-n`이 없고, TASK 줄 값이 `생략`이어도 같다 |
| T-2 | 12항목이 모두 `defect`(그 항목 ID를 `criterion`으로 단 지적이 있음)·`none`(따라가 본 경로)·`not_applicable`(이유) 중 하나로 답하고 유효 blocking이 없으면 pass다. 항목 누락·경로 없는 `none`·이유 없는 `not_applicable`·지적 없는 `defect`는 unknown이다. 실행 증거 요구로는 unknown이 되지 않는다 |
| T-3 | 인수 사례: P045/T06 R1의 교착(F2)을 흐름 항목, 소급 변경(F1)을 상태 항목의 blocking으로 낸 원문은 fail이다. 원래대로(note, `implementation`·`design`) 낸 원문과 기준 재판정·계획 타당성 지적은 질문 밖 note다 |
| T-4 | 사후 프롬프트에 루트 TASK.md와 diff가 있고, main의 1단계 지시 3문장(`verify.ts:70`·`:76`·`:81`)과 범위 축소 4문장(`verify.ts:61`·`:62`·`structured-review.ts:111`·`verify-cli.ts:368`의 note 문장)이 첫 검토·재검토·수정 확인과 `verify`·`review-hand` 모두에서 없다 |
| T-5 | 첫 비공백 줄이 `diff --git `이고 헝크 머리(`@@ -n[,n] +n[,n] @@`)가 하나 이상인 대상만 사후 검토한다. 비-diff 대상(tester 경로 안내와 함께)과 사후 같은 대상·같은 해시 fail 재요청은 `verify`·`review-hand` 모두 예약 전에 거부한다(실행기·call 행·고정본·예산 불변). owner 회차의 같은 해시 재요청 허용은 그대로다 |
| T-6 | 단계 경계: 백로그·사전·scope 없는 검토의 프롬프트가 변경 전과 같고 `review-admission.ts`가 바뀌지 않는다. 옛 사후 기록(T-n 필수 기준·기존 범주)의 다시 판정한 결과와 `legacyStructureOnly`·`pace project stats` 결과가 변경 전과 같다 |
| T-7 | 묶음 지적에서도 조기 호출 신호가 현행 계산대로 나온다 — 기존 회귀 시험(`test/review-signals.test.ts`)과 tester 원자료 대조 |
| T-8 | 설치 전 재생 보고: BR02의 6입력 × 2회를 새 사후 프롬프트로 실제 재생한 관측값(묶음별 검출·unknown·음성 대조 blocking·도구 판정)을 evidence에 기록한다. 통과선은 없고 설치는 owner가 보고로 정한다(owner A-1 2026-11-28) |
| T-9 | 문구 고정 시험(`test/agent-structured-review.test.ts`의 질문·1단계 단언)을 의도적으로 갱신하고 TASK-CLOSE에 적는다. 바꾼 경로가 `src/agent/**`(`call-hook.ts` 제외)·`test/**`(필요하면 `src/project/review-metrics.ts`)뿐이다(프로젝트 기록·`.pace/memory/**`·하네스 관리 파일 제외) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | post 범위, TASK 줄 `필요`/`생략` 두 판 | `reviewCriteria`·`buildVerifyPrompt` | 필수 ID가 정확히 12개 고정 순서, `T-` 없음, 두 판 프롬프트의 묶음 부분 동일. ID가 `A-`·`B-`·`C-`로 시작하지 않음 | `test/agent-structured-review.test.ts` |
| S-2 | unit | T-2 | 12항목 모의 원문: `none`·유효 `not_applicable`·비차단 지적 단 `defect`를 섞은 정상 / 항목 하나씩 누락·빈 경로 `none`·빈 이유 `not_applicable`·지적 없는 `defect` / 실행 증거 없음을 적은 정상 `none` | `assessStructuredReview('post')` | 정상 pass, 각 결손 unknown, 실행 증거 문장만으로는 pass. 음성 대조: 결손 판정을 빼면 시험 실패 | 같은 파일 |
| S-3 | unit | T-3 | T06 R1 시나리오 원문을 지적 하나씩 따로: 교착(F2)만 흐름 blocking / 소급 변경(F1)만 상태 blocking / 각각 원래 note·`implementation`·`design` / 기준 재판정·계획 타당성을 `other` | 같은 함수 | 앞 둘은 각각 fail이고 그 지적의 effective가 blocking(강등 사유 없음), 나머지는 각 지적 effective note·`outside_question`·pass. 음성 대조: 묶음 범주를 질문 밖으로 두면 앞 둘이 각각 실패 | 같은 파일 |
| S-4 | unit | T-4 | `verify`(실행기 대역 프롬프트): 첫 검토·재검토·진단 없는/있는 수정 확인 / `review-hand`(고정본 prompt): 첫 검토·재검토 | 프롬프트 조립 | 루트 TASK.md·diff 원문 포함, main 문장 7개 각각 부재, 모든 모드에 12항목 전체 지시. 모드별 지시 원문은 tester가 BR02와 대조한다 | `test/agent-structured-review.test.ts`·`test/agent-review-hand.test.ts` |
| S-5 | unit | T-5 | 비-diff 대상(문서), 헝크 없는 diff 머리, 정상 패치 / H fail 뒤 같은 H 재요청 / owner 회차 같은 H(`verify`만) | `verify`·`review-hand` | 앞 둘·같은 H는 거부, 실행기 0·call 행 0·고정본 없음·budget 불변. 비-diff 거부 메시지가 tester 경로(`pace agent run`으로 tester 배정)를 안내한다. 정상 패치·owner 회차는 진행 | `test/agent-review-log.test.ts`·`test/agent-review-hand.test.ts` |
| S-6 | unit | T-6 | 백로그·사전·scope 없는 프롬프트 고정 비교, 이 프로젝트 앞 태스크의 옛 사후 기록 원문(R1~R5) | `buildVerifyPrompt`, `assessStructuredReview`, `readReviewBudget`, `stats` | 프롬프트 바이트 동일(변경 전 기대값), 옛 기록 verdict·budget·stats 불변, `review-admission.ts` 해시 불변. `legacyStructureOnly`는 줄 없는 v2 옛 fail과 증명 범위 없는 옛 fail의 [rounds, calls]를 변경 전 값과 직접 비교 | `test/agent-structured-review.test.ts`·`test/project-review-metrics.test.ts`·`test/agent-review-log.test.ts` |
| S-7 | e2e | T-8 | 입력 7개(해시 확인), 입력·회차마다 새 임시 저장소·`PACE_HOME`·고정 목적 | `./bin/pace.ts agent verify`(Codex) | 구현 후 tester가 관측값 기록이 원자료와 맞는지 확인한다. 원자료·관측값은 evidence에 남긴다 | tester, `evidence/replay-*` |
| S-8 | check | T-9 | 구현 커밋 후보 | 변경 경로·갱신한 고정 시험 | 구현 후 tester가 원자료를 BR02 경로 기준과 대조해 판정한다 | tester, TASK-CLOSE |

## 접근

- `review-criteria.ts`: post는 고정 12항목(`RA`·`RB`·`RC`)을 돌려준다. 항목 문구는 BACKLOG 수정안 2의 점검 문장이다.
- `structured-review.ts`: 기록된 필수 항목이 이 12 ID 집합이면 묶음 규칙(하위 확인 `boundary`·`state`·`flow`, 답 상태 `defect`·`none`·`not_applicable`)을 쓰고, 아니면 지금 규칙 그대로 판독한다. 규칙은 기록에 이미 있는 필수 항목으로 고르고, 날짜·경로로 고르지 않는다(옛 기록 판독만, 생성 경로 없음).
- `verify.ts`: 사후 단계 프롬프트 분기 — 1단계 지시 대신 묶음 점검 지시, `## 태스크 계약: TASK.md` 절, 재검토는 12항목 전체와 직전 blocking 해소를 함께 묻는다. 수정 확인 문구의 note 문장은 사후에서 빼고 해소 의미는 그대로 둔다.
- `verify-cli.ts`·`review-hand.ts`: 사후 대상 diff 판정과 같은 해시 fail 재요청 거부를 예약 전에 둔다. 루트 TASK.md는 `reviewInput`(링크 거부 일반 파일)으로 읽어 붙인다.
- 재생(S-7)은 사후 tester·reviewer 배정 전에 한다.
