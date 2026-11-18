# T01 독립 tester · 3차 검증

**판정 통과. T-1, T-2, T-3 통과.** 유효한 Windows 기준선과 병목 관측을 보존했고, 재사용 보고서가 누락·변경된 저장 시간을 거부했다.

- 임시 사본에서 `node measure.ts --self-test --label independent-self-test-round2`는 종료 0이었다. 기존 원시 행·저장 행·보조 이벤트 누락 및 잘못된 총계·잘린 JSON에 대한 실패 단언과 저장 시간 누락·불일치의 새 단언을 통과했다. `node measure.ts --runs 1 --label independent-normal-round2`의 실제 정상 Node 시험은 종료 0·유효 true였다. 같은 시험의 사례 행만 빼고 자식의 실제 요약과 종료 0을 유지한 `node measure.ts --runs 1 --label independent-missing-row-round2`는 종료 1·완전성 false·유효 false를 반환했다.
- 정상 Node 시험 2개의 원시 로그와 보조 데이터를 사용했다. `node report.ts <independent-profile-normal>`은 종료 0·유효 true였고 순위 두 건의 시간은 원시 0.584ms와 0.1185ms였다. 첫 시험의 저장 `durationMs`만 생략한 `node report.ts <independent-profile-missing-duration>`과 654321ms로 바꾼 `node report.ts <independent-profile-wrong-duration>`은 각각 종료 1·기준 유효 false, 순위 0건이었다. 이름·판정과 총계는 일치했고 `timingDifferences`가 원시 시간 0.584ms와 각각 null 및 654321ms의 차이를 기록했다.
- `node report.ts <보존 기준선 사본>`은 종료 0이었다. 세 회차 각각 963건·954 통과·실패 0·9 건너뜀, 중앙값 1425.464초와 절반 712.732초를 유지했다. `node report.ts <보존 보조 관측 사본>`은 알려진 wrapper 실패로 종료 1, 보조 유효 false, 기준 유효 true를 유지했다. 파일 94개와 정상 시험 954개×3회, 최대 파일 540.390초, 최장 정상 시험 176.929초를 다시 확인했다.

작업 트리 수정과 전체 검사 재실행은 없었다. 보조에서 관측한 중첩 시험 실패는 T03 인계 사항이다.