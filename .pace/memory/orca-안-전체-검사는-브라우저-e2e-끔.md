---
name: Orca 안 전체 검사는 브라우저 E2E 끔
description: Orca 터미널에서 npm run check는 PACE_SKIP_BROWSER_E2E=1로 돌린다 — playbook E2E 4개가 Orca 브라우저 탭을 열어 사용자 화면을 어지럽힌다. 브라우저 동작을 바꾼 일만 켠다
type: rule
created: 2026-11-23
updated: 2026-11-23
---

2026-11-23 S-4b 수정 검증 중 전체 검사가 Orca 탭을 여러 개 열어 캡틴이 지적. test/playbook/*-e2e.test.mjs가 orca tab list 성공 시 자동 실행.
