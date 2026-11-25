**답변 (읽기 전용 시험, 실제 명령은 실행하지 않음)**

**자동 첨부와 읽은 범위**
- 자동 첨부는 있었다. 사용자 계정 정보(이메일)가 system-reminder로 붙었고, 그 값은 쓰지 않는다.
- 읽은 파일과 줄 범위는 다음과 같다.
  - `SKILL.md` 1–93줄 전체
  - `references/task-steps.md` 1–11줄 전체
  - `references/reviewer.md` 1–123줄 전체
  - `references/decision-rights.md` 1–45줄 전체
  - `references/commands.md`는 `pace project log` 형식을 찾는 Grep으로 1–15줄 부근만 읽었다.
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았다.
- 전체 바이트 수는 도구로 확인하지 않았으므로 적지 않는다.

**사례: 1차 fail, blocking 2, escalation 없음**

1. **담당**
   - 워크트리 PM이 직접 처리한다. 허브 이관이나 owner 요청은 하지 않는다.
   - escalation이 없으므로 normal 단계다. diagnose는 3번째 fail에서 열린다.
   - 이 판단은 task-steps.md 4번과 reviewer.md "반복 실패"에 따른다.

2. **순서**
   1. `verify` 출력에서 `escalation` 유무를 먼저 확인한다. 이번에는 없다.
   2. 지적 2건의 등급과 근거를 확인한다. 실제 결함인지, 절차·열람 지적인지 구별한다.
      - 같은 절차·열람 지적이 두 번 이어지면 structure 문제로 본다. 3회를 기다리지 않고 허브로 이관한다.
      - 1차에서는 해당하지 않는다.
   3. 수정 직전에 조치가 합의된 목적·범위·`P-n`을 바꾸는지 A-1~A-5로 대조한다.
      - 모두 "아니오"이면 PM이 결정한다. 근거를 기록하고 사후 요약에 담는다.
      - 하나라도 "예"이면 해당 조치만 보류하고 허브를 거쳐 owner에게 요청한다. 독립 작업은 계속한다.
   4. blocking을 수정한다. should_fix는 반영하거나 이유를 남긴다. handoff는 "남긴 것"에 적는다.
   5. **구현 후 단계**라면 tester와 reviewer **둘 다** 다시 돈다.
      - reviewer 재검토는 `pace agent verify`를 다시 불러 자동 재검토로 받는다. 원장의 직전 원문과 바뀐 줄이 reviewer에게 간다.
      - 도구 밖 서브에이전트는 쓰지 않는다. 쓰면 원장이 끊긴다.
      - 재검토 범위는 직전 blocking 해소 여부와 그 수정이 만든 새 결함뿐이다.
   6. **구현 전 사전 검토**라면 수정한 TASK.md로 `verify`(`--kind task`)를 다시 불러 pass(blocking 0)를 받은 뒤에만 구현한다.
   7. 같은 주기 안에서는 경로를 바꾸지 않는다.

3. **실제 명령·기록**
   - `pace agent verify …` 재호출. 구현 후 diff는 같은 경로(예: `evidence/impl-diff.patch`)를 차수마다 갱신해 쓴다.
   - `pace project log P### T0n --type review --msg "reviewer fail blocking 2 should_fix N"`. tester 결과가 있으면 `tester pass/fail …`도 함께 남긴다. 원문·세션·diff·비밀은 복제하지 않는다.
   - 사전 검토라면 `PRE-REVIEW.json`의 attempts에 시도를 옮긴다.
     - `status: fail`, `blocking: 2`, `evidence: review-records/R<n>.json`, `continuity: new`.
   - TASK-CLOSE "리뷰"에 `1차: tester … · reviewer blocking 2 — …` 한 줄을 적는다. 교본 대조 한 줄도 적는다.
   - 증거 원문은 차수별로 보존한다. 비밀·민감정보를 검사하고, 지적마다 반영 여부, 이유, 수정 위치를 연결한다.
   - `review-note --diagnosis`와 `--decision`은 쓰지 않는다. 해당 단계가 아니기 때문이다.
   - waiver도 붙이지 않는다.

4. **회신·보고**
   - 허브나 owner에게 보내는 보고는 없다. 3차 fail이나 A 해당 조치가 생길 때만 보낸다.
   - 최종 완료 보고와 C의 사후 요약에는 PM이 대신 정한 사항을 한 줄씩 모은다.
   - 이후 pass가 나와도 목표 달성 판정(goal-review)은 별도로 확인한다.

5. **대기 수**
   - 질문: 0개
   - 승인 대기: 0개
   - 지금은 사용자나 허브의 회신을 기다리지 않고 수정 후 재검토로 진행한다.
   - 조건이 바뀌면 달라진다. A 항목에 걸리는 조치가 생기면 요청 1건이 생기고, 그 조치만 보류한다.

6. **경계**
   - 커밋하지 않는다. blocking이 남으면 구현 전에는 구현을, 구현 후에는 커밋을 막는다.
   - `done`은 호출하지 않는다.
   - 메모리는 쓰지 않는다. 시험은 읽기 전용이다.
   - main에서 worktree 파일을 절대 경로로 고치지 않는다.
   - fail 횟수는 원장이 센다. 2차까지 fail이면 3차 호출에서 diagnose가 열릴 수 있다. 이번 1차에서는 해당하지 않는다.