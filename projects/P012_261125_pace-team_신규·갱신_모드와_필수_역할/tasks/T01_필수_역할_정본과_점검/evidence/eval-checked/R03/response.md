## 팀 설계 제안

필수 원형은 2개이고 작업본에는 `pace-backlog-planner` 역할만 있습니다. 제안은 **BP-02 하나를 고치는 것**입니다. 문제 해결자는 요건이 아직 등록되지 않아 제안을 보류합니다. 아래 내용은 모두 읽기만 해서 확인했고, 파일은 수정하거나 만들지 않았습니다.

### 수행 순서
1. **분석**: `skills/pace-team/SKILL.md:10-16`에 따라 정의서와 기존 역할을 읽었습니다. 정의서는 `docs/README.md:3-5`이고, 기존 역할은 `.pace/team/agents/pace-backlog-planner.md:1-34`입니다.
2. **필수 원형 확인**: `required-roles.md:7-10`에 필수 원형이 둘 있습니다. 기획자의 등록 담당은 BL261125_02 BR04이고, 문제 해결자의 등록 담당은 BL261125_01입니다.
3. **등록 대조**: `required-roles.md:39-41` 절차를 따릅니다. 현재 점검 범위는 `records/sequence.md:3`에 따라 기획자 합의(BR04)뿐이고, BL261125_01은 착수 전입니다.
4. **정의 대조**: `required-roles.md:45-48` 절차를 따릅니다. 등록된 요건이 있는 기획자만 대조합니다.
5. **설계**: 아래 개선안을 냅니다. 이 개선은 합의된 목적·범위·완료 기준을 바꾸지 않고 요건을 채우는 것이어서, `decision-rights.md:11`의 A-1은 "아니오"입니다. 외부 영향(A-2), 안전 기준 약화(A-3), 새 비용(A-4)도 없습니다.
6. **승인 뒤 작성·동기화·검증**(`SKILL.md:36,44`): 원본을 고친 뒤 `pace team sync`, `pace team sync --check --json`, `pace team verify pace-backlog-planner --agent <claude|codex>` 순서로 진행합니다. 호출 범위와 비용 승인이 필요합니다.

### 등록 대조표
| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로 명시 · `records/agreement.md:3` | BP-01 · v1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | 검사 명령 명시 · `records/agreement.md:4` | BP-02 · v1 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 해당 합의 없음 (표가 비어 있음, `required-roles.md:35`) | 없음 | 요건 미등록(BL261125_01 담당) · `records/sequence.md:3` |

기획자 합의 2개는 모두 등록되어 있어 등록 누락은 0건입니다.

### 정의 대조표
| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 · v1 | 충족 | 18행 "제출물은 plans/intake/에 둔다"가 `docs/README.md:3`의 경로와 일치합니다. 선행 장치는 없습니다. |
| 백로그 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-02 · v1 | 누락 | `docs/README.md:4`가 `make verify-intake`를 지정합니다. 원본 1-34행 어디에도 이 명령이 없습니다. 선행 장치는 없어서 `보류(선행 미병합)`가 아닙니다. |
| 문제 해결자 | 해당 없음 (아직 점검 대상 아님) | 없음 | 요건 미등록(BL261125_01 담당) | 정의 대조와 추가안을 보류합니다(`required-roles.md:39,48`). 합의되지 않은 정의는 제안하지 않습니다. |

### 개선안 (BP-02)
- **대상**: `.pace/team/agents/pace-backlog-planner.md`의 "맡는 일" 절(16-18행).
- **내용**: BP-01 줄 옆에 `BP-02 제출 전 검사는 make verify-intake를 실행한다.` 형식의 줄을 추가합니다. 요건 ID 표기는 기존 BP-01과 같게 맞춥니다.
- **보존할 부분**: "실행 전 대조" 문단(24-26행)과 점검 표지는 그대로 둡니다. `SKILL.md:36`이 정한 대로, 공통 문단 바로 뒤에 조사와 정본 A를 설명하는 별도 문단이 필요한지는 작성 단계에서 확인합니다.
- **배포 명령**: `docs/README.md:5`에 별도 배포 명령은 운용하지 않는다고 되어 있으므로 추가하지 않습니다.

### 도구와 등급
- `tools/tiers.txt:1`은 지원 등급을 `high` 하나로 제한합니다. 역할의 `tier: high`(원본 5행)와 일치하므로 등급 변경이 필요 없습니다.
- 역할의 `tools: []`(원본 7행)는 BP-02 이행에 영향이 없습니다. 명령 이름만 명시하면 되기 때문입니다. 실제로 `make verify-intake`를 실행하는 권한이 필요한지는 이 작업본에서 확인할 수 없어 미확인으로 남깁니다.

### 팀 구성 판단
- 역할은 기획자 1개로 충분합니다. 필수 업무가 이 역할의 제출·검사 요건이고, 병렬 프로젝트나 다른 제공자가 필요한 검토 단서는 확인되지 않았습니다(`SKILL.md:14`).
- 선택 역할 후보(`role-archetypes.md:10-19`)는 근거가 없어 추가하지 않습니다.
- 문제 해결자는 BL261125_01이 요건을 등록한 뒤 재점검합니다. 그때 정의 대조와 추가안 여부를 판정하면 됩니다.

### 읽은 경로
`skills/pace-team/SKILL.md`, `skills/pace-team/references/required-roles.md`, `skills/pace-team/references/role-archetypes.md`, `skills/pace-project-dev/references/decision-rights.md`, `docs/README.md`, `records/agreement.md`, `records/sequence.md`, `tools/tiers.txt`, `.pace/team/agents/pace-backlog-planner.md`. 모두 작업본 안의 파일입니다.
