---
name: Windows 설치 스크립트 미실행 검증
description: Windows pace agent 자손 추적·회수를 실기 검증하고 부모 강제 종료용 reaper를 보완한다
type: issue
created: 2026-10-22
updated: 2026-11-16
---

설치(install.cmd)·설치본 반영과 재설치 뒤 Claude 세션 부트는 확인했다(훅 단독 실행 JSON 유효·1.5s). 남은 것: pace agent 자손 회수는 모의 테스트만 통과(process_cleanup best-effort-unverified) — Windows 실기 검증과 reaper 보완.
