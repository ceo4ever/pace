---
name: dashboard-init-형제-스냅숏-간헐-실패
description: dashboard-init의 형제 저장소 불변 스냅숏이 전체 검사에서 간헐 실패하면 원문·단독·무변경 재실행을 대조해 원인을 찾는다
type: issue
created: 2026-11-24
updated: 2026-11-24
---

test/dashboard-init.test.ts:129 전체 검사에서 형제 Git 저장소 treeSnapshot 엄격 비교가 간헐 실패했다. P009 T02/T03 마감 증거에 실패 원문과 단독·무변경 전체 통과가 보존되어 있다. 원인은 확정하지 않았으며 제품/시험을 약화하지 않았다. 재현 시 바뀐 파일·Git 메타데이터를 잘리지 않는 별도 차이로 수집한다.
