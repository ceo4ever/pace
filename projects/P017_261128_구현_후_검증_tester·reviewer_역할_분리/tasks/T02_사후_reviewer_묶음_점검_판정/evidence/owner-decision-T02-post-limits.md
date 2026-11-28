# owner 결정 — 사후 2회차 F7·F8·F9 한계 수용 (A-3)

- 결정: owner, 2026-11-28, 허브가 질문. owner 원문 선택: "한계로 적고 마감 (Recommended)"
- 질문 요지: 사후 2회차(R7, 예산 rounds 2/2 소진) blocking F7(없는 옛 기록 형식), F8(원장 확정 직전 중단 뒤 같은 해시 재요청 순서, 같은 흐름 절 두 번째 blocking), F9(검토 중 TASK.md 삭제)를 TASK-CLOSE 한계로 받고 T02 마감.
- 같은 결정에 딸린 허브 지시(main 판단): 2회차 뒤 고친 T-2·T-8만 tester 새 맥락으로 한 번 확인, F10 should_fix는 이유만 기록.

## R7 원문 (요약 없이 필드 그대로)

### F7
- id F7 · blocking · state · location `src/agent/structured-review.ts:70` · impact goal · criterion RB-3 · recurrence same_class
- scenario: 변경 전 사후 기준표도 RA-1부터 RC-4까지 같은 12개 ID를 허용했다. 새 판독기는 post 단계와 ID 배열만 보고 형식을 정하므로, 그 ID를 쓴 옛 사후 기록의 답 상태와 지적 범주를 새 규칙으로 해석한다. 저장된 판정과 재계산이 달라지면 loadRereview는 기준점 사용을 거부하고 stats는 판정 원문 집계에서 그 기록을 제외한다.
- reproduction: 필수 ID를 RA-1~4, RB-1~4, RC-1~4 순서로 주고, 각 항목이 관측을 담은 present이고 findings가 빈 v2 원문을 assessStructuredReview('post', ...)에 넣는다. 같은 입력이 070f105에서는 pass, 작업 트리에서는 unknown임을 메모리에서 확인했다.

### F8
- id F8 · blocking · flow · location `src/agent/verify-cli.ts:325, src/agent/review-hand.ts:182` · impact goal · criterion RC-3 · recurrence same_class
- scenario: 같은 대상·같은 해시의 fail 재요청은 두 진입점 모두 중단 복구 뒤에 거부된다. 첫 fail의 결과 파일까지 썼지만 마지막 원장 행을 쓰기 전에 중단됐다면, 재요청은 그 fail을 원장에 추가하고 유효 회차를 0에서 1로 바꾼 뒤 동일 대상 오류로 끝난다.
- reproduction: 임시 태스크에서 첫 사후 fail을 기록한 뒤 call·format 행과 완성된 결과 JSON을 남기고 마지막 review 행만 뺀다. 패치나 계약을 변경하지 않고 같은 대상을 verify와 review-hand에 각각 제출한다. 실행기와 새 예약 없이 거부되지만, 거부 전후 원장에 review 행이 하나 추가되고 rounds가 1이 되는 경로다.

### F9
- id F9 · blocking · state · location `src/agent/review-hand.ts:262` · impact goal · criterion RB-1
- scenario: 외부 검토가 끝난 뒤 루트 TASK.md가 없어지거나 읽을 수 없게 되면, review-record는 제출 원문을 읽고도 계약 읽기 예외로 종료한다. 읽을 수 있는 계약으로 바뀐 경우에는 원문과 stale unknown이 저장된다. 계약을 읽을 수 없는 경우 예약만 남고 외부 실행 결과는 호출자가 제공한 파일에만 남는다.
- reproduction: 임시 태스크의 정상 패치를 review-hand로 고정하고 정상적인 결과 파일을 준비한다. 루트 TASK.md를 임시 이름으로 옮긴 뒤 review-record에 결과를 제출한다. 종료 2와 함께 새 review 행과 결과 JSON이 생기지 않는 경로를 확인한다. 대조군에서는 TASK.md를 유효한 다른 UTF-8 계약으로 바꾸면 같은 제출이 stale unknown과 원문을 저장한다.

## 영향

- F7: RA-1~RC-4 12개 ID를 그 순서로 쓴 옛 사후 기준 표는 없다. 이 프로젝트 T01 R1~R5의 재판정·예산·stats는 변경 전과 같다(S-6).
- F8: 첫 fail의 결과 파일을 쓴 뒤 마지막 원장 행 직전에 중단된 경우에만 생긴다. 복구는 실제 있었던 판정을 원장에 되살리는 것이고 새 실행기 호출·새 예약은 없다. 비-diff 거부(F5)는 복구 앞으로 옮겼다.
- F9: review-hand 뒤 review-record 전에 루트 TASK.md가 없어지면 결과가 기록되지 않고 종료 2다. 예약만 남고 외부 결과는 제출자 파일에 남는다.
