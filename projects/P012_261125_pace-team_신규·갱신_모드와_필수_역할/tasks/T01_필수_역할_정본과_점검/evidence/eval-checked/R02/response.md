# 팀 설계 제안 (읽기 전용 점검, 파일 수정·생성 없음)

## 1. 수행 순서와 확인한 경로

1. **스킬 읽기.** `skills/pace-team/SKILL.md:10-16`(① 분석)과 `:24-32`(③ 설계)에서 필수 원형 점검, 등록 대조, 정의 대조를 하라고 정했습니다.
2. **필수 역할 정본 읽기.**
   - `skills/pace-team/references/required-roles.md:7-10`: 필수 원형은 백로그 기획자(등록 담당 BL261125_02 BR04)와 문제 해결자(등록 담당 BL261125_01) 두 개입니다.
   - `required-roles.md:29-30`: BP-01과 BP-02가 등록되어 있습니다. 둘 다 버전 1이고 선행 장치는 "없음"이며 구분은 고정 요건입니다.
   - `required-roles.md:34-35`: 문제 해결자 표는 헤더만 있고 행이 없습니다.
   - `required-roles.md:39-41`: 등록 대조 절차입니다.
   - `required-roles.md:45-48`: 정의 대조 절차입니다.
3. **등록 담당과 판정 시점 확인.** `records/sequence.md:3`에 따르면 현재 점검의 등록 범위는 BL261125_02 BR04의 기획자 합의입니다. BL261125_01은 착수 전이라 범위 밖입니다.
4. **합의 원문 확인.** `records/agreement.md:3-4`입니다.
5. **저장소 사실 확인.**
   - `docs/README.md:3`: 제출 경로는 `plans/intake/`입니다.
   - `docs/README.md:4`: 검사 명령은 `make verify-intake`입니다.
   - `docs/README.md:5`: 별도 배포 명령은 없습니다.
6. **도구 확인.** `tools/tiers.txt:1`에 지원 등급은 high뿐이라고 되어 있습니다.
7. **결정 권한 확인.** `skills/pace-project-dev/references/decision-rights.md:9-15`(A-1~A-5)를 확인했습니다.
8. **팀 원본 탐색.**
   - `.pace/**/*`와 `.claude`, `.codex`, `.agents`, `AGENTS.md`, `Makefile`, `plans`를 찾았습니다.
   - 결과는 모두 없음입니다. 작업본 안에 `.pace/team/agents/` 원본이 없으므로 기획자 역할 정의는 존재하지 않습니다.
9. `skills/pace-team/references/role-archetypes.md:5-6`에서 두 원형이 필수임을 확인했습니다. 선택 후보는 이번 범위(필수 요건 충족과 선행 조치)에 필요하지 않아 고르지 않습니다.

## 2. 등록 대조표

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로를 역할 정의에 명시 · `records/agreement.md:3` | BP-01 · v1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | 검사 명령을 역할 정의에 명시 · `records/agreement.md:4` | BP-02 · v1 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 해당 합의 없음 (`records/agreement.md`에 항목 없음) | 없음 | `요건 미등록(BL261125_01 담당)` · `required-roles.md:34-35`, `records/sequence.md:3` |

- 등록 누락 별도 표: 기획자 합의 2개가 모두 등록되어 있어 누락은 0건입니다.
- 문제 해결자는 등록 차례가 오기 전이고 행이 비어 있습니다. `required-roles.md:39`에 따라 정의 대조와 제안을 보류합니다. 합의되지 않은 정의나 추가안은 내지 않습니다(`required-roles.md:48`).

## 3. 정의 대조표

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | 없음 (`.pace/team/agents/`에 원본 없음) | BP-01 · v1 | 누락 | 원형을 맡은 정의가 없음. 팀 원본 경로 탐색 결과 없음. 선행 장치는 "없음"(`required-roles.md:29`)이라 보류 사유가 아님 |
| 백로그 기획자 | 없음 | BP-02 · v1 | 누락 | 위와 같음. `required-roles.md:30` |
| 문제 해결자 | 해당 없음 | (미등록) | `요건 미등록(BL261125_01 담당)` | 대조 보류. `required-roles.md:39` |

