```text
판정: fail
독립 목표 대조: 미확인 — TASK.md를 읽기 전에 BR01과 작업본 diff를 대조했다. TASK 선언·영향 범위, 사전 판정 규칙과 형식 검사, 마감 기록 서식을 확인했다. check·done의 CLI 시험은 줄 누락만 직접 다뤘고, 실제 제공자가 인수 사례를 구분했는지는 diff로 확인할 수 없었다.
목표 달성: 미달 — 지정한 대상 시험 192건은 모두 통과했다. 임시 사본에서 상반된 reviewer 선언 두 줄이 check·done·사전 verify·review-hand를 모두 통과해 BR01의 중복 거부 조건을 충족하지 못했다.
기준: T-1 fail — 두 템플릿의 현행 문구와 마감 서식은 기준에 맞는다. 임시 사본에서 변경과 무관한 기존 경로도 T-n에 포함하라고 안내를 뒤집어도 S-1이 통과했다. `test/project-templates.test.ts:86`
      T-2 fail — 정상 선언 뒤에 `- > 구현 후 reviewer: 생략 — 문구만`을 넣자 `reviewerLineIssues`와 `reviewIssues`가 문제를 보고하지 않았다. 임시 CLI 시험에서 check·done 모두 종료 0이었다. `src/project/pre-review.ts:88`, `test/project-harness.test.ts:2665`
      T-3 fail — 같은 중복 입력으로 사전 verify와 review-hand 모두 종료 0이었다. 올바른 `생략`을 review-hand에서만 거부하도록 바꾼 임시 구현도 S-4를 통과했다. `src/agent/verify-cli.ts:334`, `src/agent/review-hand.ts:181`, `test/agent-review-hand.test.ts:570`
      T-4 pass — S-5에서 옛 기록의 회차·호출 수가 각각 [1, 1]과 [0, 1]이었다. 새 줄 검사를 옛 구조 판정에 포함한 임시 결함은 시험이 검출했다. `test/agent-review-log.test.ts:958`
      T-5 pass — S-6에서 (가)·(다)는 유효 blocking으로 fail, (나)는 지적 없이 pass, (라)는 유효 should_fix로 pass였다. breadth 범주를 삭제한 임시 결함은 시험이 검출했다. `test/agent-structured-review.test.ts:493`
      T-6 pass — 두 회차의 입력 스냅샷 SHA-256과 JSON·stdout 원문을 확인했다. (가)는 선언 줄 20의 영속 쓰기 불일치, (다)는 T-3 줄 30의 기존 읽기 경로 편입이 유효 blocking이었다. (나)는 모든 범주에서 같은 내용·위치의 지적이 없었다. (나)의 도구 판정은 별도 scope·detection 지적 등으로 fail이었다. `evidence/behavior-run1/`, `evidence/behavior-{ga,na,da}.json`
      T-7 pass — `git status`와 `git diff`를 `evidence/s8-paths.md`와 대조했다. 제품·시험 변경 13개는 허용 경로에 있었다. 백로그 원문 변경은 없었고 대시보드는 생성 시각·건너뛴 수·현황 목록만 갱신됐다.
signals: `npm run check`는 타입 검사를 통과했고 부트·daemon 등에서 실패가 관측된 뒤 전체 종료 전에 중단했다. 부트 계열 두 건은 HEAD 사본에서도 재현됐으며 `PACE_AGENT_CHILD`를 제거하면 통과했다. 점검 중 `REVIEW-LOG.lock`과 미추적 검토 기록의 변동을 관측했다. 작업본은 편집하지 않았고 시작·종료 diff SHA-256은 모두 `581e4c4d82eb85f2e8a0744a51696095e9b1345e840c68cef987e59f7f5466e5`였다.
```
