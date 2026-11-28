```text
판정: fail
독립 목표 대조: 미확인 — TASK를 읽기 전에 BR01과 작업본 diff만 대조했다. 템플릿 안내, 사전 형식 검사, 필요·생략과 기준 범위의 판정 규칙은 확인했다. 실제 검토 결과가 인수 사례별로 갈리는지는 diff만으로 확인할 수 없었다.
목표 달성: 미달 — 지정 대상 시험 192개는 모두 통과했으나, 주석으로 끊긴 허용 값이 check·done과 두 사전 검토 경로를 통과했다.
기준: T-1 pass — S-1에서 선언 한 줄, 사실 질문 11개, 기존 절 목록, 두 역할의 판정·회차별 시각 서식을 확인했다. 임시 사본에서 포함 안내를 반전하자 S-1이 실패했다(test/project-templates.test.ts:73, :96).
      T-2 fail — S-2·S-3은 통과했다. `- 구현 후 reviewer: 생<!-- 설명 -->략 — 이유`는 허용 값 문법에 맞지 않지만, 검사 전에 주석 양쪽을 이어 붙여 `생략`으로 처리한다. 임시 사본에서 check·done 모두 종료 코드 0을 확인했다(src/project/pre-review.ts:34, :84, test/project-harness.test.ts:2665).
      T-3 fail — S-4는 통과했고 review-hand가 정상 `생략`을 거부하도록 바꾸자 S-4가 실패했다. 그러나 T-2의 입력으로 사전 verify는 실행기 1회와 call 행을, review-hand는 call 행과 고정본을 남겼다(src/agent/verify-cli.ts:335, src/agent/review-hand.ts:181).
      T-4 pass — S-5에서 reviewer 줄만 없는 옛 v2 기록은 판정 1회·호출 1회, 증명 범위가 없는 기록은 판정 0회·호출 1회로 집계됐다(test/agent-review-log.test.ts:958).
      T-5 pass — S-6에서 두 사전 질문과 지시 문구를 확인했다. 모의 원문의 (가)·(다)는 유효 blocking, (나)는 지적 없음, (라)는 유효 should_fix로 처리됐다(test/agent-structured-review.test.ts:493, :552).
      T-6 pass — 두 회차의 고정 입력 해시와 JSON·stdout 원문을 대조했다. (가)는 선언 줄 TASK.md:20, (다)는 넓힌 기준 T-3의 TASK.md:30에서 각각 유효 blocking이었다. (나) 원문에는 범주를 불문하고 (가)와 같은 내용·위치의 판단 불일치 지적이 없었다. (나)의 도구 판정은 별개 지적으로 두 회차 모두 fail이었다(evidence/behavior-run1, evidence/behavior-{ga,na,da}.{json,stdout}).
      T-7 pass — s8-paths.md와 현재 git status·git diff를 대조했다. 구현 변경 13개는 허용 경로에 있었다. 대시보드 본문 데이터는 같았고 생성 시각·목록·집계만 바뀌었다. 그 밖의 변경은 프로젝트 진행 기록이며 백로그·브리프 본문 변경은 없었다(evidence/s8-paths.md:25).
signals: PACE_SKIP_BROWSER_E2E=1 npm run check에서 타입 검사는 통과했고 부트·OPAL·daemon 등에서 실패가 관측됐다. 부트·OPAL 표본 4건은 PACE_AGENT_CHILD를 제거한 재실행에서 통과했다. 전체 검사 완료를 기다리는 대신 지정 대상 시험과 직접 재현으로 판정했다. 작업본·인덱스 diff SHA-256은 전후 동일했다. 처음 보인 REVIEW-LOG.lock은 마지막 확인에서 사라졌고, 검사 중 직접 수정한 작업본 파일은 없다.
```
