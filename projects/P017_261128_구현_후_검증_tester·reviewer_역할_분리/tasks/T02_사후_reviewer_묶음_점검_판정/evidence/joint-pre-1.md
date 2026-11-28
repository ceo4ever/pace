# T02 사전 검토 공동 시도 1회차 근거

- 계기: 사전 verify budget_exhausted(stage pre, rounds 2/2, calls 2/4), 도구 next classify_followup, joint_attempts 0.
- 직전 지적: R1(fail, blocking 6 — F1~F6), R2(rereview, fail, blocking 3 — F7~F9, note F10). 모두 시험 검출력·주기 경계 규칙 부류. 원문은 review-records/R1.json·R2.json.
- 허브 결정(main 판단, 2026-11-28, Orca 회신): 공동 검토 1회 진행. 목적·범위·기준 변경 없음 → A-1·A-3 아님. blocking만 반영, should_fix·note는 계약에 넣지 않고 이유만 기록. 같은 절이 다시 blocking이면 덧붙이기 전에 축소·삭제안부터 허브에 원문 보고. 비현실 입력·과잉 거부 방향 지적은 반영하지 않고 허브에 보고.
- 적용 조치: R2 blocking 3건 반영 — S-4 지시 줄 전체의 모드별 정확 비교(붙인 원문 절 제외), 주기 경계를 직전 경계와 해시가 다른 pass로 한정·S-7(d), S-8을 현행 신호 계산과 recurrence 보존 단언으로. F10(note, P-1 참조 문구)은 note라 반영하지 않는다.

## 결과

- 공동 1회차(R3) fail, blocking 1(F11 — 같은 해시 pass 재등록 뒤 다른 해시의 새 주기 오집계), note F10.
