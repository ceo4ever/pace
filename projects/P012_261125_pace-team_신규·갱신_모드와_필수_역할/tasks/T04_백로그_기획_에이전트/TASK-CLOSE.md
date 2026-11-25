# T04 백로그 기획 에이전트 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

허브가 맡았던 백로그 작성·근거 확인·분량 정리를 기록 근거가 있는 저장소 맞춤 maker에 연결할 수 있다. [팀 갱신 판단](evidence/team-refresh-assessment.md)과 [독립 검토](evidence/reviewer-stage2.md)는 역할의 소관과 결정 경계를 확인했고, [독립 tester](evidence/tester-stage2.md)는 고정 사본에서 실제로 근거 오류·교차 백로그 관계·분량 차이를 찾는 행동과 균일 입력의 무분할을 확인했다. 이 태스크의 목표는 달성했다. 허브 호출 흐름은 T05, 실제 백로그 인수는 병합·설치 이후 owner 확인이다.

## 기준 대조

| 기준 | 판정 | 근거 |
|---|---|---|
| T-1 | 통과 | [원문과 정본 대조](evidence/requirements-trace.md), BP-01~BP-12 전부 v1. 등록 누락 0, 고정 11개와 등급 권고 1개. |
| T-2 | 통과 | 같은 표에서 12개 정의 충족. [팀 기록](evidence/team-refresh-assessment.md)과 [실제 측정 분류](evidence/team-classification.json). 문제 해결자는 요건 미등록(BL261125_01 담당). |
| T-3 | 통과 | [정규 생성물 확인](evidence/team-sync-check.json)에서 차이 0. [적재 보고서](evidence/team-verify-report.json)의 Claude·Codex 두 행에서 실제 모델 및 원본 지문 일치, effort 적용은 미확인. |
| T-4 | 통과 | [고정 사본 지문](evidence/eval/snapshot.json), [실제 도구 격리 관측](evidence/isolation-observed.json), [양성](evidence/eval/positive/response.md), [음성](evidence/eval/negative/response.md), [독립 채점](evidence/tester-stage2.md). |
| T-5 | 통과 | [전체 검사](evidence/full-test-summary.txt)와 [독립 검사 확인](evidence/tester-suite.md), [ID 검색](evidence/requirements-search.txt), [병합 뒤 실제 작업 인수](../../../../.pace/memory/백로그-기획자-실제-작업-인수-검증.md). |

## 단위 테스트

임시 PACE_HOME과 PACE_SKIP_BROWSER_E2E=1로 타입 검사와 Node 시험 전체를 실행했다. 최종 실행은 `npm run typecheck && npm test -- --test-concurrency=2`다. 통과·제외 횟수는 전체 검사 기록에 있다. 첫 검사에서 모든 maker를 워크트리 수신자로 보던 가정이 새 허브 역할과 충돌했다. 공통 실행 경계는 유지하고, 역할 표지의 허브 배치를 수신자 검사에 연결한 뒤 [실패한 검사를 다시 실행](evidence/boundary-retest.txt)했다. 다음 두 기본 동시성 실행에서 각각 간헐 실패한 기존 [프로세스 회수](evidence/reaper-retest.txt)와 [daemon 모의 응답](evidence/wizard-retest.txt)은 개별 재실행에서 통과했다. 이후 동시성 4에서 간헐 실패한 [팀 자원 그룹 회수](evidence/lock-retest.txt)도 단독 통과했다. 최종 검사에서는 다른 전체 검사와 겹치지 않게 하고 동시 실행을 2개로 제한했다. T-5의 전체 검사 범위는 타입 검사와 Node 시험 전수이며 docs/README.md 환경에 따라 파일 동시성만 명시 조정했다. 독립 판정의 기본 동시성 요구 여부 조건은 이 계약에서 적용되지 않는다.

## E2E

`node bin/pace.ts team sync`와 `team sync --check --json`으로 실제 두 native 생성물을 대조했다. `team verify pace-backlog-planner`는 원본 prompt 적재와 명시 표지를 확인했다. 별도 기능 평가는 `git archive 1b9ae1f`에 원본과 근거 열이 없는 발췌를 추가하고 이후 커밋의 파일 없이 Anthropic 새 맥락 두 개로 실행했다. 양성 owner 입력은 당시 백로그에 남은 직접 인용 네 구절을 사용했다. [평가 설계](evidence/eval-plan.md)

## 리뷰

사전 검토 pass와 동일 TASK 지문은 [PRE-REVIEW.json](PRE-REVIEW.json)에 있다. 다른 제공자의 [1단계](evidence/reviewer-stage1.md)와 [최종 재검토](evidence/reviewer-stage2.md)에서 구현 차단 지적 0. 역할의 구체 경로·금지·허브 수신자·공통 실행 경계를 지적에 따라 보완했다. [tester 첫 판단](evidence/tester-stage1.md)과 [최종 독립 채점](evidence/tester-stage2.md)은 별도 세션이다.

## 남긴 것

owner의 실제 업무 인수는 메모리 todo로, 문제 해결자 요건 등록과 두 역할 공동 목표 종결은 BL261125_01로 연결했다. 실제 host의 모델 실행은 보고된 값에 근거하며 실제 effort와 금지 행동의 기술적 집행은 관측 범위 밖이다.
