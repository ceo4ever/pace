---
name: Orca 메뉴 경로 복구 전체 검사 불안정
description: 전체 검사에서 메뉴 경로 승인 뒤 screen-mismatch가 반복되면 단독 실행과 비교하고 실패 원문을 보존한다
type: issue
created: 2026-11-23
updated: 2026-11-23
---

P008 T01 evidence/check-attempt1.txt와 check-complete-failed.txt: test/playbook/healer-e2e.test.mjs:184 menu가 needs-approval로 남음. test/playbook/healer-e2e.test.mjs 및 healer.mjs·heal-web.mjs는 main과 diff 없음. 한 차례 전체 통과도 있어 항상 실패로 단정하지 않으며 별도 단독 실행 결과와 비교한다.
