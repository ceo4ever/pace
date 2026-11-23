---
name: Gateway 인증 시간 초과 시험 부하 민감
description: "test/daemon-process.test.ts Gateway 인증 시간 초과·미인증 연결 상한 시험이 전체 검사 부하에서 간헐 실패 — 단독은 통과, 시간 여유나 부하 독립 판정으로 고친다"
type: issue
created: 2026-11-23
updated: 2026-11-23
---

2026-11-23 macOS P007 전체 검사 1019개 중 이것만 실패(391ms), 단독 3회 통과. P007은 daemon 코드 무변경. changed-check-timeout 이슈와 같은 유형