- 사용한 결과 상태는 정본의 `충족`, `누락`, `해당 없음`, `보류(선행 미병합)`, `요건 미등록(...)` 중에서 골랐습니다.
- BP-01과 BP-02에는 조건부 문장이 없어 `해당 없음`을 쓸 근거가 없습니다.
- 두 요건 모두 선행 장치가 "없음"이라 `보류(선행 미병합)`도 적용되지 않습니다.

## 4. 제안

`required-roles.md:48-4`의 기준을 적용했습니다. 역할이 없고, 적용할 요건(BP-01, BP-02)의 선행 장치가 모두 사용 가능하므로 저장소 맞춤 **추가안**을 냅니다.

**추가 역할: 백로그 기획자 (`pace-backlog-planner`)**
- 종류: 필수 원형을 맡는 역할입니다. `pace team new`의 `--role` 값은 `maker`와 `coordinator` 중 하나를 검토했고, 산출물(plans/intake/ 제출물) 제작이 중심이라 **maker를 추천**합니다. 근거는 `SKILL.md:38`입니다.
- 원본 경로: `.pace/team/agents/` 아래입니다.
- 정의에 넣을 내용 (요건 ID를 적용 ID로 명기):
  - **BP-01 v1**: 제출 경로 `plans/intake/`를 명시합니다(`docs/README.md:3`).
  - **BP-02 v1**: 검사 명령 `make verify-intake`를 명시합니다(`docs/README.md:4`).
- 맡는 일: `plans/intake/`에 제출물을 작성하고 `make verify-intake`로 검사합니다.
- 하지 않는 일: 배포를 하지 않습니다. 배포 명령 자체가 없습니다(`docs/README.md:5`). 자기 산출물을 독립 판정하지 않습니다.
- 결정 경계: 합의 변경은 A-1, 외부 영향은 A-2 기준으로 owner에게 올립니다(`decision-rights.md:11-12`).
- HANDOFF: `HANDOFF: <수신자> | <요청> | <근거>` 형식을 씁니다(`SKILL.md:32`). 수신자는 호출자(허브 PM)입니다.
- 등급·모델: 이 저장소가 지원하는 등급은 high뿐이므로(`tools/tiers.txt:1`) 기본값(권고)으로 high를 씁니다. 모델과 effort는 저장소 분석 근거가 없어 미확인입니다.

**선행 조치(작성 단계에서 실행, 이번에는 실행하지 않음)**
1. 쓰기 권한과 설계를 확인합니다(`SKILL.md:36`).
2. `pace team new <이름> --role maker`로 원본을 만듭니다.
3. 원본을 채우고 `pace team sync`로 Claude와 Codex 생성물을 갱신합니다.
4. `pace team sync --check --json`과 `pace team verify`로 검증합니다(`SKILL.md:44`).
5. 업무 배정은 `pace project start P### --role <이름> --agent <claude|codex>`로 합니다.

## 5. 판단 근거와 미확인·주의

- **문제 해결자는 이번 제안에서 제외합니다.** `records/sequence.md:3`이 BL261125_01을 범위 밖으로 정했고 요건 표도 비어 있습니다. 제안 범위가 "발견한 필수 요건의 충족과 해당 선행 조치"라서 맞춤 정의를 만들지 않습니다. 재점검 조건은 BL261125_01 착수 후 요건이 등록될 때입니다.
- **확인하지 못한 것.**
  - `Makefile`, `plans/intake/`가 작업본 안에 없습니다. `make verify-intake`가 실제로 동작하는지는 이 작업본에서 확인할 수 없습니다. 정의에는 `docs/README.md:4`의 명령 문자열만 쓸 수 있습니다.
  - `AGENTS.md`와 백로그가 없어 `SKILL.md:12`의 입력 일부를 읽지 못했습니다. 신규 저장소로 보고 합의된 단계를 기준으로 삼았습니다.
- **결정 주체.** 추가안은 합의된 BP-01과 BP-02를 그대로 구현하는 것입니다. 합의 범위를 바꾸지 않으므로 A-1은 "아니오"입니다. 원본을 만들고 동기화하는 일은 이 worktree의 Git으로 되돌릴 수 있고 외부로 나가지 않으므로 A-2도 "아니오"입니다. 새 권한이나 유료 비용도 없어 A-4도 "아니오"입니다. 다만 독립 검토나 검증을 생략하지 않도록 A-3에 유의해야 합니다.
- **작업본 밖의 파일은 읽지 않았습니다.**
