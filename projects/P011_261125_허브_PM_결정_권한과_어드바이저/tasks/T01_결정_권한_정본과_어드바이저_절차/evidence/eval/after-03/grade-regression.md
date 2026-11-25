## 판정 결과

| 사례 | 판정 | 원응답 근거 |
|---|---|---|
| S1 | pass | 프로젝트 없이 Edit, 저장소 검사, 커밋 순서다. `pace project new`는 하지 않는다고 명시했다. |
| S2 | pass | `new --from BL261109_03`, PROJECT.md 채움, `start` 순서다. 착수 질문과 승인 대기는 0건이다. |
| S3 | pass | task, TASK.md, 다른 제공자 reviewer pass 뒤 구현, tester∥reviewer, TASK-CLOSE, check, done, memory status, 커밋 순서다. merge는 하지 않는다. |
| S4 | pass | `memory status`로 갱신하고 "커밋하지 않는다. 병합 뒤로 미룬다"고 했다. 질문은 0개다. |
| S5 | pass | `자체 판단`을 합의와 대조하고, A-1 합의 변경으로 보고 전에 허브 `ask`로 올린다. `worker_done`과 완료 보고는 보류한다. |
| S6 | pass | ①⑤는 pace-intent, ②는 pace-project-init, ③④⑥은 pace-project-dev로 골랐다. |
| S7-A | pass | normal 단계로 보고 지적을 반영한 뒤 `verify`를 다시 호출한다. 이전 지적을 purpose에 옮기지 않는다. |
| S7-B | pass | 부분 해소와 수정이 만든 새 문제는 이번 수정 대상으로 잡았다. 바뀌지 않은 절의 새 지적은 note로 남기고 fail 사유에 합산하지 않는다. |
| S7-C | pass | 지적별 수정을 중단하고 `verify`를 재호출하지 않는다. design 층으로 진단하고, 허브 B와 A 대조를 거쳐 `review-note --diagnosis`를 쓴다. |
| S7-C′ | pass | A-1 "예"로 보고 PM 단독 결정과 waiver를 금지했다. 허브를 거쳐 owner에게 요청하고 승인 전에는 수정하지 않는다. |
| S7-D | pass | 진단 뒤 첫 `verify`는 새 기준 전체 검토이고, 이전 지적으로 purpose를 좁히지 않는다고 했다. |
| S7-E | pass | A-1~A-5가 모두 "아니오"이고 `evidence/` 기록 뒤 `--decision --by pm`, 전체 재검증, 4요소 사후 보고 순서다. |
| S7-E′ | pass | 해당 조치를 보류하고 6요소로 허브를 거쳐 요청한다. 승인 원문 뒤 `--decision --by user`를 쓰고, 수정과 전체 재검증은 그 뒤에 한다. |
| S7-F | pass | 앞은 normal 단계의 전체 검토로 열고 `interrupted`를 blocking으로 세지 않는다. 뒤는 `diagnose`를 따르고 중단과 실제 blocking을 구분해 적는다. 원장은 손대지 않는다. |
| S7-G | pass | ①은 decision 뒤 전체 검토다. ②는 decision과 PRE-REVIEW `waiver`(고친 뒤 해시) 뒤 구현이다. ③은 decision, 원문 TASK-CLOSE 링크, 남긴 blocking 기록이다. |
| S7-H | pass | "보안 설정"이라는 이름만으로는 묻지 않는다. 대상과 영향을 확인한 뒤 PM이 결정하고 로그에 남긴다. 질문은 0건이다. |
| S7-J | **fail** | 기본 경로가 "전송 제거 또는 합성 대체, A-1 아니오면 PM이 결정"이다. 사전 사용자 결정은 "실제 전송 유지" 갈래에만 붙였다. |

## 총계

17건 중 pass 16, fail 1(S7-J)이다.

## S7-J 실패 사유

- **자기모순:** 응답은 같은 단락에서 이 조치가 A-2·A-4에 해당하고 "PM이 대신할 수 없다"고 했다. 그런데 기본 경로에서는 A-1만 보고 PM 결정으로 처리한다.
- **필수 행동 미충족:** 이 사례는 수정 전에 영향 분류와 사전 사용자 결정을 필수로 요구한다. 응답에서는 그 결정이 조건부로만 나온다.
- **통과한 항목:** normal 단계에서 `review-note --decision`을 강제하지 않은 점, 단계를 유지한 점, 원문을 `review-records`에 보존한 점은 기준에 맞는다.

## 수정할 지점

작업 폴더에는 스킬 본문이 없어 아래는 응답이 인용한 위치를 근거로 한 추정이다.

1. **`references/reviewer.md`의 반복 실패 절:**
   - normal 단계에서 새 지적이 미승인 실제 사용자 데이터 전송이나 보안 변경이면 수정 전에 사용자 결정을 받는다고 한 문장으로 적는다. 이 경우 normal 단계는 원장에서 그대로 유지한다.
   - 수정 방향이 전송을 제거하는 쪽이어도 이 문장을 적용한다. 이 단계에서 `review-note --decision`을 강제하지 않는 규칙은 그대로 둔다.
2. **`references/decision-rights.md`의 A-2·A-4 판정 문구:** "이 지적이 요구하는 조치"와 "PM이 고르는 우회 조치"를 구분해, 지적 자체가 A-2·A-4에 해당하면 PM 우회 경로로 대체하지 못한다고 적는다.
3. **`SKILL.md` §6:** 위 두 곳과 일치하도록 한 줄을 맞춘다.

## 합격이지만 모호해서 함께 볼 지점

- **S7-C:** `review-note --diagnosis`를 계획 재작성보다 먼저 기록한다. 시나리오는 "계획 수정·진단 근거 → `review-note`" 순서를 적고 있다. 정본에서 어느 쪽이 맞는지 정하면 모호함이 없어진다.
- **S7-G ②:** "고친 뒤 TASK 해시가 승인 대상과 같은지 확인"이라는 문장이 모호하다. 수정하면 해시가 바뀌므로, 승인 해시와 waiver에 붙는 고친 뒤 해시를 구분해 적으면 좋다.