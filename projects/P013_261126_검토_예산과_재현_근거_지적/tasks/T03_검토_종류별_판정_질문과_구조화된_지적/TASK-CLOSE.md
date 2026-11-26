# T03 검토 종류별 판정 질문과 구조화된 지적 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

백로그, 태스크 사전, 구현 후 검토는 각각 다른 질문으로 판정한다. 단계에 맞는 지적의 위치·실패 조건·재현 수단이 갖춰졌을 때 blocking이 도구 판정에 들어간다. 원문과 도구 판정, 등급이 바뀐 이유와 인계를 함께 보존한다. 구조를 판독할 수 없는 응답은 미확인으로 남기며 유효 회차에서 제외한다. [변경 패치](evidence/impl-diff.patch)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 단계별 프롬프트 세 종류, tester 판정 질문, 관리 단위 밖 일반 목표 검토 |
| T-2 | 통과 | ID·등급·유형·위치·실패 조건·재현·확신도, 두 종류 인계, 근거 누락 강등과 파일 줄 범위 |
| T-3 | 통과 | 구조에 따른 도구 판정, footer 차이, 중복 키와 깨진 구조의 미확인 처리, 고아 복구와 재검토의 판정 대조 |
| T-4 | 통과 | 기존 원장과 일반 산출물 호환, T02a 공동·owner 회차와 B1 근거 |
| T-5 | 통과 | 타입 검사, 집중 시험, 선언된 전체 검사 및 다른 제공자 실측 |

## 단위 테스트

- 타입 검사와 집중 시험 99건 통과. 실패·건너뜀 0건.
- `PACE_SKIP_BROWSER_E2E=1 npm run check` 통과. 총 1,438건 중 1,421건 통과, 실패 0건, 건너뜀 17건.
- 비밀 검사와 `pace brain lint`에서 오류 0건. 브레인은 T02의 결정 권한 정본 변경을 참조하는 검토 경고 2건을 알렸다.

## E2E

- 작업본 `pace agent verify`에서 OpenAI 작성자 기준으로 Anthropic 검토를 호출했다. 교차 검토의 실제 응답과 계산된 판정을 함께 보존했다. Claude의 보고와 도구 판정은 모두 fail이었다. 유효 blocking 1건과 should_fix 3건을 기록했다. [입력](evidence/real-review-input.md) [원문과 계산](evidence/real-review-result.json)

## 리뷰

- 최신 사전 계약의 독립 판정과 계약 대조가 통과했다. [첫 판정](review-records/R1.json) [계약 대조](evidence/pre-review-stage2.json)
- 구현 패치 SHA-256 `3ca4f2043ed6a6863c0ec7cc89ca4f0cc6793a5eca5ae2e81677908d820298d2`를 독립 tester와 다른 제공자 reviewer가 대조했다. [tester](evidence/tester-final.md) [reviewer 첫 판정](evidence/review-records/R3.json) [계약 대조](evidence/reviewer-final-stage2.json)
- 먼저 나온 중복 키, 줄 범위, 구조화 표지 누락의 재현을 고쳤다. 보완 회귀 시험은 원문의 pass로 판정이 복구되는 우회와, 원문이 가리키는 판정이 원장과 달라지는 기준점 양쪽을 검사한다. [첫 검증](evidence/tester-first.md) [고아 기록 재현](evidence/tester-r2.md)

- 검토 등급과 B1 안내를 정렬한 최종 패치 SHA-256 `c0dbb9bc44a2c94fc1830c09266d1810af583f90eca4fffa8948e734feea5af4`는 작동 코드가 위 지문 `3ca4f2043ed6`와 같고, 독립 문서 대조와 변경 후 집중 시험이 통과했다. [최종 검토](evidence/review-records/R4.json)

## 남긴 것

- 증거 진술의 실제 재현 가능성은 독립 검토·시험에서 확인한다. 도구는 지적의 연결과 필수 항목을 검사한다.
- 수정 확인과 상위 검토는 T09, 증거 상태와 영향 문턱은 T04에서 다룬다.
- 의도 파악 스킬의 양쪽 제공자 미실행 안내도 T09의 결정·도구 문서에 맞춰 정렬한다.
