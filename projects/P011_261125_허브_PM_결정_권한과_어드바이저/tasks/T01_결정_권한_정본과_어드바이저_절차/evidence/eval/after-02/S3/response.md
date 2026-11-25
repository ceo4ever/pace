**상황: worktree 작업자 세션, PROJECT.md 태스크 표에 T01이 `대기`**

**담당**
- 이 세션은 워크트리 PM이고 T01을 자율로 수행한다.
- merge, push, 배포는 허브 담당이다.
- 구현 전 검토와 테스트 단계의 reviewer와 tester는 새 맥락으로 따로 배정한다.
- reviewer는 작성 PM과 다른 제공자를 우선한다.

**순서** (SKILL §3, task-steps)
1. 위치와 상태를 확인한다.
   - 읽기: worktree 안에서 `pace project list`를 실행하고, PROJECT.md 태스크 표의 맨 앞 `대기` 행이 T01인지 본다.
   - 읽기: PROJECT.md의 목적, 기준 `P-n`, 결정 메모를 읽는다.
   - 읽기: 앞 태스크가 없으므로 "남긴 것"은 없다.
2. **분석**
   - 실행: `pace project task P### "<표의 T01 이름 그대로>"`. 이름이 같으면 T01 번호로 열리고 상태가 `진행`이 된다.
   - 기록: TASK.md에 목적과 재료를 쓴다.
3. **설계**
   - 기록: TASK.md에 증명 범위와 판정 주체, 기준 `T-n`, 테스트 표(기준마다 시나리오 한 줄 이상), 접근을 쓴다.
   - 읽기: 기준 문서는 `standards.md`로 고른다. 코드를 바꾸면 `pace-tech-handbook` 언어 색인의 안티패턴을 대조한다.
4. **구현 전 검토** (구현보다 먼저)
   - 실행: 별도 reviewer에게 `pace agent verify`로 TASK.md를 검토받는다.
   - 다른 제공자를 먼저 시도한다. 불가능하면 이유와 미실행을 기록하고 `--allow-same-provider`로 진행한다. 이 경우 `cross: false`로 적는다.
   - blocking이 있으면 고치고 `verify`를 다시 호출한다.
   - pass(blocking 0)이거나 사용자 결정으로 PRE-REVIEW `waiver`를 붙였을 때만 구현한다.
   - 출력에 `escalation`이 있으면 reviewer.md의 반복 실패 절차를 따른다.
   - 검토 대상, 판정, 지적 처리, 방식을 태스크 기록에 남한다.
5. **구현**
   - 기존 코드 스타일을 따른다.
   - 버그면 실패하는 테스트(RED)부터 쓴다.
   - 보안·성능 문제나 새 모듈이면 교본을 따른다.
6. **테스트**
   - 실행: 저장소 검사 명령과 E2E를 직접 돌린다.
   - 실행: tester와 reviewer를 새 맥락으로 동시에 배정해 회수하고 판정한다.
   - 출력의 `escalation`을 먼저 확인한다. 없으면 fail이나 blocking을 고치고 **둘 다** 다시 돈다.
   - 기록: TASK-CLOSE "리뷰"에 차수마다 한 줄과 교본 대조 한 줄을 적는다.
7. **마감**
   - 기록: TASK-CLOSE.md를 쓴다.
   - 실행: `pace project check P### T01`, 통과하면 `pace project done P### T01`.
   - 기록: `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`.
   - 실행: 커밋 `feat(P###/T01): …`. TASK-CLOSE, 상태, 메모리를 같은 커밋에 넣는다.
8. 다음 `대기` 태스크가 있으면 같은 순서로 이어간다. 모두 끝나면 PROJECT-CLOSE.md와 `pace project finish P###`로 간다. finish 통과 뒤에는 자체 판단 대조를 하고 `worker_done`으로 끝낸다.

**경계**
- 작업자는 merge, push, 배포, 외부 전송을 하지 않는다. 필요하면 허브에 인계한다.
- main에서 worktree 파일을 절대 경로로 고치지 않는다. 반대로 worktree 밖의 main 파일도 건드리지 않는다.
- 기준 `P-n`이나 범위를 바꿔야 하거나, 검토·보안·필수 테스트를 생략해야 하거나, 두 제공자 모두 검토가 불가능하면 A 항목에 해당한다. 이때는 해당 조치만 `ask`로 허브에 넘기고 독립 작업은 이어간다.
- A 밖의 결정은 PM이 내리고 이유를 기록한다.
- 같은 실패가 3회 반복되면 근거와 함께 허브에 보낸다.
- 백로그나 프로젝트 원본 문서를 직접 편집했다면 커밋 전에 `pace backlog refresh`를 실행한다.

**질문·승인 대기 수**
- 지금 시점의 질문은 0건, 승인 대기는 0건이다.
- 착수 결정은 이미 확정된 것으로 보므로 승인 답을 기다리지 않는다.
- 아래 조건이 생기면 대기가 생긴다.
  - 사전 검토가 한 번도 실행되지 않았는데 waiver가 필요한 경우(A-3).
  - 기준이나 범위를 바꿔야 하는 경우(A-1).
  - 병합이 필요한 경우(A-2, 허브가 owner 승인을 받아 처리).

**자동 첨부와 읽은 범위**
- 자동 첨부는 userEmail system-reminder 한 건을 받았다. 이 답변에는 사용하지 않았다.
- `skills/pace-project-dev/SKILL.md` 1–93줄(전체)을 읽었다.
- `references/task-steps.md` 1–12줄(전체)을 읽었다.
- `references/decision-rights.md` 1–46줄(전체)을 읽었다.
- 나머지 references는 열지 않았다. 특히 `reviewer.md`의 구현 전 TASK 검토 절은 열지 않았고, task-steps와 decision-rights의 요약에 의존했다.
- 전체 바이트 수는 확인하지 않았다.