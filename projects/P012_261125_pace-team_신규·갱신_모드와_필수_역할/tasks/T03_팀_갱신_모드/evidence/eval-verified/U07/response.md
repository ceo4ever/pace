# 팀 점검 결과: 개선·합침·제외 검토 (반영 없음)

**결론:** 기존 역할 3개(hub-notes·test-auditor·unused-reporter)는 근거가 있어 개선을 검토할 수 있습니다. 합침은 doc-auditor와 test-auditor 사이에 후보가 하나 있지만 추천하지 않습니다. 제외는 unused-reporter만 후보가 될 수 있고, 관측이 한 건뿐이라 결정은 보류하는 것이 맞습니다. conditional-helper와 doc-auditor는 그대로 둡니다. 파일은 하나도 바꾸지 않았고 작업본 밖도 읽지 않았습니다.

## 점검 범위와 하지 못한 것
- **모드: 갱신.** `.pace/team/agents/`에 원본 5개가 있습니다. 다만 셸을 쓸 수 없어 `pace team list`, `sync --check --json`, `verify`는 실행하지 못했습니다. 원본 검증 결과와 native 생성물의 지문 일치는 확인되지 않았습니다. 원본과 native를 눈으로 비교했을 때 같은 내용으로 보이는 데까지만 확인했습니다.
- **대상 프로젝트:** 최근 마감 2건 전부를 봤습니다.
  - P602(2026-11-20 병합, 팀 채택: `PROJECT.md:4`)
  - P601(2026-10-23 병합, 팀 미채택)
- **허브 기록:** `backlogs/BL261112_02_허브_진행_메모/`

## 필수 역할 점검
| 원형 | 등록 상태 | 근거 |
|---|---|---|
| pace-backlog-planner | 요건 미등록(BL261125_02 BR04 담당) | `skills/pace-team/references/required-roles.md:27-28`, `records/registration.md:1` |
| pace-troubleshooter | 요건 미등록(BL261125_01 담당) | `required-roles.md:32-33`, `records/registration.md:1` |

두 원형 모두 등록 전이라 정의 대조와 추가안은 내지 않습니다.

## 에이전트별 검토표
| 에이전트 | 실제 맡은 일 | 담당 공백 | 반복 지적 | 비참여 | 호출 수·시간·토큰 | 근거(파일:행) |
|---|---|---|---|---|---|---|
| doc-auditor (reviewer) | 릴리스 메모의 링크·버전 표기 검사(P602 T02 7항목, T05 6항목, P601 T03 5항목) | 없음 | 링크 경로 기준 보강은 처리가 끝난 변경 이력 | 참여 | P602: 호출 수 미확인(start 1행, 호출 로그 미수집) / 시간 1,260,000 ms(reported) / 토큰 Read 4,120 · Bash 1,380. P601: 호출 수 1(팀 절이 아닌 호출 집계) / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/doc-auditor.md:18-22`, `projects/P602_261120_릴리스_문서/log.jsonl:2,8,22`, `projects/P602_261120_릴리스_문서/METRICS.md:19`, `projects/P602_261120_릴리스_문서/TEAM-RETROSPECTIVE.json:25-31`, `projects/P601_261023_의존성_기록/log.jsonl:8`, `projects/P601_261023_의존성_기록/METRICS.md:14` |
| test-auditor (reviewer) | P601에서는 정의대로 테스트 12건 확인. P602 T03·T05에서는 정의 밖인 **릴리스 메모 버전 표기·링크 검사**를 함. T05에서는 doc-auditor와 같은 6항목을 겹쳐 검사 | 없음 | 회고의 `review-tester-fail` 2, `review-blocking` 4는 의미와 처리 여부가 미확인(정의 변경과 연결되지 않음) | 참여 | P602: 호출 수 미확인 / 시간 미확인 / 토큰 미확인. P601: 호출 수 1 | `.pace/team/agents/test-auditor.md:18-20`, `projects/P602_261120_릴리스_문서/log.jsonl:3,13,22-23,15,25`, `projects/P602_261120_릴리스_문서/METRICS.md:20,25-26`, `projects/P602_261120_릴리스_문서/TEAM-RETROSPECTIVE.json:6-23`, `projects/P601_261023_의존성_기록/log.jsonl:12` |
| conditional-helper (maker, 조건부) | 관측된 업무 없음. 호출 대상인 T04가 user 결정으로 취소됨 | 없음 | 없음 | 호출 조건 미발생 | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/conditional-helper.md:18-20`, `projects/P602_261120_릴리스_문서/log.jsonl:19,29`, `projects/P602_261120_릴리스_문서/METRICS.md:32`, `.pace/team/required-roles.json:1` |
| hub-notes (maker, 허브) | 허브 기록 4회 실행(P601 메모 이동 1회, 결정·owner 열 기재 3회). P602 메모를 허브로 옮긴 기록은 없음 | P602 종료 뒤 메모 이동은 관측되지 않음 | **결정·owner 열 작성 지적 4회(R1~R4)**. 진단 뒤에도 R4에서 재발. 11-19 pm 결정 뒤 R5 pass. 정의서에는 금지 문장이 없음 | P602 구간은 기록 부족(미확인). 허브 쪽에는 같은 기간 실행 기록이 있음 | 호출 수 미확인(실행 기록 4행) / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/hub-notes.md:18-20,22-25`, `backlogs/BL261112_02_허브_진행_메모/BACKLOG.md:17,23-29`, `backlogs/BL261112_02_허브_진행_메모/REVIEW-LOG.jsonl:1-7`, `backlogs/BL261112_02_허브_진행_메모/decisions/BL261112_02-rule-change.md:5-10`, `projects/P602_261120_릴리스_문서/METRICS.md:33` |
| unused-reporter (maker, 허브) | 관측된 업무 없음. 미사용 역할 판정은 하네스의 stats·회고 쪽에서 처리됨 | 없음 | 없음 | 실제 미사용 | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/unused-reporter.md:18-20`, `projects/P602_261120_릴리스_문서/METRICS.md:34`, `projects/P602_261120_릴리스_문서/log.jsonl:30`, `docs/TEAM-METRICS.md:54,116` |
| (담당 없음) 의존성 목록 `DEPENDENCIES.md` 갱신 | owner가 직접 4회 갱신. 모두 "자체 판단"으로 기록됐고 user 결정 원문은 없음 | **반복 업무인데 담당 역할이 없음** | — | — | — | `projects/P601_261023_의존성_기록/log.jsonl:5,11`, `projects/P601_261023_의존성_기록/METRICS.md:20`, `projects/P602_261120_릴리스_문서/log.jsonl:5,21`, `projects/P602_261120_릴리스_문서/PROJECT.md:24` |

