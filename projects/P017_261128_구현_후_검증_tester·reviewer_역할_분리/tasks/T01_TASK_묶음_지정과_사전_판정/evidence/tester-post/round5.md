```text
판정: pass
독립 목표 대조: 맞음 — TASK를 읽기 전에 BR01과 작업본 diff만 대조했다. 필요·생략 선언, 변경 영향 경로로 기준을 한정하는 안내, 예약 전 형식 검사, 사전 reviewer의 두 판정 규칙, TASK-CLOSE 기록 서식이 BR01과 일치했다.
목표 달성: 달성 — 지정된 대상 시험 192개가 모두 통과했다. 전체 검사 종료가 지연되어 대상 시험, 임시 사본의 음성 대조, 행동 평가 원자료로 판정했다. 행동 평가는 Codex 한 제공자의 고정 사례 두 회차로 한정된다.
기준: T-1 pass — S-1에서 선언 한 줄, 사실 질문 11개, 기존 절 제목, 역할별 판정과 회차별 요청·회수 서식을 확인했다. 포함 안내를 반전하자 S-1이 실패했다(test/project-templates.test.ts:73, :96).
      T-2 pass — S-2·S-3과 임시 사본에서 두 검사 함수의 결과가 일치했다. 형식 오류 네 종류와 거부 대상 주석 입력에서 check·done은 같은 문구로 비영 종료했고, 정본 줄과 주석 접두 예시를 함께 두면 통과했다. 선언 후보의 원문 확인과 원문 동일성 검사를 각각 제거하자 S-2가 실패했다(test/pre-review.test.ts:43, test/project-harness.test.ts:2665).
      T-3 pass — 형식 오류와 거부 대상 주석 입력에서 사전 verify 실행기 0회, 두 경로의 call 행 0개·고정본 0개를 확인했다. 정본 필요·생략은 둘 다 통과했고, verify 실행기 진입 시 call 행이 이미 있었다. review-hand에서만 생략을 거부하자 해당 S-4만 실패했다(test/agent-review-hand.test.ts:535, :570).
      T-4 pass — 옛 원장의 [rounds, calls]는 줄 없는 v2에서 [1,1], 증명 범위 누락에서 [0,1]이었다. 새 줄 검사를 옛 기록 재판정에 섞자 S-5가 실패했다(test/agent-review-log.test.ts:958).
      T-5 pass — S-6에서 (가)·(다)는 유효 blocking·fail, (나)는 지적 없이 pass, (라)는 유효 should_fix·pass였다. 넓힘 지적을 should_fix로 낮추자 S-6이 실패했다(test/agent-structured-review.test.ts:493, :552).
      T-6 pass — behavior-*의 두 회차에서 TASK 해시 6개와 JSON·stdout 검토 원문이 일치했다. (가)의 영속 쓰기와 생략 판단 불일치는 TASK.md:20에서, (다)의 기존 읽기 경로 넓힘은 TASK.md:30에서 유효 blocking이었다. (나)의 원문은 두 회차 모두 필요 판단이 영속 쓰기와 일치한다고 명시했다. 도구 종합 판정은 다른 지적 때문에 fail이었고, 같은 내용·위치의 판단 불일치 지적은 어느 범주에도 없었다.
      T-7 pass — s8-paths.md와 현재 git status·git diff를 대조했다. main...HEAD와 인덱스 diff는 비어 있고 작업본의 제품 변경은 허용 경로 13개였다. 백로그 본문과 BR은 그대로였으며 대시보드는 프로젝트 기록 경로 두 개, 생성 시각, 제외 건수만 바뀌었다.
signals: npm run check는 타입 검사를 통과했다. 전체 시험에서는 부트·로컬 포트 등에서 실패가 관측됐고 종료는 확인하지 못했다. 변경 전 HEAD 사본에서도 대표 실패 3건을 재현했다. 시작 시 보였던 REVIEW-LOG.lock은 마지막 확인에서 사라졌고, 작업본 diff SHA-256은 전후 동일했다(476db9edb50ef0c3aa88bb596e11602dad4742b2ac3bfae7497ff5adebfb306c).
```
