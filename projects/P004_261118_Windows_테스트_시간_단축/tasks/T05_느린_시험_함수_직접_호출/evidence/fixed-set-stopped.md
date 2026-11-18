# 수정 뒤 새 세트 중단

새 세트 `t05-fixed-final-2026-11-18T19-38-37-695Z`도2회차 실패로 자동 중단했다. 세 번째 회차는 미실행이다.

| 회차 | 벽시계 ms | 종료 | tests/pass/fail/cancel/skip |
|---|---:|---:|---|
| 1 | 709176.2479 | 0 | 995/986/0/0/9 |
| 2 | 714000.5572 | 1 | 995/985/1/0/9 |
| 3 | 미실행 | — | — |

실패는 `test/backlog-dashboard.test.ts:388`의 `simultaneous stale-lock recovery serializes writers without leaving generated files`다. 401행은8개 자식 종료코드 모두0을 기대했지만 실제 `[0,0,0,0,0,0,1,0]`이었다. 원래 시험은 stdio ignore로 자식 출력을 버려 종료1의 실제 오류는 남아 있지 않다. 원인은 미확정이다. 첫 무효 세트의 Telegram timeout과 같은 원인이라고 주장하지 않는다.

승인된 Telegram 시험은 새 두 회 모두 통과했다. 그 사실이 전체 세트 실패를 없애거나 모든 부하에서 재발하지 않는다는 증명은 아니다. 이전 통제 지연·rollback 변이는 별도 진단이다.

runtime-t05-fixed의607개 시작/종료 파일 SHA는 모두 같다. 첫 세트 대비606개는 그대로이고 telegram-flow 대상1건의 주입 조건과 추가 단언만 바뀌었다. 원래 네 단언과 대상 블록 바깥 byte는 동일하며 source-change에 정확한 SHA쌍을 기록했다. HEAD는46fdf68이고 실행 파일 변경은 미커밋 상태로 launch에 명시돼 있다. source snapshot은 연속 감시가 아니며 호스트 부하를 고정하지 않는다.

summary valid:false/runs2를 유지하며 두 회의 중앙값은P-6에 사용하지 않는다. 최종 비교 도구는 실패 입력을 거부하므로 final-views를 만들거나 성공 보고서를 생성하지 않았다. 추가 반복/부분 진단/대시보드 코드 변경 없이 main에 다음 범위를 묻는다. 기존 프로젝트 메모리의 '대시보드 잠금 복구와 호환성' 이슈는 미실측 경계이며 이번 원인의 확정 근거는 아니다.
