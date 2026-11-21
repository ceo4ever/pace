---
name: Windows 루트 교체 검사 skip
description: Windows의 루트 교체 훅 skip 원인을 확인해 실제 경로 재검증 시험의 실행 가능성을 점검한다
type: issue
created: 2026-11-21
updated: 2026-11-21
---

P005 T03 전체 검사에서 test/telegram-flow.test.ts:700 루트 교체 훅이 권한·열린 핸들 제약으로 작동하지 않아 skip됐다. 기존 skip이며 제품 결함이나 통과로 간주하지 않는다. 이 PC에서 교체 조건을 준비해 실제 경로 식별자 재확인 시험이 실행되는지 별도 확인한다. 이번 전체 검사·Telegram 실측은 반복하지 않는다.
