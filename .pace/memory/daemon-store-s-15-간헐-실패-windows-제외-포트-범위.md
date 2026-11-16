---
name: daemon-store S-15 간헐 실패 — Windows 제외 포트 범위
description: 임시 PACE_HOME의 해시 인스턴스 포트가 Windows 제외 범위면 listen EACCES 실패 — 다음 후보 포트로 넘어가게 고침
type: issue
created: 2026-11-13
updated: 2026-11-15
---

재현: node --test test/daemon-store.test.ts 반복 시 약 2%. netsh interface ipv4 show excludedportrange protocol=tcp 의 범위(예 56577~56876). 포트는 daemon.lock의 port에 기록, status·stop은 activeInstancePort 조회, 후보 순서가 같아 중복 기동 방지 유지. 제외 범위는 기기마다 달라 실제 daemon도 같은 증상 가능.
