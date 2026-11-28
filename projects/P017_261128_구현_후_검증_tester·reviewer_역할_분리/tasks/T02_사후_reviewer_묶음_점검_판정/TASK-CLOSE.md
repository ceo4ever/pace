# T02 사후 reviewer 묶음 점검 판정 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적 정합: 맞음. BR02 목적은 사후 reviewer의 필수 항목을 TASK 기준 `T-n`에서 경계·상태·흐름 세 묶음 12항목으로 바꿔, 실행 증거 부재로 생기는 unknown과 호출 소진을 없애고 묶음 안 결함이 판정에 닿게 하는 것이다. 고정 12항목·답 상태(`defect`·`none`·`not_applicable`)·묶음 범주, TASK+diff 입력과 1단계·범위 축소 문장 제거, 비-diff·같은 해시 fail 재요청의 예약 전 거부가 이 목적을 직접 구현한다.
- 달성: 달성(한계 있음). 재생 2차에서 unknown 0/12(기존 R1 다섯 입력은 모두 unknown), 경계(A) 합성 2/2, 상태(B) T06 소급 변경 2/2가 유효 blocking으로 나왔다. 독립 tester(Codex)는 T-1·T-3·T-4·T-6·T-7·T-9를 2회차에서, T-2·T-8을 3회차 재확인에서 통과로 판정했다.
- 번복·한계:
  - 흐름(C)은 재생으로 검증되지 않았다. T06 교착은 패치 밖 기존 `FOR UPDATE`에 의존해 패치만으로 판정할 수 없고, 무해 대조의 흐름 blocking은 기준 IA에 이미 있는 단계를 몰라 생긴 거짓 양성이다(문제해결자 원자료 대조). owner A-1(2026-11-28, "기록해서 보고로")로 재생 관문의 통과선을 없애고 관측값 기록·owner 보고로 바꿨다. 재생 입력에 base 트리를 더해 BL261128_01 최종 설치 후보에서 한 번 다시 돌린다(백로그 BL261127_01 결정 기록 `owner-decision-2026-11-28-replay-report.md`).
  - 사후 reviewer 2회차(R2) blocking F7·F8·F9는 owner A-3(2026-11-28, "한계로 적고 마감")으로 한계로 받았다(`evidence/owner-decision-T02-post-limits.md`, `evidence/a3-request-T02-post-limits.json`, REVIEW-FOLLOWUPS의 waiver_request·owner 행). 세부는 아래 남긴 것.
  - 재생은 한 제공자(Codex)·표본 7개(입력 6 + 무해 대조 1)·입력당 2회라 일반화 한계가 있다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 `test/agent-structured-review.test.ts`(12 ID·필요/생략 동일), 공통 단언 12개 ID(`test/helpers.ts` `assertPostBundlePrompt`), tester 2회차 1개 항목 제거 음성 대조 검출 |
| T-2 | 통과 | 한계 F7(아래). S-2 결손 사례(누락·빈 관측·상태 이름만 쓴 관측·위치 없는 지적의 defect·지적 없는 defect), 다른 단계 같은 ID는 기존 답 상태. 음성 대조 M1·M10·M11·M14, tester 3회차 |
| T-3 | 통과 | S-3 T06 교착·소급 변경 각각 fail, 원래 범주·재판정·계획 지적은 `outside_question` note. 음성 대조 M2, tester 2회차 |
| T-4 | 통과 | S-4 `verify`(첫 검토·재검토·진단 없는/있는 수정 확인)·`review-hand`(첫 검토·재검토) — TASK·diff 원문, 7문장 부재, 12항목 지시. tester 2회차 |
| T-5 | 통과 | 한계 F8(아래). S-5 `verify`·`review-hand` 비-diff·헝크 없는 diff·같은 해시 fail 거부와 상태 불변, 비-diff 거부는 중단 복구·소진 판정보다 먼저(tester 안내 유지), 다른 원장의 같은 이름은 거부하지 않음, `--out` 루트 TASK.md 거부, owner 회차 허용. 음성 대조 M7·M8·M12·M13 |
| T-6 | 통과 | S-6 프롬프트 sha256 고정값·`review-admission.ts` 해시, T01 R1~R5 재판정, `legacyStructureOnly` [rounds, calls], 예산·stats(`evidence/s6-baseline-head.json`, `evidence/s6-baseline.ts`로 070f105 소스에서 계산) |
| T-7 | 통과 | `test/review-signals.test.ts`, 묶음 원문 `verify`에서 `recurring_area`·`superficial_fix`(`test/agent-review-log.test.ts`), tester 2회차 |
| T-8 | 통과 | `evidence/replay/summary.md`, 원문 `evidence/replay/attempt1/`·`attempt2/`, 입력 해시 `*.input.sha256`. 관측값 기록 — owner A-1로 통과선 없음, tester 3회차가 요약과 원문 일치 확인 |
| T-9 | 통과 | tester 2회차: 제외 경로 뺀 변경 12파일이 `src/agent/**`·`test/**`, `call-hook.ts`·`harness.ts` 무변경. 문구 고정 시험 갱신은 아래 |

