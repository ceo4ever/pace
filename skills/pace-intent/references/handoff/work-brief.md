# Work brief for another AI (route A)

Use when the result of route A is a task for another AI agent (Claude Code, Codex, a chat model) to carry out — complex, multi-file, ambiguous, or agentic work. Not needed for a one-shot question.

Fill every section from the plan; write the brief in the user's language. Section headings below are the output (Korean by default). Copy decisions in — never write "as discussed". Remove secrets; name environment variables instead.

```md
## 목표
<무엇을 만들거나 고치거나 내놓는지 한 문장. 접근에 영향을 주면 왜도 한 줄>

## 맥락
<지금 있는 것 — 관련 파일, 현재 동작, 이미 정한 스택, 해 봤다가 안 된 것, 이번 대화의 결정>

## 목표 상태
<끝났을 때의 모습 — 바뀐 파일, 만들어지는 동작, 통과하는 테스트. 가능하면 예/아니오로 갈리게>

## 범위
- 작업할 곳: <파일·폴더>
- 건드리지 않을 곳: <.env, 잠금 파일, 설정, 범위 밖 전부>

## 제약
- <스택 버전, 이름 규칙, 새 의존성은 묻고 추가>
- 요청한 것만 바꾼다. 요청 밖 기능·추상화·파일을 더하지 않는다.

## 완료 기준
- [ ] <예/아니오로 확인되는 항목 — GWT에서>
- [ ] …

## 행동 경계
- 되돌릴 수 있고 범위 안인 조사·수정·검증은 진행한다.
- 삭제·되돌리기 어려운 일, 외부 쓰기, 결제, 범위의 큰 확장, 사용자만 정할 결정 전에는 멈추고 묻는다.

## 진행 증거
오래 걸리는 일은 상태가 바뀌거나 단계에 이를 때만 알린다. 완료 주장은 도구 결과·바뀐 파일·검증 출력에 근거한다.
```

For coding agents that keep sessions (e.g. Claude Code), add when relevant:

```md
## 세션 방식
- 새 세션 — 앞 맥락과 무관
- 이어서 — 앞 맥락이 필요
- 하위 에이전트 — <독립적이고 큰 작업>만 맡기고 결과물을 정한다
- 먼저 압축 — <결정·제약·현재 상태> 중심으로 압축한 뒤 시작
```

Where each section comes from: 목표 ← purpose-ladder · 맥락 ← collection summary, decision-record · 목표 상태 / 완료 기준 ← gwt · 범위 ← moscow (Won't → 건드리지 않을 곳) · 행동 경계 ← pre-mortem (stop-and-ask triggers) · then run the diagnostic checklist (review/diagnostic-checklist.md).

Source: adapted from nidhinjs/prompt-master `references/templates.md` "Template M — Current Claude Task Brief" (MIT License, commit 49b3a72469b1e7287d66387004ccfcca90e5968a) — translated to Korean output headings, bracket hints rewritten, effort note dropped, lens sources added. See [../SOURCES.md](../SOURCES.md).
