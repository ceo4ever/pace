> 대체됨 — owner A-1 단순화 2026-11-28([owner-decision-2026-11-28-simplify.md](owner-decision-2026-11-28-simplify.md))

# owner 결정 (2026-11-27 허브 대화)

- 질문: 같은 diff에서 유효 묶음이 늘어나는 칸(F2·F14·F15 반복, [구조 진단](diagnosis-2026-11-27.md))을 어떻게 없앨 것인가.
- 선택: "tester 먼저 (Recommended)". 묶음이 지정된 태스크는 구현 후 tester를 먼저 돌린다. PM이 실제 diff와 tester signals로 묶음 추가를 확정한 뒤 reviewer를 부른다. 유효 묶음 집합은 reviewer 호출 전에 diff마다 고정된다. 수정 뒤에도 같은 순서다(tester 재실행 → PM 확정 → reviewer 전체 묶음).
- 대체: 앞선 결정 "예산 밖 1회 허용"([owner-decision-2026-11-27-late-addition.md](owner-decision-2026-11-27-late-addition.md)).
- 결정 권한: A-1(합의 범위 변경). 출처는 허브가 전달한 owner 선택지 원문이다.
