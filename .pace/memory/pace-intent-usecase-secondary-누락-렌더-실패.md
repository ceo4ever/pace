---
name: pace-intent usecase secondary 누락 렌더 실패
description: usecase 템플릿이 선택 필드 secondary 없으면 'u.secondary is not iterable'로 빈 화면 — verify 13검사 통과
type: idea
created: 2026-11-16
updated: 2026-11-16
---

opalwrite L2 ⑥ 렌더에서 발생. 고침: (u.secondary||[]) 또는 render가 헤드리스 콘솔 오류 검사. 횟수 1.
