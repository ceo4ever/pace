---
name: POSIX 감시자 PID 재사용 검토
description: POSIX 감시자의 부모·감시자 PID 재사용 경합을 검토한다
type: issue
created: 2026-11-11
updated: 2026-11-11
---

T04 독립 검토에서 src/agent/process.ts의 부모 생존 확인과 감시자 종료가 PID에 의존함을 발견했다. POSIX 동작 보존 범위 밖이므로 별도 재현과 안전 설계가 필요하다.
