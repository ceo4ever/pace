# T01 TASK 묶음 지정과 사전 판정 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적 정합: 맞음. BR01 목적은 구현 후 reviewer 필요·생략을 TASK에 사실 질문으로 미리 적고 사전 reviewer가 그 판단과 기준 범위를 판정하는 것이다. 템플릿 줄·사실 질문, 형식 게이트(check·done·사전 verify·review-hand 예약 전), 사전 질문 두 범주와 v2 지시가 이 목적을 직접 구현한다.
- 달성: 달성(한계 있음). 1단계는 구현 PM의 전체 검사와 기준별 시험이다. 2단계는 독립 tester(Codex, 슬롯 2 뒤 5회차)로, BR01과 diff를 먼저 대조한 뒤 T-1~T-7을 모두 통과로 판정했고 음성 대조도 모두 검출했다(`evidence/tester-post/round5.md`).
- 번복·한계:
  - reviewer 최종 회차 R5는 F5 blocking으로 fail이다. 인라인 코드로 주석 표지를 인용한 유효 선언을 "주석이 섞였다"로 오거부한다. 잘못 통과시키는 방향이 아니라 안전 쪽이다. owner A-3 결정(한계로 받고 마감)으로 한계 처리했다(`evidence/owner-decision-F5.md`, `evidence/a3-request-F5.json`, REVIEW-FOLLOWUPS의 waiver_request·owner 행).
  - 선언 줄은 **원문 줄**로 해석한다. 주석·인용으로 정본 줄 머리를 흉내 내는 우회를 막는다고 보증하지 않는다. 숨은 변형 선언의 판단은 사전 reviewer 몫이다.
  - 행동 평가(S-7)는 한 제공자(Codex)·고정 장난감 입력 두 회차라 일반화 한계가 있다. (나)의 도구 종합 판정은 판정 차원 밖 지적(detection·scope·permission) 때문에 fail이었다. reviewer 범주 지적 0건으로 갈림을 tester가 판정했다.
  - 사전 검토 R9 F1·F2(S-7·S-8 판정 방식)는 owner waiver로 tester 원자료 대조로 줄였다(`PRE-REVIEW.json` waiver, `evidence/owner-waiver-R9.md`).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 `test/project-templates.test.ts:73`·`:96`, tester 5회차 포함 안내 반전 음성 대조 검출 |
| T-2 | 통과 | 한계: F5 오거부 사례(owner A-3). S-2 `test/pre-review.test.ts`, S-3 `test/project-harness.test.ts`, tester 5회차 원문 머리·동일성 제거 음성 대조 검출. F5는 owner A-3 한계 |
| T-3 | 통과 | 한계: F5 유효 선언 예약 전 거부(owner A-3). S-4 `test/agent-verify.test.ts`·`test/agent-review-hand.test.ts`, 거부 경로 실행기 0·call 0·고정본 0 |
| T-4 | 통과 | S-5 `test/agent-review-log.test.ts` [1,1]·[0,1], 옛 기록 재판정에 새 검사를 섞는 음성 대조 검출 |
| T-5 | 통과 | S-6 `test/agent-structured-review.test.ts`(실제 TASK 원문 (가)~(라), 넓힘 강등 음성 대조 검출) |
| T-6 | 통과 | S-7 `evidence/behavior-summary.md`, `evidence/behavior-run1/`, `evidence/behavior-ga.json`·`evidence/behavior-na.json`·`evidence/behavior-da.json` 원문, tester 판정 `evidence/tester-post/round5.md` |
| T-7 | 통과 | S-8 `evidence/s8-paths.md`, tester 대조(허용 경로 13개, `harness.ts`·`call-hook.ts` diff 없음) |

## 단위 테스트

- `PACE_SKIP_BROWSER_E2E=1 npm run check` — 종료 0. `tsc` 통과, `node --test` tests 1536 · pass 1518 · fail 0 · cancelled 0 · skipped 18(브라우저 E2E 끔).

## E2E

- S-7 행동 평가: 통과(tester 판정) — `evidence/behavior-summary.md`, 원문 `evidence/behavior-run1/`, `evidence/behavior-ga.stdout`·`evidence/behavior-na.stdout`·`evidence/behavior-da.stdout`, 입력 해시 `behavior-*-input.sha256`.

## 리뷰

