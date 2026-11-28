# T02 음성 대조 (2026-11-28, 구현 PM)

소스를 하나씩 결함으로 바꾸고 해당 시험만 돌린 뒤 원래대로 되돌렸다(`node --test --test-name-pattern="P017 T02 S-n"`).

| # | 주입한 결함 | 시험 | 결과 |
|---|---|---|---|
| M1 | `assessCriteria` 결손 판정 제거(근거 없는 none·이유 없는 not_applicable·지적 없는 defect를 그대로 인정) | S-2 `test/agent-structured-review.test.ts` | 실패 1 |
| M2 | 묶음 하위 확인 ID를 바꿔 boundary·state·flow를 질문 밖으로 | S-3 같은 파일 | 실패 1 |
| M3 | `verify-cli.ts` 비-diff 예약 전 거부 제거 | S-5 `test/agent-review-log.test.ts` | 실패 1 |
| M4 | `verify-cli.ts` 같은 해시 fail 예약 전 거부 제거(예약 뒤 `loadRereview` 거부만 남김) | S-5 같은 파일 | 실패 1(예산·기록 변화 검출) |
| M5 | 사후에도 1단계 기록 지시 문장을 넣음(`...(false ? [] : [...])`) | S-4 structured·followup·hand | 각각 실패 1, 원인 "뺀 문장이 남았다: 첫 판단을…" |
| M6 | `review-hand.ts` 비-diff 예약 전 거부 제거 | S-5 `test/agent-review-hand.test.ts` | 실패 1 |

- M5는 처음 주입이 문법 오류로 실패했다(검출이 아니라 적재 실패). 문법이 맞는 주입으로 다시 돌려 단언 실패로 검출됨을 확인했다. 첫 시도가 전체 검사와 겹쳐 `test/team-metrics.test.ts` 한 건이 같은 문법 오류로 실패했으며, 되돌린 뒤 무관함을 확인한다(아래 전체 검사).

## 사후 1회차 반영 뒤 추가 (2026-11-28, 허브 결정 A — main 판단)

| # | 결함 주입 | 대상 시험 | 결과 |
|---|---|---|---|
| M7 | F1: 같은 해시 fail 거부에서 원장 일치 조건 제거 | `test/agent-review-log.test.ts` T02 S-5 | 1건 실패 — 검출 |
| M8 | F3: `--out` 보호에서 루트 TASK.md 제외 | 같은 파일 T02 S-5 | 1건 실패 — 검출 |
| M9 | F2: 묶음 답 상태를 단계와 무관하게 ID로만 선택 | `test/agent-structured-review.test.ts` T02 S-2 | 1건 실패 — 검출 |
| M10 | T-2: 상태 이름만 쓴 관측 허용 | 같은 파일 S-2 | 1건 실패 — 검출 |
| M11 | T-2: 위치 없는 지적의 defect 연결 허용 | 같은 파일 S-2 | 1건 실패 — 검출 |
| M12 | T-5·F5: review-hand의 비-diff 거부를 복구·소진 판정 앞에서 제거 | `test/agent-review-hand.test.ts` T02 S-5 | 1건 실패 — 검출 |
| M13 | T-5·F5: verify의 비-diff 거부를 복구·소진 판정 앞에서 제거 | `test/agent-review-log.test.ts` | 2건 실패 — 검출 |

| M14 | T-2(tester 2회차): defect 답의 빈·상태명 관측 허용 | `test/agent-structured-review.test.ts` S-2 | 1건 실패 — 검출 |

주입 뒤 소스는 사본과 바이트 비교(`cmp`)로 복원을 확인했다. 전체 검사(`PACE_SKIP_BROWSER_E2E=1 npm run check`) 종료 0 — tests 1548 · pass 1530 · fail 0 · skipped 18.
