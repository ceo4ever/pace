**읽은 범위**
- 자동 첨부: 사용자 이메일 컨텍스트가 자동 첨부됐다. 값은 적지 않고 사용하지도 않았다.
- 직접 읽은 파일 (전체 바이트는 도구로 확인하지 않아 적지 않는다):
  - `skills/pace-project-dev/SKILL.md` 1–92행
  - `references/reviewer.md` 1–125행
  - `references/decision-rights.md` 1–45행
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았다.

**사례: 3차 fail, 종료 0, `escalation.stage: diagnose`**

담당은 워크트리 PM이다. 근본 조치는 허브와 B 절차로 정한다.

1. **즉시 대응.** 이 신호를 받은 호출에서 바로 대응한다. 진단을 기록하기 전에 `verify`를 다시 부르면 종료 16으로 차단된다.
2. **증거 확인.** 1·2·3차 원문을 `review-records/R1~R3`와 `REVIEW-LOG.jsonl`에서 확인한다. 차수별 blocking은 PATH 누락, launchd 등록, 강제 종료 신호다. 원문이 없으면 추정 복원하지 않고 그 한계를 적는다.
3. **원인 층 판정.** `design`이다. macOS로 합의된 환경에 Windows의 경로·등록·종료 방식을 적용한 것이 공통 원인이다. 환경 결정 자체가 틀린 것이 아니므로 `planning`이 아니다. 지적별 땜질은 멈춘다.
4. **허브 보고.** 세 차례 근거와 진단을 허브에 보낸다. 이는 보고이지 owner 질문이 아니다. 허브는 재현하고 근본 조치를 정해 회신한다. 작업자는 그 회신을 `(main 판단)`으로 기록한다.
5. **수정 직전 A 분류.**
   - 조치는 TASK 설계를 macOS 기준의 PATH, launchd, 종료 신호(SIGTERM 등)로 다시 쓰는 것이다.
   - A-1 아니오: 합의된 목적·범위·기준 `P-n`이 그대로다.
   - A-2 아니오: 설계 문서 수정이라 외부 영향이 없다.
   - A-3 아니오: 검증을 강화하는 조치다.
   - A-4 아니오, A-5 아니오.
   - 따라서 PM이 결정한다.
6. **진단 기록.** `evidence/`에 진단 문서를 쓴다. 내용은 차수별 blocking, 층 `design`, 근본 조치, A 분류 근거다. 그 뒤 아래 명령으로 기록한다.
   - `pace agent review-note --target <TASK.md 경로> --diagnosis --layer design --summary "<진단·조치>" --file evidence/<진단>.md`
   - `--decision`은 쓰지 않는다. `ask_user` 단계가 아니기 때문이다.
   - `pace project log`에도 진단과 `(main 판단)`을 남긴다.
7. **TASK 재작성.** TASK.md를 실제 macOS 기준으로 다시 쓴다. 증명 범위와 판정 주체, 기준 `T-n`, 테스트 표도 같이 맞춘다.
8. **전체 재검토.** `pace agent verify --kind task <TASK.md 경로>`로 받는다.
   - 진단 뒤 첫 검토라 `rereview_of`는 null이고 새 기준 전체 검토다.
   - 이전 지적으로 purpose를 좁히지 않는다.
   - 다른 제공자를 우선한다.
   - 같은 대상의 경로는 바꾸지 않는다.
9. **결과별 후속.**
   - pass(blocking 0): `PRE-REVIEW.json`에 원장을 옮겨 적는다. `continuity`는 `changed`이고 reason은 "진단 뒤 새 기준 전체 검토"다. 그 뒤 구현으로 간다.
   - fail: 종료 0과 `ask_user`가 열린다. 수정 전에 A를 다시 분류한다.
     - A 밖이면 `--decision --by pm`으로 기록하고 근본 조치 → 전체 재검증 → 사후 보고로 간다.
     - A에 걸리면 허브를 거쳐 6요소(대상, 실패 추이, 진단과 고친 층, 남은 지적 성격, 선택지, 추천과 이유)로 owner에게 요청한다. 승인 원문을 대조한 뒤 `--by user`로 기록한다.
10. **사후 보고.** TASK-CLOSE 리뷰 절과 C의 사후 요약에 4요소를 남긴다. 4요소는 무엇이 반복됐는지, 고친 층, 채우거나 덜어낸 것, 재검증 결과다.

**경계**
- 이번 신호부터 진단 기록까지 owner 질문은 0건이고 승인 대기도 0건이다. 허브 회신 대기는 승인 대기가 아니다.
- 다음 검토가 fail이면 그때 위 9번에서 A를 다시 분류한다.
- 구현은 pass 전에 시작하지 않는다.
- 커밋·병합·푸시는 하지 않는다.
- main에서 worktree 파일을 고치지 않는다.
- 실제 launchd 등록이나 시스템 변경은 하지 않는다.