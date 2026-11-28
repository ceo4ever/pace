# T03 구현 후 배정·재확인 절차와 문서·팀 정렬

- 프로젝트: [P017](../../PROJECT.md) · 백로그: [BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

BR01·BR02의 도구 동작을 PM 절차·역할 문서·팀 원본에 맞춘다. 지금 문서는 구현 뒤 tester ∥ reviewer를 항상 배정하고 고친 뒤 둘 다 다시 돌린다(`skills/pace-project-dev/SKILL.md:59`, `references/task-steps.md:11`). 계약 정본은 [BR03](../../../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BR03_구현_후_배정·재확인_절차와_문서·팀_정렬.md) 범위·완료 기준이며 여기서 다시 쓰지 않는다(P-1, P-4).

## 재료

- 바꿀 문서: `skills/pace-project-dev/SKILL.md` §3-4, `references/{task-steps,reviewer,tester,goal-review,tools,cross-verify,security,verification}.md`, `docs/{WORK-PROCESS,SECURITY,AGENT-CALL}.md`, `.pace/team/agents/pace-{reviewer,tester}.md`(→ `pace team sync`).
- 도구 문구 정본(T02): 사후 질문 "이 변경을 내보내도 되는가?", 세 묶음 `boundary`·`state`·`flow`, 12항목 `RA-1~4`·`RB-1~4`·`RC-1~4`(`src/agent/structured-review.ts` `POST_BUNDLE_ITEMS`), 답 상태 `defect`·`none`·`not_applicable`, 비-diff 거부 안내(`src/agent/review-criteria.ts` `postTargetIssue`).
- 앞 태스크: T01 reviewer 줄(`필요`·`생략`)·사실 질문, T02 사후 대상은 구현 diff만·묶음 답 형식.
- 문구 고정 시험: `test/project-dev-skill.test.ts:129`(검토 정본 질문 단언).

## 증명 범위

- 판정 주체: 자동 테스트(`node --test`의 문구 고정 시험) + 사례 대조표·문구 대조는 구현 후 tester가 문서 원문으로 판정
- 구현 후 reviewer: 필요 — 바꾸는 스킬·절차 문서가 에이전트의 흐름 규칙이다
- 포함: BR03 범위의 배정 절차·재호출·예외, 역할 문서, Q1 예외, 보안 둘째 겹, 묶음 밖 보완 (a)(b), 기타 정렬, 팀 원본 동기화, 문구 고정 시험 갱신
- 범위 밖: 코드·시험 동작(T01·T02), done 게이트(Q2), BL261118_02 BR04 문장(그 백로그 최신화), 설치본 반영(병합 뒤 main) — 기존 동작 — 기존 회귀 시험(`npm run check`)

<!--
경계(A): 아니오. 코드·권한 경로 변경 없음(문서).
상태(B): 아니오. 저장 형식 변경 없음.
흐름(C): 예. 에이전트 배정·재호출 절차 문서가 바뀐다.
-->

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | BR03 사례 대조표 (1)~(6)을 바꾼 문서 문장에 대입한 결과가 문서 간 갈리는 칸 없이 BR03 기대와 같다 |
| T-2 | `SKILL.md`·`task-steps.md`·`reviewer.md`·`tester.md`가 배정 절차(tester는 항상, reviewer는 `필요` 또는 PM 판단, tester 통과 diff에만, 재호출 조건과 예외, 사후 대상은 구현 diff만)를 같은 뜻으로 말하고 정의는 `task-steps.md` 한 곳이다. 네 문서와 팀 원본에 "∥"가 없다 |
| T-3 | `reviewer.md`의 사후 질문·세 묶음·12항목·답 형식이 T02 도구 문구와 같고, 사후 reviewer가 하지 않는 일(기준 재판정·계획 타당성)과 사전 검토의 필요·생략 판정이 있다. 문구 고정 시험을 의도적으로 갱신한다 |
| T-4 | Q1 예외(구현 후 reviewer는 1단계 없이 TASK와 diff를 받는다)가 `goal-review.md`·`tools.md`·`cross-verify.md`·`docs/WORK-PROCESS.md`·`reviewer.md`에서 같은 뜻이고, tester·백로그 검토의 1단계 문장은 그대로다 |
| T-5 | 보안 둘째 겹(`security.md`·`docs/SECURITY.md`)이 경계(A) 묶음 점검과 사실 질문으로 이어지고, 묶음 밖 보완 (a)(b), `task-steps.md`의 TASK-CLOSE 회차별 요청·회수 시각 필수와 TASK 기준 범위 한정 규칙(`reviewer.md` 사전 절과 같은 문구)이 있다 |
| T-6 | `verification.md` 역할 표·`docs/AGENT-CALL.md`·`docs/WORK-PROCESS.md:22`가 정렬되고 `pace team sync --check` 종료 0이다. 바꾼 경로가 스킬·docs 문서, 팀 원본·생성물, 문구 고정 시험뿐이다 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | check | T-1 | 바꾼 문서 | 사례 (1)~(6) 대입 | tester가 BR03 원문 전체(범위·완료 기준)과 바꾼 문서, 구현 직전 git status·diff 스냅샷(미추적 포함, evidence) 대비 구현 변경를 직접 대조해 판정 | tester |
| S-2 | check | T-2 | 바꾼 문서 | `grep -n "∥"`, 배정 문장 대조 | "∥" 0건, tester가 BR03 원문 전체와 직접 대조해 판정 | tester |
| S-3 | unit | T-3 | `reviewer.md` | 문구 고정 시험 | 사후 질문·세 묶음·12항목, 상태별 근거(`none` 경로·`not_applicable` 이유·`defect` 같은 ID의 위치 있는 지적), 사후가 하지 않는 일, 사전 필요·생략 판정 단언 통과. 음성 대조: 그중 한 문장을 지우면 실패 | `test/project-dev-skill.test.ts` |
| S-4 | check | T-4 | 다섯 문서 | `grep -n "1단계\|첫 판단"` | tester가 BR03 원문 전체·구현 직전 git status·diff 스냅샷(미추적 포함, evidence) 대비 구현 변경와 직접 대조해 판정 | tester |
| S-5 | check | T-5 | 각 위치 | 원문 대조(회차별 시각 필수 문구 포함) | tester가 BR03 원문 전체(범위·완료 기준)과 바꾼 문서, 구현 직전 git status·diff 스냅샷(미추적 포함, evidence) 대비 구현 변경를 직접 대조해 판정 | tester |
| S-6 | check | T-6 | 변경 후보 | 원문 대조, `pace team sync --check` | tester가 BR03 원문 전체(범위·완료 기준)과 바꾼 문서, 구현 직전 git status·diff 스냅샷(미추적 포함, evidence) 대비 구현 변경를 직접 대조해 판정, sync 종료 0 | tester |

## 접근

- 배정 정의를 `task-steps.md` 4단계에 한 번 쓰고 `SKILL.md` §3-4는 한 줄 요약+링크, `reviewer.md`·`tester.md`는 역할 쪽 한 줄씩. 삭제·교체 위주로 고친다.
- `reviewer.md` 관점 절의 구현 후 줄을 세 묶음·답 형식으로 교체하고 `넘길 것`의 구현 후 첫 판단 회수 문장을 Q1 예외로 교체한다.
- 팀 원본 두 파일은 맡는 일 한 줄씩 고친 뒤 `pace team sync`.
