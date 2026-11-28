# owner 결정 — R5 F5 한계 수용 (A-3)

- 결정: owner, 2026-11-28, 허브가 질문. owner 원문 선택: "한계로 받고 마감 (Recommended)"
- 질문 요지: F5(이유 줄의 인라인 코드 주석 표지 인용 오거부, 안전 쪽, 슬롯 2에서 의도된 엄격화로 짚음)를 받아들이고 TASK-CLOSE 한계로 적은 뒤 T01 마감, T02 진행.

## R5 F5 원문

- id F5 · blocking · defect · location `src/project/pre-review.ts:95` · impact criterion · criterion T-2 · recurrence same_class
- scenario: 유효한 정본 선언의 이유가 인라인 코드로 주석 표지를 인용하면 실제 HTML 주석이 없어도 거부된다. visibleMarkdown이 인라인 코드의 `<!--`를 `&lt;!--`로 바꾸고, 새 원문 비교가 이 내부 치환을 실제 주석 제거로 판정한다.
- reproduction 요지: 유일한 선언의 이유에 인라인 코드로 주석 표지를 인용하면 reviewerLineIssues·reviewIssues가 "줄에 주석이 섞였다"를 내고, 사전 verify·review-hand는 종료 2로 실행기 호출·call 행·고정본 없이 거부한다. 인라인 코드를 다른 낱말로 바꾸면 통과한다.

## 영향

- 잔여: T-2의 이 오거부 사례(유효 선언을 형식 문제로 거부) 하나. 잘못 통과시키는 방향이 아니다(안전 쪽).
- 거부 경로는 실행기 호출 0·call 행 0·고정본 없음을 유지한다(T-3 경계 불변).
- 작성자 우회: 이유에 주석 표지를 인용하지 않고 쓴다.
- 같은 때 tester 독립 확인은 T-1~T-7 통과, 음성 대조 모두 검출 — 새 결함(잘못 통과 방향) 없음.
