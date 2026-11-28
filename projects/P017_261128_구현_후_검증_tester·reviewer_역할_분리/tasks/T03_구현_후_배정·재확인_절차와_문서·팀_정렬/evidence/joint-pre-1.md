# T03 사전 검토 공동 시도 1회차 근거

- 계기: 사전 verify budget_exhausted(stage pre, rounds 2/2), joint_attempts 0.
- 직전 지적: R1(fail, blocking 4 — F1~F4), R2(rereview, fail, blocking 3 — F1~F3). 모두 category detection(문서 대조 시험의 검출력). 원문은 review-records/R1.json·R2.json.
- 허브 결정(main 판단, 2026-11-28, Orca 회신): 같은 시험 행(S-1·S-5·S-6)이 2회 연속 blocking이라 덧붙이지 않고 줄인다. owner 예외 대신 공동 검토 1회로 확인. 목적·범위·기준 변경 없음 → A-1·A-3 아님. 공동 1회차에도 detection만 남으면 고치지 않고 원문 보고, scope·observable의 실제 결함이면 교체 위주 반영 후 공동 2회차.
- 적용 조치: S-1·S-2·S-4·S-5·S-6의 열거 기대 결과를 지우고 tester가 BR03 완료 기준·사례 대조표 원문과 바꾼 문서, `git diff 9756e3d`를 직접 대조해 판정하도록 줄였다(회차별 시각 필수 문구는 원문 대조 대상, S-5 행에 명시). S-3(unit)은 R1 F2 근거 규칙을 한 줄로 압축. TASK 3874자(R1 3891자 이하).

## 결과

- 공동 1회차(R3) fail, blocking 3 — 모두 category detection(F1 회수 시각 출처 금지 대조, F2 기존 변경과 구현 추가 변경·미추적 파일 귀속, F3 verification.md 역할 표 대조). 허브 결정대로 고치지 않고 원문 보고.
