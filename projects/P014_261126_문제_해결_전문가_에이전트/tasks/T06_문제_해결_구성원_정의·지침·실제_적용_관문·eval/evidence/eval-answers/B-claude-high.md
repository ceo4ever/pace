# 사례 B 해결안: 계약 변경 뒤 첫 `verify`가 직전 검토 범위로 좁아짐

**결론:** 증거 이어가기 기준점을 고르는 `evidenceRereviewBase`가 지금 회차가 어디서 시작하는지 모릅니다. 그래서 계약 변경 직후 R1이 다시 기준점으로 쓰였을 가능성이 가장 높습니다. 원인 층은 **설계**입니다. 회차를 판정하는 곳이 둘로 갈라져 있습니다. 해결안으로는 기준을 하나로 합치는 B를 추천합니다.

## 막힌 목표
- **목표:** 새 검토 단계나 계약 변경 뒤 첫 호출은 전체를 검토합니다. 같은 회차에서 실제 증거를 이어 갈 때만 처리한 지적과 변경분을 넘깁니다. 형식을 해석할 수 없는 반환과 증거가 모자란 반환은 따로 다룹니다 (`case.md:3`).
- **상위 목적과 맞는지:** 맞습니다. 독립 검토 두 번이 같은 문제(검토 범위가 의도치 않게 좁아짐)를 지적했고, 목표 자체를 고칠 근거는 자료에 없습니다. 목표는 그대로 두고 구현을 고치는 쪽으로 봅니다.

## 확인한 원문 증거 (실행한 재현 없음)
1. **기준점 탐색에 경계가 없음.** `evidenceRereviewBase`는 받은 `entries` 전체에서 `findLast`로 다음 조건을 만족하는 마지막 행을 찾습니다 (`case.md:165-167`, 원본 추정 `src/agent/verify-cli.ts:87-89`).
   - 같은 `target`, `verdict === "unknown"`, `required_criteria` 있음, `structured_stage` 있음
   - 확인하지 않는 것: 원장 기준점(offset), `recordedStage === scope.stage`, `void`·`interrupted` 여부, 그 뒤에 다른 검토가 있었는지, 현재 `criteria`와 같은지
2. **진입 조건이 회차 경계와 겹침.** 이 함수는 `budget && !budget.latest`일 때 호출됩니다 (`case.md:277`, 추정 `verify-cli.ts:271`).
   - `readReviewBudget`은 `entries.slice(offset)`으로 자르고, 단계가 다른 행은 건너뜁니다 (`case.md:30-32`, 추정 `review-budget.ts:115-117`).
   - 그래서 계약 변경 직후나 새 단계 첫 호출에서는 `budget.latest`가 비게 됩니다. "증거 이어가기"를 시작하는 조건과 "새 회차"의 조건이 같은 상태입니다.
3. **선택 순서.** `budget?.latest`가 없으면 `evidenceBase`로 넘어갑니다 (`case.md:283-284`). 이렇게 고른 기준점은 `loadRereview`로 들어가고, 거기서 `rereview_of`가 생깁니다 (`case.md:285-287`, `309`).
4. **같은 부류의 결함이 하나 더 있음.** `latestEvidenceGaps`도 offset이나 단계를 보지 않고 원장 전체에서 마지막 검토를 고릅니다 (`case.md:76-83`). 그 결과가 `followupReport`의 `evidence_action`과 waiver 거부 조건에 그대로 쓰입니다 (`case.md:130`, `138`, `65-68`).

**보고된 사건 순서에 대입한 결과 (추정):**
- R1은 증거 미확인(`unknown`)이었고, 그 뒤 두 번 실패한 다음 계약이 바뀌었습니다 (`case.md:5`).
- offset 때문에 `budget.latest`가 비고, `evidenceRereviewBase`는 두 번의 실패를 건너뛰어 R1을 찾습니다. 단계·형식 검사(`case.md:174-175`)는 통과합니다.
- 그래서 `rereview_of`가 R1이 되고 직전 범위 프롬프트가 쓰였습니다.
- 다만 이 순서는 코드를 읽고 추론한 것입니다. 실제 기록에서 `rereview_of`가 어떤 기록을 가리켰는지는 자료에 없습니다.

