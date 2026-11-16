---
name: ACP 테스트 간헐 실패
description: test/agent-acp.test.ts:52 agent_failed 간헐 실패를 재현해 원인을 찾는다
type: idea
created: 2026-11-11
updated: 2026-11-16
---

Windows 전체 검사 7회 중 1회 agent_failed로 실패하고 나머지는 통과했다. finish 게이트에서 재발하면 30분 재실행이 든다.
