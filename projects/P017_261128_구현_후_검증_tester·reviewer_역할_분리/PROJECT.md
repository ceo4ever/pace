# P017 구현 후 검증 tester·reviewer 역할 분리

- 상태: 진행
- 규모: L(태스크 3개)
- 출처: [BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음](../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BACKLOG.md)
- 브랜치: `project/P017` · worktree: `../pace.wt/P017/`
- 작업자: <!-- 이 프로젝트만 다른 도구로 띄울 때 이름 하나: claude · codex · cursor · antigravity 등. 정하지 않으면 비워 둔다 → 정의서 `작업자 도구:` → 지금 세션 도구 -->
- 작업자 역할: <!-- 팀 구성원 이름 하나. 생략하면 역할 없음. 도구는 위 작업자 줄/--agent로 고른다 -->
- 팀 측정: <!-- 새 역할 start에서 v1 활성화. 옛 프로젝트 비소급 -->
- 시작: 2026-11-28

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

태스크 구현 뒤 검증에서 tester와 reviewer의 질문을 시점·목적별로 나눈다. 사후 reviewer가 실행 증거 없이 TASK 기준을 다시 판정하다 `unknown`을 반복하며 예산을 쓰는 문제를 없애고, 읽기로만 보이는 경계(A)·상태(B)·흐름(C) 결함은 계속 잡는다. 상위 목적: owner가 자리를 비워도 품질을 지키며 검토 반복에 시간·토큰을 낭비하지 않는다. 계약 정본은 출처 백로그의 목표·수정안 1~4와 BR01~BR03이며 여기서 다시 쓰지 않는다.

## 재료

<!-- 무엇을 근거로: 백로그·대화 날짜·코드 위치(file:line)·문서·브레인 페이지 -->

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스: 명시적 증명 범위와 영향 분류로 검토를 집중하고 PM/user를 기록한다; 옛 주체는 unknown이며 일반 갭은 재검증 후 보고한다

- 백로그: 목표·근거·고른 길·D1~D5·측정 절 ([BACKLOG](../../backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BACKLOG.md)), 독립 검토 R14 pass(2026-11-28).
- owner 결정: Q1(2026-11-27), 단순화·새 주기·무조건 보고(2026-11-28) — 백로그 `evidence/owner-decision-*`.
- 기준선: 백로그 `evidence/baseline-2026-11-28.md`.

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01 완료 기준 전부: v2 TASK의 `구현 후 reviewer` 줄 형식 검사(예약 전 거부·check/done 보고), 사전 판정(`생략`+사실 질문 "예" → blocking, 기준 범위 넓힘 판정), TASK-CLOSE 회차 시각 칸, `legacyStructureOnly` 결과 불변 | T01 시험 + 행동 평가(TASK-CLOSE) |
| P-2 | BR02 완료 기준 전부: 사후 reviewer는 TASK+diff 입력으로 12항목을 묻고 `T-n`을 필수에서 뺌, 답 형식·판정, 좁히는 문장 4개 미적용, 비-diff·같은 대상 fail 재요청 예약 전 거부, pass 뒤 새 주기 예산(verify·review-hand 두 경로), 단계 경계 회귀 불변 | T02 시험 |
| P-3 | BR02 설치 전 관문: 고정 입력 6개×2회(분모 12) 재생에서 unknown ≤ 1, 세 묶음 모두 유효 blocking·fail, 음성 대조 T05 `post-02-docs.patch` 2회 blocking 없음 — 원문 evidence 고정, tester 판정 | T02 evidence |
| P-4 | BR03 완료 기준 전부: 배정 절차(tester 통과 diff에만 reviewer, 재호출·예외), 역할·보안·팀 문서 정렬, 사례 대조표에서 문서 간 답이 갈리는 칸 0, `pace team sync` | T03 check·TASK-CLOSE |
| P-5 | `npm run check` 통과, 구판 호환 경로·표지·이중 판독 없음 | finish |

## 설계

순서 BR01 → BR02 → BR03(사후 판정기가 TASK 줄을 입력으로 쓰고, 문서는 코드 동작에 맞춘다). 저장 행·필드·판독 위치는 각 태스크 설계와 사전 검토에서 정한다(백로그 공통 규칙). 보안 영향: `src/agent/call-hook.ts`(민감)와 `src/project/harness.ts`는 바꾸지 않는다. TASK 형식 검사는 check·done 게이트가 부르므로(`pre-review.ts:207`) T01에서 회귀 시험으로 확인한다. 설치는 이 프로젝트 범위 밖이다 — 병합 뒤 D5(등록 워크스페이스 진행 프로젝트 병합 확인)와 P-3 통과 뒤 허브가 main에서 한다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `templates/project/TASK.md`·`TASK-CLOSE.md` | reviewer 필요·생략 줄과 사실 질문 주석, 증명 범위 = 변경 영향 경로, 회차별 시각 칸 (T01) |
| `src/project/pre-review.ts`, `src/agent/structured-review.ts`·`verify-cli.ts`·`review-hand.ts` | 줄 형식 검사·사전 하위 확인 (T01) |
| `src/agent/structured-review.ts`·`verify.ts`·`verify-cli.ts`·`review-hand.ts`·`review-criteria.ts`·`review-budget.ts`·`review-followup.ts`·`review-admission.ts` | 사후 12항목 질문·입력·판정, 예약 전 거부, 새 주기 (T02) |
| `skills/pace-project-dev/**`(SKILL·task-steps·reviewer·tester·security·verification·goal-review·tools·cross-verify), `docs/AGENT-CALL.md`·`WORK-PROCESS.md`·`SECURITY.md`, `.pace/team/agents/pace-reviewer.md`·`pace-tester.md` | 배정·재확인 절차와 역할 정렬 (T03) |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | TASK 묶음 지정과 사전 판정 | 대기 | |
| T02 | 사후 reviewer 묶음 점검 판정 | 대기 | |
| T03 | 구현 후 배정·재확인 절차와 문서·팀 정렬 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-28 07:35 | 정의 작성 |
| 2026-11-28 08:00 | 착수 결정(허브): 출처 백로그 R14 pass와 owner 지시("검증 완료되면 프로젝트를 진행해줘", 이슈 없으면 허브 PM이 병합까지)로 바로 start한다. 설치는 병합 뒤 D5·P-3 확인 후 별도 |
