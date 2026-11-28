# T03 구현 후 배정·재확인 절차와 문서·팀 정렬 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적 정합: 맞음. BR03 목적은 BR01·BR02의 도구 동작을 PM 절차·역할 문서·팀 정의에 정렬하는 것이다. 배정 정의를 `task-steps.md` 4단계 한 곳에 두고(tester 항상, reviewer는 `필요` 또는 PM 판단, tester 통과 diff에만, 재호출·예외, 회차별 시각 필수), 역할·Q1·보안·팀 원본이 그 정의를 따른다.
- 달성: 달성(한계 있음). 독립 tester(Codex) 6회차가 BR03 원문 전체와 구현 직전 스냅샷 대비 변경을 먼저 대조한 뒤 T-1~T-6을 통과로 판정했다(사례 대조표 6칸 갈림 0, `team sync --check` 종료 0).
- 번복·한계:
  - 사후 reviewer 2회차(R2) blocking F1·F2는 문서로 닫을 수 없는 도구 한계다. owner A-3(2026-11-28, "한계로 적고 마감")으로 한계로 받았다(`evidence/owner-decision-T03-post-limits.md`, `evidence/a3-request-T03-post-limits.json`, REVIEW-FOLLOWUPS의 waiver_request·owner 행).
  - 사전 검토는 owner A-3 예외로 구현했다(`evidence/owner-waiver-T03.md`, `evidence/a3-request-T03-waiver.json`, REVIEW-FOLLOWUPS의 waiver_request·owner 행). 공동 1·2회차 근거 `evidence/joint-pre-1.md`·`evidence/joint-pre-2.md`.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | tester 6회차 사례 대조표 (1)~(6) — 아래 표, 문서 간 갈림 0칸(`evidence/tester-post/round6.md`) |
| T-2 | 통과 | 배정 정의 `skills/pace-project-dev/references/task-steps.md` 4단계, SKILL·reviewer·tester는 그 절을 링크·요약. 네 문서·팀 원본 "∥" 0건, eval 시나리오 S3도 정렬 |
| T-3 | 통과 | `reviewer.md` 관점 절(세 묶음·12항목·답 형식·역할 경계), 사전 검토 절의 필요·생략·범위 한정, 재검토·수정 확인은 구현 후 diff 전체 12항목. S-3 `test/project-dev-skill.test.ts` 단언 7개 추가, 음성 대조 4건 검출 |
| T-4 | 통과 | Q1 예외: `goal-review.md`·`tools.md`(두 곳)·`cross-verify.md`·`docs/WORK-PROCESS.md`·`reviewer.md`. tester·백로그 1단계 문장 그대로 |
| T-5 | 통과 | 보안 둘째 겹 `security.md`·`docs/SECURITY.md`(경계(A)를 포함한 사실 질문), (a) `task-steps.md` 2단계, (b) `tester.md`, 회차별 시각 필수·출처 `task-steps.md` 4단계, 범위 한정 문구 `task-steps.md`·`reviewer.md` 같음 |
| T-6 | 통과 | `verification.md` 역할 표, `docs/AGENT-CALL.md` 구현 후 문단, `docs/WORK-PROCESS.md` TASK v2 줄, 팀 원본 두 파일·생성물(`pace team sync`), 스냅샷 `evidence/pre-impl-snapshot.md` 대비 구현 변경 21개 모두 허용 경로 |

사례 대조표(tester 6회차, 바꾼 문서 문장 대입):

| 사례 | 결과 |
|---|---|
| (1) `생략`, PM 미호출 | tester만. TASK-CLOSE에 `reviewer 생략 — 이유` |
| (2) `생략`, PM 호출 | tester 통과 뒤 reviewer 12항목. 부른 이유 기록 |
| (3) `필요` | tester 통과 뒤 reviewer 12항목 |
| (4) 직전 pass 뒤 화면 문구만, A·B·C 모두 아니오 | tester만 다시. 예외와 답 기록 |
| (5) 직전 pass 뒤 `task-steps.md` 게이트 지시 약화 | 흐름 규칙 문서라 예외 아님 → tester 통과 뒤 reviewer 재호출 |
| (6) 직전 pass 뒤 화면 문구+저장 필드 | 상태(B) 예 → reviewer 재호출 |

## 단위 테스트

