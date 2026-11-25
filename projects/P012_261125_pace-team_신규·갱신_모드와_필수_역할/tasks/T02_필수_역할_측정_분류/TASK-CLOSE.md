# T02 필수 역할 측정 분류 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

허브 쪽·조건부 역할의 비참여를 조건 미발생, 기록 부족, 실제 미사용으로 구분해 마감과 병합의 지표에 기록했다. 회고에서는 해당 역할의 별도 신고 없이 마감할 수 있고, 일반 역할의 기존 후보와 실제 참여 관측은 유지됐다. 별도 호출 자료를 기존 팀 채택·소통 필드와 분리하는 후속 수집 규칙을 정했다. [독립 목표 대조](evidence/review-records/R3.json) · [리뷰어 계약 재검증](evidence/reviewer-recheck.md) · [테스터 1단계](evidence/tester-stage1.md) · [테스터 실행·계약 재검증](evidence/tester-aggregate.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 구판 d5129f8의 `loadTeam` 실행 전후 역할 객체 일치, 표지의 경로·링크·UTF-8·크기·중복·비밀 후보 음성 대조. [호환·표적 검사](evidence/compatibility-and-targeted.txt) |
| T-2 | 통과 | 구간 영수증, 충돌과 부족, 실제 활동 우선 및 일반 역할 대조. [표적 검사](evidence/compatibility-and-targeted.txt) |
| T-3 | 통과 | 일반 후보 누락 거부, 표지 역할 신고 없이 finish·merge, 양쪽 METRICS의 비참여 3종 포함. 기존 finish·merge 3건을 구판·현행에서 재실행. [호환·표적 검사](evidence/compatibility-and-targeted.txt) |
| T-4 | 통과 | 호출 자료만으로는 팀 절과 팀 마감이 생기지 않고, 실제 질문·소통 원장은 기존 미채택 요약을 냈다. 후속 판독·집계 규칙은 팀 측정 문서에 반영했다. [표적 검사](evidence/compatibility-and-targeted.txt) |
| T-5 | 통과 | [전체 검사](evidence/check-results.txt) · [독립 테스트](evidence/tester-aggregate.md) · [보안 검토](evidence/reviewer-recheck.md) |

## 단위 테스트

Orca의 브라우저 E2E 제외 설정으로 전체 검사 1,372건 통과, 실패 0, 건너뜀 17. 소통 원장 대체 입력과 표지의 Git 스냅숏 누락 회귀를 추가한 뒤 타입 검사와 최종 표적 8건 통과. 실행 코드는 이 마지막 두 시험 추가 전과 동일하다. [검사 결과](evidence/check-results.txt)

## E2E

격리 Git 저장소·worktree에서 stats JSON/텍스트, 일반 후보 보류, 마감, 병합 결과를 확인했다. 구판 호환은 과거 Git 객체를 직접 내보낸 사본에서 확인했다. 팀 채택 여부와 사용된 역할 증거를 분리했고, 별도 호출 자료는 유효한 기존 `note`와 독립 파일로 대체했다. [구판 및 소스 CLI 결과](evidence/compatibility-and-targeted.txt)

## 리뷰

- 사전 reviewer pass · blocking 0. 마감 지표, 음성 대조·영수증 형식과 보안 시험에 보완을 반영했다. [사전 검토 원장](PRE-REVIEW.json)
- 구현 후 reviewer의 첫 계약 대조에서 구판 판독 실행 증거의 전달 누락을 확인했다. 실제 구판 실행·기존과 현행의 마감/병합 결과, 미채택 소통 원장, Git 봉인 후보 대조를 함께 회수했다. [첫 계약 대조](evidence/reviewer-stage2.md)
- 최종 tester pass · reviewer blocking 0. Git 이력을 요구하는 구판 시험은 격리 실행으로 보존했고, 표지에 대한 Git 인덱스의 음성 대조는 반복 가능하게 했다. 표지는 Git의 역할 배정 근거와 함께 검토한다. [독립 테스트 재실행](evidence/tester-aggregate.md) · [계약 및 보안 재대조](evidence/reviewer-recheck.md)
- 교본: TypeScript·검증 색인 — 기존 안전 판독과 스냅숏 기능을 재사용하고, 임시 파일·Git 실행 통합 fixture에서 실패 동작을 대조했다.

## 남긴 것

T03은 측정 분류를 갱신의 근거로 쓴다. T04는 백로그 기획자에게 허브 쪽 표지를 적용한다. BL261125_01 BR01·BR03은 이 태스크의 표지와 별도 호출 자료 규칙을 이어받는다.
