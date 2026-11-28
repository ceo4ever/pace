# owner 결정 — T03 사후 2회차 F1·F2 한계 수용 (A-3)

- 결정: owner, 2026-11-28, 허브가 질문. owner 원문 선택: "한계로 적고 마감 (Recommended)"
- 질문 요지: T03 사후 2회차(R2, 예산 rounds 2/2 소진) blocking F1(소진과 최신 pass 뒤 필수 재호출 경로 없음, 새 주기 철회의 결과), F2(헝크 없는 diff의 reviewer 경로 없음)를 TASK-CLOSE 한계로 받고 마감. 도구 후속은 허브가 기존 idea `upper-review-종료-뒤-owner-재개-경로`에 덧붙인다(새 idea 없음).

## R2 원문 (review-records/R2.json)

### F1
- id F1 · blocking · flow · location `skills/pace-project-dev/references/task-steps.md:15` · criterion RC-3
- scenario: 사후 일반 판정을 두 회차 사용한 뒤 최신 판정이 pass이고, 이후 예외에 해당하지 않는 필수 변경을 tester가 통과시켰다. 새 문구는 허브에 인계하도록 하지만, 연결된 반복 실패 절차에서는 새 diff의 독립 판정을 회수할 수 없다. 필수 변경을 유지한 태스크가 기존 위임으로 마감까지 갈 경로가 빠져 있다.
- reproduction: 같은 태스크의 일반 사후 원장에 fail → pass를 가정하고, 에이전트 게이트 문서의 필수 변경을 tester가 통과시킨 새 패치에 반영한다. src/agent/review-budget.ts:147과 src/agent/verify-cli.ts:330에서 일반 실행이 소진으로 거부된다. 허브 인계 뒤 src/agent/review-admission.ts:22에서 최신 pass 때문에 공동 검토가 막히고, src/agent/review-followup.ts:327에서 최신 fail 기준점이 없어 수정 확인이 열리지 않는다. 같은 파일 :412에서 상위 검토도 열린 상위 상태를 요구한다.

### F2
- id F2 · blocking · flow · location `skills/pace-project-dev/references/task-steps.md:14` · criterion RC-4
- scenario: reviewer가 필요한 최초 구현에 텍스트 헝크가 없으면 tester가 통과해도 reviewer 판정을 회수할 수 없다. 추가된 인계 문구는 재호출에만 적용된다. 재호출에서도 반복 실패 절차는 헝크 없는 구현 diff가 도구의 입력 검사를 통과할 경로를 제공하지 않는다.
- reproduction: 기존 훅의 실행 비트만 바꾸는 필요 태스크를 가정한다. tester가 동작을 통과시키면 첫 reviewer 입력은 diff --git과 old mode/new mode만 있는 패치다. src/agent/review-criteria.ts:76의 헝크 조건 때문에 verify는 src/agent/verify-cli.ts:314에서, review-hand는 src/agent/review-hand.ts:179에서 예산 예약 전에 거부한다. test/agent-review-hand.test.ts:637의 모드 변경 예제는 이 거부를 고정한다. task-steps.md:15의 허브 인계 뒤에도 같은 입력 검사가 먼저 적용된다.

## 영향

- 문서는 도구가 재호출을 거부하면(소진·헝크 없는 diff) 반복 실패 절차대로 허브에 인계하라고 말한다. 도구가 그 뒤 독립 판정 경로를 열지 않는 것이 남은 한계다.
- tester 6회차는 T-1~T-6 통과.