## 단위 테스트

- `PACE_SKIP_BROWSER_E2E=1 npm run check` — 종료 0. `tsc` 통과, `node --test` tests 1548 · pass 1530 · fail 0 · skipped 18(브라우저 E2E 끔).
- 음성 대조 M1~M14 모두 검출(`evidence/negative-controls.md`). M5 첫 시도는 구문 오류로 무효라 다시 했다.
- 의도적으로 바꾼 고정 시험(T-9): 사후 첫 검토의 1단계 단언 두 곳 → "지금은 구현 후 묶음 점검이다", 재검토 범위 단언 → 12항목 전체 지시, 묶음 범주 단언 추가(`test/agent-structured-review.test.ts`). 사후 픽스처는 diff로 바꿨다(`test/agent-review-log.test.ts`·`test/agent-review-followup.test.ts`·`test/agent-review-hand.test.ts`·`test/project-harness.test.ts`) — 비-diff 대상이 예약 전에 거부되기 때문이다.
- 시험 위치 편차: TASK 표와 달리 `verify` S-4와 owner 회차 S-5는 `test/agent-review-followup.test.ts`, S-6 stats는 `test/project-review-metrics.test.ts`에 있다(기존 하네스 재사용).

## E2E

- S-7 재생(T-8): 관측값 기록 — unknown 0/12, 경계(A) 합성 2/2, 상태(B) T06 2/2, 흐름(C) 미검증(T06 교착 0/2, 무해 대조 흐름 blocking 2/2는 거짓 양성), 도구 판정 pass 2/12. 1차 재생은 `category`에 항목 ID를 적어 다섯 입력이 unknown이었고, 묶음 프롬프트에만 범주 문구를 보완해 2차를 돌렸다(재시도 1/2, 다른 단계 프롬프트 바이트 불변). `evidence/replay/summary.md`.

## 리뷰

회차마다 요청 시각=PM 검증 요청, 회수 시각=판정 결과 수신(2026-11-28 KST):

| 역할 | 회차 | 요청 시각 | 회수 시각 | 판정 |
|---|---|---|---|---|
| tester | 1 | 20:44:13 | 20:51:27 | fail(T-1·T-2·T-4·T-5·T-9) |
| reviewer | 1 | 20:44:13 | 20:46:51 | fail(blocking 6) |
| tester | 2 | 21:03:30 | 21:11:07 | fail(T-2·T-5·T-8) |
| reviewer | 2 | 21:03:30 | 21:06:22 | fail(blocking 3·should_fix 1, 예산 2/2 → owner A-3 한계) |
| tester | 3 | 21:14:59 | 21:17:07 | pass(T-2·T-8만, 허브 필수 재검증) |

tester 판정: pass — 2회차에서 T-1·T-3·T-4·T-6·T-7·T-9 통과, 3회차(허브 필수 재검증)에서 T-2·T-8 통과. 3회차의 "목표 달성: 미달"은 base 트리를 더한 최종 설치 후보 재생이 후속이라는 근거뿐이며 owner A-1이 그 재생을 BL261128_01로 넘겼다. src·test diff 해시는 매 회차 전후 같았다. 원문 `evidence/tester-post/round1.md`·`evidence/tester-post/round2.md`·`evidence/tester-post/round3.md`.
reviewer 판정: fail → owner A-3 한계 수용 — R2 blocking 3(F7·F8·F9)·should_fix 1(F10). R1 blocking 6 중 F1·F2·F3·F5는 고쳤고 F4는 허브 결정으로 한계, F6은 같은 커밋 포함으로 해소(`evidence/reviewer-post/round1.json`·`evidence/reviewer-post/round2.json`, `evidence/review-records/R1.json`·`evidence/review-records/R2.json`).

