# 함수 전환 뒤 최종 세트:3회차 실패

새 세트는 `t05-function-final-2026-11-18T21-45-07-589Z`다. 원래 비계측 npm run check/Windows 기본4/회차별 임시 격리로 실행했고 이전 실패·진단과 합산하지 않았다.

| 회차 | 벽시계 ms | 종료 | tests/pass/fail/cancel/skip |
|---|---:|---:|---|
| 1 | 704920.2361999999 | 0 | 996/987/0/0/9 |
| 2 | 704630.4685 | 0 | 996/987/0/0/9 |
| 3 | 700394.1875000002 | 1 | 996/986/1/0/9 |

summary는valid:false/runs3이다. 저장된 중앙값704630.4685ms는 실패를 포함한 무효 세트의 기술값이며 P-6 통과나 달성 시간으로 사용하지 않는다. 최종 비교 도구는 실패를 거부하므로 final-views를 만들지 않았다.

실패는 변경하지 않은 `test/install-windows-wrapper.test.ts:107`의 `실제 Windows Git Bash에서 래퍼와 커밋 훅이 동작한다`이며121행의 경로 문자열 비교다. version 호출의 command -v 결과는 `/tmp/pace-test-XlS8m8/한글 space '$&()/.pace/bin/pace`, 별도 bash 호출의 cygpath 기대값은 `/c/Users/root-user/AppData/Local/Temp/pace-p004-run-3-BqH6VB/pace-test-run-AJ6lKH/pace-test-XlS8m8/한글 space '$&()/.pace/bin/pace`였다. 원문은run-3.log다. 같은 물리 파일의 별칭인지 아직 확인하지 않았다. 이 단계에서 실패해 뒤의 commit hook/인자 경로가 실행됐다고 주장하지 않는다.

함수 전환3개와 새 어댑터1건은 세 회 모두 통과했다. 이 사실은 전체 실패를 지우지 않는다. 원래 stale-lock 및 healer 관측과 이번 실패가 같은 원인이라는 근거는 없다.

runtime-t05-function의 시작/종료609개 파일 SHA는 모두 같다. HEAD·도구 SHA·기존 T04 증거 보존은 function-final-stopped-binding.json에 연결했다. snapshot은 연속 감시가 아니며 호스트 부하를 동결하지 않는다. 측정 중 실행 소스/도구를 바꾸지 않고 다른 검사/진단을 겹치지 않았다. 읽기/진행 메시지 부하는 정량화하지 않았다.

추가 시험/진단·재측정·Windows 시험/제품 수정은 하지 않았다. 원인 미확정 상태를 유지하고 main에 다음 좁은 조사 범위를 묻는다. T05마감/P-6/finish는 미완료다.
