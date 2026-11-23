# T01 전체 검사 차단 근거

P009 시작 커밋은 e4129f5다. 기능 관련 3개 추가 시험과 독립 tester의 project-log/project-metrics 21개 시험, 문서 gate는 통과했다. 첫 npm run check도 1034개(1017 pass·17 skip)로 통과했지만, 이후 전체 검사에서는 기존 경로 2건이 실패했다.

| 실행 | 결과 | 근거 |
|---|---|---|
| 첫 전체 검사 | pass | check-first-pass.txt |
| 변경 후 전체 검사 | fail | check-final-fail.txt: Telegram S-9g offset 및 playbook S-11 menu |
| Telegram S-9g 단독 | pass 1/1 | node --test --test-name-pattern S-9g test/telegram-flow.test.ts, 214ms |
| 브라우저 S-11 단독(현재 작업본) | fail | healer-e2e.test.mjs:184, menu screen-mismatch / needs-approval |
| 시작 커밋 사본의 동일 브라우저 시험 | fail | base-browser-repro.txt, e4129f5 git archive와 export-ignore된 test/를 git show로 복원 |

세 번째 브라우저 실패까지 같은 menu 승인 재개 구간에서 expected done, actual screen-mismatch, heal needs-approval / screen-path-changed가 나온다. 재현 사본에는 P009 변경을 넣지 않았다. 실행된 시험은 1건이고 건너뛰지 않았다.

기술적 원인은 아직 확정하지 않았다. 조사 후보: healer.mjs:124의 candidateHash가 prepared recordHash·shotSha256·boxHash를 포함하고, :225~235 prepare가 승인 후 재호출에서도 재캡처해 후보 해시를 재생성한다. 이 값이 달라져 이전 승인이 매칭되지 않는지 추가 진단이 필요하다. 어떤 승인 검사도 약화하거나 건너뛰지 않았다.

Telegram S-9g는 mock 응답 문구 관측 직후 offset을 즉시 단언하지만 adapter의 advance는 handleUpdate가 돌아온 뒤 실행된다(adapter.ts:250대·269, 시험 404행). 단독 실행은 통과해 경합 가능성이 있지만 원인 확정이나 수정은 하지 않았다.

P009 T01 필수 산출은 구현·실측·두 기준선까지 마련했다. tester의 effort 불일치 지적은 검토 중 파일 갱신 시점 차이가 있었고 현재 표는 원장의 medium으로 수정돼 있다. should_fix(복구 영수증·원문 명령/도구 메타·기간 중첩·미확인 손작업·수신자 불명 1건·escalation 예시·CLI 도움말)는 보완했고, 막힘 해소 뒤 파일을 고정한 상태에서 tester/reviewer를 다시 받아야 한다. TASK-CLOSE·project check·done·커밋은 아직 하지 않았다.
