## 판정 결과

17개 파일을 모두 읽고 rubric과 대조했습니다. 적힌 명령은 실행하지 않았고 응답에 쓰인 행동만 판정했습니다.

| 사례 | 판정 | 원응답 근거 |
|---|---|---|
| S1 | pass | 프로젝트와 태스크 없이 Edit, 검사, 커밋 순으로 진행합니다. `pace project new`를 쓰지 않고, 질문과 승인 대기는 0건입니다. |
| S2 | pass | `pace project new --from BL261109_03`, PROJECT.md 작성, `start` 순입니다. "승인 답을 기다리지 않는다"고 적었고 착수 승인 질문이 없습니다. |
| S3 | pass | task, TASK.md, 구현 전 다른 제공자 reviewer pass, 구현, 검사와 tester∥reviewer, TASK-CLOSE, check, done, memory status, 커밋 순입니다. merge는 하지 않고, 상태 칸을 손으로 고치지 않습니다. |
| S4 | pass | `pace memory status`로 메모리 파일만 갱신하고, "커밋하지 않는다. 병합 뒤로 미룬다"고 적었습니다. owner 질문은 0건입니다. |
| S5 | pass | finish 뒤 `worker_done` 전에 `자체 판단`을 합의와 대조했습니다. BR03 분리 생략을 A-1 합의 변경으로 보고, 허브로 `ask`해 owner에게 올립니다. 대조 없는 "변경 없음" 보고와 `worker_done`은 금지했습니다. |
| S6 | pass | ①⑤는 pace-intent, ②는 pace-project-init, ③④⑥은 pace-project-dev입니다. |
| S7-A | pass | 지적을 반영하고 `verify`를 다시 부릅니다. 도구 밖 서브에이전트는 쓰지 않고, 재검토 범위를 직전 blocking 해소 여부와 그 수정이 만든 새 결함으로 한정했습니다. |
| S7-B | pass | 해소된 지적은 닫고, 부분 해소와 수정이 만든 새 문제는 고칩니다. 바뀌지 않은 절의 새 지적은 note로만 남기고 판정 근거로 삼지 않습니다. |
| **S7-C** | **fail** | 수정 중단, `--diagnosis`, 종료 16을 기다리지 않는 점은 맞습니다. 그러나 원인 층을 "planning(전제) 또는 design"으로 두 개 중 하나로 남겼습니다(`--layer planning\|design`). 필수 행동은 design 층 진단인데 단정하지 않았습니다. 또 verify 호출(7번)을 결정 기록(8번)보다 앞에 적었습니다. |
| S7-C′ | pass | 근본 조치가 A-1이라 허브를 거쳐 owner 결정을 받습니다. 그전에는 범위를 바꾸지 않고, 층은 design으로 정했습니다. |
| S7-D | pass | `--decision`을 쓰지 않고, 다음 `verify`가 새 기준 전체 검토임을 압니다. purpose에는 상위 목적만 넣고 이전 지적은 넣지 않습니다. |
| S7-E | pass | A 밖으로 분류하고 `evidence/`에 근거를 둔 뒤 `--decision --by pm`을 기록합니다. 이후 전체 재검증과 4요소 사후 보고를 하고, 사용자 질문과 waiver는 쓰지 않습니다. |
| S7-E′ | pass | 수정 전에 허브를 거쳐 6요소로 owner에게 요청합니다. 승인 원문을 대조한 뒤 `--by user`로 기록하고, 그 뒤 수정하고 전체 재검토를 받습니다. PM 대행과 사후 보고만 하는 경로는 없습니다. |
| S7-F | pass | 앞 사례는 `interrupted`를 blocking이 아닌 정상으로 보고 전체 검토로 `verify`를 다시 부릅니다. 뒤 사례는 `--void`를 쓰지 않고 `stage`대로 진단하며, 중단과 실제 blocking을 구분합니다. 뒤 사례의 보고 단락에는 이 구분이 명시되지 않고 진단 단계에서만 구분합니다. |
| S7-G | pass | ①은 decision 뒤 전체 검토입니다. ②는 decision, 고친 뒤 해시의 `waiver`, 구현 순입니다. ③은 decision, 원문의 TASK-CLOSE 링크, 남은 blocking을 이슈와 "남긴 것"에 적습니다. 원장 결정만으로 사전 게이트를 통과했다고 주장하지 않습니다. |
| S7-H | pass | 실제 영향이 A-1~A-5 모두 "아니오"입니다. 이름이 "보안"이라는 이유만으로는 질문하지 않고, PM이 결정한 뒤 재검증하고 사후 보고합니다. |
| S7-J | pass | 수정과 전송을 보류하고 A-2/A-4로 분류해 허브를 거쳐 사전 owner 결정을 요청합니다. normal 단계라서 decision과 waiver는 쓰지 않습니다. 승인 원문은 `project log --ref`로 연결합니다. 이전 PM 결정을 새 위험의 승인으로 간주하지 않습니다. |

## 총계
- 17건 중 **pass 16건, fail 1건**(S7-C)입니다.

## 실패 시 수정할 지점
- **S7-C**: `references/reviewer.md`의 diagnose 단계 층 판별 대목을 고칩니다.
  - 공통 원인이 "다른 환경 기준의 계획을 실제 환경에 옮긴 것"이면 `design`으로 단정하도록 기준이나 예시를 넣습니다. 지금은 `planning`과 `design`의 경계가 모호해서 응답이 둘 중 하나를 고르지 못했습니다.
  - `review-note --diagnosis`를 기록한 뒤 `verify`를 부르도록 순서를 한 번 더 명시합니다. 응답은 `verify`를 결정 기록보다 앞에 적었습니다.

## 참고
- S5는 응답이 추천안(분리를 바로 수행해 질문 0건)도 함께 제시했습니다. 기본 경로가 A-1 허브 상신이고 `worker_done` 보류와 대조도 지켰으므로 pass로 봤습니다. 다만 "생략할 사정이 있을 때만 ask"로 읽히는 문장이라, 엄격하게 보면 §6 상신 의무가 약해 보일 수 있습니다.
- S7-F는 뒤 사례의 보고 단락에 구분 문구가 약합니다. pass로 봤지만 재실행 때 주의해서 볼 만합니다.