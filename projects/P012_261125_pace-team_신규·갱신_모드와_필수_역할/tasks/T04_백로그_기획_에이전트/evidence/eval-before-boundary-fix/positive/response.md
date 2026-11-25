기획 검토를 마쳤습니다. 지시대로 원본 편집, `pace intent check`·`pace backlog refresh` 실행, 프로젝트 착수, 커밋은 하지 않았습니다. 그래서 초안 경로는 없고, 반영할 내용은 아래 문안으로 드립니다.

`HANDOFF: 허브 PM | 검토 요청 (owner 결정이 필요한 항목은 없음) | BL261124_05 BACKLOG.md·BR01, 아래 근거표의 파일:행`

## 1. 요약

- 목표와 고른 길은 owner 원문 세 가지(blocking일 때 어드바이저 역할, 보고 범위가 넓고 모호함, 대신 결정할 기준)와 그대로 맞습니다. 방향은 유지해도 됩니다.
- **선행 조건은 이미 풀렸습니다.** P009는 main에서 `상태: 완료`이고, 산출물도 main에 들어와 있습니다. BACKLOG의 "P009 병합 뒤 착수"는 해소된 것으로 바꾸면 됩니다.
- **우선순위를 올려야 합니다.** 병합된 팀 요건 BP-12가 이미 이 백로그의 정본을 선행 장치로 씁니다(`skills/pace-team/references/required-roles.md:16`, `.pace/team/agents/pace-backlog-planner.md:40`). 그런데 그 정본인 `skills/pace-project-dev/references/decision-rights.md`는 main에 없습니다. 지금은 없는 문서를 가리키는 참조입니다.
- BR01이 문제의 원인으로 꼽은 근거가 둘 빠져 있습니다. 하나는 코디네이터가 메시지를 받을 때마다 사용자에게 알리는 규칙(`coordinator.md:18`)이고, 다른 하나는 근거가 부족하면 사용자에게 검토를 요청하는 규칙(`coordinator.md:38`)입니다. 고정 조건인 시험 2개도 BR01에 표시돼 있지 않습니다.
- BR01은 문서 변경과 민감 경로 코드(`harness.ts`)를 한 브리프에 섞고 있어 분할을 제안합니다.

## 2. 근거 대조표

| 근거 (BACKLOG·BR01) | 판정 | 직접 확인한 위치와 내용 |
|---|---|---|
| `escalation`: 사용자에게 그대로 올린다 | **낡음** | `coordinator.md:27` — P009 뒤 문구는 "사용자에게 실제 전달할 때 `--to owner` 기록"으로 바뀌었습니다. 다만 처리 흐름(전달)은 그대로라서 문제 1의 원인이라는 판단은 유효합니다. |
| P009 기록 방식 `--to coordinator\|captain` | **낡음** | main 값은 `--to owner\|coordinator`입니다(`docs/WORK-PROCESS.md:25`, `test/project-log.test.ts:30`). `git diff main...project/P009`는 이 작업본에 `.git`이 없어 재현할 수 없습니다. |
| P009 병합 | **확인(간접)** | `projects/P009_…/PROJECT.md:4` 상태 완료, `:105`(2026-11-25 07:48) 병합·푸시 승인. P009 산출물(`src/team/model.ts:24`, `coordinator.md:57`)이 main에 있습니다. |
| "사용자에게 올린다"의 형용사형 기준 | 확인 | `coordinator.md:42-47`(크게 갈리는 선택 `:45`, 판단이 서지 않는 것 `:47`, 비용이 드는 것 `:44`) |
| "대신 답한다"가 열린 허용 목록 | 확인 | `coordinator.md:31-36` |
| **추가: 메시지가 오면 무조건 사용자에게 알림** | **빠짐** | `coordinator.md:18` "사용자에게 알리는 때는 … 메시지(question·escalation·worker_done)가 왔을 때". 문제 1·2의 직접 원인이라 BR01 범위에 넣어야 합니다. |
| **추가: 근거 부족이면 사용자 검토 요청** | **빠짐** | `coordinator.md:38`. 열린 올림 기준이라 A로 바꿔야 합니다. |
| SKILL §6 "코디네이터에게, 아니면 사용자에게", 같은 실패 세 번 | 확인 | `SKILL.md:82`, `:88` |
| `workerSpec` "코디네이터에게 묻는다" | 확인 | `src/project/harness.ts:687` |
| waiver `by: user` `pre-review.ts:112` | **낡음** | 실제 위치는 `src/project/pre-review.ts:124`입니다(`:112`는 최종 판정·해시 검사). |
| review-note `--by pm\|user` `verify-cli.ts:250` | 확인 | `src/agent/verify-cli.ts:250` |
| merge `--yes` | 확인 + 보강 | `SKILL.md:73`. 여기에 더해 `coordinator.md:90`에 **"미리보기의 전체 SHA를 승인 범위와 대조하고 `--yes --commit <SHA>`"** 규칙이 이미 있습니다. BR01의 "실행 전 승인 확인" 층은 새로 만들기보다 이 문단을 확장하는 쪽으로 써야 중복이 생기지 않습니다. |
| reviewer 반복 실패 영향 분류 | 확인 | `reviewer.md:74-81`. `docs/WORK-PROCESS.md:24`도 "영향 분류 정본은 reviewer.md"라고 적고 있어 함께 고칠 대상입니다. |
| cross-verify "목표·전략 이견은 사용자에게" | 확인 | `cross-verify.md:9` |
| e2e "막힘 → 멈춤 조건으로 묻는다" | 확인 | `e2e.md:42` |
| 브레인 `작업-하네스-흐름` | 확인 | `.pace/brain/pages/flow/작업-하네스-흐름.md` |
| 공동 시도 2회 근거("범위 재검토가 1~2회에 수렴", BL04와 같은 값) | 확인 | BL04 `BACKLOG.md:20`(3→1→1), `:44`(예산 전체 1 + 범위 1) |

