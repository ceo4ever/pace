판정: fail  
독립 목표 대조: 어긋남 — TASK.md를 열기 전 BR01과 구현 diff를 대조했다. 템플릿과 사전 판정 규칙은 반영됐으나, check·done 통합 시험은 네 가지 형식 오류 중 줄 누락만 검증했다. 실제 제공자의 행동은 diff에서 확인할 수 없었다.  
목표 달성: 미달 — 지정 대상 시험 192건은 통과했다. 임시 사본에서 `생략` 선언 아래에 `1. 구현 후 reviewer: 필요 — 영속 저장`을 추가하면 상반된 두 판단이 남은 채 check·done이 통과하고 사전 호출도 예약됐다.

기준: T-1 pass — `test/project-templates.test.ts:73`, `:95`에서 기존 절 목록, 판단 줄 하나, 사실 질문 11개, 역할별 회차와 요청·회수 시각을 확인했다. 임시 사본에서 reviewer 회차를 비우자 시험이 실패했다.  
　　　T-2 fail — S-2·S-3과 네 오류를 넣은 추가 CLI 시험은 통과했다. 그러나 `src/project/pre-review.ts:88`은 순서 목록의 두 번째 선언을 세지 않아 check·done이 중복 진단 없이 통과했다.  
　　　T-3 fail — `test/agent-review-hand.test.ts:535`, `:570`은 네 오류의 예약 전 거부를 검증했고, verify의 예약 순서를 뒤집자 실패했다. 순서 목록 중복 재현에서는 두 경로 모두 `call` 행을 남겼고, verify 실행기 진입과 review-hand 고정본 생성도 확인했다.  
　　　T-4 pass — `test/agent-review-log.test.ts:958`에서 옛 v2 기록의 `[판정 회차, 호출]`이 각각 `[1, 1]`, `[0, 1]`로 유지됐다. reviewer 줄 누락을 옛 구조 오류로 세게 하자 시험이 실패했다.  
　　　T-5 pass — `test/agent-structured-review.test.ts:493`, `:551`에서 네 인수 사례와 프롬프트를 확인했다. 넓힘 지적을 `should_fix`로 강등하자 시험이 실패했고, 임시 CLI 재현에서 유효 blocking이 사전 관문을 막았다.  
　　　T-6 pass — 두 회차의 `behavior-*.json`·`.stdout` 원문에서 (가)는 `TASK.md:20` 판단 불일치, (다)는 `TASK.md:30`의 T-3 넓힘이 유효 blocking이었다. (나)는 범주와 무관하게 20행에 같은 내용의 지적이 없었다. (나)의 전체 판정은 다른 지적으로 두 번 모두 fail이었다. 2차 입력 해시는 일치했고, 1차는 보존된 해시 목록과 호출 기록을 대조했다.  
　　　T-7 pass — `evidence/s8-paths.md`, `git status`, `git diff`를 대조했다. `main...HEAD`와 인덱스 diff는 비어 있었고, 프로젝트 기록을 제외한 구현 변경 13개는 BR01 허용 경로에 있었다. 대시보드는 생성 시각·목록·건수만 바뀌었으며 백로그·브리프 본문은 그대로였다.

signals: `PACE_SKIP_BROWSER_E2E=1 npm run check`는 타입 검사를 통과했으나 전체 테스트에서 실패가 관측돼 대상 시험으로 판정했다. Gateway의 로컬 포트 `EPERM`은 변경 전 사본에서도 재현됐다. 작업본은 수정하지 않았으며 검사 전후 `git diff` SHA-256이 일치했다.
