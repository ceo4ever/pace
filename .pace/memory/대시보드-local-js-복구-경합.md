---
name: 대시보드 local.js 복구 경합
description: ensureLocalLink 복구가 내용 확인 직후 교체된 파일을 덮을 수 있는 좁은 창 — local.js 쓰기를 refresh 잠금 안으로 옮기는 안 검토
type: idea
created: 2026-11-18
updated: 2026-11-18
---

codex should_fix(P003 4차). init 잠금과 refresh 잠금이 달라 남는다. src/project/dashboard-layout.ts restoreLocalLink.
