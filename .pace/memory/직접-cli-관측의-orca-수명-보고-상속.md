---
name: 직접 CLI 관측의 Orca 수명 보고 상속
description: 중첩 Codex 실측은 Orca 세션 환경을 격리하고 부모 작업 종료로 오인되지 않는지 확인한다
type: issue
created: 2026-11-23
updated: 2026-11-23
---

P009 T01에서 Studio MCP 메타데이터만 확인한 직접 codex exec가 정상 종료했지만 코디네이터는 원래 작업의 worker_done 없는 중단으로 통지받았다. 기존 원래 dispatch는 live로 확인되어 계속 수행했다. 원인 후보는 직접 CLI에 상속된 Orca 훅 환경이며 아직 확정하지 않았다. 비교: src/agent/process.ts의 격리 환경과 test/helpers.ts sessionFreeEnv. 사용자 설정 변경이나 Studio 도구 실행은 없었다.
