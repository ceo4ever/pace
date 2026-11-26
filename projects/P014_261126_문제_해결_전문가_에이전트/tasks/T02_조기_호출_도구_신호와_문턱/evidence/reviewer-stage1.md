# 1단계 교차 검토: 독립 목표 대조 결과

**결론: 네 신호와 계약 유지는 코드와 시험으로 대부분 확인됩니다.** 다만 문턱 2의 근거가 약하고, 대상 시험만 확인했으며, 일부 범위가 빠져 있습니다. 2단계는 실행하지 않았습니다.

## 목적 대조

| 요건 | 구현한 곳 | 판단 |
|---|---|---|
| **TS-01 검토 실패 신호** | `review-signals.ts`의 `reviewFailureSignal`, `verify-cli.ts:465-468` | **충족.** 예산 단위가 아닌 일반 산출물에서 유효한 `fail`이 처음 두 번 연속되면 `review_failures`를 냅니다. void·중단·stale은 무시하고, unknown은 세지도 끊지도 않습니다. `pass`·`decision`·`diagnosis`가 나오면 다시 셉니다. 셋째 실패에는 신호 없이 기존 `escalation.stage: diagnose`가 그대로 나옵니다. 예산 단위는 새 신호를 내지 않고 기존 `budget.status`를 씁니다. |
| **TS-02 시험 실패 신호** | `test-runner/signals.ts`, `execute.ts`의 `observe` | **충족.** 대상 시험 기록이 같은 파일에서 두 번 연속 실패하면 `test_failures`를 냅니다. 외부 `node --test`, main checkout에서의 실행, 시간 초과, 빈 파일, 전체 skip은 실패로 세지 않습니다. |
| **TS-03 같은 영역 재발** | `recurringReviewSignals`, `sameArea` | **충족.** 같은 파일, 같은 category, 같은 criterion(없으면 impact), ±8행 안이면 지적 ID나 행이 바뀌어도 `recurring_area`로 잡습니다. 다른 파일·기준·category, 범위 밖 행, `note`는 걸러냅니다. |
| **TS-04 겉만 고침** | `changedInReview`, `patchSection` | **충족.** 같은 대상과 같은 `effective` 등급이고, 그 파일의 patch 변경 줄이 실제로 바뀌었을 때만 `superficial_fix`를 냅니다. 서로 다른 산출물끼리는 이 신호를 추정하지 않습니다(음성 시험 있음). |
| **TS-05 확인 가능성** | 출력 필드 `troubleshooterSignals`, 시험 출력의 `문제 해결 호출 권고:` 줄 | **충족.** 신호마다 종류·단위·근거 회차(기록 이름 또는 시도 ID)가 붙습니다. 문턱 직전, 기록 밖 시험, 무관한 지적에 대한 음성 시험이 있습니다. |

## 경계 확인 (코드를 직접 읽음)

- **경로 경계**
  - 검토 지적 위치에 `permissionPath`를 적용해 `..`, `.git`, `\`, `:`, 제어 문자를 거부합니다.
  - 비밀 형태 경로는 `hasSecret`로 제외합니다.
  - 절대 경로는 repo 기준 상대 경로로 바꾸고, repo 밖이면 거부합니다.
- **시험 이력 경계**
  - `project/P###` 브랜치의 하네스 소유 worktree에서만 기록합니다.
  - 저장 위치는 그 worktree 전용 Git 폴더 안의 `pace/test-signals/log.jsonl`입니다. 추적되지 않고 main과도 공유되지 않습니다.
  - Git 폴더 위치는 `realpath`로 `common/worktrees` 바로 아래인지 확인합니다.
  - 각 경로 단계에서 링크와 복수 링크를 거부합니다(`safeTeamPath`, `nlink === 1`).
  - 열 때는 `O_NOFOLLOW`를 씁니다.
  - 기록이나 읽기가 실패하면 빈 문자열을 돌려주고 시험 결과를 바꾸지 않습니다. 심볼릭 링크 시험으로 확인했습니다.
