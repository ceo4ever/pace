# 팀 설계 제안 (읽기 전용 점검 — 파일 수정·생성 없음)

## 1. 수행한 순서
1. `skills/pace-team/SKILL.md` 전체를 읽었습니다. ①분석(:10-16), ③설계(:24-32), ⑤검증(:40-44)이 이번 점검에 해당합니다.
2. 참조 `required-roles.md`, `role-archetypes.md`, `decision-rights.md`를 읽었습니다.
3. 저장소 문서 `docs/README.md`, `records/agreement.md`, `records/sequence.md`, `tools/tiers.txt`를 읽었습니다.
4. 작업본 전체를 Glob으로 확인했습니다. `.pace/team/agents/` 팀 원본은 없습니다(`.pace/**/*` 결과 0건). 작업본 밖은 읽지 않았습니다.

## 2. 저장소 사실
| 사실 | 근거 |
|---|---|
| 제출 경로는 `plans/intake/` | `docs/README.md:3` |
| 검사 명령은 `make verify-intake`, 배포 명령은 없음 | `docs/README.md:4-5` |
| 확정 합의 2건: 제출 경로를 역할 정의에 명시, deepest 등급 사용 | `records/agreement.md:3-4` |
| 이번 등록 범위는 BL261125_02 BR04의 기획자 합의. BL261125_01은 착수 전이며 범위 밖 | `records/sequence.md:3` |
| 지원 등급은 high뿐 | `tools/tiers.txt:1` |
| 기존 역할과 팀 원본은 없음 | `.pace/` 아래 파일 0건 |

## 3. 등록 대조표 (`required-roles.md:41` 형식)
| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 제출 경로 명시 · `records/agreement.md:3` | BP-01 · v1 | 등록됨 · `required-roles.md:29` |
| 백로그 기획자 | deepest 등급 사용 · `records/agreement.md:4` | BP-02 · v1 | 등록됨 · `required-roles.md:30` |
| 문제 해결자 | 합의 항목 없음 | 없음 | `요건 미등록(BL261125_01 담당)` · 표가 비어 있음(`required-roles.md:34-35`), `sequence.md:3`상 착수 전 |

등록 누락은 0건입니다. 문제 해결자 원형은 `required-roles.md:39`에 따라 정의 대조와 제안을 보류합니다.

## 4. 정의 대조표 (`required-roles.md:47` 형식)
| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | 없음 · 원본 없음 | BP-01 · v1 | 누락 | 원형을 맡는 정의가 없습니다(`required-roles.md:47`). 선행 장치는 "없음"이라 사용 가능합니다(`required-roles.md:29`). |
| 백로그 기획자 | 없음 · 원본 없음 | BP-02 · v1 | 보류(선행 미병합) | 선행 장치는 `tools/tiers.txt`와 시험 장치 BR02입니다(`required-roles.md:30`). `tools/tiers.txt`는 `high`만 지원하고 `deepest`는 없습니다(`tiers.txt:1`). 시험 장치 BR02는 작업본에서 찾지 못했습니다. |
| 문제 해결자 | — | — | `요건 미등록(BL261125_01 담당)` | 정의 대조 대상이 아닙니다. |

## 5. 제안
- **BP-01 (충족 방향)**: 선행 장치가 없어 지금 적용할 수 있습니다. 백로그 기획자 역할을 새로 정의하고 역할 정의에 제출 경로 `plans/intake/`를 명시합니다(`docs/README.md:3`).
- **BP-02 (보류)**: deepest 등급을 `high`로 낮추어 대체하지 않습니다. 이 요건을 뺀 채 정의를 완성하지도 않습니다(`required-roles.md:46`). `tools/tiers.txt`의 deepest 지원과 BR02 시험 장치가 병합되면 다시 점검합니다. 재점검 조건과 담당은 SKILL.md:42에 따라 남깁니다.
- **맞춤 추가안 전체는 보류**: 적용되는 요건 중 BP-02의 선행 장치가 아직 없기 때문입니다(`required-roles.md:48`). 지금 만들 수 있는 정의는 BP-01을 담은 초안 수준까지입니다. 이 초안도 BP-02를 해소하기 전에는 완성 정의로 반영하지 않습니다.
- **문제 해결자**: 합의되지 않은 정의나 추가안을 내지 않습니다(`required-roles.md:48`).
- **선택 역할**: 필요한 업무 근거가 없어 제안하지 않습니다. 병렬 작업이나 세 단계 이상의 지속 업무, 다른 제공자가 필요한 검토 같은 단서가 문서에 없고, 배포 명령도 없습니다(`SKILL.md:14`, `docs/README.md:5`).

## 6. 결정 경계(`decision-rights.md` A)
- 제안 자체는 합의 변경이 아닙니다(A-1 아니오).
- BP-02를 낮추어 대체하면 안전 기준을 약화하므로 A-3 대상이며, 하지 않습니다.
- 실제 역할 원본 작성과 `pace team sync`는 쓰기 권한이 확인된 뒤 `SKILL.md:36`의 절차로 진행합니다. 이번에는 실행하지 않았습니다.

## 7. 한계
- BR02 시험 장치는 작업본에 없어 존재를 확인하지 못했습니다. 그래서 선행 미병합으로 판정했습니다.
- 인터뷰 단계의 미정 결정(결정 주체, 모델·비용 한도)은 문서에 없습니다. 이번 제안은 해당 값에 의존하지 않습니다.
- `pace team verify`는 팀 원본이 없어 해당하지 않으며 실행하지 않았습니다.
