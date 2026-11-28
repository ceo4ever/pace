# T01 사전 검토 예외 — owner 결정(A-3)

- 결정 주체: owner (2026-11-28 허브 대화, 허브 Orca 회신 msg_479a31584f62로 전달)
- 원문 선택지: "줄이고 예외로 진행 (Recommended)"
- 대상: P017 T01 `TASK.md` reviewHash 87c738882491f2ceae818d234697584d3a983ba06ebc7696fab9a8fc1276e67c (R9 지적 반영·축소 뒤 판)
- 직전 판정: review-records/R9.json — owner 허용 전체 재검토(2차) fail, blocking 3(F1 S-7·F2 S-8·F3 S-1), 예산 rounds 소진
- 결정 내용:
  1. F3 반영 — 요청 시각=PM 검증 요청, 회수 시각=판정 결과 수신을 TASK S-1·TASK-CLOSE 템플릿 안내·S-1 시험에 명시.
  2. F1·F2 축소 — S-7·S-8의 기계 성공 조건을 지우고 "구현 후 tester가 원자료를 BR01 인수 사례 (가)(나)(다)·바꾼 경로 기준과 대조해 판정, 원자료·판정을 evidence에 남김"으로 바꿈(BR01 원문이 tester 판정).
  3. 수정한 TASK 해시에 PRE-REVIEW waiver(by user)를 기록하고 구현 진행. 남은 F1·F2는 TASK-CLOSE 한계로 적고, 구현 후 tester·reviewer 검증은 그대로 받는다.
- 게이트가 예외를 거부하면 거부 메시지 원문을 그대로 허브에 보고한다.
