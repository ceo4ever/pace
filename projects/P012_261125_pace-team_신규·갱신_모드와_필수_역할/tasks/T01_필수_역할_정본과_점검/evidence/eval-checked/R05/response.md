# 팀 설계 제안: 필수 역할 점검 결과

파일은 수정하거나 만들지 않았고, 작업본 안의 파일만 읽었습니다.

## 결론
- **백로그 기획자 (`pace-backlog-planner`)**: BP-01은 충족입니다. BP-02는 누락입니다. 역할은 이미 있으므로 BP-02 개선안만 냅니다.
- **문제 해결자**: 요건 미등록(BL261125_01 담당)이라 정의 대조와 제안을 보류합니다.
- 새 역할 추가안은 없습니다. 근거 없는 역할도, 담당이 빠진 업무도 발견하지 못했습니다.

## 수행 순서와 확인한 경로
1. **스킬 읽기**: `skills/pace-team/SKILL.md:10-16, 26-28`에서 분석 단계와 필수 역할 점검 절차를 확인했습니다. 필수 원형 확인, 등록 대조, 정의 대조 순서입니다.
2. **정본 읽기**: `skills/pace-team/references/required-roles.md:7-10`의 필수 원형은 기획자와 문제 해결자입니다. 요건은 `:29-30`(BP-01, BP-02)에 있고, 문제 해결자 표는 `:34-36`에서 비어 있습니다.
3. **저장소 사실 확인**
   - `docs/README.md:3`: 제출 경로는 `plans/intake/`입니다.
   - `docs/README.md:4`: 검사 명령은 `make verify-intake`입니다.
   - `docs/README.md:5`: 배포 명령은 없습니다.
4. **합의와 담당 시점 확인**
   - `records/agreement.md:3-4`: 이번 점검의 확정 합의 두 항목입니다.
   - `records/sequence.md:3`: 등록 범위는 BL261125_02 BR04의 기획자 합의입니다. BL261125_01은 착수 전이라 범위 밖입니다.
5. **도구와 팀 원본 확인**
   - `tools/tiers.txt:1`: 지원 등급은 high입니다.
   - `.pace/team/agents/pace-backlog-planner.md:5-7`: tier는 high이고 resources와 tools는 빈 목록입니다.
   - `skills/pace-team/references/role-archetypes.md`와 `skills/pace-project-dev/references/decision-rights.md`는 결정 경계(A-1~A-5)를 판정할 때 읽었습니다.

## 등록 대조표
| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로를 역할 정의에 명시 · `records/agreement.md:3` | BP-01 · v1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | 검사 명령 실행과 종료 상태 기록 · `records/agreement.md:4` | BP-02 · v2 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 해당 없음 · `records/sequence.md:3`이 범위 밖으로 명시 | 해당 없음 | 요건 미등록(BL261125_01 담당) · `required-roles.md:34-36` 표가 비어 있음 |

기획자의 등록 누락은 0건입니다. 문제 해결자는 등록 차례가 오지 않았고 합의 원문도 없어서 누락이 아닙니다.

## 정의 대조표
| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 · v1 | 충족 | 18행에 "제출물은 plans/intake/에 둔다"가 있고, `docs/README.md:3`의 경로와 일치합니다. |
| 백로그 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-02 · v2 | 누락 | 19행은 `make verify-intake` 실행만 적었습니다. 종료 상태를 기록한다는 문장이 없습니다. 31행의 완료 보고도 "초안과 근거"만 반환합니다. |
| 문제 해결자 | 없음 | 없음 | 요건 미등록(BL261125_01 담당) | 정의 대조와 제안을 보류합니다. |

BP-02의 선행 장치는 "없음"(`required-roles.md:30`)이므로 보류 사유가 없습니다. 요건 버전이 2이고 이전에 확인한 버전을 알 수 없어서 현재 문장 기준으로 다시 대조했습니다.

## 설계 판단
- **역할 구성**: 기획자 한 역할(maker)이 `docs/README.md`에 적힌 업무(제출, 검사)를 모두 맡습니다. 별도 reviewer나 coordinator를 둘 근거는 없습니다. 병렬 프로젝트도, 세 단계 이상의 지속 업무도, 다른 제공자가 필요한 검토도 확인되지 않았습니다(`SKILL.md:14`).
- **결정 경계**
  - A-1: 개선안은 합의 `agreement.md:4`를 그대로 이행하는 것이라 합의를 바꾸지 않습니다.
  - A-2: 배포 명령이 없고 외부 전송도 없습니다.
  - A-3: 검사를 약화하지 않고 강화합니다.
  - A-4: 새 비용이나 권한이 없습니다.
  - 결과: 모두 "아니오"이므로 담당 PM이 결정합니다.
- **미확인 사항**: `tools: []`(7행)와 `resources: []`(6행)가 비어 있습니다. 이 환경에서 `make verify-intake` 실행 권한이 실제로 있는지는 파일만으로 확인할 수 없습니다. 도구 안내(35행)는 "환경에 부여된 도구 권한을 따른다"로만 적혀 있습니다.

## 개선안 (BP-02 · 코드 변경 전 제안)
1. **19행 보강**: `BP-02 검사 명령 make verify-intake를 실행하고 종료 상태(exit code)를 기록한다.`
2. **31행 보강**: `허브에 초안, 근거, make verify-intake의 종료 상태를 반환한다.`
3. **도구 확인**: 실행 권한이 `tools`에 필요한지 소유자가 확인합니다. 필요한데 부여되지 않았다면 실행을 보류하고 결정 주체(담당 PM)에게 근거와 선택지를 보냅니다.
4. **보존할 부분**: "실행 전 대조" 문단(25-27행)과 BP-01 문장은 그대로 둡니다.

## 적용 단계 (이번에 실행하지 않음)
1. 승인을 받은 뒤 `.pace/team/agents/pace-backlog-planner.md`를 수정합니다.
2. `pace team sync`를 실행하고, `pace team sync --check --json`에서 `differences`가 비어 있는지 확인합니다.
3. 승인된 호출 범위 안에서 `pace team verify pace-backlog-planner --agent <claude|codex>`로 적재를 확인합니다.
4. 이 검증은 prompt 적재만 관측합니다. 종료 상태 기록을 실제로 이행하는지는 별도 실행 근거가 필요합니다.

## 재점검 조건
- **문제 해결자**: BL261125_01이 착수해 `TS-NN` 요건을 등록하면 그 차례에 등록 대조와 정의 대조를 수행합니다.
- **BP-02**: 개선안 적용 뒤 정의 대조를 다시 해서 충족으로 바뀌는지 확인합니다.
