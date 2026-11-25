# 팀 설계 제안 (읽기 전용 점검, 파일 수정 없음)

## 결론
- **백로그 기획자 (`pace-backlog-planner`)**: 이 저장소에는 팀 원본이 없습니다. BP-01의 선행 장치는 없으므로 충족하는 정의를 낼 수 있습니다. BP-02는 선행 장치가 빠져 `보류(선행 미병합)`입니다. 따라서 새 역할의 **부분 초안과 완성본을 모두 보류**합니다.
- **문제 해결자 (`pace-troubleshooter`)**: `요건 미등록(BL261125_01 담당)`입니다. 정의 대조와 추가안은 보류합니다.
- 이 점검에서 낼 수 있는 제안은 필수 요건의 선행 조치뿐입니다.

## 수행 순서와 근거
1. **스킬 읽기.** `skills/pace-team/SKILL.md:10-16`(분석), `:24-32`(설계), `:34-44`(작성·검증)을 읽었습니다. 필수 원형은 정본 `required-roles.md`로 점검합니다(`SKILL.md:16`, `:28`).
2. **저장소 사실 확인.**
   - `docs/README.md:3`: 제출 경로는 `plans/intake/`입니다.
   - `docs/README.md:4`: 검사 명령은 `make verify-intake`입니다.
   - `docs/README.md:5`: 별도 배포 명령은 없습니다.
   - 병렬 프로젝트나 세 단계 이상의 지속 업무를 보여 주는 근거는 없습니다.
3. **합의와 담당 시점.**
   - `records/agreement.md:3-4`가 확정 합의입니다.
   - `records/sequence.md:3`: 등록 범위는 BL261125_02 BR04의 기획자 합의입니다. BL261125_01은 착수 전이라 범위 밖입니다.
4. **도구 확인.** `tools/tiers.txt:1`은 지원 등급을 `high`로 적고 있습니다. `deepest`는 없습니다.
5. **팀 원본 확인.** `.pace/**` 검색 결과는 없었고, `pace-backlog-planner`는 정본 외 어떤 파일에도 없습니다. 이 도구 환경에서는 `pace` 명령(sync·verify)을 실행할 수 없어 실행하지 않았습니다.

## 등록 대조표 (`required-roles.md:41`의 형식)
| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로를 역할 정의에 명시 · `records/agreement.md:3` | BP-01 · v1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | deepest 등급 사용 · `records/agreement.md:4` | BP-02 · v1 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 합의 항목 없음 · `records/sequence.md:3` | 없음 | `요건 미등록(BL261125_01 담당)` · `required-roles.md:34-35`는 빈 표 |

등록 누락은 없습니다. 기획자의 합의 2건이 모두 옮겨져 있습니다.

## 정의 대조표 (`required-roles.md:47`의 형식)
| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | 담당 역할 없음 · `.pace/team/agents/` 원본 없음 | BP-01 · v1 | 누락 (선행 장치 없음, 추가안 가능) | 정의가 없어 제출 경로가 명시되지 않음. 선행 장치는 "없음"(`required-roles.md:29`) |
| 백로그 기획자 | 담당 역할 없음 · 원본 없음 | BP-02 · v1 | 보류(선행 미병합) | `tools/tiers.txt:1`은 `high`뿐이고 시험 장치 BR02는 저장소에서 찾지 못함 |
| 문제 해결자 | — | — | 요건 미등록(BL261125_01 담당) | `required-roles.md:35`, `records/sequence.md:3` |

## 제안
1. **BP-02는 `high`로 낮춰 대체하지 않습니다.** 대체하거나 요건을 빼고 완성하는 것은 금지입니다(`required-roles.md:46`).
2. **기획자 정의의 부분 초안도 만들지 않습니다.** 선행 장치가 하나라도 빠지면 부분 초안과 완성본을 모두 보류합니다(`required-roles.md:48`).
3. **BP-01 내용은 나중에 사용할 수 있게 정리만 해 둡니다.** 정의에는 제출 경로 `plans/intake/`와 검사 `make verify-intake`(`docs/README.md:3-4`)를 담습니다.
4. **재점검 조건.** `tools/tiers.txt`에 `deepest`가 지원되고 시험 장치 BR02가 병합되면 BP-01과 BP-02를 모두 담은 추가안을 냅니다. 그때 `pace team new`와 `pace team sync`, 그리고 `--check --json`과 `verify`로 이어갑니다(`SKILL.md:36`, `:44`).
5. **문제 해결자는 BL261125_01이 요건을 등록하는 차례에 다시 점검합니다.** 그 전에는 합의되지 않은 정의를 만들지 않습니다.

## 결정 경계와 HANDOFF
- `HANDOFF: 호출자 | BP-02 선행 장치(tools/tiers.txt의 deepest 지원, 시험 장치 BR02) 확인 | tools/tiers.txt:1, required-roles.md:30`
- 이 제안은 합의를 바꾸지 않아 A-1에 해당하지 않습니다. 등급을 낮추는 변경은 합의 변경이므로 A-1과 A-3 대상이 됩니다(`decision-rights.md:11,13`).

## 미확인 사항
- 시험 장치 BR02가 병합됐는지는 이 작업본에 근거가 없습니다.
- 이 작업본은 git 저장소가 아니어서 버전 이력은 확인하지 못했습니다.
- 팀 원본이 없어 `sync --check`와 `verify`는 대상이 없습니다.
