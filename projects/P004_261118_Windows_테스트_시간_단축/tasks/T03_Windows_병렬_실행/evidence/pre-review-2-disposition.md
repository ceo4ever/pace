# 안정성 우선 선택의 사전 재검토 처리

동일 anthropic reviewer의 pass(blocking0·should_fix3), 실제 TASK 해시 `b8db38246827bdd04edc71ec5ecb3e262b76347112b29f7a000cba9dbff913c7`와 원문은 `pre-review-2-stability.md` 및 PRE-REVIEW 마지막 시도에 연결했다. 이전 TASK 정본도 `task-before-stability-amendment.md`에 보존했다.

1. SF-1: S-2의 서로 다른 PID 확인은 충분조건이 아니다. 실제 시험은 동일 두-worker marker/release 배리어를1에서 RED·2에서 GREEN으로 확인하고, 두 PID가 다르면서 `max(entered) <= min(passedAt)`인 시간 겹침을 단언한다. 구현 원문은 test-command의 runner npm 시험이며 초기 RED/수정 후 GREEN은 `runner-red.tap`, `runner-green.tap`, 후보4 반영 뒤 기존 포함8건은 `candidate4-focused.tap`에 있다. TASK 기준은 바꾸지 않고 이 처리 기록에서 S-2의 실제 의미를 연결한다.
2. SF-2: 실패8의 source-used 두 사본이 당시 시작 SHA와 같음을 먼저 확인했다. `record-validation.ts`는4의 runner가 그 사본의 기본값8→4 한 변경, 시험도 첫 기대8→4 한 변경임을 byte 단위 비교한다. 나머지94개 test·helper·측정5개 도구 SHA는 그대로다. 진단/검증 도구는 projects 아래에 있고 정상 test glob95개에 들어가지 않는다. Node 계측/trace env가 없고 기본 Node argv가 test/concurrency4/전체glob뿐임을 확인한다. 의도적 browser skip/debug 보존도 거부한다. 부수 변경은 승인 TASK/PRE/PROJECT·검사 문서·사건/진행 기록과 진단·증거다. 원인 수정으로 해석하지 않는다.
3. SF-3: `stability-selection-decision.json`을 approved-for-validation·appliedDefault4로 확정하고 이번 검토 경로·TASK 해시를 연결했다. `candidate4-validation-launch.json`은 확정 결정 SHA·검토·후보4·기본 argv·source 차이를 기록한다. 선택 결정은 측정 중 바꾸지 않으며, `assess-selected.ts`는 숫자 인자 대신 이 결정 자료를 읽고 원래 비교의 초기8·8 실패·4 비교2회 정상 및 launch 결정 SHA를 대조한다. 새5회가 성공하기 전에는 결과 통과로 표시하지 않는다.

실행 직전 집중8건과 진단/검증 도구 strict tsc가 통과했다. 새5회가 종료되면 source-boundary를 먼저 기록한 뒤 assess-selected를 실행한다. 실패·취소·중단·실제 source 차이면 원문을 보존하고 즉시 main에 올리며 다른 검사 재시도는 하지 않는다. 실제4의 실패0 관측은8 실패의 원인이나4에서 재발 불가능을 증명하지 않는다.
