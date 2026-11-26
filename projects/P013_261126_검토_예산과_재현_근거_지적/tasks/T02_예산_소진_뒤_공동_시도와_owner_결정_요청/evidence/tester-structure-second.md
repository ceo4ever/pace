**P013 T02 목표 대조는 미달입니다.** 같은 원인의 구조 진단을 예약한 순서와 실행한 순서가 다르면, 직전 실행의 지문을 담은 재진단은 차단되고 이미 적용한 조치가 다시 실행됩니다. T-5와 S-7의 계약을 위반합니다.

| 확인 범위 | 판정과 재현 근거 |
|---|---|
| T-5 구조 진단 재사용과 허브 재진단 | **Fail.** 임시 태스크의 사전·사후 단계에서 같은 원인의 진단을 A → B 순서로 예약하고 B → A 순서로 실행했습니다. 다음 확인에서 A 지문과 새 조치를 제출하자 종료 16과 `refer_hub_structure`가 반환됐습니다. 반대로 B 지문과 직전에 적용한 A의 조치를 제출하자 예약과 실행이 모두 종료 0이었고 실행기가 1회 호출됐습니다. `repeatedDiagnosis`가 실행 순서 대신 예약 기록 순서에서 마지막 진단을 고릅니다. [review-followup.ts](/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t02-structure-r2-tester/work/src/agent/review-followup.ts:194) |
| 태스크 판정표 | 표 주도 시험 26건은 통과했습니다. 같은 원인의 새 예약 행에 대응하는 시험은 `structureRepeated`를 직접 주입해 실행 분기만 확인합니다. 실제 원장에서 직전 진단을 고르는 오류는 위 명령 재현에서 드러났습니다. [agent-review-followup.test.ts](/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t02-structure-r2-tester/work/test/agent-review-followup.test.ts:525) |
| T-2 최초 전체 검토 복구 | **Pass.** 유효 판정 0회로 호출 상한에 도달한 뒤 무기록 복구와 해시 불일치는 종료 16, 근거 파일 누락은 종료 2였습니다. 근거와 해시가 맞을 때 전체 검토가 1회 실행됐고 `rereview_of`는 `null`이었습니다. 복구 판정이 `fail`이어도 일반·공동 검토와 추가 복구는 계속 차단됐습니다. |
| F1·F5 영향 회귀 | **Pass.** F1은 owner 승인 회차의 `pass` 뒤 공동 기록 종료 2, 후속 실행 종료 16, 추가 실행 0회를 확인했습니다. F5는 B1 대체의 `cross: false`와 교차 timeout 사유가 응답·검토 기록·원장·사후 보고에 모두 남았습니다. |

`impl-diff.patch`의 SHA-256은 `2816b305815f40a3fc6e8daa91bc62ad3f81626db567f240a3de98a9390c38ed`와 일치했고 역적용 검사도 통과했습니다. `npm run typecheck`와 지정된 5개 테스트 파일은 모두 통과했습니다. 테스트는 106건, 실패·건너뜀은 0건입니다. 전체 검사는 별도 실행 범위이며 작업 사본의 파일은 편집하지 않았습니다.

독립 fail