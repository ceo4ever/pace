# 팀 설계 제안: 필수 역할 점검 결과

파일은 수정하거나 만들지 않았고, 작업본 안의 파일만 읽었습니다.

## 결론
- **백로그 기획자 (`pace-backlog-planner`)**: 역할은 이미 있습니다. BP-02가 누락이라 개선안을 냅니다. BP-03은 정본에 등록되지 않았습니다. 등록은 BL261125_02 BR04 담당에게 돌려줍니다.
- **문제 해결자 (`pace-troubleshooter`)**: `요건 미등록(BL261125_01 담당)`입니다. 이번 점검에서는 정의나 추가안을 내지 않고 보류합니다.
- **선택 역할**: 추가하지 않습니다. 근거가 없습니다.

## 수행할 일 (순서대로)

1. **분석 – 업무와 범위 확인**
   - `docs/README.md:3-5`: 제출 경로는 `plans/intake/`이고 검사는 `make verify-intake`입니다. 배포 명령은 운용하지 않습니다.
   - 그래서 배포나 운영 역할의 근거가 없습니다. 병렬 프로젝트나 3단계 이상의 지속 업무를 보여 주는 단서도 없습니다. 선택 역할(`role-archetypes.md:10-19`)은 고르지 않습니다.
   - `records/sequence.md:3`: 이번 등록 범위는 BL261125_02 BR04의 기획자 합의입니다. BL261125_01은 착수 전이라 범위 밖입니다.

2. **필수 원형 확인**
   - `required-roles.md:9-10`: 필수 원형은 기획자와 문제 해결자 두 가지입니다.
   - 기존 원본은 `.pace/team/agents/pace-backlog-planner.md` 하나뿐입니다. 문제 해결자 원본은 없습니다.

3. **등록 대조 (합의 원문과 요건 ID 비교)**

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 기획자 | 제출 경로 명시 (`records/agreement.md:3`) | BP-01 v1 | 등록됨 (`required-roles.md:29`) |
| 기획자 | 검사 명령 명시 (`records/agreement.md:4`) | BP-02 v1 | 등록됨 (`required-roles.md:30`) |
| 기획자 | **승인 상태 반환** (`records/agreement.md:5`) | 없음 | **등록 누락.** 근거는 `agreement.md:5`이고 등록 담당은 BL261125_02 BR04입니다. |
| 문제 해결자 | 재현 명령 남김 (`records/followup.md:3`) | 없음 | 이번 범위 밖입니다. 표가 비어 있습니다 (`required-roles.md:34-35`). 등록은 BL261125_01 차례에 합니다. |

   - 등록 누락은 `required-roles.md:41` 규정대로 아래 정의 대조의 미충족 수에서 제외합니다. 제가 BP-03을 임의로 만들지 않고 BR04 담당에게 돌려줍니다.
   - 문제 해결자의 `followup.md`는 후속 합의입니다. 담당 차례에 등록하고 판정합니다 (`required-roles.md:39-40`).

4. **정의 대조 (현재 등록된 요건만)**
   - 선행 장치는 BP-01과 BP-02 모두 "없음"입니다 (`required-roles.md:29-30`). 그래서 보류 사유가 없습니다.

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 기획자 | `pace-backlog-planner` / `.pace/team/agents/pace-backlog-planner.md` | BP-01 v1 | 충족 | 원본 18행에 "BP-01 제출물은 plans/intake/에 둔다."가 있습니다. |
| 기획자 | 같은 원본 | BP-02 v1 | **누락** | 원본 전체에 `make verify-intake`가 없습니다 (`docs/README.md:4`에만 있음). |
| 문제 해결자 | 없음 | — | 요건 미등록(BL261125_01 담당) | `required-roles.md:35`의 표가 비어 있습니다. |

5. **개선안 (BP-02만, 반영은 승인 후)**
   - `pace-backlog-planner.md`의 "맡는 일"(16-18행)에 한 줄을 추가합니다. 예: "BP-02 저장소의 검사 명령은 `make verify-intake`다."
   - 그 밖의 항목은 그대로 둡니다. 기존 "실행 전 대조"(24-26행)와 점검 표지는 보존합니다. 새 조사·정본 A 문단은 공통 문단 바로 뒤에 둡니다 (`SKILL.md:36`).
   - 문제 해결자에는 제안을 내지 않습니다 (`required-roles.md:48`).

6. **도구와 등급 확인**
   - `tools/tiers.txt:1`: 지원하는 등급은 `high`뿐입니다. 기획자 원본도 `tier: high`(5행)라 일치합니다.
   - 원본의 `tools: []`, `resources: []`(6-7행)는 그대로 둡니다. 추가 도구는 필요하지 않습니다.

7. **검토 독립성과 결정 경계**
   - 기획자는 maker입니다 (원본 2행). 작성자와 다른 독립 검토가 필요하면 reviewer를 따로 배정하고, 다른 제공자를 먼저 시도합니다. 호출할 수 없으면 B1에 따라 같은 제공자의 새 세션을 쓰고 `cross: false`를 남깁니다 (`decision-rights.md:17`).
   - 합의 변경은 A-1(`decision-rights.md:11`)로 판정합니다. 이번 개선안은 기존 합의 항목을 정의에 옮기는 것이라 A-1 해당 없음으로 봅니다. 새 유료 비용도 없어 A-4도 해당 없음입니다.

8. **작성·동기화·검증 (승인 후에만)**
   - `pace team sync`로 생성물을 갱신합니다. 이어서 `pace team sync --check --json`과 `pace team verify pace-backlog-planner --agent <claude|codex>`를 실행합니다 (`SKILL.md:36, 42`). 지금은 실행하지 않았습니다.
   - 역할 배정은 `pace project start P### --role pace-backlog-planner --agent <claude|codex>`로 합니다 (`SKILL.md:38`).

9. **반환할 HANDOFF**
   - `HANDOFF: 호출자 | BP-02 개선안 반영 승인 요청 | pace-backlog-planner.md에 make verify-intake 없음 (docs/README.md:4, required-roles.md:30)`. 검증 기준은 원본에 해당 문장이 있고, sync `differences`가 0이며, verify 판정이 통과인 것입니다.
   - `HANDOFF: BL261125_02 BR04 담당 | BP-03 등록 요청 | records/agreement.md:5 "승인 상태를 반환한다"가 required-roles.md:27-30에 없음`.

## 판단 근거 요약
- 필수 역할은 두 개라는 정본(`required-roles.md:9-10`)을 따랐습니다. 이 중 이번 차례에 판정할 수 있는 것은 등록된 BP-01과 BP-02뿐입니다.
- 미등록 요건(BP-03, TS)에 대해 정의나 추가안을 만들면 `required-roles.md:41, 48`을 어기게 됩니다. 그래서 등록 담당에게 돌려줍니다.
- 역할을 늘릴 근거가 없고(배포 없음, 단일 업무 흐름), 기존 역할 하나가 필수 업무를 맡습니다. 팀은 기획자 하나에 BP-02 보강만 더하는 최소 구성입니다.

## 확인한 경로
`skills/pace-team/SKILL.md`, `skills/pace-team/references/required-roles.md`, `skills/pace-team/references/role-archetypes.md`, `skills/pace-project-dev/references/decision-rights.md`, `docs/README.md`, `records/agreement.md`, `records/sequence.md`, `records/followup.md`, `tools/tiers.txt`, `.pace/team/agents/pace-backlog-planner.md`
