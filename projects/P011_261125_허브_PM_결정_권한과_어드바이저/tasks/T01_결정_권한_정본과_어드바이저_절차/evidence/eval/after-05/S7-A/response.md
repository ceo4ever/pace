시나리오는 읽기 전용이라 아래는 실제 실행 없이 순서만 적은 것이다. 실제 조회와 명령 실행은 하지 않았다.

**자동 첨부와 읽은 범위**
- 사용자 이메일이 시스템 컨텍스트로 자동 첨부됐다. 값은 쓰지 않으며, 외부 전송이나 기록에도 넣지 않는다.
- 읽은 파일은 세 개다.
  - `skills/pace-project-dev/SKILL.md`: 1–93줄 전체.
  - `references/task-steps.md`: 1–12줄 전체.
  - `references/reviewer.md`: 1–126줄 전체.
- `references/commands.md`는 Grep으로 3, 10, 12, 14, 15줄만 확인했다.
- 전체 바이트는 도구로 확인하지 않았으므로 적지 않는다.
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았다.

**사례: 1차 fail, blocking 2, escalation 없음**

1. **담당**
   - 워크트리 PM이 처리한다. 허브 에스컬레이션이나 결정 요청 대상이 아니다.
   - 세 번째 fail에서 diagnose가 열리고 그 뒤 ask_user가 열리는데, 지금은 1차 fail이라 해당 단계가 아니다.
   - 사용자 결정이나 waiver 대상도 아니다.

2. **실제 명령 또는 기록**
   - 출력에서 `escalation`이 없는지 먼저 확인한다. 없으면 normal 단계다.
   - 수정 직전에 조치가 합의된 목적·범위를 바꾸는지 A-1로 대조한다.
     - 바꾸지 않으면 PM이 직접 고친다.
     - 바꾸면 §6에 따라 `ask`로 허브에 올리고 해당 조치만 보류한다. 독립 작업은 이어간다.
   - blocking 2건을 모두 고친다.
     - 같은 reviewer의 지적을 `should_fix`나 `note`로 낮추지 않는다.
     - `should_fix`는 반영하거나 이유를 남긴다.
     - `handoff`는 TASK-CLOSE의 "남긴 것"에 적는다.
   - `pace project log P### T0n --type review --msg "reviewer fail blocking 2 should_fix N"` 형식으로 기록한다. 원문 출력·세션·diff·비밀은 복제하지 않는다.
   - 재검토는 도구 밖 서브에이전트로 하지 않고 `pace agent verify`를 다시 부른다.
     - 구현 전 TASK 검토라면 다른 제공자 CLI로 받을 때 `--kind task`를 쓴다.
     - 도구가 원장의 직전 fail을 기준점으로 골라 자동 재검토를 한다.
     - 자동 재검토는 직전 blocking의 해소 여부와 수정이 만든 새 결함만 본다.
   - 단계별 추가 조건은 다음과 같다.
     - 구현 전이면 pass(blocking 0)가 나올 때까지 구현하지 않는다.
     - 구현 후(테스트 단계)이면 **tester와 reviewer 둘 다** 새 맥락으로 다시 돈다.
   - 이 단계에서는 `review-note --diagnosis`나 `--decision`을 쓰지 않는다.
   - 차수별 원문은 `review-records/`에 보존하고, 비밀·민감정보를 검사한다.
   - 구현 후 diff는 같은 경로로 갱신한다.

3. **필요한 회신·보고**
   - 허브나 owner에게 보내는 회신과 사전 보고는 없다.
   - TASK-CLOSE "리뷰"에 차수마다 한 줄을 남긴다. 예: `1차: tester pass · reviewer blocking 2 — …`. 교본 대조 한 줄도 적는다.
   - 사후 요약(C)에는 `worker_done` 전 대조 결과를 담는다.
   - 3회 연속 fail이 되거나 구조·절차 지적이 2회 반복되면 그때 허브와 B로 간다. 지금은 해당하지 않는다.

4. **질문과 승인 대기 수**
   - 질문 0, 승인 대기 0이다.
   - 이 사례에서 `pace memory`, 커밋, merge, 외부 전송은 하지 않는다.