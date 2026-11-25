**사례: 워크트리 PM, 같은 대상 반복 검토, 1차 fail·blocking 2·escalation 없음**

**담당**
- 워크트리 PM(나)이 직접 처리한다. 허브 이관은 하지 않는다. 3회 연속 fail, 같은 지적이 두 번 이어진 절차·열람 지적, 장애가 생길 때만 이관한다.
- 판정은 reviewer나 tester가 한다. 나는 수정, 재호출, 기록을 맡는다.

**순서**
1. 출력에 `escalation`이 없는지 확인한다. 이 사례는 없으므로 진단과 사용자 결정 단계로 가지 않고 normal 단계로 처리한다.
2. 원문을 `review-records/R<n>.json`에 보존한다. 지적별로 등급, 근거, 반영 여부를 적어 둔다.
3. 수정 직전에 각 수정이 합의된 목적·기준·범위를 바꾸는지 A로 대조한다.
   - 바뀌지 않으면 PM이 결정한다. 승인은 기다리지 않는다.
   - 바뀌면 그 조치만 `ask`로 허브에 인계하고, 독립 작업은 이어간다.
4. blocking 2건을 고친다. should_fix는 반영하거나 이유를 남기고, handoff는 "남긴 것"에 적는다.
5. 구현 전 검토는 TASK.md를 고친다. 구현 후 검토는 코드나 테스트를 고치고 `evidence/impl-diff.patch`를 같은 경로로 갱신한다.
6. `pace agent verify`를 다시 부른다.
   - 같은 대상, 같은 경로, 같은 제공자 경로를 유지한다.
   - 도구가 직전 fail 원문과 바뀐 줄로 자동 재검토를 한다.
   - 도구 밖 reviewer로 바꾸지 않는다. 미실행(종료 10)일 때만 규칙대로 대체한다.
   - purpose에는 합의된 목적과 판정 기준만 넣고, 내 대응이나 자체 판정은 넣지 않는다.
7. 구현 후라면 tester와 reviewer를 둘 다 새로 돌린다. 고친 뒤 한쪽만 돌리지 않는다.
8. 재검토 결과별 처리
   - pass(blocking 0)면 진행한다. 사전 검토라면 `PRE-REVIEW.json`에 시도를 옮기고 해시를 맞춘다. 원장 순서대로 `continuity`는 `changed`(자동 재검토), 사유를 적는다.
   - 다시 fail이면 2차로 같은 절차를 반복한다. 3차 fail에서 `escalation: diagnose`가 나오면 그 호출에서 바로 대응한다.
9. TASK-CLOSE "리뷰"에 `1차: tester … · reviewer blocking 2 — …`처럼 차수마다 한 줄을 적는다. 교본 대조 한 줄도 적는다.
10. 목표 달성 판정은 검토 pass와 별도로 구별해 기록한다. 미달이나 미확인이면 done하지 않는다.
11. 이후 `pace project check`, `done`, `pace memory status`, 커밋 `feat(P###/T0n): …` 순으로 간다.

**실제 명령·기록**
- `pace agent verify`: 다른 제공자 CLI로 받을 때 사전 검토는 `--kind task`를 쓴다.
- `pace project log`: 대상, 제공자, 결과, blocking과 should_fix 처리, 재검토를 기록한다.
- `review-note`의 diagnosis, decision, void는 쓰지 않는다. 열린 단계가 없고 도구 결함도 없기 때문이다.

**질문과 승인 대기**
- 질문 0, 승인 대기 0이다.
- 수정이 A(합의 변경)에 걸릴 때만 예외로 `ask` 1건을 허브에 올린다.
- merge나 배포는 이 단계가 아니다.

**경계**
- 파일 수정, 질문, 메모리 기록, 커밋, 전송은 하지 않았다. 순서만 답했다.
- waiver는 사용자만 줄 수 있고, PM이 대행하지 않는다.
- 도구 밖 reviewer로 주기 중간에 경로를 섞지 않는다.

**자동 첨부·읽은 범위**
- 자동 첨부로 userEmail 컨텍스트를 받았고, 답변에는 쓰지 않았다.
- 읽은 파일과 줄:
  - `skills/pace-project-dev/SKILL.md` 1–93
  - `references/task-steps.md` 1–12
  - `references/reviewer.md` 1–122
- 전체 바이트는 확인하지 않았다.