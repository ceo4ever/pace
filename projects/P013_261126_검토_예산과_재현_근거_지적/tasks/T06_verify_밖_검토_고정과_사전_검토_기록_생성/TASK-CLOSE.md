# T06 verify 밖 검토 고정과 사전 검토 기록 생성 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

외부 검토는 원문·필수 기준·직전 판정을 넘기는 시점에 고정한다. 같은 예약의 결과를 동일 판정기로 계산하며, 생성한 PRE-REVIEW가 실제 태스크 게이트의 입력이 된다. [구현 변경](evidence/impl-diff.patch)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | verify 혼용 호출 4·판정 2와 고정만 4·판정 0을 확인했다. 새 파일 없이 종료 16으로 기존 공동·사용자·상위 경로를 반환한다. |
| T-2 | 통과 | 원장 예약과 고정본 지문에 연결한다. 무고정·재사용·다른 단계·판정 상한을 거부하고 같은 구조화 판정기로 계산한다. |
| T-3 | 통과 | 원래·현재 내용 및 기준 변경과 직전 검토를 대조한다. 중단 복구에서도 외부 원문과 고정 증거를 확인한다. |
| T-4 | 통과 | 수기·옛 원장과 동일한 게이트, 교차 대체 근거·연속성·허가, 무효·중단 제외와 유효/비활성 사용자 승인 보존. |
| T-5 | 통과 | 지문 고정 독립 reviewer·tester, 실제 CLI 게이트, 명령 문서, 선언 전체 검사 및 사전 검토·스킬 회귀. |

## 단위 테스트

- 원장·외부 검토·스킬 회귀 124건, 실제 하네스 5건을 통과했다. 부모 구현의 초기 기능 시험 9건은 모두 실패했다. [집중](evidence/compatibility.log) [하네스](evidence/gate.log) [이전 구현](evidence/baseline.log)
- `PACE_SKIP_BROWSER_E2E=1 npm run check`에서 1,480건 중 1,463건 통과, 실패 0건, 건너뜀 17건을 확인했다.
- 초기 검사의 기존 R27 fixture 준비 실패는 단독 실행과 최종 전체 검사에서 통과했다. [초기 실패](evidence/full-check-r27-initial.log) [단독 재검증](evidence/full-check-r27-retry.log)
- 비밀 검사가 통과했다.

## E2E

- 임시 Git 저장소에서 외부 원문 고정과 판정 등록을 거쳐 생성한 PRE를 실제 `pace project check`에서 확인했다. 구현 후 검토도 T05의 허용 diff·지문을 전달한다. [하네스 결과](evidence/gate.log)
- 다른 단계에 열린 상위 보류와 실제 합성 A-3 승인 대기에서 원장 바이트를 보존했다. 기존 verify는 기록된 공동·사용자 회차를 실행했다. [응답·예산 시험](evidence/compatibility.log)

## 리뷰

- 설계를 보완한 사전 계약을 두 단계로 대조했다. [사전 기록](PRE-REVIEW.json) [계약 대조](evidence/pre-review-stage2.json)
- 최종 구현 지문 `4a0de9c914b653b447bf9fd4c686a8e09f061b601f3fdb4d473242e6ccbe455f`의 독립 reviewer와 tester가 통과했다. 독립 tester는 기존 구현에 대한 8가지 변이의 검출력도 확인했다. [reviewer](evidence/reviewer-final-stage2.json) [tester](evidence/tester-final.md) [반영 기록](evidence/review-disposition.md)

## 남긴 것

- 외부 제공자·검토자와 원문의 독립성은 제출자가 실제 출처를 확인한다. 원본 기록이 출처의 근거다. 옛 경로에서 확인할 수 없는 대체 사유는 새로 만들지 않는다.
- 외부가 쓴 원장 호출의 비용과 관측 표기는 T07이 같은 원장에서 집계한다.
