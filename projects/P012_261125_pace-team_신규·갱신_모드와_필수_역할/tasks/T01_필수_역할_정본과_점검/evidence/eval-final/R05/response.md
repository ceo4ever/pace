## 팀 설계 제안

**결론: 새 역할을 추가하지 않고, 기존 `pace-backlog-planner`를 유지하되 BP-02에 대한 개선안 1건만 냅니다. `pace-troubleshooter`는 `요건 미등록(BL261125_01 담당)`으로 보류합니다.**

### 확인한 근거
- 스킬 절차: `skills/pace-team/SKILL.md:10-16`(분석), `:26-28`(설계·필수 역할 점검)
- 필수 원형은 두 개입니다. 기획자(등록 담당 BL261125_02 BR04)와 문제 해결자(BL261125_01). 근거는 `skills/pace-team/references/required-roles.md:7-10`입니다.
- 현재 등록 범위: `records/sequence.md:3`. 기획자 합의만 대상이고 BL261125_01은 착수 전이라 범위 밖입니다.
- 저장소 사실: 제출 경로 `plans/intake/`(`docs/README.md:3`), 검사 명령 `make verify-intake`(`docs/README.md:4`), 배포 명령 없음(`docs/README.md:5`).
- 사용 가능한 도구: 지원 등급은 `high`뿐입니다(`tools/tiers.txt:1`).
- 팀 원본은 `.pace/team/agents/pace-backlog-planner.md` 하나뿐입니다. 종류 maker, 등급 high(`:3,5`)입니다.

### 1. 등록 대조 (합의 → 요건 ID)

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 기획자 | 제출 경로를 역할 정의에 명시 · `records/agreement.md:3` | BP-01 v1 | 등록됨 · `required-roles.md:29` |
| 기획자 | 검사 명령 실행 + 종료 상태 기록 · `records/agreement.md:4` | BP-02 v2 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 현재 범위 밖 · `records/sequence.md:3` | 없음 | 요건 미등록(BL261125_01 담당) · 표가 비어 있음 `required-roles.md:34-35` |

등록 누락은 없습니다. 합의 2항목이 모두 옮겨져 있습니다. 문제 해결자 행이 비어 있는 것은 누락이 아니라 차례 전입니다(`required-roles.md:39`).

### 2. 정의 대조 (현재 버전 기준)

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 v1 | 충족 | `:18` 제출물을 `plans/intake/`에 둔다고 명시. `docs/README.md:3`과 일치 |
| 기획자 | 위와 같음 | BP-02 v2 | **누락** | `:19`는 `make verify-intake`로 검사한다고만 적었습니다. 종료 상태를 기록한다는 문장이 없습니다. `:31`의 완료 보고도 "초안과 근거 반환"뿐입니다. 요건은 "실행하고 종료 상태를 기록"(`required-roles.md:30`)입니다. |
| 문제 해결자 | 없음 | — | 보류 | `요건 미등록(BL261125_01 담당)`. 합의되지 않은 정의나 추가안은 내지 않습니다(`required-roles.md:48`). |

선행 장치는 BP-01·BP-02 모두 "없음"이라 `보류(선행 미병합)`에 해당하지 않습니다.

### 3. 개선안 (BP-02 한 건)
원본의 `## 맡는 일` 또는 `## 인계·결정 요청·완료 보고`에 다음 취지를 추가합니다. `make verify-intake`를 실행하고 종료 상태(exit code)를 완료 보고에 기록한다는 내용입니다. 기존 원본, 공통 "실행 전 대조" 문단(`:25-27`), 점검 표지는 보존합니다. 요건 ID 표기(BP-01, BP-02)도 유지합니다. 등급 `high`는 지원 등급과 일치하므로 변경하지 않습니다.

### 4. 판단의 근거
- **역할 추가 불필요:** 업무가 기획·제출·검사로 한정됩니다. 배포 명령이 없고(`docs/README.md:5`), 병렬 프로젝트나 3단계 이상의 지속 업무를 시사하는 단서가 이 작업본에는 없습니다(`SKILL.md:14`). 선택 후보(`role-archetypes.md:10-19`)는 필요한 근거가 없어 고르지 않습니다.
- **독립 검토:** 현재 원본에는 reviewer가 없습니다. 이번 합의에 독립 검토 요건이 없고 도구도 `high` 한 등급뿐이라 제공자 독립성 요건을 확인할 수 없습니다. **미확인 항목**으로 표시합니다. 개선안 적용 후 검토가 필요하면 B1(`decision-rights.md:17`)에 따라 같은 제공자의 새 세션을 쓰고 `cross: false`를 기록합니다.
- **결정 주체:** BP-02 보강은 합의된 목적·범위·완료 기준을 바꾸지 않고 합의 항목을 그대로 반영합니다. A-1은 '아니오'입니다. 검증을 약화하는 것이 아니므로 A-3도 '아니오'입니다. 푸시·배포·비용은 없어 A-2·A-4도 '아니오'입니다(`decision-rights.md:11-14`). 담당 PM이 결정할 수 있습니다.

### 5. 수행할 일 (순서, 이번에는 실행하지 않음)
1. 위 개선안을 `.pace/team/agents/pace-backlog-planner.md`에 반영합니다. `pace team new`는 이미 원본이 있으므로 쓰지 않습니다(`SKILL.md:36`).
2. `pace team sync`로 Claude·Codex 생성물을 갱신합니다.
3. `pace team sync --check --json`에서 exit와 `differences`를 확인합니다(`SKILL.md:42`).
4. 승인된 호출 범위와 비용을 확인한 뒤 `pace team verify pace-backlog-planner --agent <claude|codex>`를 실행합니다. 이 결과는 prompt 적재 관측일 뿐, 현장 업무 이행의 증거는 아닙니다.
5. BL261125_01 차례에 문제 해결자 요건이 등록되면 같은 점검을 다시 수행합니다.

**제한:** 이 환경에서는 파일을 수정하거나 `pace` 명령을 실행하지 않았습니다. 위 절차는 계획만 제시한 것입니다. 작업본 밖의 경로는 읽지 않았습니다.
