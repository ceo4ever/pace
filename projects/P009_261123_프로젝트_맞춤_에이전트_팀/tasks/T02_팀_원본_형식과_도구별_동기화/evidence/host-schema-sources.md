# 호스트 정의 형식 근거 (2026-11-24)

- Claude 공식 문서: https://code.claude.com/docs/en/sub-agents — name/description 필수, model 전체 ID와 effort 필드를 지원한다고 명시한다. 이름 예시에 reviewer-v2가 있고 시작 하이픈·콜론·길이 초과는 제외한다.
- Codex 공식 문서: https://learn.chatgpt.com/docs/agent-configuration/subagents — .codex/agents TOML의 name/description/developer_instructions와 model/model_reasoning_effort를 명시한다.

이 문서 대조는 필드 규격의 근거이며 실제 호스트 실행·권한 집행을 대체하지 않는다. TOML·YAML 파서 실측과 Claude 정적 CLI 검증(누락 description 음성 대조 포함)은 별도 결과 파일에 보존했다. 단일 Markdown 파일에 plugin validate를 직접 쓰면 JSON manifest로 해석하므로 실패하며 그 결과를 agent 파일 거부로 해석하지 않는다. 정상 파일의 contents 배열이 비어도 음성 대조에서 같은 파일을 description 없이 바꿨을 때 검출되는지 별도로 확인했다.
