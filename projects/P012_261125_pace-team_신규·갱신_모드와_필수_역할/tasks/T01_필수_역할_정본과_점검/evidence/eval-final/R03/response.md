# 팀 설계 제안 (읽기 전용 점검, 파일 수정·생성 없음)

## 결론
- **백로그 기획자 (`pace-backlog-planner`)**: 역할은 이미 있습니다. BP-01은 충족입니다. **BP-02는 누락**이라 개선안이 필요합니다.
- **문제 해결자 (`pace-troubleshooter`)**: `요건 미등록(BL261125_01 담당)`입니다. 정의 대조와 추가안은 보류하고, 합의되지 않은 정의는 내지 않습니다.
- 선택 역할은 추가하지 않습니다. 필수 업무가 기획 하나이고 역할이 이미 있습니다. 단일 역할로 충족되는 근거는 `.pace/team/agents/pace-backlog-planner.md:3`(role: maker)과 `:14`(기획 담당)입니다.

## 수행할 일 (순서대로)

1. **스킬 확인.** `skills/pace-team/SKILL.md:10-16`의 분석 절차와 `:26-28`의 설계·필수 역할 점검을 읽었습니다. 필수 원형 자리는 `references/required-roles.md:7-10`의 두 개입니다.
2. **등록 대조 (합의 원문 → 요건 ID).** 등록 범위는 `records/sequence.md:3`에 따라 BL261125_02 BR04의 기획자 합의뿐입니다. BL261125_01은 착수 전이라 범위 밖입니다.

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 기획자 | `records/agreement.md:3` 제출 경로 명시 | BP-01 v1 | 등록됨, `required-roles.md:29` |
| 기획자 | `records/agreement.md:4` 정의서가 검사 명령을 지정하면 명시 | BP-02 v1 | 등록됨, `required-roles.md:30` |
| 문제 해결자 | 해당 합의 없음 | 없음 | 요건 미등록(BL261125_01 담당), 표가 비어 있음 `required-roles.md:35`, 규칙 `:39` |

   등록 누락은 0건입니다.

3. **정의 대조.**
   - 선행 장치는 BP-01, BP-02 모두 "없음"입니다(`required-roles.md:29-30`). 그래서 `보류(선행 미병합)`에 해당하지 않습니다.
   - BP-02의 조건은 성립합니다. 정의서 `docs/README.md:4`가 `make verify-intake`를 지정하기 때문입니다. 따라서 "해당 없음"이 아닙니다.

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 기획자 | pace-backlog-planner, `.pace/team/agents/pace-backlog-planner.md` | BP-01 v1 | 충족 | `:18`에 "제출물은 plans/intake/에 둔다", 일치 근거는 `docs/README.md:3` |
| 기획자 | 같은 원본 | BP-02 v1 | **누락** | 원본 전체(`:1-34`)에 `make verify-intake`가 없음. 근거 `docs/README.md:4` |
| 문제 해결자 | 없음 | - | 요건 미등록, 보류 | `required-roles.md:39`, `:48` |

4. **개선안 (BP-02).** `pace-backlog-planner.md`의 `## 맡는 일`(`:16-18`)에 아래 문장 한 줄을 추가하는 안입니다.
   - 예: "BP-02 제출 전 검사는 `make verify-intake`를 실행한다."
   - 배포 명령은 `docs/README.md:5`에서 운용하지 않는다고 했으므로 만들어 넣지 않습니다.
   - 실제 반영은 `pace team sync`와 `pace team sync --check --json`, `pace team verify`로 합니다(`SKILL.md:36`, `:42`). 쓰기 승인 뒤에만 합니다.
5. **보조 점검 (요건 ID 밖).**
   - **등급:** 원본이 `tier: high`(`:5`)이고, 지원 등급이 high뿐입니다(`tools/tiers.txt:1`). 일치합니다.
   - **공통 문단:** `SKILL.md:36`은 공통 실행 전 대조 문단 바로 뒤에 조사와 정본 A를 설명하는 별도 문단을 두라고 합니다. 원본 `:24-26`에는 그 문단이 없습니다. 개선 시 함께 보강을 권합니다.
6. **결정 경계.** 이 개선은 합의의 목적·범위·기준을 바꾸지 않고 합의를 구현합니다. A-1~A-5는 모두 "아니오"입니다(`decision-rights.md:9-15`). 그래서 담당 PM이 결정합니다. 독립 검토는 `decision-rights.md:17`(B1)을 따릅니다. 다른 제공자를 먼저 시도하고, 불가하면 사유와 `cross: false`를 남깁니다.
7. **HANDOFF 예시.** `HANDOFF: 호출자 | pace-backlog-planner에 BP-02 문장 추가 | records/agreement.md:4, docs/README.md:4`. 검증 기준은 원본에 `make verify-intake`가 있고 sync 차이가 0인 것입니다.

## 확인한 범위와 한계
- 읽은 경로는 모두 작업본 안입니다. `skills/pace-team/SKILL.md`, `references/required-roles.md`, `references/role-archetypes.md`, `skills/pace-project-dev/references/decision-rights.md`, `docs/README.md`, `records/agreement.md`, `records/sequence.md`, `tools/tiers.txt`, `.pace/team/agents/pace-backlog-planner.md`입니다.
- 사용할 수 있는 도구는 읽기·검색뿐입니다. `pace` CLI는 실행하지 않았습니다. 따라서 sync·verify 결과는 없으며 "미실행"입니다.
- `make verify-intake`가 실제로 존재하고 동작하는지는 확인하지 않았습니다. 작업본에 Makefile이 없고 정의서의 지정만 확인했습니다.
- 팀 원본은 `.pace/team/agents/`에 기획자 하나뿐입니다. 문제 해결자 원본은 없고, 위 이유로 만들지 않습니다.