- **두 연속 시도**
  - 실행 한 번에 임의 `testAttempt`를 하나 붙입니다. 같은 실행 안에서 같은 파일 결과가 엇갈리면 unknown으로 합칩니다.
  - 직전이 `failed`가 아니고 최근 두 번이 모두 `failed`일 때 한 번만 신호를 냅니다.
  - stopEarly로 건너뛴 파일은 기록하지 않으므로 연속이 유지됩니다.
- **계약 유지**
  - 원장 행, 판정, 예산 회차, 종료 코드는 그대로입니다. 시험이 원장에 `troubleshooterSignals`가 없음과 `budget.rounds === 1`을 확인합니다.
  - 출력은 필드나 줄을 덧붙이기만 합니다. 시험 출력의 소비자는 `cli.ts:230` 하나이고 판정 줄을 다시 파싱하지 않습니다.
  - 예산 단위의 영역 신호는 후속 확인, 예산 소진, 상위 복구 상황에서는 내지 않습니다.

## 근거

- `focused-tests.txt`: 대상 시험 33건이 모두 통과했습니다. 새 시험 10건이 포함됩니다(검토 신호 4, 시험 신호 4, verify 통합 2).
- `convergence.json`: 기준 커밋 `4c7621d` 원장에서 두 번째 실패 뒤의 다음 판정은 fail 20, pass 7이었습니다. 가장 큰 원장(P009 T06)을 빼면 fail 5, pass 3입니다.
- `convergence-driver.txt`의 세는 방식(void·중단·stale 제외, decision·diagnosis에서 다시 셈, unknown 건너뜀, 연속 2회 도달)은 `reviewFailureSignal`과 일치합니다.

## 한계

1. **실행으로 재현하지 못했습니다.** 이번 세션에는 셸이 없어서 driver 집계, `tsc`, `npm run check` 전체를 실행하지 못했습니다. 위 수치와 시험 결과는 제출된 파일에 적힌 값입니다.
2. **문턱 2의 근거가 약합니다.** 관측 27건 중 19건이 원장 하나(P009 T06)에서 나왔고, 그 원장을 빼면 8건뿐입니다. 시험 문턱 2는 검토 이력에서 가져온 값이고, 시험 쪽 이력 근거는 주어진 자료에 없습니다.
3. **unknown 처리가 두 신호에서 다릅니다.** 검토 신호는 unknown을 건너뛰지만, 시험 신호는 시간 초과 같은 unknown이 연속을 끊습니다. "세지 않는다"는 요건은 양쪽 다 만족하지만, 이 차이가 의도인지는 PM이 확인해야 합니다.
4. **빠진 범위**
   - vitest는 여러 파일을 한 번에 실행하는 방식이라 관측하지 않습니다.
   - `pace test unit`, `all`, `finish`도 기록하지 않습니다.
   - 예산 단위(TS-01)는 새 `kind`를 내지 않고 기존 `budget.status`의 소진 표시를 씁니다. 그 표시가 TS-05의 "종류·근거 회차" 형식을 갖췄는지는 확인하지 못했습니다.
5. **운영상 주의**
   - 이력 파일은 계속 커지기만 합니다. `readTeamEvents`의 32MiB 상한을 넘으면 그 뒤로 신호가 조용히 멈춥니다.
   - 기록에 실패하면 stderr에 "지표 로그 기록 실패" 경고가 한 줄 나옵니다.
   - 이력은 시각 기준으로 정렬하므로, 시스템 시계가 뒤로 가면 순서가 틀어질 수 있습니다.

## 독립 노출과 자동 주입

- **읽은 것:** 지정된 네 파일과 후보 코드(`verify-cli.ts`, `test-runner/*`, `event-log.ts`, `team-input.ts`, `team/store.ts`, `handoff-files.ts`, `harness.ts` 일부, `review-permission.ts`).
- **자동으로 들어온 것:** `CLAUDE.md`·`AGENTS.md`, git status 스냅숏, SessionStart 훅의 부트 생략 메시지.
- **열지 않은 것:** TASK, 승낙 문서, 마감 문서. `required-roles.md` 변경분에 있는 BR02 링크와 `convergence.json`에 이름만 나오는 TASK·TASK-CLOSE 대상도 열지 않았습니다.
