---
name: team-lock 자기 갱신 시작 조회 간헐 실패
description: 전체 검사 부하에서 team-lock 자기 갱신 시험이 간헐 실패한다 — S-19와 같은 부류인지 원인 확인
type: issue
created: 2026-11-27
updated: 2026-11-27
---

0.1.5 릴리즈 검사에서 test/team-lock.test.ts '자기 갱신은 일시적 외부 시작 조회 실패…'가 reason other-host(기대 start-query-unavailable)로 1회 실패. 단독 3/3·전체 재실행 통과. 부하 때 시작 조회 시점 경합으로 보임
