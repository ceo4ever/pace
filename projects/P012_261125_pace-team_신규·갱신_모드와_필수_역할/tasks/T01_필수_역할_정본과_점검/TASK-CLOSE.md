# T01 필수 역할 정본과 점검 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

필수 역할의 합의 요건을 단일 정본과 등록 담당에 연결했다. 합의 원문의 등록 누락과 팀 정의의 미충족을 서로 다른 결과로 판정한다. 시험 사본에서는 문서·명령을 반영한 신규 역할 제안, 버전 상승의 누락 식별, 기존 완성 정의 유지, 선행 장치 보류와 후속 담당의 요건 미등록을 각각 관측했다.

독립 리뷰어는 문서 목표 대조와 계약 재검증을 통과시켰고, 독립 테스터는 격리 입력·원응답을 대조하고 표적 명령을 직접 실행했다. 현장 적용과 실제 등록 요건은 해당 담당의 태스크에 연결된다. [리뷰어 목표 대조](evidence/review-records/R5.json) · [리뷰어 계약 재검증](evidence/reviewer-R08-recheck.md) · [테스터 초기 목표 대조](evidence/tester-command-stage1.md) · [테스터 마지막 재채점](evidence/tester-R08-recheck.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | [필수 역할 정본](../../../../skills/pace-team/references/required-roles.md)과 [시나리오](../../../../skills/pace-team/evals/scenarios.md), [독립 정적 대조](evidence/tester-final.md) |
| T-2 | 통과 | [R01](evidence/eval-checked/R01/response.md)의 등록 누락 1건·정의 미충족 1건과 후속 원형 음성 대조, [검색 및 양성 대조](evidence/requirement-references.txt) |
| T-3 | 통과 | [R02](evidence/eval-checked/R02/response.md) · [R03](evidence/eval-checked/R03/response.md) · [R04](evidence/eval-checked/R04/response.md) · [R05](evidence/eval-checked/R05/response.md) · [R06](evidence/eval-checked/R06/response.md)의 제안·결과·근거 |
| T-4 | 통과 | 기존 정의의 [R07](evidence/eval-checked/R07/response.md)과 원본이 없는 [R08 재실행](evidence/eval-R08-recheck/R08/response.md), [독립 채점](evidence/tester-R08-recheck.md) |

## 단위 테스트

Orca의 브라우저 E2E 제외 설정으로 전체 검사 1,368건 통과, 실패 0건, 건너뜀 17건. 최종 문구를 적용한 뒤 스킬 표적 검사 9건 통과, 실패 0건. [명령·출력](evidence/check-results.txt)

## E2E

R01~R07과 수정 범위를 확인한 R08을 개별 Anthropic 새 맥락에서 읽기 전용으로 실행했다. 입력과 원응답 및 제공자·모델·종료 관측을 보존했다. 최종 결과 세트는 앞 일곱 사례와 R08 재검증으로 구성한다. [실행 및 변경 범위](evidence/eval-provenance.md)

## 리뷰

- 사전 검토 1·2차 reviewer pass · blocking 0. 최초 보완에 시나리오 정본·대조표·음성 대조를 반영했다. 2차 보완의 등록 담당 범위, 적용 조건 근거, 검색 양성 대조를 문서와 시험에 반영했다. [정규화된 계약 지문과 원문](PRE-REVIEW.json)
- 구현 후 reviewer pass · 초기 tester fail. 결과 상태 표기와 제안 범위를 고정한 입력으로 재실행했다. 후속 tester는 R08의 부분 초안 제안이 남은 점을 검출했다. [최초 독립 채점](evidence/tester-stage2.md) · [표적 직접 실행 및 개별 채점](evidence/tester-final.md)
- 정본에 부분 초안과 완성본 모두의 보류를 명시했다. 재검증 tester pass · reviewer blocking 0. [최종 tester](evidence/tester-R08-recheck.md) · [최종 reviewer](evidence/reviewer-R08-recheck.md)
- 교본: 해당 없음(코드 변경 없음).

## 남긴 것

T03이 신규·갱신·이전 흐름에 이 점검을 연결한다. T04·T05는 실제 기획자 요건 ID로 중복 본문·참조 대조를 다시 실행한다. 문제 해결자 요건 등록과 충족 판정은 BL261125_01의 담당 범위다.
