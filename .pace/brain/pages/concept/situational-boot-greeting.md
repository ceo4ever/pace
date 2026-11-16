---
type: concept
title: 상황별 부트 — 위치를 판별해 사실을 넘긴다
summary: "부트는 세션 위치를 PACE 프로젝트·정의 없음·새 프로젝트·밖으로 판별하고 git·메모리를 넘기며, 첫 멘트는 에이전트가 판단한다. 홈 폴더(~/.pace 있음)는 프로젝트로 보지 않는다"
tags: [boot, situation]
sources: [code:src/project/situation.ts, code:src/boot.ts]
related: [session-boot-via-hooks, llm-cannot-speak-first]
created: 2026-10-22
updated: 2026-11-16
status: active
---

| 상황 | 판별 | 첫 멘트 방향 |
|---|---|---|
| PACE 프로젝트 | `AGENTS.md`·유효한 `.pace/AGENT.md`·`.pace/memory`·브레인 | 진행 상황·이슈·할 일로 1~3개 제안 |
| 정의 없음 | git 저장소, PACE 정의 없음 | 요약 후 pace-project-init 제안 |
| 새 프로젝트 | 거의 빈 폴더 | 무엇을 만들지 묻기 |
| 밖 | 그 외, 홈 폴더 포함 | 개인 할 일·규칙으로 제안 |

PACE 프로젝트에서는 진행 중·병합 대기인 프로젝트(`projects/P###`)를 한 줄씩 넘긴다 — worktree 작업본을 먼저 읽어 진행 태스크까지 보인다.

함정: 위로 올라가며 표지를 찾을 때 홈 폴더에서 멈춘다 — `~/.pace`(설치 폴더)를 프로젝트 `.pace`로 착각하지 않게.
