---
name: daemon 마법사 S-19 간헐 실패
description: "test/daemon-wizard-follow.test.ts S-19 대화형 수동 입력이 전체 검사 부하에서 저장 시크릿 undefined로 간헐 실패 — 단독은 통과, 원인을 찾는다"
type: issue
created: 2026-11-26
updated: 2026-11-26
---

0.1.4 릴리즈 전체 검사 1회차에서 :81 strictEqual 실패(actual undefined). 같은 파일 단독 3회·2회차 전체 검사에서는 통과. 2회차에는 dashboard-init 형제 보존 시험이 대신 간헐 실패(기존 이슈). 부하·공유 상태 의존 의심.
