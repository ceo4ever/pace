---
name: 브레인 대규모 lint와 긴 이력 실측
description: 수천 페이지 lint와 긴 Git 이력 쓰기의 상한을 실측하고 필요하면 최적화한다
type: idea
created: 2026-11-10
updated: 2026-11-16
---

1000페이지 lint와 2000페이지 add는 검증했지만 빠진 링크 전체 검사는 여전히 이차 복잡도이며 큰 파일·긴 이력·update 시간은 미측정이다.