## 제안과 결정 주체 (모두 승인 전, 원본·생성물 유지)
| # | 제안 | 근거 | 바꿀 범위 | 결정 주체 | 검증 |
|---|---|---|---|---|---|
| 1 | **hub-notes 개선**: "하지 않는 일"에 "BACKLOG 결정·owner 열은 쓰지 않는다 → PM에 HANDOFF"를 추가 | 같은 지적이 4회 반복됐고, 진단 뒤에도 재발함. pm 규칙은 정해졌지만 정의서에는 반영되지 않음 | `hub-notes.md` "하지 않는 일" 한 줄 | **pm**. 이미 내린 표기 규칙(`BACKLOG.md:17`)을 정의서에 옮기는 정리이고, A-1~A-5 모두 해당 없음 | `pace team sync` → `sync --check --json` → `pace team verify hub-notes`. 다음 허브 검토에서 같은 지적이 다시 나오는지 확인 |
| 2 | **test-auditor 개선**: 문서의 링크·버전 표기 검사는 "하지 않는 일"로 두고 doc-auditor에 HANDOFF하도록 경계를 적음 | P602에서 정의 밖 업무를 했고 T05에서 중복 검사가 있었음. 업무 중복이라는 별도 근거가 있음 | `test-auditor.md` "하지 않는 일" 한 줄 | **pm**. 기존 담당 문장에 맞추는 정리이고 검토가 줄지 않음(doc-auditor가 그대로 맡음) | sync·check·`verify test-auditor`. 다음 프로젝트에서 검사 항목이 겹치지 않는지 확인 |
| 2' | (대안) doc-auditor와 test-auditor **합침** | 위와 같은 중복 근거 | 역할 2개를 1개로 줄이고 표지 확인 | **user**. 범위 변경이고, A-3(독립 검토 약화)에 해당할 수 있음 | **추천하지 않음**. reviewer 판정과 tester 판정이 따로 기록되고 있어(`P602 log.jsonl:9,15`) 합치면 독립성이 줄어듭니다 |
| 3 | **unused-reporter 개선 또는 제외 판단** | 실제 미사용이 1건 관측됨. 하네스의 stats·finish가 같은 일을 함. 입력이 "start 행"뿐이라 조건 미발생·미확인·미사용을 구분하지 못하는 것도 정의상 빈틈임 | 개선안: 입력에 `required-roles.json`·비참여 영수증·stats JSON을 넣고 세 상태로 출력. 제외안: 원본 삭제와 `required-roles.json` 표지 정리 | 개선은 **pm**, 제외는 **user**(팀 구성·필수 역할 표지의 범위 변경) | 추천: 지금은 개선만 하고, 다음 팀 프로젝트 1건을 더 관측한 뒤 제외를 user에게 올림 |
| 4 | **의존성 목록 갱신 담당 공백** | owner 직접 갱신이 2개 프로젝트에서 4회 있었음 | 새 역할 추가 또는 기존 역할 범위 확장 | **user**. owner 업무를 옮기는 범위 결정 | user가 직접 계속할지부터 확인. 선택하면 그때 설계 |
| — | conditional-helper·doc-auditor | 조건 미발생이거나 이미 처리가 끝난 변경 | 변경 없음 | — | 조건 미발생만으로는 합침·제외를 제안하지 않음 |

**결정 전에 확인할 것:**
- **P602 회고의 반복 지적:** `review-tester-fail` 2와 `review-blocking` 4는 의미와 원인이 로그에 남아 있지 않습니다. 정의 변경으로 연결하려면 pm(필요하면 user) 인터뷰가 먼저 필요합니다.
- **hub-notes의 "기록 부족":** P602 구간에 역할 영수증이 연결되지 않아서 생긴 것입니다. 제외 근거가 아니라 기록을 보완할 대상입니다.

## 다음 조치
1. pm: 제안 1·2의 승인 여부를 결정하고, 제안 3 중 개선안의 승인 여부를 결정합니다.
2. user: 제안 4의 의존성 갱신 담당을 정합니다. 이후 제안 3의 제외안과 2'의 합침안을 판단합니다.
3. 승인된 항목만 원본에 반영합니다. 그다음 `pace team sync`, `pace team sync --check --json`, `pace team verify <이름>`을 실행하고 `Report:` 경로의 결과를 기록합니다. 위에서 실행하지 못한 `pace team list`와 check도 이때 함께 확인해야 합니다.