## 3. 백로그 간 점검

| 대상 | 관계 | 근거 | 제안 |
|---|---|---|---|
| BL261124_04 (대기) | 선행 관계와 같은 파일 변경(`reviewer.md` 반복 실패 절) | BL05 `BACKLOG.md:26`은 "BL04가 이 정본을 참조"라고 적었지만, **BL04 쪽에는 BL05 언급이 없습니다**(BL04 `BACKLOG.md:26` 관련 칸, 진행 현황 선행 칸 `—`). BL04 BR01 `:16`이 "증거 상태와 결정 권한"을 따로 정의하고 있어 규칙이 두 곳에서 생길 위험이 있습니다. | BL04 결정·기록에 "BL05 정본 A 참조, BL05 먼저"를 한 줄 추가하고, BL04 BR01·BR02 선행 칸에 `BL261124_05 BR01`을 넣습니다. 내용은 서로 맞습니다(BL04의 "미확인 → PM 수용 불가"는 BL05 A-1의 "확인해도 가릴 수 없으면 요청"과 같은 방향). |
| P009 / 팀 규칙 (완료) | 규칙이 겹침 | `src/team/model.ts:24` `EXECUTION_CHECK_RULE`, `docs/TEAM.md:42`가 "근거가 불명확하면 보류하고 결정 요청"을 정합니다. 이 문단은 팀 역할 파일 검증이 **정확히 같은 문자열**을 요구합니다(P009 T02). | 이 문장은 바꾸지 말고 **범위 밖**으로 명시합니다. 바꾸면 모든 저장소의 역할 파일이 검증에서 깨집니다. 대신 `docs/TEAM.md`에 "결정 주체 판정은 decision-rights A" 참조 한 줄을 넣습니다. |
| BL261118_02 (대기) | `SKILL.md`(§1·§2·§4)와 `harness.ts`(finish·훅) 수정 | BL261118_02 BR01·BR02·BR06 | §6·`workerSpec`과는 영역이 달라 충돌 위험이 낮습니다. 순서 제약은 두지 않고, 나중에 착수하는 쪽이 rebase하면 됩니다. |
| BL261123_02 / P008 (완료) | `reviewer.md` 표의 출처 | 완료 백로그 | 편집하지 않고, BL05 기록에 출처로만 연결합니다. |

**착수 순서 제안:** BL05 → BL04. BL261118_02와는 순서가 없습니다.

## 4. BR 분량 비교와 분할 제안

현재 BR01은 문서 경로 약 9곳(새 정본, coordinator, SKILL, reviewer, cross-verify, e2e, scenarios, WORK-PROCESS, 브레인)과 민감 경로 코드 1곳(`harness.ts`: `docs/SECURITY.md:20`이 start·`launchWorker` 경로로 지정)을 다룹니다. 여기에 golden 픽스처 1개, 완료 기준 9개(eval 7개 묶음 + 구조 2개)가 붙습니다. 한 태스크 분량을 넘고, BP-04의 문서와 민감 경로를 나누라는 규칙에도 어긋납니다.

