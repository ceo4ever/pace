**결론:** 1차 fail에 `escalation`이 없으므로 normal 단계다. 허브 인계, 진단, 사용자 질문은 하지 않고, 워크트리 PM이 직접 고쳐서 같은 경로로 재검토한다.

## 순서

1. **출력 확인 (담당: 워크트리 PM).**
   - `escalation` 필드가 없음을 확인한다. 3회 fail이 되어야 `diagnose`, 그 뒤 첫 fail에서 `ask_user`가 나온다. 지금은 1차라 둘 다 해당 없다.
   - blocking 2건을 F1, F2로 나눠 등급과 근거를 읽는다.
   - 절차·열람 지적이 두 번 이어지는지도 본다. 지금은 1차라 해당 없다.

2. **수정 직전 영향 분류 (담당: 워크트리 PM).**
   - 각 수정이 합의된 목적·기준·범위를 바꾸는지 대조한다. 기준은 `decision-rights.md`의 A다.
   - A에 걸리지 않으면 PM이 결정하고 직접 고친다.
   - 목적·범위·기준 변경이 필요하면 그 조치만 `ask`로 허브에 넘기고 나머지 수정은 계속한다.

3. **blocking 2건 수정 (담당: 워크트리 PM).**
   - 구현 전 TASK 검토라면 TASK.md를 고친다.
   - 구현 후 검토라면 코드와 테스트를 고친다. 버그는 실패하는 테스트부터 만든다.
   - should_fix는 반영하거나 이유를 남긴다.
   - 증명 범위·판정 주체가 비어서 난 blocking이면, 그 구조 누락만 채운 뒤 전체 검토를 받는다.

4. **같은 경로로 재검토 (담당: 별도 reviewer).**
   - 명령은 `pace agent verify`를 다시 호출한다. 사전 검토는 `--kind task`다.
   - 도구가 원장의 직전 fail을 기준점으로 삼아 자동 재검토(`rereview_of`)를 한다. reviewer는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함만 본다.
   - 서브에이전트처럼 도구 밖 reviewer를 쓰거나 경로를 바꾸지 않는다. 그러면 원장이 끊긴다.
   - purpose에는 합의된 목적만 넣는다. 작성자의 대응이나 자체 판정은 넣지 않는다.
   - 구현 후 검토라면 tester와 reviewer를 둘 다 다시 돈다. `evidence/impl-diff.patch`는 같은 경로로 갱신한다.

5. **기록 (담당: 워크트리 PM).**
   - 기록은 `pace project log`와 `review-records/R<n>.json`에 남긴다.
   - 지적마다 등급, 반영 여부와 이유, 수정 위치, 재검토 결과를 연결한다.
   - 사전 검토라면 `PRE-REVIEW.json`의 시도로 옮긴다. 첫 항목은 `new`, 재검토는 `changed`(reason: 자동 재검토)로 적는다.
   - 구현 후 검토라면 TASK-CLOSE "리뷰"에 `1차: tester … · reviewer blocking 2 — …` 한 줄과 교본 대조 한 줄을 적는다.

6. **다음 단계 판단.**
   - pass(blocking 0)가 되면 진행한다. 사전 검토는 구현으로, 구현 후 검토는 마감으로 간다.
   - 또 fail이면 2차 재검토를 같은 방식으로 한다.
   - 3차 fail에서 `diagnose` 신호가 나오면 그때 허브에 진단을 보낸다. 지금 단계는 아니다.
   - pass여도 계약 목표가 미달·미확인이면 done하지 않는다.

## 수 집계

| 항목 | 수 |
|---|---|
| 사용자 질문 | 0 |
| 승인 대기 | 0 |
| 허브 인계 | 0 (A에 걸리는 조치가 생길 때만 해당 조치에 대해 1건) |
| 실제 실행 | 이 시험에서는 하지 않음 |

merge, 배포, 커밋은 이 단계에 없다. 커밋은 마감 때 한다.

## 첨부와 읽은 범위

- 자동 첨부: 받았다. userEmail이 담긴 system-reminder였고, 외부로 보내지 않았다.
- 읽은 파일과 줄:
  - `skills/pace-project-dev/SKILL.md` 1–93줄(전체)
  - `references/task-steps.md` 1–12줄(전체)
  - `references/reviewer.md` 1–122줄(전체)
- `decision-rights.md`는 열지 않았다. A 번호의 세부는 확인하지 못했고, reviewer.md와 SKILL.md가 인용한 내용만 따랐다.
- 전체 바이트 수는 도구로 확인하지 않아 적지 않는다.