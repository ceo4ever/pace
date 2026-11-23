---
name: telegram-flow S-4b 단독 실행 실패
description: test/telegram-flow.test.ts S-4b가 --test-name-pattern 단독 실행에서 항상 실패(파일 전체는 통과) — 앞 시험에 기대는 숨은 의존을 끊는다
type: issue
created: 2026-11-23
updated: 2026-11-23
---

2026-11-23 macOS main·P007 모두 단독 3회 실패, 파일 전체 40개 통과. 전체 검사 부하에서도 간헐 실패 관측. pace test changed·file 같은 부분 실행에 영향
