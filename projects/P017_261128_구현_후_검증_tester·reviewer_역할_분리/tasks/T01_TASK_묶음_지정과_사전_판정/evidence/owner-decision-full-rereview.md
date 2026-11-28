# T01 사전 검토 전체 재검토 1회 — owner 결정

- 결정 주체: owner (2026-11-28 허브 대화, 허브 Orca 회신 msg_c3cadd994721로 전달)
- 원문 선택지: "전체 재검토 1회 허용 (Recommended)"
- 대상: P017 T01 `TASK.md` reviewHash 249795e2bd0eb72024f4ab87374c754ed1ffe97c092dd12c4dca098e89910148 (R6 한정 확인 pass와 같은 판)
- 범위: 독립 전체 사전 검토 1회. pass면 그 기록을 PRE-REVIEW 허가로 쓴다. fail이면 수정하지 않고 원문을 허브에 보고한다.
- 경위: R6(진단 뒤 한정 확인) pass는 PRE-REVIEW 생성기·게이트가 세지 않고(`src/agent/review-pre.ts:79-80`, `src/project/pre-review.ts:186`) 허가가 probe라 구현 경로를 덮지 못했다. 예산 소진(exit 16, confirmed_findings).

- 수정 이력(2026-11-28, 허브 지시): 허브 회신(msg_5d41c9d68574·msg_228c3dcfff48)에 따라 S-7 (나) 조건과 T-7·S-8 하네스 관리 파일 제외를 반영한 판(reviewHash f602743bd77423a0f849446a93944e14566d6efe11adf57ced77cc0a0c5adab7)으로 전체 재검토 R7을 실행했다. 위 대상 해시 249795e2…는 수정 전 판이다.
