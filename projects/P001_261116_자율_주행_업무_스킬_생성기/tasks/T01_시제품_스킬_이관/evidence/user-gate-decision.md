# 사용자 게이트 예외 결정 (T01 사전 검토)

- 2026-11-16, 코디네이터가 캡틴에게 올린 질문 요지: T01 TASK.md가 공개 저장소 비식별화(이름·경로·커밋 자리표시 치환)로 바뀌어 해시가 달라졌고, codex 재검토(evidence/review-codex-5.md)는 이름 치환 외 변경이 없음을 확인했으나 일반 blocking을 다시 냈다. 선택: ① 게이트 예외로 진행 ② 추가 검토 ③ 범위 축소.
- 캡틴 답 원문: "둘 다 1번으로 진행해 줘" (2026-11-16)
- 사유: 이름 치환뿐임이 확인된 사후 문구 변경(evidence/rename-check.txt). 기능 검토는 이전 해시에서 pass(evidence/review-claude.md).
- 이 예외는 pass가 아니다 — PRE-REVIEW.json의 시도(codex fail 포함)는 그대로 둔다.
