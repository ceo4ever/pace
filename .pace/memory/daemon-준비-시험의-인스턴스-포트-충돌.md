---
name: daemon 준비 시험의 인스턴스 포트 충돌
description: T06 전체 S-16 임시 인스턴스 포트 점유 exit2 원문 보존; 단독과 후속 전체를 구분
type: issue
created: 2026-11-24
updated: 2026-11-24
---

test/daemon-process.test.ts:42의 기존 S-16이 전체 검사 중 준비 전 종료했다. stderr는 인스턴스 포트 이미 점유만 기록했고 다른 소유 프로세스·충돌 인과는 미확인이다. 제품/시험을 우회 수정하지 않는다. 근거: T06 evidence/whole-post-r8-39-fail-daemon-port.txt.
