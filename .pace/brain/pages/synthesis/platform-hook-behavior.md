---
type: synthesis
title: 도구별 세션 시작 훅 동작 (실측)
summary: "호스트별 부트 훅 실측과 최신 공식 문서: Codex 약 2,500토큰, Cursor 비차단, Antigravity 시작 훅 지원"
tags: [hooks, platform, claude, codex, cursor, antigravity, gemini]
sources: [실측:2026-10-22, url:https://learn.chatgpt.com/docs/hooks, url:https://geminicli.com/docs/hooks/reference/, url:https://forum.cursor.com/t/how-do-i-configure-a-global-rules-file-that-gets-picked-up-by-agent-mode/157335, code:src/setup/install.ts, url:https://cursor.com/docs/hooks, url:https://antigravity.google/docs/hooks, url:https://antigravity.google/docs/rules/]
related: [session-boot-via-hooks, llm-cannot-speak-first]
created: 2026-10-22
updated: 2026-11-27
status: active
---

| 도구 (버전) | 시작 훅 | 실측 결과 | PACE 대응 |
|---|---|---|---|
| Claude Code 2.1.30x | `SessionStart` | 세션을 열 때 실행, `systemMessage`가 "SessionStart:startup says:"로 화면에 보임 | 훅 + 화면 인사 |
| Codex 0.163 | `SessionStart` | **첫 메시지 턴에 실행**(열기만 하면 아무 일 없음). 새 훅은 `/hooks`에서 신뢰 승인 필요, 승인된 훅은 목록에 안 보임 | 훅 + developer_instructions 대체 규칙 |
| Gemini CLI 0.35 | `SessionStart` | 문서상 `additionalContext` 지원 (실측 안 함) | 훅 |
| Cursor 3.26 | `sessionStart` | 등록돼도 **한 번도 호출되지 않음**(설치 전 열린 창). `~/.cursor/rules/*.mdc`는 적용되지 않았음 — 전역 사용자 규칙은 설정(클라우드)에 저장된다는 공식 답변 | 사용자 규칙 한 줄을 설정에 직접 등록 |
| Antigravity (2026-10-22 당시) | 시작 훅 미확인 | `~/.gemini/GEMINI.md` 대체 규칙으로 부트 성공 | GEMINI.md 대체 규칙 |

## 근거

- Codex: `~/.codex/sessions/2026/10/22/rollout-2026-10-22T15-32-48-*.jsonl` — 세션 열림 15:32:48, 훅 주입 15:33:19(첫 메시지 "안녕").
- Cursor: `~/Library/Application Support/Cursor/logs/…/cursor.hooks.*.log` — 실행 단계는 beforeSubmitPrompt·afterAgentResponse·stop뿐.
- Claude: `claude -p` 헤드리스로 훅 있음/없음 비교, 입력 토큰 차이 약 2천.

## 2026-11-01 공식 문서 대조

- Codex는 훅 `additionalContext`를 핸들러당 기본 약 2,500토큰까지 모델에 직접 보여 준다. 초과분은 파일과 앞뒤 미리보기로 바뀐다. 설정 `additionalContextLimit`으로 조정 가능하다. 현재 PACE의 Codex 훅에는 이 설정이 없다. 근거: https://learn.chatgpt.com/docs/hooks (2026-11-01 확인), `src/setup/install.ts`.
- Cursor 공식 `sessionStart`는 `additional_context`를 초기 맥락에 추가하되 비차단 방식이다. 공식 훅 문서에 숫자 출력 상한은 확인되지 않는다. 따라서 첫 응답의 실제 수신을 별도로 확인해야 한다. 근거: https://cursor.com/docs/hooks (2026-11-01 확인).
- Antigravity 최신 공식 문서는 첫 모델 호출 전 `SessionStart`·`injectSteps`를 지원한다. 과거 실측 행의 ‘훅 없음’ 가정은 현재 문서에는 맞지 않는다. 공식 훅 문서에서 숫자 출력 한도는 확인되지 않는다. 소스는 IDE·CLI가 공유하는 전역 SessionStart 훅을 등록하고 기존 `GEMINI.md` 호환 규칙도 유지한다. 합성 세션에서 수신을 관측했고 실제 설치본의 수신·중복은 검증하지 않았다. 규칙 파일은 각 24,000바이트, 전역·항상 적용 규칙은 합계 20,000토큰 예산이다. 근거: https://antigravity.google/docs/hooks 및 https://antigravity.google/docs/rules/ (2026-11-01 확인), `src/setup/install.ts`.

## 2026-11-05 Windows 실측 (Claude Code)

- Windows의 Claude Code는 훅 명령을 `/usr/bin/bash`(Git Bash)로 실행한다. 백슬래시 경로 `C:\Users\…\.pace\bin\pace.cmd boot …`는 이스케이프로 `C:Users….pacebinpace.cmd`가 되어 `command not found`(비차단 오류)로 부트가 빠진다. 근거: 루카스 Windows 세션 화면 출력(2026-11-05).
- 대응: Windows 훅·대체 규칙은 `node "C:/…/.pace/app/bin/pace.ts" boot --host <도구>` — 슬래시 경로, `.cmd` 실행에 기대지 않음. 재설치는 옛 백슬래시·pace.cmd 훅을 알아보고 교체한다. 근거: `src/setup/install.ts`(`bootBin`·`isBootCommand`), `test/install.test.ts`. 재설치 후 실제 부트 확인은 이슈 `windows-설치-스크립트-미실행-검증`.
