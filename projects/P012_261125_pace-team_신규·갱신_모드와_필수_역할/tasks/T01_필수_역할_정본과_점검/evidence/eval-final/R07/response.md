# 팀 설계 제안 (읽기 전용, 파일 수정·생성 없음)

## 수행 순서와 확인 경로

1. **스킬 읽기** — `skills/pace-team/SKILL.md:10-16`(분석), `:26-28`(설계·필수 역할 점검)에서 필수 원형 점검과 등록 대조 규칙을 확인했습니다.
2. **정본 확인** — `skills/pace-team/references/required-roles.md:7-10`에서 필수 원형 2개를 확인했습니다. 기획자는 BL261125_02 BR04가 등록 담당이고, 문제 해결자는 BL261125_01이 등록 담당입니다.
3. **저장소 업무** — `docs/README.md:3-5`에서 제출 경로(`plans/intake/`), 검사(`make verify-intake`), 배포 명령 없음을 확인했습니다.
4. **합의·담당 시점** — `records/agreement.md:3-4`의 합의 2건과 `records/sequence.md:3`의 등록 범위(BL261125_02 BR04의 기획자 합의만 해당, BL261125_01은 착수 전)를 확인했습니다.
5. **도구** — `tools/tiers.txt:1`에서 지원 등급이 `high`뿐임을 확인했습니다.
6. **팀 원본** — `.pace/team/agents/pace-backlog-planner.md:1-34`를 확인했습니다.
7. **결정 권한** — `skills/pace-project-dev/references/decision-rights.md:9-15`(A-1~A-5)로 결정 주체를 대조했습니다.

## 등록 대조 (required-roles.md:37-41)

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 기획자 | 제출 경로를 역할 정의에 명시 · agreement.md:3 | BP-01 v1 | 등록됨 · required-roles.md:29 |
| 기획자 | deepest 등급 사용 · agreement.md:4 | BP-02 v1 | 등록됨 · required-roles.md:30 |
| 문제 해결자 | 해당 합의 없음 | — | **요건 미등록(BL261125_01 담당)** · required-roles.md:34-35 표가 비어 있고 sequence.md:3에서 착수 전 |

등록 누락은 없습니다. 합의 2건이 모두 옮겨져 있습니다.

## 정의 대조 (required-roles.md:43-48)

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 기획자 | `pace-backlog-planner` · `.pace/team/agents/pace-backlog-planner.md` | BP-01 v1 | **충족** | 원본 18행 "BP-01 제출물은 plans/intake/에 둔다."가 `docs/README.md:3`의 경로와 일치합니다. 선행 장치가 없습니다. |
| 기획자 | 위와 같음 | BP-02 v1 | **보류(선행 미병합)** | 요건은 deepest를 요구합니다. 그러나 `tools/tiers.txt:1`은 `high`만 지원하므로 선행 장치(tiers.txt·시험 장치 BR02)를 쓸 수 없습니다. 원본 5행은 `tier: high`입니다. |
| 문제 해결자 | 원본 없음 | — | **요건 미등록(BL261125_01 담당)** | 정의 대조와 추가안을 보류합니다. required-roles.md:48에 따라 합의되지 않은 정의는 제안하지 않습니다. |

## 제안과 판단 근거

- **기획자: 개선안 없이 유지합니다.**
  - BP-01은 충족입니다.
  - BP-02는 `high`를 deepest 대신 쓰는 대체나 요건 삭제를 하지 않습니다(required-roles.md:46). 원본 5행의 `tier: high`는 현재 가능한 값일 뿐 충족 근거로 쓰지 않습니다. BP-02는 보류로 남기고, deepest 등급이 `tools/tiers.txt`에 들어온 뒤(BR02) 다시 판정합니다.
- **문제 해결자: 추가안을 내지 않습니다.** 등록 차례 전이라 정의를 만들지 않고, BL261125_01 착수 때 등록과 판정을 합니다.
- **선택 역할: 추가하지 않습니다.**
  - 업무는 제출 경로로 보내는 기획과 `make verify-intake` 검사뿐입니다(docs/README.md:3-5). 배포는 없습니다.
  - 역할 한 개와 기존 검사 절차로 필수 업무를 충족하므로 SKILL.md:14의 "한 역할로 충족" 근거로 남깁니다.
- **결정 주체:** 이번 제안은 합의 목적·범위를 바꾸지 않고 보안·독립 검토를 약화하지 않으며 외부 영향도 없습니다. 그래서 A-1~A-5에 모두 "아니오"이고 담당 PM이 결정합니다.
  - 단, BP-02를 `high`로 완화하는 일은 합의 변경(A-1)에 해당할 수 있어 owner 요청이 필요합니다.
- **독립 검토:** 이 저장소에서 확인된 제공자 근거가 없습니다. 교차 제공자 검토가 필요해지면 decision-rights.md:17의 B1(같은 제공자의 새 세션, `cross: false` 기록)을 따릅니다.

## 확인하지 못한 항목

- `make verify-intake`의 실제 정의(Makefile)는 작업본에 없어 확인하지 못했습니다.
- 작업본에 `AGENTS.md`와 백로그가 없어 분석 근거에서 제외했습니다.
- 인터뷰 단계에서 새로 물을 결정은 없습니다. 필요하면 BP-02 보류를 owner에게 알리는 한 건뿐입니다.
