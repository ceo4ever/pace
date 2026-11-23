---
name: Orca 캡처 래스터 배율의 운영 경로 대조
description: 실제 플레이북 재캡처에서도 viewport 정보와 JPEG 배율이 일치하는지 확인한다
type: issue
created: 2026-11-23
updated: 2026-11-23
---

P009 T01 선행 S-11 진단에서 동일한 DOM box·view 320×240·dpr 1인데 두 JPEG의 콘텐츠 배율이 달라 shot/record/candidate 해시가 달라졌다. 시험은 매 캡처 전 명시된 viewport를 재고정해 통과했고 승인 검증은 유지했다. 사용자 실제 화면의 임의 viewport를 강제로 바꾸지 않으므로 운영 어댑터에도 같은 현상이 있는지 별도 실측이 필요하다. test/playbook/healer-e2e.test.mjs, skills/pace-playbook-maker/tools/orca-adapter.mjs 참조.
