# T01 구현 후 검토 공동 시도 1회차 — 허브 결정(main 판단)

- 결정: 허브 Orca 회신 msg_52cc21d7ea10 (2026-11-28)
- 경위: 구현 후 tester·reviewer 2회 fail, budget post rounds 2/2 소진. PM이 근본 수정(reviewerLineIssues 선언형 줄 판독 일원화, S-2·S-6 시험 보강) 적용·전체 검사 통과.
- 결정 내용: 3회차 tester·reviewer 모두 새 맥락, 전체 범위(근본 수정 한정 아님). F3 규칙(들여쓴 코드 예시도 선언으로 셈, 예시는 주석·fence 안)은 허브 수용 — 목표·합격 기준 불변, 판독 방식 선택이라 A 밖. fail이면 고치기 전에 원문을 허브에 보고.
