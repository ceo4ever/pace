**담당:** worktree 작업자 세션(워크트리 PM)이다. SKILL.md §3에 따라 표의 `대기` 중 맨 앞인 T01부터 자율로 끝까지 진행한다. 멈춤 조건(§6)이 없으면 묻지 않는다. main 쪽 일(`new`, `start`, `merge`)은 하지 않는다.

**순서(실제 명령 또는 기록)**
1. **분석.** `pace project task P### "<T01 이름>"`을 실행한다. 이름은 표의 이름 칸과 똑같이 쓴다. 그러면 `tasks/T01_<이름>/TASK.md`가 생기고 표 상태가 `진행`이 된다. 목적과 재료를 쓴다. T01은 첫 태스크라서 앞 태스크 TASK-CLOSE의 "남긴 것"은 없다.
2. **설계.**
   - TASK.md에 기준 `T-n`을 쓴다. 기준마다 시나리오가 한 줄 이상인 테스트 표와 접근도 쓴다.
   - 새 형식 TASK면 증명 범위와 판정 주체를 먼저 쓴다.
   - 바꿀 경로에 맞는 기준 문서는 standards.md로 고른다.
   - 코드를 바꾸면 `pace-tech-handbook` 언어 색인의 안티패턴을 테스트 표와 접근에 대조한다.
3. **구현 전 검토.**
   - `pace agent verify`로 별도 reviewer에게 TASK.md를 검토받는다. 작성 PM과 다른 제공자를 우선한다.
   - 다른 제공자를 쓸 수 없으면 실패 이유를 기록하고 같은 제공자의 새 세션에 맡긴다. 이 경우는 별도 맥락 검토로 적는다.
   - pass(blocking 0)이거나 사용자 결정 waiver가 있을 때만 구현한다. 어느 쪽도 검토하지 못하면 미검토로 두고 구현하지 않는다.
   - blocking은 고친 뒤 `verify`를 다시 부른다. 연속 fail로 `escalation`이 붙으면 reviewer.md의 반복 실패 절차를 따른다.
   - 대상, 판정, 지적 처리, 검토 방식은 태스크 기록에 남긴다.
4. **구현.** 기존 코드 스타일을 따른다. 보안·성능 문제나 새 모듈이면 교본을 따른다. 버그는 실패하는 테스트(RED)부터 쓴다.
5. **테스트.**
   - 저장소 검사 명령과 E2E를 직접 수행한다.
   - tester와 reviewer를 새 맥락으로 동시에 배정한다. 구현 후 최초 reviewer는 사전 검토와 다른 새 맥락으로 연다.
   - 출력의 `escalation`을 먼저 확인한다.
   - fail이나 blocking은 고치고 둘 다 다시 돈다.
   - should_fix는 반영하거나 이유를 남기고, handoff는 "남긴 것"에 적는다.
   - TASK-CLOSE "리뷰"에는 차수별 한 줄과 교본 대조 한 줄을 적는다.
6. **마감.**
   - TASK-CLOSE.md를 쓰고 `pace project check P### T01`, `pace project done P### T01` 순으로 실행한다.
   - 커밋 전에 `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`으로 메모리를 갱신한다.
   - 커밋은 `feat(P###/T01): …` 하나로, TASK-CLOSE·상태·메모리를 같은 커밋에 넣는다.
   - 원본 문서를 직접 편집했다면 커밋 전에 `pace backlog refresh`를 실행한다.
7. **다음.** 남은 `대기` 태스크가 있으면 T02로 같은 절차를 돈다. 모두 `완료`(또는 `보류`)가 되면 PROJECT-CLOSE.md를 쓴다. 기준 대조와 별도로 목표 달성 판정(goal-review.md)을 넣는다. 그 뒤 `pace project finish P###`를 worktree에서 실행한다. 실패하면 이유를 고쳐 다시 돌리고, finish 전후에 같은 검사를 따로 반복하지 않는다. 통과하면 log.jsonl의 `자체 판단` 결정을 합의와 대조하고, 변경이 없으면 보고에 "대조: 변경 없음"을 적는다. 합의를 바꾼 것이 있으면 보고 전에 §6으로 올린다. Orca 작업자면 `worker_done`으로 끝낸다.

**경계**
- worktree 세션은 `pace project merge`를 하지 않는다. merge는 main에서 사람이 승인하고, 푸시·배포도 승인 없이는 하지 않는다.
- main의 파일을 절대 경로로 고치지 않는다.
- 기준이나 범위 변경, 승인된 설계와 다른 방향, 보안·비밀·비용 문제, 같은 검사가 3회 연속 실패하는 경우에는 멈추고 묻는다.
- 질문은 Orca 작업자면 주입된 `ask` 명령으로 코디네이터에게 하고, 아니면 사용자에게 한다. 질문 직전에 `pace project log P### T01 --type question --by agent --to coordinator --msg "…"`를 기록한다. 답을 받으면 바로 `--type answer --by agent`를 기록한다(answer에는 `--to`를 붙이지 않는다).
- 구현 세부, 테스트 방식, 문서 표현, 작업 순서는 스스로 정하고 결정 메모에 남긴다.

**질문과 승인 대기:** 지금 시점의 질문은 0건이고 승인 대기도 0건이다. 위 멈춤 조건이 생길 때만 질문한다.

**자동 첨부와 읽은 범위**
- 자동 첨부는 userEmail 컨텍스트 system-reminder 1건을 받았다. 이 값은 외부로 보내지 않았다.
- `skills/pace-project-dev/SKILL.md`를 1~98줄 읽었다.
- `references/task-steps.md`를 1~11줄 읽었다.
- `references/coordinator.md`를 1~90줄 읽었다. 이 파일은 코디네이터용이라 작업자 규칙은 질문 기록 부분만 반영했다.
- 전체 바이트는 도구로 확인하지 않아 적지 않는다.