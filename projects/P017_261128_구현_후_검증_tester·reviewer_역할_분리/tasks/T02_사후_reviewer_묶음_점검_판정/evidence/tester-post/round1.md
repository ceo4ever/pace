```text
판정: fail
독립 목표 대조: 어긋남 — TASK.md를 읽기 전에 BR02와 `git diff HEAD -- src test`만 대조했다. 사후 reviewer가 세 묶음 12항목으로 전환됐지만, 경로와 이유를 비어 있지 않은 문자열만으로 인정해 근거 없는 답도 통과할 수 있다고 기록했다(src/agent/structured-review.ts:240).
목표 달성: 미달 — 임시 사본에서 `none`에 “없음”, `not_applicable`에 “해당 없음”만 쓴 응답이 각각 pass였다. 예산 소진 상태에서는 `verify`와 `review-hand` 모두 비-diff 대상에 tester 경로를 안내하지 않았다.
기준: T-1 fail — S-1은 고정 12개 ID와 `필요`·`생략` 간 동일성을 확인했다. 프롬프트에서 `RC-2`만 뺀 임시 사본도 S-1을 통과해 실제 출력의 항목 누락을 검출하지 못했다(test/agent-structured-review.test.ts:603).
      T-2 fail — S-2는 빈 값과 누락을 검출했다. 반면 경로·이유 없이 상태명만 반복한 답과 파일 위치·재현이 없는 `should_fix` 지적을 연결한 `defect`도 pass였다(src/agent/structured-review.ts:251, test/agent-structured-review.test.ts:625).
      T-3 pass — S-3에서 교착 F2와 소급 변경 F1은 각각 묶음 blocking으로 fail이었다. 원래 implementation·design 지적과 기준 재판정·계획 타당성 지적은 `outside_question` note였다(test/agent-structured-review.test.ts:652, evidence/negative-controls.md의 M2).
      T-4 fail — S-4에서 두 명령의 해당 모드별 TASK·diff 원문과 기존 7개 문장의 부재를 확인했다. 공통 단언은 6개 ID만 검사해 `RC-2`를 뺀 임시 사본에서도 S-4 세 시험이 모두 통과했다(test/helpers.ts:203).
      T-5 fail — S-5에서 일반 회차의 예약 전 거부와 owner 회차의 동일 해시 실행을 확인했다. 예산을 소진한 뒤 문서를 넣은 임시 사본에서는 두 명령 모두 종료 16과 `budget_exhausted`를 반환했고 tester 안내가 없었다(src/agent/verify-cli.ts:323, src/agent/review-hand.ts:182).
      T-6 pass — S-6에서 백로그·사전·scope 없는 프롬프트의 바이트와 `review-admission.ts` 해시가 기준값과 일치했다. 옛 R1~R5 재판정, `legacyStructureOnly` 회차·호출 수, 예산·stats도 일치했다(test/agent-structured-review.test.ts:707, test/agent-review-log.test.ts:961, test/project-review-metrics.test.ts:201).
      T-7 pass — 묶음 원문을 넣은 `verify` 시험에서 위치를 바탕으로 `recurring_area`·`superficial_fix`를 반환했고, 별도 원문 시험에서 `recurrence`가 판정과 저장 기록에 보존됐다. `review-signals` 회귀 시험도 통과했다(test/agent-review-log.test.ts:98, test/agent-structured-review.test.ts:116).
      T-8 pass — 두 attempt의 원문 JSON·stdout·저장 판정을 대조했다. 입력 7종의 패치·TASK 해시 기록은 BR02와 일치했다. 1차 unknown 5건, 2차 본표본 unknown 0/12·pass 2/12, 경계 합성 RA-2 2/2, T06 상태 RB-2 2/2·교착 0/2, 무해 대조 흐름 blocking 2/2가 요약과 일치했다. owner 결정에 따라 관측값만 대조했다(evidence/replay/summary.md:5).
      T-9 fail — `git status`와 `git diff HEAD --stat`에서 제외 기록을 빼면 변경은 허용된 소스·시험 12개 파일이었다. 기존 두 1단계 단언은 묶음 점검 문구로, 재검토 범위 단언은 전체 diff 재점검으로 의도적으로 갱신됐다. 판정 시점에 TASK-CLOSE.md가 없었다(test/agent-structured-review.test.ts:362, :459, :502).
signals: 지정 대상 시험 224/224 통과, 종료 0. `PACE_SKIP_BROWSER_E2E=1 npm run check`는 타입 검사를 통과했고 전체 시험에서는 부트·Canvas 등에서 실패가 출력됐다. 그중 두 건은 변경 전 소스의 임시 사본에서도 재현됐다. 전체 검사 종료 전이어서 대상 시험과 직접 대조로 판정했다. 시작 시 `REVIEW-LOG.lock`을 관측했다. `src test` diff SHA-256은 전후 동일했다(d82b67bc9b9935a483238ec3aae8b9054ed17dd90c005b8e130b525825926d8f).
```
