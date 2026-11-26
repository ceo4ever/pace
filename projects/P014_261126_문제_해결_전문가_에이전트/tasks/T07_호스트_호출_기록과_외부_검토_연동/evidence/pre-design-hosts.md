# T07 호스트 후속 실측

2026-11-26. 임시 Git 저장소와 안전한 고정 응답 픽스처를 사용했다. 세션·자식 식별자 원문, 프롬프트, 응답과 인증 설정은 근거에 포함하지 않았다. [T03 시작·종료와 구판 재현](../../T03_에이전트_호출_기록/evidence/pre-design-host-and-size.md)

| 호스트 | 실행에서 확인한 값 | 적용 경계 |
|---|---|---|
| Claude Code 2.1.332 | `SubagentStart`와 `SubagentStop`에 각각 자식 식별자와 역할이 있었다. `SubagentStop.effort.level`에 픽스처 자식의 `low`가 있었다. `PostToolUse`에서 `tool_name=Agent`와 부모 effort `medium`이 나타났고 자식의 보고는 `tool_response.agentId`, `agentType`, `resolvedModel=claude-opus-5-5`, `status=completed`, `totalDurationMs=881`, `totalTokens=2243`이었다. | 부모 effort는 자식 실제값에 쓰지 않는다. 종료 훅에서 자식 설정을, Agent 도구 결과에서 자식 모델·시간·토큰을 읽는다. 토큰의 범위는 호스트가 보고한 값이다. [Claude 훅과 Agent 응답](https://code.claude.com/docs/en/hooks) |
| Codex CLI 0.171.0 | 임시 Git 저장소의 훅 구성은 신뢰 확인 전 비활성화됐다. `--ephemeral`에서는 자식 스레드 저장소 오류가 났다. 영속 스레드 실행을 별도 재현하자 로컬 실행 기록에 실제 `spawn_agent`가 한 번 성공해 자식 이름을 반환했고 대기를 수행했다. 프로젝트 훅은 실행되지 않았다. 자식의 개별 시간·토큰·실제 모델은 이 실행의 대기 보고에서 확인되지 않았다. | 신뢰되지 않은 훅을 자동 승인하지 않는다. 실제 Codex 호출의 PM 수동 기록을 시험한다. 호스트가 보고하지 않은 값은 미확인으로 둔다. [Codex 훅 신뢰](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) |

Claude 정상 종료의 주입 코드와 Codex 수동 기록은 구성별로 실측한다. Claude가 시작 뒤 작업을 거부해 종료 훅이 없었던 T03 실측은, 종료 상태를 입증하는 다른 근거 없이는 완료로 표시할 수 없다는 대조다.
