---
name: 병합 대기 중 memory 쓰기가 merge 차단
description: 병합 대기 중 pace memory가 main에 파일을 써서 merge가 커밋 안 한 변경으로 막힌다 — merge 전 메모리 변경 처리 절차·게이트를 검토한다
type: idea
created: 2026-11-26
updated: 2026-11-26
---

roblox-studio 요청 8: stash→merge→stash pop으로 우회. BL261118_02 BR05(main 점유 충돌)는 일반 main 커밋(메모리) 정책을 제외해 덮지 못한다 — BR05 범위 확장 또는 새 백로그 후보.
