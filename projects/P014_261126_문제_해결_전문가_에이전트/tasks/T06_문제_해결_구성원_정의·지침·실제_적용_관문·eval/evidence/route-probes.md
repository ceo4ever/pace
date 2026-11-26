# 호출 수단 설계 실측

2026-11-26 macOS worktree의 격리 Git 저장소와 임시 `PACE_HOME`에서 짧은 픽스처 역할로 두 기존 수단을 조사했다. 본문을 적용한 최종 역할 관측은 S-2에서 반복한다.

| 수단 | Claude | Codex |
|---|---|---|
| 호스트 native | `pace team sync`의 모델·effort와 자식 원장 한 행이 일치했다. 자식 Agent 결과 모델 `claude-fable-5-2`, 자식 종료 훅 effort `high`. | 격리 호스트의 named spawn 수락 한 건을 관측했다. 부모 호스트는 자식의 런타임 model/effort를 둘 다 보고하지 않았다. 실제값 미확인. |
| `pace agent run --mode p`와 명시 인자 | Claude 실행 결과의 보고 모델 `claude-fable-5-2`, 같은 실행 세션의 `Stop` 훅 `effort.level=high`. | 실행 호스트 머리글의 모델 `gpt-6.2-astra`, `reasoning effort=medium`. 보고 모델·effort가 모두 요청과 일치했다. |

직접 실행을 두 호스트 공통 기본으로 정했다. 한 호출의 응답·런타임 증거와 역할, 요청 모델/effort, 결과 분석을 함께 묶을 수 있다. Claude native는 같은 필드의 직접 관측을 얻을 수 있는 대체 경로다. Codex native는 이 실측에서 관문에 쓸 수 없다. 기본 모델 거부 시 다른 모델을 실행하지 않고 PM에게 보류와 근거를 돌려준다. 정해진 모델의 런타임 관측이 불일치하거나 미확인인 경우에는 같은 모델을 보존하는 경로만 다시 시험한다.

공식 [Claude 훅](https://code.claude.com/docs/en/hooks)과 [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)를 참고했다. 관측한 값은 [격리 실측](route-probes.json)에 기록했다.
