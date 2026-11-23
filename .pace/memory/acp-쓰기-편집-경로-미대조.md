---
name: ACP 쓰기 편집 경로 미대조
description: ACP 쓰기 모드에서 편집 도구 자동 허용이 경로를 대조하지 않아 작업사본 밖 편집도 승인 없이 허용될 수 있다 — 워크트리 안 경로만 자동 허용하게 고친다
type: issue
created: 2026-11-23
updated: 2026-11-23
---

src/agent/acp-executor.ts 권한 분기: access=write·kind=edit·writeTools면 default-allow, 대상 경로(toolCall locations·rawInput) 미확인. P005 T04 사전 검토 v3에서 발견, T04는 작업사본 밖 변경 감지로만 대응
