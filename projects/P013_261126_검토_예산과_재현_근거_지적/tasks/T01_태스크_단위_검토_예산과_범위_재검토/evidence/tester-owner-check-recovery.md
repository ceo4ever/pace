`work`에서 지정한 테스트 3개가 모두 통과했습니다. 옛 `goal`·`task` 판정과 중단 기록은 구현 후 예산에 귀속됐고, 루트 `TASK.md`의 첫 사전 검토는 정상 실행됐습니다.

**[blocking]** 옛 증거 원장의 `task` 판정이 구조 누락만 확인한 경우에도 구현 후 판정 1회와 재검토 기준점으로 잡힙니다. 임시 픽스처로 재현했습니다. 이 경우 첫 구현 후 검토가 범위 재검토로 시작해 전체 검토 기회를 잃습니다. 구조 전용 판정은 귀속 단계와 관계없이 호출 수에만 남겨야 합니다. [review-budget.ts](/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/tester-proof/work/src/agent/review-budget.ts:113)

fail