# T01 사전 검토 공동 시도 1회차 근거

- 계기: 사전 verify 종료 16 budget_exhausted(stage pre, rounds 2/2, calls 2/4), TASK 해시 224903d12f96….
- 직전 지적: R1(fail, blocking 6), R2(rereview, fail, blocking 4) — 모두 시험 검출력·관측 보완 부류. 원문은 review-records/R1.json·R2.json.
- 허브 결정(main 판단, 2026-11-28, Orca 회신): 공동 검토 1회차 진행. 목적·범위·기준 변경 없음 → A-1·A-3 아님. blocking만 반영, should_fix·note는 계약에 넣지 않고 이유만 기록.
- 적용 조치: R2 blocking 4건 반영 — S-1 역할별 시각 칸 단언, S-4 실행기 진입 시점 call 행 확인, S-7 (나) 유효 구조화 판정 요구, S-8 `--no-renames`.
