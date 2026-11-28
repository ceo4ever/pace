# P017 구현 후 검증 tester·reviewer 역할 분리 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-28

## 목표 달성 판정

- 상위 목적 정합: 맞음. 상위 목적은 owner가 자리를 비워도 품질을 지키며 검토 반복에 시간·토큰을 낭비하지 않는 것이다. 이 프로젝트는 사후 reviewer가 실행 증거 없이 TASK 기준을 다시 판정하다 `unknown`으로 예산을 쓰는 원인을 없애고(TASK+diff 입력, 세 묶음 12항목, 실행 증거 요구 제거), reviewer를 필요한 태스크에만 tester 통과 diff로 부르게 했다.
- 계약 목표: 달성(한계 있음).
  - BR01(T01): TASK의 `구현 후 reviewer: 필요|생략 — 이유` 줄, 사전 판정(사실 질문·기준 범위 한정), 회차별 시각 칸.
  - BR02(T02): 사후 12항목·답 형식·판정, 비-diff·같은 해시 fail 재요청 예약 전 거부, 단계 경계 회귀 불변(프롬프트 sha256·옛 기록·stats 고정 비교).
  - BR03(T03): 배정 정의 한 곳(tester 항상, reviewer는 필요·PM 판단·tester 통과 diff에만), 역할·Q1·보안·팀 정렬, 사례 대조표 갈림 0.
- 관측(재생, T02 S-7 — owner A-1로 통과선 없는 기록·보고): unknown 0/12(기존 R1 다섯 입력은 모두 unknown), 경계(A) 합성 2/2, 상태(B) T06 소급 변경 2/2 검출. 흐름(C)은 **미검증** — T06 교착은 패치 밖 기존 잠금에 의존해 패치만으로 판정할 수 없고, 무해 대조의 흐름 blocking은 기준 IA를 모르는 거짓 양성이었다. 재생 입력에 base 트리를 더해 BL261128_01 최종 설치 후보에서 다시 돌리고, 설치 여부는 그 보고로 owner가 정한다.
- 상위 목적의 일반 효과(검토 비용 감소)는 설치 뒤 3개 프로젝트 관측과 보고로 확인한다(백로그 측정 절, owner "무조건 보고"). 지금은 미확인이다.
- 독립 판단: 태스크마다 독립 tester(Codex)가 BR 원문과 결과물을 먼저 대조한 뒤 기준을 판정했다(T01 5회차, T02 2·3회차, T03 6회차 pass).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | T01 [TASK-CLOSE](tasks/T01_TASK_묶음_지정과_사전_판정/TASK-CLOSE.md) — 한계 F5(안전 쪽 오거부, owner A-3) |
| P-2 | 통과 | T02 [TASK-CLOSE](tasks/T02_사후_reviewer_묶음_점검_판정/TASK-CLOSE.md) — 한계 F4·F7·F8·F9(owner A-3·허브) |
| P-3 | 통과 | T02 `evidence/replay/summary.md`·원문 `attempt1`·`attempt2`, tester 3회차가 원문과 일치 확인. owner A-1로 통과선 없음 |
| P-4 | 통과 | T03 [TASK-CLOSE](tasks/T03_구현_후_배정·재확인_절차와_문서·팀_정렬/TASK-CLOSE.md) — 사례 대조표 갈림 0, `team sync --check` 종료 0. 한계 F1·F2(owner A-3) |
| P-5 | 통과 | `PACE_SKIP_BROWSER_E2E=1 npm run check` 종료 0(tests 1548 · pass 1530 · fail 0 · skipped 18). 옛 사후 기록은 기록된 필수 항목으로 판독 규칙을 고르고(생성 경로 없음) 구판 CLI 경로·표지는 없다 |

## 태스크 결과

- T01 TASK 묶음 지정과 사전 판정 — 완료 `070f105`. [TASK-CLOSE](tasks/T01_TASK_묶음_지정과_사전_판정/TASK-CLOSE.md)
- T02 사후 reviewer 묶음 점검 판정 — 완료 `9756e3d`. [TASK-CLOSE](tasks/T02_사후_reviewer_묶음_점검_판정/TASK-CLOSE.md)
- T03 구현 후 배정·재확인 절차와 문서·팀 정렬 — 완료 `b4c7f3b`. [TASK-CLOSE](tasks/T03_구현_후_배정·재확인_절차와_문서·팀_정렬/TASK-CLOSE.md)

한계 목록(전부):