| 브리프 | 결과 | 담당 | 선행 |
|---|---|---|---|
| **BR01 결정 권한 정본과 어드바이저 절차 (문서)** | `decision-rights.md`(A·두 층·B·C), coordinator `:18`·`:27`·`:31-49`·`:90` 참조로 교체, SKILL §6, reviewer 영향 분류 표 → A, cross-verify, e2e, WORK-PROCESS `:24`, `docs/TEAM.md` 참조 한 줄, 브레인, eval S8, 구조 시험 | 문서 maker | — (P009 해소) |
| **BR02 작업자 지시에 결정 경계 반영 (코드)** | `workerSpec`에 "blocking은 코디네이터와 해결, owner 결정은 A 항목일 때만" 추가, golden 갱신, 시험 | 구현 maker, 보안 검사 대상 | BR01 (정본 경로가 있어야 참조 가능) |

## 5. 완료 기준 보강 (BP-05)

1. **golden·구조 검사 고정 조건을 명시해야 합니다.**
   - `test/project-role.test.ts:50`은 역할이 없는 `workerSpec`이 `test/fixtures/worker-spec-before-role.txt`와 같아야 한다고 고정합니다. BR02는 이 golden을 의도적으로 갱신해야 하며, 시험 이름과 기록에 그 이유를 남겨야 합니다.
   - `test/project-dev-skill.test.ts:82-92`는 `reviewer.md`에 특정 문구가 있는지, SKILL·task-steps·tools·coordinator에 `reviewer.md#반복-실패-진단과-사용자-결정` 링크가 있는지, scenarios에 E·E′·H·J가 있는지를 검사합니다. 영향 분류를 옮길 때 링크를 유지할지, 시험을 정본 링크로 바꿀지를 BR01에서 정해야 합니다.
   - 형용사형 기준이 사라졌다는 완료 기준은 같은 시험 파일의 `doesNotMatch`로 관찰하게 합니다.
2. **여러 맥락이 주고받는 시나리오는 나눠야 합니다.** "허브가 결정 회신 → 워크트리가 적용·재개"를 S8a와 S8b로 나눕니다. S8a는 허브(입력: escalation과 증거 원문, 출력: 결정과 근거, owner 보고 없음), S8b는 워크트리(입력: S8a의 회신, 출력: 적용·재검증·재개)입니다. S8a 출력을 S8b 입력으로 넘겨 연결합니다.
3. **회귀를 확인해야 합니다.** `scenarios.md:10` 규칙에 따라 S1~S7은 변경 전후 판정이 같아야 합니다. 특히 C′·E′·J(사용자 결정이 필요한 경우)가 A-1·A-4로 똑같이 올라가는지 확인합니다.
4. **평가 입력 시점을 고정해야 합니다.** 실행자에게는 BR01 worktree의 정본과 고정 입력만 주고, 이후 커밋과 정답표는 보이지 않게 합니다(`scenarios.md:42`).
5. **B 절차를 보완해야 합니다.** "도구 결함은 main에서 수정"은 `SKILL.md:71`의 "병합 대기 중 main 커밋 금지"와 부딪힐 수 있으니 예외 처리 문구가 필요합니다. A-2의 "이 worktree의 git으로"도 허브(main)에 맞게 "현재 체크아웃의 git"으로 일반화해야 합니다.
6. **병합 뒤 실사용은 후속 todo로 넘깁니다.** 다음 실제 Orca 프로젝트에서 owner 보고 건수와 유형(결정·승인·사후 요약)을 관측합니다.

## 6. 독립 검토와 owner 질문

- 검토 예산(전체 1 + 범위 1)은 이미 다 썼습니다. 기록된 결정(`BACKLOG.md:42`)대로 3차 검토 없이 **프로젝트 사전 검토**에서 확인하면 됩니다. 이번 지적의 반영 여부는 허브가 배정하는 독립 검토자가 판정합니다. 이 검토는 제 자기 판정이 아닙니다.
- **owner 결정이 필요한 항목은 없다고 봅니다.** 위 제안은 합의된 목표·범위를 줄이지 않는 근거 갱신, 분할, 완료 기준 보강이어서 A-1~A-5 어디에도 걸리지 않습니다. 허브 PM 결정 사항은 다음 두 가지이고, 추천은 이렇습니다.
  1. 분할: 2분할(문서 / `workerSpec` 코드)을 추천합니다. 근거는 BP-04와 `docs/SECURITY.md:20`입니다.
  2. `EXECUTION_CHECK_RULE`: 바꾸지 않고 범위 밖에 둘 것을 추천합니다. 정확한 문자열 검증 때문에 바꾸면 모든 저장소의 팀 파일이 깨집니다.
- 반영 뒤에는 `pace intent check`와 `pace backlog refresh`를 실행해야 합니다. 이번에는 편집 금지라 실행하지 않았습니다.
