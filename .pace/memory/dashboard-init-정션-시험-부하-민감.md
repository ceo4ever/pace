---
name: dashboard-init 정션 시험 부하 민감
description: "test/dashboard-init.test.ts '상위 정션 아래 모호한 cwd도 형제 저장소를 바꾸지 않는다'가 전체 검사 부하에서 실패 — 단독 5회 통과, 비교 스냅숏에 .git 파일이 들어가 부하 중 내용이 바뀌는지 확인한다(BL261124_01 BR01 대상)"
type: issue
created: 2026-11-24
updated: 2026-11-24
---

2026-11-24 P005 worktree 전체 검사(PACE_SKIP_BROWSER_E2E=1, 다른 Claude 실측·Codex 검토 병행) 1038개 중 실패 1. 단언: 형제 저장소 전체 파일(base64) 비교 문자열이 31자 차이 — .git/hooks 이후 어딘가(.git/index 등 git이 갱신하는 파일 추정). 단독 --test-name-pattern 5회 모두 통과.
