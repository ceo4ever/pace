---
name: Windows 검사 시간 단축
description: "Windows npm run check(순차 약 29분, Linux 7분)를 줄일 방법을 찾는다"
type: idea
created: 2026-11-11
updated: 2026-11-16
---

Windows 전용 --test-concurrency=1로 전체 검사가 약 29분이 됐고 수정마다 전체 재실행해 3시간을 쓴 적이 있다. 느린 테스트 파일만 순차로 돌리는 분할이나 변경 파일 기준 부분 검사를 검토한다.
