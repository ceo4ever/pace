---
name: changed check timeout 시험 부하 민감
description: "test/changed-test.test.ts 'changed check timeout and parent OS termination …'이 전체 검사 부하에서 실패 — 단독은 통과, 시간 여유나 부하 독립 판정으로 고친다"
type: issue
created: 2026-11-21
updated: 2026-11-21
---

P006 T01·T02 전체 검사에서 매번 이 시험 하나가 'check started' 단언으로 실패(6.4~7.0초). 단독 node --test test/changed-test.test.ts는 26/26 통과. 근거: projects/P006_…/tasks/T02_…/evidence/check-full.txt·check-changed-alone.txt
