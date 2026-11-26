# T04 영향 문턱과 기준별 증거 상태 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

검토 도구가 합의 목적·기준·필수 안전의 영향과 실제 근거를 따로 판단한다. 작은 영향은 should_fix로 기록하며 불충분한 안전 설명과 필수 증거는 미확인으로 남겨 통과를 보류한다. 필수 증거의 기본 조치는 보완 관측이다. 미확인을 수용하며 진행하는 실제 선택은 A-3 결정으로 기록한다. [구현 변경](evidence/impl-diff.patch)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 지적의 영향 분류와 확정 기준 ID, 작은 영향과 비안전 근거 누락의 강등 |
| T-2 | 통과 | 위치와 입력·도달·결과의 안전 설명, 불완전 설명에 대한 관문 보류 |
| T-3 | 통과 | 필수 기준 목록의 확보·없음·미확인·누락·여분·판독 불가, 실제 교차 관측 |
| T-4 | 통과 | 필수 근거 보완, 실제 A-3와 증거 보존, 같은 예산 구간의 재검토, 버전 1과 새 형식의 연결·고아 복구 |
| T-5 | 통과 | 합성 입력의 실제 다른 제공자 호출 및 선언 검사, 독립 tester·reviewer |

## 단위 테스트

- 타입 검사와 집중 시험 123건 통과, 실패·건너뜀 0건.
- `PACE_SKIP_BROWSER_E2E=1 npm run check` 통과. 총 1,462건 중 1,445건 통과, 실패 0건, 건너뜀 17건.
- 초기 전체 검사에서 부트 시간 제한 시험이 실패했다. 단독과 최종 전체 실행에서 통과했다. [단독 재검증](evidence/full-check-boot-retry.log)
- 새 형식 표지가 남은 고아 기록에 중복 기준 키를 삽입했을 때 원문의 통과가 복구되지 않았다. [재현 시험](evidence/orphan-duplicate-key.test.ts) [실행 결과](evidence/orphan-duplicate-key.log)
- 비밀 검사와 `pace brain lint`를 실행했다.

## E2E

- 합성 백로그를 작업본 CLI로 OpenAI 작성자 기준 Anthropic에게 검토받았다. 원문은 기준별 미확인과 없음을 구별했고, 도구는 fail과 보완 관측을 기록했다. [합성 입력](evidence/real-review-input.md) [원문·판정](evidence/real-review-result.json)

## 리뷰

- 최신 사전 계약의 두 단계가 통과했다. [사전 검토](PRE-REVIEW.json) [계약 대조](evidence/pre-review-stage2.json)
- 구현 지문 `f257d164bc0e1c536534c7a0c9cfda51f433b4bde587aa7423d00ab53b453176`에 대한 독립 tester·다른 제공자 reviewer가 통과했다. [tester](evidence/tester-final.md) [reviewer](evidence/review-records/R3.json) [계약 대조](evidence/reviewer-final-stage2.json)
- 안전 미확인과 판독 불가가 전체 판정을 생략하지 않게 하고, 승인된 계약 재시작 뒤 과거 증거를 범위 재검토 기준으로 삼지 않도록 고쳤다. [반영 기록](evidence/review-disposition.md)

## 남긴 것

- 위치와 경로 설명의 구조, 선언된 영향 및 기준별 관측 근거를 대조한다. 실제 증거의 내용과 위험 주장은 독립 검토·테스트에서 확인한다.
- 허가 범위와 실제 변경 위치의 게이트는 T05, 별도 경로의 검토 기록은 T06에서 다룬다.
