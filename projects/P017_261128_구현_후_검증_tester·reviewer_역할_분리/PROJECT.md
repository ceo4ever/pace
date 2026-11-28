# P017 구현 후 검증 tester·reviewer 역할 분리

- 상태: 완료
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
| P-2 | BR02 완료 기준 전부: 사후 reviewer는 TASK+diff 입력으로 12항목을 묻고 `T-n`을 필수에서 뺌, 답 형식·판정, 좁히는 문장 4개 미적용, 비-diff·같은 대상 fail 재요청 예약 전 거부, 단계 경계 회귀 불변 | T02 시험 |
| P-3 | BR02 설치 전 재생 보고: 고정 입력 6개×2회와 음성 대조의 관측값을 원문과 함께 evidence에 기록 — 통과선 없음, 설치는 owner가 보고로 결정 | T02 evidence |
| P-4 | BR03 완료 기준 전부: 배정 절차(tester 통과 diff에만 reviewer, 재호출·예외), 역할·보안·팀 문서 정렬, 사례 대조표에서 문서 간 답이 갈리는 칸 0, `pace team sync` | T03 check·TASK-CLOSE |
| P-5 | `npm run check` 통과, 구판 호환 경로·표지·이중 판독 없음 | finish |

## 설계

순서 BR01 → BR02 → BR03(사후 판정기가 TASK 줄을 입력으로 쓰고, 문서는 코드 동작에 맞춘다). 저장 행·필드·판독 위치는 각 태스크 설계와 사전 검토에서 정한다(백로그 공통 규칙). 보안 영향: `src/agent/call-hook.ts`(민감)와 `src/project/harness.ts`는 바꾸지 않는다. TASK 형식 검사는 check·done 게이트가 부르므로(`pre-review.ts:207`) T01에서 회귀 시험으로 확인한다. 설치는 이 프로젝트 범위 밖이다 — 병합 뒤 D5(등록 워크스페이스 진행 프로젝트 병합 확인)와 P-3 통과 뒤 허브가 main에서 한다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `templates/project/TASK.md`·`templates/project/TASK-CLOSE.md` | reviewer 필요·생략 줄과 사실 질문 주석, 증명 범위 = 변경 영향 경로, 회차별 시각 칸 (T01) |
| `src/project/pre-review.ts`, `src/agent/structured-review.ts`·`src/agent/verify-cli.ts`·`src/agent/review-hand.ts` | 줄 형식 검사·사전 하위 확인 (T01) |
| `src/agent/structured-review.ts`·`src/agent/verify.ts`·`src/agent/verify-cli.ts`·`src/agent/review-hand.ts`·`src/agent/review-criteria.ts` | 사후 12항목 질문·입력·판정, 예약 전 거부 (T02) |
| `skills/pace-project-dev/**`(SKILL·task-steps·reviewer·tester·security·verification·goal-review·tools·cross-verify), `docs/AGENT-CALL.md`·`docs/WORK-PROCESS.md`·`docs/SECURITY.md`, `.pace/team/agents/pace-reviewer.md`·`.pace/team/agents/pace-tester.md` | 배정·재확인 절차와 역할 정렬 (T03) |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | TASK 묶음 지정과 사전 판정 | 완료 | b951689 |
| T02 | 사후 reviewer 묶음 점검 판정 | 완료 | 63263af |
| T03 | 구현 후 배정·재확인 절차와 문서·팀 정렬 | 완료 | 69a9919 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-28 07:35 | 정의 작성 |
| 2026-11-28 08:00 | 착수 결정(허브): 출처 백로그 R14 pass와 owner 지시("검증 완료되면 프로젝트를 진행해줘", 이슈 없으면 허브 PM이 병합까지)로 바로 start한다. 설치는 병합 뒤 D5·P-3 확인 후 별도 |
| 2026-11-28 11:29 | T01: owner A-3 반영: F3 명시(TASK S-1·템플릿·시험), S-7·S-8 tester 원자료 대조로 축소, PRE-REVIEW waiver(by user, 87c73888…) retained·pre_review_ok true |