## 원인 후보와 반증

| 후보 | 근거 | 가르는 관찰 | 상태 |
|---|---|---|---|
| **H1** 증거 기준점 탐색에 경계가 없음 | 위 1~3 | `rereview_of`가 R1을 가리키면 확정 | **가장 유력 (추정)** |
| H2 원장 기준점 키(`relative(...)`)가 맞지 않아 offset이 적용되지 않음 | `case.md:27-28`만 있고 offsets를 만드는 쪽은 자료에 없음 | `rereview_of`가 두 번째 실패(F2)를 가리키면 H2 | 반증 못 함 |
| H3 `!scope && before.base` 경로 | R1에 `required_criteria`가 있으므로 scope가 있는 경로 (`case.md:269`, `306`) | 거의 배제 | 추정으로 배제 |
| H4 recovery나 joint grant 때문에 `latestDefinitive`가 기준점이 됨 | `case.md:279-281`. 두 번 실패한 뒤 후속 허가가 있었을 수 있음 | 마지막 call 기록에 `followup`이나 grant가 있는지 | 반증 못 함 |
| 부차 원인: `state.decision.firstReview`가 계약 변경을 첫 검토로 보지 않음 | 이 값이 참이었다면 기준점이 `undefined`였을 것 (`case.md:280`) | 그 시점의 `firstReview` 값 | 정의가 자료에 없음 |

**원인 층:** 설계입니다. 회차 경계(offset과 단계)는 `readReviewBudget` 한 곳에만 있습니다. 그런데 증거 이어가기 판정은 `!budget.latest`라는 간접 신호와 원장 전체 탐색에 따로 기대고 있습니다. 구현 결함은 이 구조의 결과입니다.

## 해결안

**A. 땜질: `evidenceRereviewBase`에 offset과 단계 필터를 추가**
- 목표 달성: 이번 증상은 막습니다. 다만 `latestEvidenceGaps`에도 같은 수정을 따로 해야 하고, 경계 로직이 세 곳에 복제됩니다.
- 비용: 작음. 위험: 다음 경계 조건(void, 기준 변경)을 또 놓칠 수 있습니다. 되돌리기: 함수 하나만 되돌리면 됩니다.

**B. 추천: 현재 회차를 하나의 기준으로 계산**
- `readReviewBudget`의 같은 루프(offset·단계·void·interrupted 필터를 이미 적용하는 곳)에서 `budget.evidenceContinuation`을 계산합니다.
- 이 값은 다음 조건을 **모두** 만족할 때만 채웁니다.
  - 현재 회차의 **마지막** 유효 검토가 `unknown`이다.
  - 형식은 해석되었고(`findings !== null`) 증거 공백만 있다.
  - format 원장 기록과 맞는다.
  - `required_criteria`가 현재 `reviewCriteria(scope, artifact)`의 id와 `matchingCriteria`로 일치한다.
- `verify-cli`의 `evidenceBase`(`case.md:277`)와 `latestEvidenceGaps`(`case.md:76-83`)는 둘 다 이 값만 씁니다. 원장 전체를 따로 탐색하는 코드는 지웁니다.
- 회차에 아무 검토도 없을 때는 이어갈 기준점이 없다는 것을 명시적으로 처리합니다. 필요하면 `decision.firstReview`도 같은 계산을 쓰게 합니다.
- 목표 달성: 계약의 "같은 회차"를 코드에서 직접 표현하므로, 단계 변경·계약 변경·기준 변경·뒤에 다른 판정이 있는 경우가 한 번에 해결됩니다.
- 비용: 중간 (모듈 세 개와 시험). 위험: budget 계산이 바뀌므로 회차 수 집계가 달라지지 않는지 확인해야 합니다. 되돌리기: 커밋 단위로 되돌릴 수 있고, 원장 형식은 바뀌지 않습니다.

