# 구현 후 2회차 F1 한정 확인 — 허브(main 판단, msg_e7c8a491ffb1)

- 지적: F1 src/project/pre-review.ts:87 — 번호·하위 목록 둘째 선언 미검출(same_class)
- 수정: reviewerLineIssues 선언형 줄 판독을 줄 머리 정규화(들여쓰기·인용·목록 표지 -*+·번호)로 일원화, 절 안 하나·정본 머리만 허용. test/pre-review.test.ts S-2 변형 사례 추가.
- 진단: evidence/diagnosis-post-1.md