| 2026-11-28 11:50 | T01 사전 검토 경로(main 판단): 반복 fail에 공동 검토 2회·진단·한정 확인을 허브가 결정, S-7 (나)는 reviewer 범주 0건으로 해석, R7 F1·F2 최소 반영. 한정 확인을 허가로 인정하는 도구 수정은 독립 검토에서 막혀 병합 뒤 별도(허브). owner 결정: 전체 재검토 2회(R7·R9 fail) 뒤 A-3 "줄이고 예외로 진행" |
| 2026-11-28 12:13 | T01: 근본 수정(PM, A 밖): 줄 머리에서 들여쓰기·인용·목록 표지(-*+·번호)를 걷어낸 선언형 줄을 모두 세고 하나·정본 머리만 허용, 예시는 주석·fence 안(들여쓴 예시도 선언으로 셈 — 의도된 규칙). S-6은 사례 TASK 원문 전 줄이 프롬프트에 실리는지 단언. 대상 시험·전체 검사 통과(무관 dashboard-init 간헐 1건, 단독 3회 통과) |
| 2026-11-28 12:42 | T01: 상위 검토 슬롯 1 적용(main 판단): reviewerLineIssues 정확 일치 복귀, S-2 계약+경계 2, S-1 T-n 한정 문구, S-4 필요·생략 둘 다, 음성 대조 2종 fail 확인, 전체 검사 통과, upper-check 기록 — 독립 확인(tester ∥ reviewer, codex 새 맥락) 실행 중 |
| 2026-11-28 13:05 | T01: 상위 검토 슬롯 2 적용(main 판단): reviewerLineIssues 원문 줄 동일성, S-2 R4 a·b·c·tester 입력·이유만 주석, 동일성 제거 음성 대조 fail, 전체 검사 통과, upper-check 기록 — 독립 확인 실행 중 |
| 2026-11-28 14:33 | T01: owner A-3 F5 한계 기록: review-note --request-waiver weaken(근거 a3-request-F5.json, 지적 F5·증거 공백 T-2·T-3 A 판정) → --decision --by user(owner-decision-F5.md), tester 5회차 원문 evidence/tester-post 보관 |
| 2026-11-28 15:04 | T02: owner A-1 철회: 사후 pass 뒤 새 주기·새 예산 규칙 철회, 기존 합산 예산 유지(00:52 새 주기 결정 대체) — BACKLOG·BR02·BR03 (7)·P-2·정본 목록에서 삭제만 |
| 2026-11-28 17:40 | T02: owner A-1 재생 보고: BR02 재생 관문 통과선 삭제, 관측값 기록과 owner 보고로 교체(입력에 base 트리, BL261128_01 최종 설치 후보에서 1회). T02는 흐름(C) 미검증을 기록하고 닫는다 — BR02·T-8·S-7·P-3 교체만 |
| 2026-11-28 15:05 | T02: T02 TASK 철회 반영: 주기 경계 절·T-7·S-7·재료 예산·주기 줄 삭제, S-4·S-8(신호) 기대를 tester 대조·한 줄로 축소, 번호 당김 — 7145자(R1 7717자 이하) |
| 2026-11-28 15:18 | T02: T02 사전 게이트: owner A-3 waiver(고친 TASK 해시 9eb2b9c9…)로 pre_review_ok true — 구현 착수 |
| 2026-11-28 20:43 | T02: owner A-1 반영(삭제와 교체만): 백로그 evidence 결정 기록, BR02 관문 절을 재생 보고로 교체(base 트리 입력, 통과 조건·실패 시 삭제), D5·BR02 행·결정 행, T-8·S-7·P-3 교체, replay/summary.md 원인 정정과 관측값 기록 |
| 2026-11-28 21:03 | T02: 사후 1회차 반영(허브 결정 A): 비-diff 거부를 복구·소진 앞으로, 12개 ID 단언, 묶음 답 상태 post 한정, 상태명만 관측·위치 없는 defect는 unknown, 같은 해시 거부에 원장 일치, --out TASK.md 보호. 음성 대조 M7~M13 검출, 전체 검사 통과. F4 한계, F6 변경 없음 |
| 2026-11-28 21:11 | T02: tester 2회차 반영(허브 결정 범위 안): defect 답도 빈·상태명 관측이면 unknown(M14 검출), 재생 요약 표에 합성 1회차 RA-3 추가 |
| 2026-11-28 21:12 | T02: 허브 무응답(코디네이터 종료) — 자체 판단: 잔여 blocking F7·F8·F9를 안고 마감하는 것은 A-3(owner) 결정이라 스스로 정하지 않는다. 꾸며낸 입력 수정도 허브 원칙상 적용 전 확인 대상이라 보류. T02 마감 보류, 재검토·추가 수정 없이 owner A-3 대기 |
| 2026-11-28 21:18 | T02: owner A-3 반영 완료: 결정 기록(review-note --request-waiver weaken, --decision --by user) 도구 수락, tester 3회차 T-2·T-8 pass, TASK-CLOSE 한계 F4·F7·F8·F9, F10 이유 기록, 사전 게이트 예외 해시를 A-1 교체본 TASK로 이동, check·done·커밋 9756e3d |
| 2026-11-28 21:18 | T03: BR03 범위의 사후 새 검토 주기 문장 삭제 — owner A-1 철회(2026-11-28) 적용 누락분, 삭제만 |
| 2026-11-28 21:31 | T03: 허브 무응답(코디네이터 종료) — 자체 판단: 잔여 blocking을 안고 구현하는 것은 A-3(owner) 결정이라 스스로 정하지 않는다. T03 구현 보류, owner 예외 결정 대기 |
| 2026-11-28 21:37 | T03: owner A-3 반영: waiver_request(weaken)·owner 결정 도구 수락(1차 요청은 기준 공백 T-6 판정 누락으로 거부, 추가 뒤 수락), PRE-REVIEW waiver 현재 TASK 해시, review-pre pre_review_ok true |
| 2026-11-28 21:47 | T03: 구현: 배정 정의를 task-steps 4단계 한 곳에, 역할·Q1·보안·팀 원본 정렬과 sync, 문구 고정 시험 갱신, 전체 검사 통과. tester 먼저 배정 |
| 2026-11-28 21:53 | T03: tester 1회차 반영: reviewer.md 구현 후 재검토는 diff 전체 12항목(시험 단언·음성 대조 추가), tools.md:7 대체 열 Q1, AGENT-CALL 문단을 표 뒤로·owner 회차 허용 |
| 2026-11-28 21:57 | T03: tester 2회차 반영(같은 절 두 번째라 덧붙이지 않고 교체): reviewer.md:44 재검토 범위를 단계별로 나눈 한 문단으로 교체 |
| 2026-11-28 22:01 | T03: tester 3회차 반영(교체 위주): 수정 확인 범위 문장 세 곳(reviewer.md 공동 한도 이후, task-steps 상한 뒤 수정 확인, decision-rights B 수정 확인)에 구현 후는 해소 확인과 함께 diff 전체 12항목을 구분 |
| 2026-11-28 22:05 | T03: tester 4회차 반영: AGENT-CALL 외부 검토 문장을 review-hand 거부·review-record stale unknown으로 교체 |
| 2026-11-28 22:12 | T03: reviewer 1회차 반영(짧은 구절): 도구가 재호출을 거부하면(소진·헝크 없는 diff) 반복 실패 절차로 허브 인계, 보안 두 문서는 경계(A)를 포함한 사실 질문(하나라도 예면 필요) |
| 2026-11-28 22:20 | T03: 허브 무응답(코디네이터 종료) — 자체 판단: 잔여 blocking 2건(도구 한계)을 안고 마감하는 것은 A-3 owner 결정이라 정하지 않는다. T03 마감 보류, 독립 작업(idea 기록·TASK-CLOSE 초안)만 진행 |
| 2026-11-28 22:53 | 자체 판단 대조: agent 결정 24건을 백로그·PROJECT 합의(목적·기준·범위)와 대조 — 합의 변경 없음. 참고: T03에서 정본 목록 밖 decision-rights.md 한 구절(구현 후 수정 확인 범위 구분)·evals S3 문구를 정렬, PROJECT-CLOSE에 기록. T02 게이트 예외 해시 이동은 owner 사후 인정 |