tester 판정: pass — 5회차(상위 검토 슬롯 2 적용본) T-1~T-7 통과, 음성 대조 모두 검출, 작업본 diff 해시 전후 동일(`evidence/tester-post/round5.md`). 1~4회차 fail 원문은 `evidence/tester-post/round1.md`·`evidence/tester-post/round2.md`·`evidence/tester-post/round3.md`·`evidence/tester-post/round4.md`.
reviewer 판정: fail → owner A-3 한계 수용 — R5 blocking 1건(F5, 안전 쪽 오거부)·should_fix 0. 앞 회차 R1~R4 blocking은 진단·한정 확인·상위 검토 슬롯 1·2로 고쳤다(`evidence/review-records/R1.json`~`evidence/review-records/R5.json`, `evidence/diagnosis-post-1.md`, `evidence/confirm-post-F1.md`, `evidence/upper-review-post-1.json`·`evidence/upper-review-post-2.json`, `evidence/upper-check-post-1.json`·`evidence/upper-check-post-2.json`).

회차마다 요청 시각=PM 검증 요청, 회수 시각=판정 결과 수신(2026-11-28 KST):

| 역할 | 회차 | 요청 시각 | 회수 시각 | 판정 |
|---|---|---|---|---|
| tester | 1 | 11:45:57 | 11:48:21 | fail(샌드박스 mkdtemp EPERM, 환경) |
| reviewer | 1 | 11:46:09 | 11:49:19 | fail(blocking 2) |
| tester | 2 | 11:58:17 | 12:04:04 | fail(T-2·T-3) |
| reviewer | 2 | 11:58:07 | 12:00:25 | fail(blocking 3, 예산 2/2) |
| tester | 3 | 12:14:21 | 12:21:23 | fail(T-1·T-2·T-3) |
| reviewer | 3 | 12:15:28 | 12:17:46 | fail(F1 한정 확인, upper_review) |
| tester | 4 | 12:42:15 | 12:47:36 | fail(T-2·T-3) |
| reviewer | 4 | 12:42:12 | 12:45:47 | fail(슬롯 1 확인, upper_review) |
| tester | 5 | 13:05:49 | 13:11:55 | pass |
| reviewer | 5 | 13:05:46 | 13:08:52 | fail(F5, agreement_required → owner A-3 한계) |

- 결정 메모:
  - 공동 검토(`--joint`) 거부: 도구가 공동 검토 시도를 단계와 상관없이 단위 전체로 세어(사전 단계 공동 2회) "현재 예산과 판정에서 공동 검토를 열 수 없다"를 냈다(`evidence/joint-post-1.md`). 허브가 진단·한정 확인 경로를 골랐다(main 판단). 도구 수정은 병합 뒤 백로그로 넘긴다.
  - F3(탭 들여쓴 예시 오계수) 규칙은 허브가 받아들였다(main 판단). 이후 상위 검토 슬롯 1(설계 층)에서 정확 일치 문법으로 되돌렸고, 슬롯 2에서 원문 줄 동일성을 더했다.
- 특수 기능: 필요 없음. tester·reviewer는 `pace agent run`·`pace agent verify`(Codex)로 새 맥락에서 실행했다. tester는 mkdtemp 때문에 `--write`로 돌리고 작업본 diff 해시를 전후로 대조했다.
- 교본: TypeScript 색인 — 주변 코드(`pre-review.ts`의 `visibleMarkdown`·`proofScopeIssues`)를 따랐고 안티패턴은 대조 결과 없음.

## 남긴 것

- F5 한계: 이유에 인라인 코드로 `<!--`를 인용한 유효 선언을 오거부한다(`visibleMarkdown`이 인라인 코드의 `<!--`를 `&lt;!--`로 바꾸기 때문). 작성자는 이유에 주석 표지를 인용하지 않는다.
- 형제 필드 주석 접합(다른 `- 판정 주체:` 등 줄과 주석으로 이어 붙인 변형)은 검사하지 않는다. 선언 줄은 원문 줄 해석이며 우회 방지를 보증하지 않는다.
- 공동 검토 횟수를 단위 전체로 세는 도구 동작(`src/agent/review-followup.ts:174-175`, `src/agent/review-admission.ts:22`) — 병합 뒤 백로그 후보.
- 전체 검사의 간헐 실패: `test/dashboard-init.test.ts:129` "상위 정션 아래 모호한 cwd도 형제 저장소를 바꾸지 않는다"가 전체 부하에서 가끔 실패하고 단독 실행은 3/3 통과. team-lock 시험도 한 번 흔들렸다. 이번 변경과 무관한 경로다.
- tester 샌드박스에서 `PACE_AGENT_CHILD` 아래 부트·로컬 포트 시험이 실패하고 전체 검사가 끝나지 않았다. 변경 전 HEAD 사본에서도 재현했다(tester 5회차 signals). 판정은 대상 시험과 음성 대조로 했다.
- T02가 알아야 할 것: 사후 질문·판정은 사전 단계의 `reviewer`·`breadth` 범주와 같은 방식(`structured-review.ts` 질문 안 범주, 강등 안 되는 필드)으로 더한다. 구현 후 예산(라운드 2·호출 4)은 빨리 소진되므로 변형 열거보다 문법 정의부터 정한다.
