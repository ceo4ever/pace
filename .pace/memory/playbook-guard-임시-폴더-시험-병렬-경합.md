---
name: playbook-guard 임시 폴더 시험 병렬 경합
description: playbook-guard 저장 경계 시험이 공용 tmpdir의 pace-playbook-* 증가로 판정해 병렬 실행 때 다른 시험 파일의 임시 폴더를 잡고 실패 — 시험 전용 임시 루트로 격리
type: issue
created: 2026-11-18
updated: 2026-11-18
---

test/playbook/playbook-guard.test.mjs:42-50. 2026-11-18 전체 검사에서 실패(임시 폴더가 남았다), 단독 실행은 P003 전·후 모두 통과. BL261118_01 병렬화(BR03) 때도 걸릴 경합.
