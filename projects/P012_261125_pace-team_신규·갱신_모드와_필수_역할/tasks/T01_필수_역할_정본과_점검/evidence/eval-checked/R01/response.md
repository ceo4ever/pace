# 팀 설계 제안: 필수 역할 점검 (수정·생성 없음)

## 수행 순서 (읽기만 했습니다)
1. `skills/pace-team/SKILL.md`를 읽었습니다. 분석 절(12~16행)은 필수 원형을 정본으로 확인하고 등록 누락을 별도 표로 남기라고 합니다. 설계 절(28행)은 요건 ID마다 판정을 남기라고 합니다.
2. `skills/pace-team/references/required-roles.md`를 읽었습니다. 필수 원형은 백로그 기획자와 문제 해결자 둘입니다(9~10행).
3. `docs/README.md`, `records/agreement.md`, `records/sequence.md`, `records/followup.md`, `tools/tiers.txt`, `.pace/team/agents/pace-backlog-planner.md`를 읽었습니다. 선택 후보 참조(`role-archetypes.md`)와 `decision-rights.md`도 읽었습니다.
4. 등록 대조를 먼저 하고 정의 대조를 뒤에 했습니다(`required-roles.md:39-47`). 작업본 밖은 읽지 않았습니다. `pace team sync/verify`는 실행하지 않았습니다.

## 등록 대조
담당과 시점은 `records/sequence.md:3`에 있습니다. 이번 점검의 등록 범위는 BL261125_02 BR04의 기획자 합의이고, BL261125_01은 착수 전이라 범위 밖입니다.

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로를 역할 정의에 명시 · `records/agreement.md:3` | BP-01 · 1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | 검사 명령을 역할 정의에 명시 · `records/agreement.md:4` | BP-02 · 1 | 등록됨 · `required-roles.md:30` |
| 백로그 기획자 | 승인 상태를 반환 · `records/agreement.md:5` | 없음 | **등록 누락**. 원문은 `agreement.md:5`이고 등록 담당은 BL261125_02 BR04입니다. 정본 표(`required-roles.md:27-30`)에 해당 행이 없습니다. |
| 문제 해결자 | `records/followup.md:3`(재현 명령) | 없음 | **요건 미등록(BL261125_01 담당)**. 표가 비어 있고(`required-roles.md:34-35`) 착수 전입니다(`sequence.md:3`). followup 문장은 그 담당의 차례에 등록합니다. |

- 등록 누락 행은 아래 정의 대조의 미충족 수에서 제외했습니다(`required-roles.md:41`).
- 등록은 정본 수정이라 이 제안 범위 밖입니다. 누락 사실과 근거를 BR04 담당에게 돌려주는 것까지만 합니다.

## 정의 대조
| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 · 1 | 충족 | 18행 "제출물은 plans/intake/에 둔다"가 `docs/README.md:3`의 제출 경로와 일치합니다. 선행 장치는 없습니다(`required-roles.md:29`). |
| 백로그 기획자 | 같은 원본 | BP-02 · 1 | 누락 | 정의 전체(1~34행)에 검사 명령이 없습니다. 저장소의 검사 명령은 `docs/README.md:4`의 `make verify-intake`입니다. |
| 문제 해결자 | 해당 원본 없음 | (미등록) | 요건 미등록(BL261125_01 담당) | 합의되지 않은 정의나 추가안은 내지 않습니다(`required-roles.md:48`). 재점검 조건은 BL261125_01 착수 뒤 등록이 끝나는 시점입니다. |

## 제안
역할이 이미 있으니 추가안이 아니라 누락 요건의 개선안입니다(`required-roles.md:48`).

- **BP-02 개선안:** `pace-backlog-planner.md`의 "맡는 일"(16~18행)에 검사 명령을 명시합니다. 예: "검사는 `make verify-intake`를 실행한다". 선행 장치가 없으니 바로 적용할 수 있습니다.
- **BP-01:** 충족이라 개선안이 없습니다.
- **등급:** 원본의 `tier: high`(5행)는 `tools/tiers.txt:1`의 지원 등급과 같습니다. 별도 조치는 필요 없습니다.
- **도구:** 역할의 `tools: []`(7행)와 "이 환경에 부여된 도구 권한을 따른다"(34행)로 충분합니다. 검사 명령 실행을 위해 도구를 추가할지는 이번 합의에 근거가 없어 제안하지 않습니다.
- **배포:** `docs/README.md:5`에 별도 배포 명령이 없습니다. A-2 대상 조치는 이 제안에 없습니다.
- **선택 역할:** 한 역할과 기존 검토 절차로 이번 필수 요건을 충족합니다. 선택 후보는 추가하지 않습니다(`SKILL.md:14`).

## 판단의 근거와 한계
- 승인 상태 반환(`agreement.md:5`)은 정본에 등록되지 않았습니다. 이 항목으로 정의에 문장을 넣으면 등록 전 요건을 앞질러 적용하는 셈이라 제안하지 않았습니다.
- 변경 반영은 결정 권한 정본 A로 판정합니다. 제출 경로와 검사 명령을 문서에 맞춰 적는 일은 합의된 완료 기준을 바꾸지 않아 A-1에 해당하지 않는 것으로 봅니다(`decision-rights.md:11`).
- 실제 반영 단계에서는 `pace team sync`와 `pace team verify`로 확인해야 합니다(`SKILL.md:36,44`).