| 태스크 | 한계 | 결정 |
|---|---|---|
| T01 | F5 이유 줄의 인라인 코드 주석 표지 인용을 오거부(안전 쪽). 형제 필드 주석 접합 미검사 | owner A-3 |
| T02 | 흐름(C) 재생 미검증 — BL261128_01 최종본에서 base 트리 재생·보고 | owner A-1 |
| T02 | F4 일반 `verify`는 호출 뒤 TASK.md를 다시 대조하지 않는다 | 허브(main 판단) |
| T02 | F7 RA-1~RC-4 12 ID를 쓴 옛 사후 기준 표는 새 규칙으로 재판정(해당 기록 없음) | owner A-3 |
| T02 | F8 원장 확정 직전 중단 뒤 같은 해시 재요청은 거부 전 중단 복구 | owner A-3 |
| T02 | F9 `review-hand` 뒤 `review-record` 전 TASK.md 삭제 시 결과 미기록 | owner A-3 |
| T02 | 메모가 앞에 붙은 패치·헝크 없는 diff는 거부, 내용 진위는 판정하지 않음. 재생은 한 제공자·표본 7개 | TASK 범위 |
| T03 | F1 사후 소진·최신 pass 뒤 필수 재호출 경로 없음(새 주기 철회의 결과) | owner A-3 |
| T03 | F2 헝크 없는 diff의 사후 reviewer 경로 없음 | owner A-3 |

## 보안

- 기계 검사: `pace project finish`가 선언된 보안 검사를 실행한다(finish 결과로 확인).
- 전체 diff 판단: 민감 경로 `src/agent/call-hook.ts`·`src/project/harness.ts`는 바꾸지 않았다. 새 진입점·인가 판정·외부 전송 없음. 사후 계약 첨부는 링크·하드 링크·비UTF-8을 거부하는 일반 파일 읽기(`postTaskContract`), `--out`은 루트 TASK.md를 덮지 못한다(T02 F3). blocking 0.
- 증거의 비밀 노출: 재생 입력은 다른 저장소(fin-link) 패치·TASK 원문으로, 비밀 검사 대상이다. 원문·로그에 토큰·인증 정보를 넣지 않았다.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| 브레인(`.pace/brain/`) | 반영 | `concept/검토-반복-실패-하네스.md`에 구현 후 묶음 점검 절(묶음·답 형식·재생 한계·도구 한계), `flow/작업-하네스-흐름.md`의 tester ∥ reviewer 줄을 새 배정으로. 다른 갱신 후보(install-and-launch-pitfalls·profile-is-independent-agent·백로그-대시보드·작업-하네스-실측-함정·프로젝트-지표-해석·pace-intent)는 검토했고 주장이 이 변경과 무관하다 |
| `templates/project/TASK.md`·`TASK-CLOSE.md` | 반영(T01) | reviewer 줄·사실 질문·회차별 시각 칸 |
| `src/agent/**`·`src/project/pre-review.ts` | 반영(T01·T02) | 사전 판정, 사후 12항목·예약 전 거부 |
| `skills/pace-project-dev/**`, `docs/AGENT-CALL.md`·`WORK-PROCESS.md`·`SECURITY.md`, 팀 원본·생성물 | 반영(T03) | 정본 목록 밖으로 `references/decision-rights.md`(수정 확인 범위에 구현 후 구분 한 구절)와 `evals/scenarios.md` S3(∥ 문구)도 고쳤다 |

## 남은 일

- 병합 뒤 main: 설치 전 BL261128_01 최종 설치 후보에서 base 트리를 더한 재생 1회·owner 보고(BR02), D5 진행 중 프로젝트 확인, `bash scripts/install.sh`.
- 도구 후속(T03 F1·F2): 허브가 main의 기존 idea `upper-review-종료-뒤-owner-재개-경로`에 덧붙였다.
- 설치 뒤 3개 프로젝트 지표 관측과 owner 보고(백로그 측정 절).
- 공동 검토 횟수를 단위 전체로 세는 도구 동작(T01 남긴 것) — 병합 뒤 백로그 후보.

## 회고

- 잘된 것: 사후 reviewer의 unknown이 재생에서 0/12로 사라졌고, 경계·상태 결함은 묶음 항목의 blocking으로 판정에 닿았다. 같은 절 2회 연속 blocking이면 덧붙이지 않고 줄이는 원칙이 사전 검토 반복을 끊었다.
- 다음에 바꿀 것: 문서 태스크의 사전 검토는 열거형 기대 결과 대신 처음부터 "tester가 정본 원문과 직접 대조"로 쓴다. by user 기록(waiver·decision)은 바꾸기 전에 허브에 묻는다.

## 지표

[지표 집계](METRICS.md)

러닝 907분 중 승인·질의 대기 273분(30%), T01의 대기(215분)가 가장 컸다 — owner 결정을 기다린 시간이다. 리뷰 지적 blocking 68건 대부분이 사전 검토의 시험 검출력(detection) 지적과 사후 도구 한계 지적이었고, 게이트 실패 10건은 TASK-CLOSE 누락·해시 불일치 같은 마감 형식 문제였다.

## 배포

해당 없음 — 설치는 병합 뒤 main에서 허브가 BR02 재생 보고와 D5 확인 뒤 owner 결정으로 한다.