**C. 이어가기를 명시적으로 선언 (예: `--evidence-for <record>`)**
- 목표 달성: 암묵적 추론을 없앱니다.
- 비용: CLI 계약이 바뀌므로 owner 결정이 필요합니다(정본 A). 지금은 추천하지 않으며, B가 실패하면 고려합니다.

**추천과 이유:** B입니다. 이번 증상(R1 재사용)만이 아니라, 회차 경계를 모르는 곳이 두 군데 있다는 부류 자체를 없앱니다. 원장 형식도 바꾸지 않습니다. 적용 여부는 호출 PM이 정합니다.

## 검증 계획 (제안만 함, 실행하지 않음)
`verifyCommand`는 실행기를 주입할 수 있으므로(`case.md:159`) 시험 안에서 `crossVerify`에 넘어가는 `rereview`를 직접 관찰할 수 있습니다.

1. **실패 재현 (수정 전 red):** R1(`unknown`, 기준 있음, 증거 공백) → F1 fail → F2 fail → 계약 변경 offset → `verify`.
   - 수정 전 예상: `rereview_of`가 R1 (H2라면 F2).
   - 수정 후 기대: `rereview`가 `undefined`이고 `review.rereview_of`가 null.
   - 같은 시나리오에서 offset 대신 단계 변경도 확인합니다.
2. **음성 대조 (좁은 검토는 유지되어야 함):**
   - 같은 회차에서 R1(증거 공백) 바로 뒤 `verify` → `rereview_of`가 R1.
   - R1이 형식 해석 불가(`findings === null`) → 이어가기 없음. 해석 불가와 증거 부족이 따로 다뤄지는지 확인합니다.
   - R1 → F1 → `verify` → 기준점이 F1.
   - R1이 void 처리됨 → 이어가기 없음.
   - 같은 회차지만 필수 기준이 바뀜 → 전체 검토.
3. **같은 부류 확인:** 계약 변경 직후 `followupReport`에 이전 회차의 `evidence_action`이 나오지 않아야 하고, waiver가 이전 회차의 증거 공백 때문에 거부되지 않아야 합니다.
4. **재발 감시:** 기존 회차 수 집계(`ROUND_LIMIT`)와 escalation 시험이 그대로 통과해야 합니다.
5. **실패하면 다음 수:**
   - 1번이 수정 후에도 `rereview_of`를 만들면 H2(offsets 키)를 확인합니다.
   - 그래도 남으면 H4(grant·recovery 때문에 `latestDefinitive`가 기준점이 됨)를 확인하고, 실제 원장과 `rereview_of` 값을 확보합니다.

## 남은 불확실성
- 실제 사고 기록의 `rereview_of` 값, 원장, offsets, grant 상태는 자료에 없습니다. H1과 H2·H4를 가르는 결정적 관찰이 아직 없습니다.
- `verifyCommand` 안의 `entries`가 무엇인지는 발췌에 없습니다. 원장 전체라고 가정했습니다.
- `budget.latest`, `decision.firstReview`, `latestDefinitive`의 정의도 발췌 밖이라 추정입니다.
- 사후 검토와 해결 자료는 사본에 없습니다 (`case.md:5`). 위 분석은 당시 발췌만 근거로 합니다.
- 쓰기, 배포, 외부 접속, 재현 실행은 하지 않았습니다.

HANDOFF: 호출 PM | 해결안 B 추천과 검증 계획. 적용 여부는 PM이 결정하고, C를 택하면 정본 A에 따라 owner 결정이 필요합니다 | 근거 `case.md:30-32`, `76-83`, `165-180`, `277-284`
