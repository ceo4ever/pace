# 구현 후 2차 검토와 시간 출처 수정

- 동일 anthropic reviewer는 pass·blocking 0·should_fix 0이다. 원문 post-review-2.md.
- 동일 openai tester는 T-1/T-2 통과·T-3 실패다. 앞선 누락 결함의 해결은 확인했으나 저장 개별 시간 누락/변조가 순위에 반영됨을 재현했다. 원문 post-tester-2.md. PM은 남은 시간 출처 결함을 blocking 1·should_fix 0으로 정규화했으며 종합 막힘을 유지했다.

`report.ts`는 이미 읽은 원시 기본 로그에서 판정과 개별 시간을 다시 가져와 순위를 계산한다. 원시 항목과 저장 항목의 시간 누락/불일치도 timingDifferences로 기록해 기준 무효·종료 1로 거부한다. 정상 원시 시간 자체가 없으면 정상 순위를 확정하지 않는다. 따라서 저장 `durationMs`가 순위의 단독 출처가 아니다.

`measure.ts --self-test --label duration-source-fix`는 실제 Node 두 시험 자료를 사용해 종료 0·16점검을 완료했다. evidence/duration-source-fix-2026-11-18T11-07-03-465Z/의 report-missing-stored-duration은 첫 저장 시간만 삭제했고 report-wrong-stored-duration은 654321로 바꿨다. 원시 로그는 그대로다. 두 경우 모두 보고서 종료 1·기준 유효 false·timingDifferences 1건·정상 순위 0건이다. 정상 대조군 보고서는 종료 0이며 앞선 누락/잘린 JSON 주입도 계속 종료 1이다. report-integrity-checks.json과 각 원시/재대조 결과를 연결했다.

기존 baseline과 baseline-profile 보고서를 재생성했다. 기준 3회는 모두 유효·timingDifferences 0·중앙값 1425.464초를 유지하고, 정상 954개 그룹의 각 3회 시간도 유지한다. 기존 보조는 실패 1과 종료 1을 유지한다. 전체 검사를 재측정하지 않았다. 수정 코드 5개 strict tsc는 종료 0이다. 수정된 부분과 fixture 결과의 tester/reviewer 확인은 아직 대기다.
