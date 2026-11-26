# T07 검토 측정과 전후 비교 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

검토 원장을 기존 프로젝트 사건·팀 지표와 구분해 보고한다. 프로젝트·태스크·연결 백로그의 실제 호출과 판정, 비용, 원문에서 확인한 지적 및 후속 사건을 관측했다. [구현 변경](evidence/impl-diff.patch)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 두 태스크 원장과 프로젝트 직속·백로그, 무예약 옛 행 및 중단·무효·미완료 호출을 확인했다. 새 입력의 실제 CLI 값은 호출 8회와 유효 판정 5회다. |
| T-2 | 통과 | 시간·토큰의 알려진 값과 미보고, 원문 지문·blocking·강등·영향별 시간·기록상 해소의 분자와 분모를 대조했다. |
| T-3 | 통과 | 공동·실제 owner 요청·진단·상위 검토를 구별한다. 옛 기록은 미관측을 표시하고 기존 프로젝트 사건과 합산하지 않는다. |
| T-4 | 통과 | P007~P013 동일 지표 비교표, P009 T06 옛 83회 원본 대조, 허브 PM의 병합 뒤 품질 관측 todo를 남겼다. |
| T-5 | 통과 | 기존 stats와 팀 마감 호환성, 전체·독립 검증 및 기존 진입점 실패 반례를 확인했다. |

## 단위 테스트

- 집중 20건, 팀 마감 반례 5건이 통과했다. 부모의 stats에 새 원장 지표가 없어 동일 CLI 반례가 실패했다. [집중](evidence/compatibility.log) [팀](evidence/team-verified.log) [이전 진입점](evidence/baseline.log)
- `PACE_SKIP_BROWSER_E2E=1 npm run check`에서 1486건 중 1469건 통과, 실패 0, 기존 skip 17을 확인했다. [전체 결과](evidence/full-check.log)
- 최초 전체에서 기존 PROJECT 하드링크와 Git에 없는 빈 디렉터리가 통계를 막았다. 실제 원장 파일을 후보에 고정하도록 바꾸고 기존 PROJECT 읽기 방식을 복원했다. [초기 실패](evidence/full-check-compatibility-initial.log)
- 뒤이은 전체 검사에서 시스템 잠자기와 같은 길이로 CLI 종료가 지연됐다. 깨어난 뒤 해당 두 건과 다시 수행한 전체 검사가 통과했다. [재현과 복구](evidence/sleep-retry.md)
- 비밀 검사가 통과했다.

## E2E

- 실제 `stats --json`과 `stats --write`에서 원장 집계와 기존 통계를 분리했다. 뒤늦게 새 검토 원장이 Git에 들어오면 팀 마감을 막으며 파일과 index는 보존한다. [검사 출력](evidence/team-verified.log)
- 실제 저장소의 P007~P013에서 같은 집계를 실행했다. 원장이 없는 재현 사례와 미보고 비용·옛 공동의 미관측을 표시했다. [비교 자료](evidence/project-comparison.json) [프로젝트 비교표](../../PROJECT-CLOSE.md#검토-전후-비교)

## 리뷰

- 사전 계약의 두 단계를 통과했다. [사전 기록](PRE-REVIEW.json) [계약 대조](evidence/pre-review-stage2.json)
- 최신 지문 `c9812550c4284c5c3622aed26a4e192c7da7e39cfc0cf2e556d67d751b083f75`을 독립 reviewer와 tester가 확인했다. 후속 사건의 정의를 구분하고 팀 호환성을 보완했다. [정의 대조](evidence/reviewer-stage2.json) [호환성 검토](evidence/reviewer-verified.json) [tester](evidence/tester-verified.md)

## 남긴 것

- 해소율은 같은 대상의 바뀐 원문·직전 재현 지적·연결된 독립 pass의 대리 지표다. 나중에 드러나는 필수 결함을 포함한 판단은 병합 후 허브 PM의 관측으로 남긴다.
- 다른 공용 호출 원장에는 이 검토 호출을 중복 집계하지 않는다. [출처 연결](../../../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BR03_에이전트_호출_기록.md)
