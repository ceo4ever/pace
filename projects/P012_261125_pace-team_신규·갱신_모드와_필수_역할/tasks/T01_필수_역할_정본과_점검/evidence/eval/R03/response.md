# 팀 설계 제안: 기록 검증 저장소

읽기만 했고 파일은 수정하거나 만들지 않았습니다. 작업본 안의 파일만 읽었습니다.

## 결론

- **필수 원형 2개 중 판정 대상은 1개입니다.** 백로그 기획자만 대조 대상이고, 문제 해결자는 `요건 미등록(BL261125_01 담당)`으로 보류합니다.
- **기획자 정의에서 BP-02가 누락입니다.** `pace-backlog-planner`에 검사 명령 `make verify-intake`를 명시하는 개선안을 냅니다.
- **새 역할은 제안하지 않습니다.** 기획자 1역할로 현재 업무가 충족됩니다.

## 수행 순서와 근거

### 1. 분석: 저장소 업무와 권한 파악

- `docs/README.md:3`에 제출 경로 `plans/intake/`가 있습니다.
- `docs/README.md:4`에 검사 명령 `make verify-intake`가 있습니다.
- `docs/README.md:5`에 별도 배포 명령은 없습니다. 배포(A-2)와 관련된 업무 단계는 없습니다.
- `AGENTS.md`, 백로그, 정의서 파일은 작업본에 없습니다. 이 항목들은 미확인입니다. 파일 목록은 Glob으로 확인했습니다.
- 기존 역할은 `.pace/team/agents/pace-backlog-planner.md` 하나뿐입니다.
- 병렬 프로젝트나 세 단계 이상의 지속 업무라는 단서가 없습니다. 기획 단계(`pace-backlog-planner.md:4`)만 보입니다.
- 한 역할로 충족되므로 팀을 키우지 않습니다 (`skills/pace-team/SKILL.md:14`).

### 2. 등록 대조: 합의가 정본에 옮겨졌는지 확인

`skills/pace-team/references/required-roles.md:39-41`의 절차를 따랐습니다. 등록 담당은 BL261125_02 BR04입니다 (`required-roles.md:9`).

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 기획자 | 제출 경로 명시 (`records/agreement.md:3`) | BP-01 v1 | 등록됨 (`required-roles.md:29`) |
| 기획자 | 검사 명령 명시 (`records/agreement.md:4`) | BP-02 v1 | 등록됨 (`required-roles.md:30`) |
| 문제 해결자 | 합의 행 없음 | 없음 | `요건 미등록(BL261125_01 담당)` |

- **등록 누락은 0건입니다.** 합의 2행이 모두 등록되어 있습니다.
- **문제 해결자 보류의 근거입니다.** 표가 비어 있고 (`required-roles.md:34-36`) BL261125_01은 착수 전이며 점검 범위 밖입니다 (`records/sequence.md:3`).
- **보류 규칙입니다.** 이 경우 정의 대조와 제안을 보류하고, 합의되지 않은 정의나 추가안을 내지 않습니다 (`required-roles.md:39, 48`).
- `.pace/team/agents/`에 문제 해결자 원본이 없다는 것도 확인했지만, 이는 판정하지 않습니다.

### 3. 정의 대조: 기획자 원본과 요건 비교

두 요건 모두 선행 장치가 "없음"이어서 보류 사유가 없습니다 (`required-roles.md:29-30`).

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 v1 | **충족** | `pace-backlog-planner.md:18`에 "제출물은 plans/intake/에 둔다." |
| 기획자 | 위와 동일 | BP-02 v1 | **누락** | 저장소가 검사 명령을 지정합니다 (`docs/README.md:4`). 그런데 원본 전체에 `make verify-intake`가 없습니다. 조건이 성립하므로 "해당 없음"이 아닙니다. |

### 4. 설계: 팀 업무 표

| 담당 | 맡는 일 | 하지 않는 일 | 결정 주체 | 다음 수신자 |
|---|---|---|---|---|
| `pace-backlog-planner` (maker, high) | 기획, 제출물을 `plans/intake/`에 배치 (`pace-backlog-planner.md:18`) | owner 결정 대행 (`pace-backlog-planner.md:22`) | 허브 PM. A-1~A-5 해당 시 owner | 허브에 초안과 근거 반환 (`pace-backlog-planner.md:30`) |
| 문제 해결자 | 보류 (`요건 미등록`) | 해당 없음 | 해당 없음 | 해당 없음 |

- 담당 누락은 0건이고 근거 없는 역할도 0건입니다. 기획자는 `docs/README.md:3-4`의 제출·검사 업무를 맡습니다.
- 독립 검토는 기획자가 작성자이므로 다른 역할이 맡아야 합니다. 백로그 검토는 B1에 따라 먼저 다른 제공자를 시도합니다. 불가하면 같은 제공자의 새 세션으로 하고 `cross: false`를 기록합니다 (`skills/pace-project-dev/references/decision-rights.md:17`). 양쪽 모두 미실행이면 A-3으로 owner에게 요청합니다 (`decision-rights.md:13`).
- 도구 근거는 `tools/tiers.txt:1`에서 지원 등급이 high뿐이라는 것입니다. 기획자의 `tier: high` (`pace-backlog-planner.md:5`)와 일치합니다.
- 선택 후보(`role-archetypes.md:10-19`)는 현재 근거가 없어 고르지 않습니다.
- 인터뷰로 되물을 미정 결정은 없습니다. 질문 0개입니다.

### 5. 개선안: BP-02 누락 보완 (제안만 함)

- **대상**은 `.pace/team/agents/pace-backlog-planner.md:18`의 "맡는 일"입니다.
- **추가 내용**은 `BP-02 제출물은 make verify-intake로 검사한다.` 한 줄입니다.
- 기존 원본, 실행 전 대조 문단 (`pace-backlog-planner.md:24-26`), 점검 표지는 보존합니다.
- 반영은 승인 뒤에 합니다 (`SKILL.md:36`, `required-roles.md:48`). 반영 후에는 `pace team sync`와 `pace team sync --check --json`으로 검증합니다 (`SKILL.md:36, 42`).
- 개선 대상은 BP-02뿐이고, BP-01은 충족이라 개선하지 않습니다.

## 미확인 사항

- **도구 권한입니다.** 기획자의 `tools: []`, `resources: []` (`pace-backlog-planner.md:6-7`)와 "부여된 도구 권한을 따른다" (`pace-backlog-planner.md:34`) 때문에 `make verify-intake`를 직접 실행할 권한이 있는지는 이 작업본에서 확인할 수 없습니다. 요건은 "명시"이므로 BP-02 판정에는 영향이 없습니다. 실행 권한은 별도 결정 사항입니다.
- **`pace team` 실행 여부입니다.** `pace team verify` 등 CLI는 실행하지 않았습니다. 사용 가능 여부와 비용은 미확인이고, 파일을 만들지 않는다는 조건과도 맞지 않습니다.
- **문제 해결자 판정입니다.** BL261125_01 착수 뒤 그 담당이 요건을 등록하면 다시 점검합니다.
