## 판단과 순서

**읽은 범위**
- 자동 첨부: 사용자 계정 정보(이메일)가 system-reminder로 자동 첨부됐습니다. 값은 쓰지 않으며 외부로도 보내지 않습니다.
- 읽은 파일과 줄:
  - `SKILL.md` 1–93 (전체)
  - `references/reviewer.md` 1–125 (전체)
  - `references/decision-rights.md` 1–45 (전체)
  - `references/security.md` 1–43 (전체)
- 읽지 않은 파일: `commands.md`(log 형식), `task-steps.md`. 필요해지면 그때 엽니다.
- 전체 바이트: 도구로 확인하지 않았으므로 적지 않습니다.

**1. 분류 (담당: 워크트리 PM)**
- 대상은 소유 임시 fixture JSON입니다. 실제 사용자, 비밀, 외부 영향이 없다는 것도 확인됐습니다.
- 그래서 `security.md`의 민감 경로 모드(인증·결제·홈 폴더 쓰기·삭제·셸·외부 전송)에는 해당하지 않습니다. 이름에 "보안 설정"이 들어 있어도 같습니다.
- `decision-rights.md` A-1~A-5를 대조하면 모두 "아니오"입니다.
  - 되돌릴 수 있고(A-2), 외부 전송이 없고(A-4), 검토를 생략하지도 않습니다(A-3).
- 따라서 owner 질문은 없고 PM이 결정합니다. 이 판단의 근거는 기록합니다.
- 기본 체크리스트의 비밀 항목(`evidence/`·로그에 원문 비밀 없음)은 그대로 확인합니다.

**2. 반복 검토 (실제 명령)**
- 같은 대상의 reviewer 판정은 처음부터 `pace agent verify`로 받아 원장을 잇습니다. 구현 전 TASK.md 검토면 `--kind task`를 씁니다.
- 직전 fail이 있으면 지적을 먼저 반영하고 `verify`를 다시 부릅니다. 그러면 도구가 자동 재검토로 처리합니다.
- 차수마다 원문을 `review-records/`에 보존합니다. 구현 후 diff는 같은 경로의 `evidence/impl-diff.patch`를 갱신해서 씁니다.
- 재검토에서는 직전 blocking이 해소됐는지와 그 수정이 만든 새 결함만 봅니다. 바뀌지 않은 부분의 새 지적은 note로 남깁니다.
- 판정은 아래 순서로 처리합니다.
  - **pass:** 기록하고 다음 단계로 진행합니다.
  - **3회째 fail** (`escalation: diagnose`): 원인 층(structure, planning, design, other)을 가리고 `pace agent review-note --target <대상> --diagnosis --layer <층> --summary … --file <증거>`로 기록합니다. 그다음 전체 재검토를 받습니다.
  - **진단 뒤 첫 fail** (`ask_user` 단계): A 밖이므로 PM이 `evidence/`에 분류 이유와 근본 조치를 쓰고 `review-note --decision --by pm --choice … --summary … --file …`로 기록합니다. 그다음 전체 재검증을 받습니다.
  - **같은 지적이 두 번 반복되는데 실질 결함이 아니라 절차·열람 지적일 때:** 3회를 기다리지 않고 재검토를 멈춥니다. 증거 원문과 함께 허브에 B로 이관합니다. 이 경우 `review-note --void --record review-records/R<n>.json --summary "<도구 결함>" --file <근거>`로 해당 fail을 무효 처리합니다.
- `verify`가 종료 10(미실행)이면 다른 제공자를 먼저 다시 확인합니다. 안 되면 `--allow-same-provider`로 원장을 잇고 `cross: false`로 기록합니다.
- 경로를 도중에 섞지 않습니다.

**3. 기록과 보고**
- `pace project log`(형식은 `commands.md`에서 확인)와 TASK-CLOSE 리뷰 절에 아래를 남깁니다.
  - 대상, 제공자, 결과
  - blocking과 should_fix 처리
  - 재검토 결과
  - A 대조에서 "해당 없음"으로 본 근거
- 진단이나 PM 결정이 있었다면 4요소(무엇이 반복됐나, 고친 층, 채우거나 덜어낸 것, 재검증 결과)를 사후 요약으로 남깁니다.
- 허브 보고는 두 경우뿐입니다.
  - 장애나 구조 문제로 이관할 때
  - 완료 보고 때. 이때 "자체 판단 대조: 변경 없음"과 PM 결정 사항 요약을 적습니다.
- 검토 pass가 목표 달성 판정을 대신하지 않으므로, `goal-review` 판정은 별도로 합산합니다.
- 보고 전에 `pace memory status --project --body "…"`로 진행 상황을 갱신해 같은 커밋에 넣습니다.

**4. 대기 수**
- 질문: 0건
- 승인 대기: 0건
- 병합이나 푸시는 하지 않습니다. 병합이 필요해지면 허브가 owner 승인 뒤 실행하며, 이는 이번 범위 밖입니다.
- 승인이 필요해지는 경우는 하나입니다. 검토 실행 불가나 안전 기준 약화, 즉 A-3이 새로 걸리면 그 조치만 보류하고 허브를 거쳐 owner에게 요청합니다. 독립 작업은 계속합니다.
