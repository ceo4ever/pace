---
name: daemon stop 직후 start 무시
description: "macOS에서 pace daemon stop 직후 start가 서비스를 띄우지 않음 — stop이 종료 확인 전에 반환하는지, launchctl start가 종료 중 작업에 걸리는지 확인한다"
type: issue
created: 2026-11-24
updated: 2026-11-24
---

2026-11-24 재설치 뒤 stop→start 연속 실행에서 '아직 응답하지 않는다', launchctl list에 PID 없음·LastExitStatus 0. 곧바로 다시 start하자 기동. 관련: src/daemon/autostart.ts startDaemonNow(로드됨이면 launchctl start). 추정: 옛 프로세스가 살아 있을 때 start가 무시됨
