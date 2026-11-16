---
type: concept
title: LLM은 먼저 말할 수 없다 — 화면 인사와 pace onboard
summary: "훅은 맥락만 넣고 응답을 일으키지 못하므로, 열자마자 보이는 인사는 부트가 만든 systemMessage로, 바로 대화를 시작하려면 첫 메시지를 넣어 CLI를 연다"
tags: [boot, onboarding, ux]
sources: [code:src/boot.ts bootNotice, code:src/setup/onboard.ts, 대화:2026-10-22]
related: [session-boot-via-hooks, platform-hook-behavior, situational-boot-greeting]
created: 2026-10-22
updated: 2026-11-16
status: active
---

## 사실

세션 시작 훅은 맥락을 넣을 수만 있다. 모델은 사용자의 첫 메시지를 받아야 답한다.

## 대응

- **화면 인사**: 부트가 메모리·상황을 보고 `systemMessage`로 "자비스 ▸ 루카스, 안녕하세요. [프로젝트] 진행: … · 이슈 n · 할 일 n. 무엇부터 할까요?"를 만든다. 말투가 반말이면 반말. Codex는 첫 메시지 뒤에야 훅이 돌아 열자마자 보이지 않는다.
- **추론한 제안**: 첫 메시지 뒤 에이전트가 상황을 보고 쓴다. 첫 메시지가 구체적 요청이면 인사 한 줄 후 요청 처리.
- **`pace onboard`**: 첫 메시지("PACE 에이전트 온보딩을 시작해 줘.")를 넣은 채 CLI를 연다. 설치 스크립트는 이것을 부르지 않는다(설치까지만 — 사용자 결정).