- 결정 메모:
  - 1회차 반영 범위(허브 main 판단, 질문 A): (가) 공통 단언 12개 ID, 비-diff 거부를 복구·소진 판정 앞으로. (나) F1·F2·F3 반영(F3은 데이터 손실이라 필수). T-2는 형식만 — 빈 관측·상태 이름만 쓴 관측·위치 없는 지적의 defect는 unknown, 경로 타당성은 보지 않는다.
  - 2회차 tester T-2(defect 답의 빈·상태명 관측)와 T-8(요약 표 누락 1건)은 허브 결정 범위 안이라 반영했다.
  - F10 should_fix(`test/agent-review-followup.test.ts`의 diff 기대값을 프롬프트에서 잘라냄): 반영하지 않았다 — should_fix는 pass 전 반영하지 않는 원칙. diff 원문 포함은 `assertPostBundlePrompt`(고정 diff 문자열)와 review-hand S-4가 따로 단언한다.
  - 재생 관문: owner A-1로 기록·보고로 바뀌어 남은 문구 재시도 1회를 쓰지 않았다.
- 특수 기능: 필요 없음. tester·reviewer는 `pace agent run`·`pace agent verify`(Codex)로 새 맥락에서 실행했다. tester는 mkdtemp 때문에 `--write`로 돌리고 src·test diff 해시를 전후로 대조했다(모두 같음).
- 교본: TypeScript 색인 — 주변 코드(`structured-review.ts`의 범주·판정, `verify-cli.ts`의 예약 전 거부)를 따랐고 안티패턴 대조 결과 없음.

## 남긴 것

- F4 한계(허브 결정): 일반 `verify`는 호출 뒤 TASK.md를 다시 대조하지 않는다. 검토 중 계약이 바뀌면 옛 계약으로 받은 판정이 저장된다. 대상 패치도 호출 뒤 대조하지 않는 기존 동작과 같다. `review-hand`→`review-record` 경로는 계약 지문(`criteriaDigest`)으로 stale unknown이 된다.
- F7 한계(owner A-3): 기준 표에 RA-1~RC-4 12개 ID를 그 순서로 쓴 옛 사후 기록이 있으면 새 묶음 규칙으로 재판정된다. 그런 기록은 없고 T01 R1~R5는 불변이다.
- F8 한계(owner A-3): 첫 fail의 결과 파일을 쓴 뒤 마지막 원장 행 직전에 중단된 상태에서 같은 해시 재요청은 거부 전에 중단 복구가 원장을 고친다(실제 판정의 복원, 새 호출 없음).
- F9 한계(owner A-3): `review-hand` 뒤 `review-record` 전에 루트 TASK.md가 없어지면 결과가 기록되지 않는다(종료 2, 예약만 남음).
- F4 형식 한계: 메모가 앞에 붙은 패치는 첫 줄이 `diff --git `이 아니라 거부된다. 헝크 없는 diff(이름 바꾸기·모드만)도 거부한다. 내용의 진위는 판정하지 않는다.
- 재생: 한 제공자·표본 7개. 흐름(C) 미검증 — BL261128_01 최종 설치 후보에서 base 트리를 더한 재생과 owner 보고로 넘긴다.
- review-hand 계약 변경 감지: `criteria_digest`에 post 단계의 TASK 원문을 포함하도록 바꿨다(`src/agent/review-hand.ts` `criteriaDigest`). 옛 고정본의 지문과 다르므로 이 변경 전에 고정한 사후 hand는 stale로 판독된다.
- T03이 알아야 할 것: 사후 reviewer 대상은 구현 diff만이고 문서·결과물 확인은 tester 경로다(`postTargetIssue` 안내 문구). 묶음 답 형식(빈·상태명 관측, 위치 없는 지적의 defect는 unknown)을 배정 문서에 적는다.