- `PACE_SKIP_BROWSER_E2E=1 npm run check` — 종료 0. tests 1548 · pass 1530 · fail 0 · skipped 18(브라우저 E2E 끔).
- 의도적으로 바꾼 고정 시험(BR03): `test/project-dev-skill.test.ts` "검토 정본은 단계별 판정 질문과 새 반환 형식을 연결한다"에 구현 후 묶음·답 형식·역할 경계·사전 필요·생략·Q1·재검토 전체 diff 단언을 더했다(기존 단언 유지). SKILL.md 크기 상한(10,800바이트) 안: 10,778바이트.

## E2E

- 해당 없음(문서 태스크). 사례 대조표가 S-1 원문 판정이다.

## 리뷰

회차마다 요청 시각=PM 검증 요청, 회수 시각=판정 결과 수신(2026-11-28 KST):

| 역할 | 회차 | 요청 시각 | 회수 시각 | 판정 |
|---|---|---|---|---|
| tester | 1 | 21:47:24 | 21:52:25 | fail(T-3·T-4·T-6) |
| tester | 2 | 21:53:05 | 21:57:33 | fail(T-3) |
| tester | 3 | 21:57:51 | 22:00:56 | fail(T-2·T-3, same_class) |
| tester | 4 | 22:01:28 | 22:05:45 | fail(T-6) |
| tester | 5 | 22:05:56 | 22:10:11 | pass |
| reviewer | 1 | 22:10:19 | 22:12:18 | fail(blocking 3) |
| tester | 6 | 22:12:49 | 22:17:26 | pass |
| reviewer | 2 | 22:17:33 | 22:19:35 | fail(blocking 2, 예산 2/2) |

tester 판정: pass — 6회차 T-1~T-6 통과. 1~4회차 fail은 문서 간 충돌(재검토·수정 확인 범위, Q1 누락 한 곳, AGENT-CALL 문단 위치·외부 검토 동작)이었고 모두 교체 위주로 고쳤다(`evidence/tester-post/round1.md`~`round6.md`).
reviewer 판정: fail → owner A-3 한계 수용 — R2 blocking 2(F1 소진·최신 pass 뒤 필수 재호출 경로, F2 헝크 없는 diff)·should_fix 0. R1 blocking 3 중 F3(보안 문서의 A만 판단)은 고쳤고 F1·F2는 허브 인계 문구를 더했으나 도구가 경로를 열지 않아 R2에서 같은 부류로 남았다(`evidence/reviewer-post/round1.json`·`round2.json`, `evidence/review-records/R1.json`·`R2.json`).

- 결정 메모:
  - reviewer 필요: TASK `필요 — 바꾸는 스킬·절차 문서가 에이전트의 흐름 규칙이다`. 새 절차대로 tester 통과 diff에만 reviewer를 불렀고, reviewer 1회차 반영 뒤 수정 diff도 tester 통과 뒤 다시 불렀다.
  - BR03 범위의 사후 새 검토 주기 문장은 owner 철회(2026-11-28)에 따라 삭제만 했다.
  - 사전 검토: R1·R2 fail(detection) → 허브 결정(main 판단)으로 시험 행을 tester 원문 대조로 축소, 공동 1·2회차 fail(detection) → owner A-3 "예외로 구현".
- 특수 기능: 필요 없음. tester·reviewer는 `pace agent run`·`pace agent verify`(Codex)로 새 맥락에서 실행했다.
- 교본: 문서 태스크라 해당 없음. 주변 문서 문체(정본 한 곳·링크)를 따랐다.

## 남긴 것

- F1 한계(owner A-3): 사후 예산 소진·최신 pass 뒤 필수 재호출 경로가 도구에 없다(새 주기 철회의 결과).
- F2 한계(owner A-3): 헝크 없는 diff(모드·이름만)는 사후 reviewer가 받지 않는다(T02 한계). 문서는 도구가 거부하면 허브에 인계하라고만 말한다.
- 두 도구 후속은 허브가 main의 기존 idea `upper-review-종료-뒤-owner-재개-경로`에 덧붙였다.
- 설치본 반영: 스킬·팀 생성물은 병합 뒤 main에서 `bash scripts/install.sh`로 반영된다.
- tester 샌드박스에서 전체 검사가 끝나지 않았다(`PACE_AGENT_CHILD` 상속 부트 실패, Gateway `listen EPERM`) — 변경 전 사본에서도 재현, 판정은 대상 시험과 원문 대조.
