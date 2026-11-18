# T01 독립 tester · 2차 검증

**판정 실패. T-1·T-2 통과, T-3 실패.** 독립 목표 대조는 맞음이다. 유효한 기준선과 병목 관측은 확보했고, 재사용 보고서의 저장 시간 누락·불일치 처리가 남았다.

- 임시 사본의 `node measure.ts --self-test --label independent-self-test-round2` 및 정상 1회 `node measure.ts --runs 1 --label independent-normal-round2`는 종료 0이었다.
- 원래 실패 재현을 다시 돌렸다. 실제 Node 시험 1개가 통과한 뒤 사례 행만 제거한 `node measure.ts --runs 1 --label independent-missing-row-round2`는 자식 종료 0이어도 측정 종료 1, `complete: false`, `valid: false`로 판정했다. 실제 Node 시험 2개의 보조 이벤트 중 1개를 없앤 `node report.ts <independent-profile-missing-event>`는 종료 1, 보조 유효 false, 결과 1개·요약 2개와 파일별 누락을 표시했다. 정상 보조 보고서는 종료 0이었다. 깨진 NDJSON, 파일 요약 누락, 잘못된 entryFile, 저장 시험 행 누락, 중앙값 불일치는 각각 종료 1이었다.
- 새로 확인한 T-3 문제는 저장 시험 행의 **시간만** 사라지거나 바뀌는 경우다. 실제 정상 2개 시험에서 첫 시험의 원시 0.5852ms는 유지했다. 저장 결과의 `durationMs`만 제거한 `node report.ts <independent-baseline-duration-omitted>`는 종료 0과 기준 유효 true를 반환하고 순위에서 첫 시험을 빠뜨렸다. 654321ms로 바꾼 `node report.ts <independent-baseline-duration-wrong>`도 종료 0과 기준 유효 true를 반환하고 해당 값을 순위에 넣었다. `report.ts`의 기준 재대조는 이름·판정 다중집합을 비교하고 순위는 저장 `run.inventory`를 사용한다. 순위를 검증한 원시 항목에서 만들거나 저장 시간과 원시 시간을 대조해야 한다.
- 보존한 증거를 복사해 `node report.ts <기준선 사본>`은 종료 0, `node report.ts <보조 관측 사본>`은 기존 wrapper 실패로 종료 1이었고 기준선 유효성은 true였다. 기준 3회 각각 963건·954 통과·실패 0·9 건너뜀, 기준 중앙값 1425.464초, 절반 712.732초를 재확인했다. 원시 정상 시험 이름·시간 954개가 저장 자료와 매 회차 일치했다. 보조 94개 파일과 963개 이벤트는 집계상 완전했다. 정상 순위 954개×3회, 최장 정상 시험 176.929초, 최대 파일 540.390초, 보조 파일 합계 1403.776초와 간극 28.615초가 보존됐다.

재검증은 임시 사본에서 수행했고 전체 검사는 반복하지 않았다. 기존 원시 자료는 유효하며 수정·검증 범위는 재사용 보고 도구와 작은 fixture다.