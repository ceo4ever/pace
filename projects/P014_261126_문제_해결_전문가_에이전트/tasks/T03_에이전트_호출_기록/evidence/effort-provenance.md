# T03 실행 설정의 출처

2026-11-26, Codex CLI 0.171.0. 임시 일반 폴더에서 `pace agent run --agent codex --mode p --model gpt-6.2-sol --effort medium --raw-dir …`로 고정 응답을 요청했다. 종료 0 및 `stop_reason: completed`; 결과가 보고한 모델은 `gpt-6.2-sol`이다. 실행기 원본 머리글에 `provider: openai` 및 `reasoning effort: medium`이 있었다. 해당 머리글 필드만 실제 effort 출처로 사용한다. 원본 프롬프트·응답·세션 정보는 보존하지 않았다.

ACP 합성 실행에서 `session/set_model` 응답은 빈 객체이고 의도 모델은 `other-model`이었다. 구판 실행기는 요청 문자열을 보고값으로 복사했다. 현재 실행기는 이를 요청값으로 반환하고 호출 행의 실제값은 null·미확인으로 남긴다. `test/agent-acp.test.ts`와 `test/agent-calls.test.ts`가 이 동작을 대조한다.

전체 검사의 탐침·A-3 회귀 세 건이 새 자동 호출 원장의 정확한 경로를 허가 범위 밖으로 판단했다. 이 원장을 프로젝트와 해당 백로그의 기존 관리 파일과 함께 같은 검증에 넣고, 일반 파일 종류·위치 확인을 유지한다. 기존 테스트의 기대값은 유지한다.
