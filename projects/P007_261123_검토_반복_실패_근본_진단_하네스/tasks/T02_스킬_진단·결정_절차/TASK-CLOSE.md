# T02 스킬 진단·결정 절차 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적(PROJECT P-5): T01 도구를 pace-project-dev 스킬 절차로 이어, 에이전트가 3회 fail에서 땜질을 멈추고 원인 층을 진단해 근본적으로 고치며 진단 뒤에도 fail이면 사용자에게 설명하고 결정을 받게 한다.
- 달성: **달성**. 정본 절 [reviewer.md 반복 실패](../../../../skills/pace-project-dev/references/reviewer.md)에 단계 읽기(그 호출의 `escalation.stage`), 층 질문표, 진단·결정 기록, 사용자 보고 6요소, 선택별 다음 행동·게이트 기록을 두고 SKILL.md·task-steps·coordinator·tools가 링크한다. 바뀐 스킬을 다른 제공자(openai)가 읽고 행동한 S-7을 3회 실행해 사례 A~G의 필수 행동이 모두 나오고 금지 행동이 없었다. 이 태스크 자체가 새 도구와 절차를 두 번 끝까지 밟았다 — 사전 검토(fail 3 → 진단 → 전체 검토 fail → 사용자 결정 → waiver), 구현 후 검토(fail 3 → 진단 → 전체 검토 fail → 사용자 결정 → 마감).
- 한계: `goal-review.md` 2단계(작업 문서를 받은 호스트 판정)의 blocking은 원장에 들어가지 않는다 — 캡틴 결정으로 프로젝트 이슈(`2단계-검토-판정-원장-미반영`)로 남겼고 reviewer.md에 알려진 한계로 적었다. 사용자 결정 원문이 실제 사람의 말인지는 PM 책임이다.
- 독립 판정: tester(새 맥락 Claude) 5차 pass, 구현 후 reviewer(Codex) 4차 fail 뒤 [캡틴 결정](evidence/user-decision-post-1.md).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | [s1-s3-grep.md](evidence/s1-s3-grep.md) — 옛 "최대 2회·반영 확인·같은 세션 재개를 보장하지 않는다" 없음, 자동 재검토 서술(task-steps·reviewer·tools), 재검토 범위는 `rereview_of` 기준·바뀌지 않은 부분은 note, 진단·결정·pass 뒤 전체 검토 |
| T-2 | 통과 | reviewer.md "반복 실패" 절 — 그 호출에서 즉시, 서로 다른 blocking도 셈, 층 질문표, `review-note --diagnosis`, 범위 변경 시 §6. S-7 사례 C·C′ 통과([s7-score.md](evidence/s7-score.md)) |
| T-3 | 통과 | 보고 6요소·결정 원문 그대로·PM 책임, 선택별 다음 행동 표(PRE-REVIEW waiver vs 구현 후 TASK-CLOSE 링크), blocking 등급 표의 사용자 결정 예외와 막힘 조건. S-7 사례 E·G 통과 |
| T-4 | 통과 | SKILL.md §6·coordinator 멈춤 조건이 반복 실패 절을 링크, reviewer 52행(절차 지적 2회 = structure 층, `--void`로 도구 결함 검토 무효화), "구현 후 검토는 예외 대상이 아니다"는 waiver 범위 문장으로 대체. 서로 다른 횟수·행동 지시 없음(s1-s3-grep) |
| T-5 | 통과 | reviewer.md "원장에서 옮겨 적기"(interrupted·void 제외, continuity new/changed, cross, unavailable 증거). 이 태스크의 [PRE-REVIEW.json](PRE-REVIEW.json)을 원장에서 옮기고 waiver를 붙여 게이트 통과(tester 대조표 일치), [s4-gate.md](evidence/s4-gate.md) — fail 뒤 pass를 `new`로 적으면 거부·`changed`면 통과 |
| T-6 | 통과 | evals/scenarios.md S7 행·사례 표, `test/project-dev-skill.test.ts` S1~S7 구조 검사. S-7 실행 3회(작성자 anthropic, 실행자 openai) 통과. `npm run check` 종료 0 — 1031개 통과 1014·실패 0 |

## 단위 테스트

- `node --test test/agent-review-log.test.ts test/agent-verify.test.ts test/project-dev-skill.test.ts` — 통과(원장 시험 23개에 `--void`·복구 귀속 시험 S-9m·S-9n·S-9o 추가).
- `npm run check`(임시 PACE_HOME) — 1031개 통과 1014·실패 0·건너뜀 17. 직전 1회는 알려진 `telegram-flow` S-4b 간헐 실패(이슈 기록됨, 재실행 통과).
- 결함 주입: 작성자(void 단계·대상·pass·중단, 복구 귀속) + tester 3~5차(void 14건, 복구 귀속 8건) — 기준 동작 결함은 모두 검출.

## E2E

- S-7 행동 시나리오: [s7-prompt.md](evidence/s7-prompt.md)·[s7-prompt-2.md](evidence/s7-prompt-2.md)(사례 C 입력 보강) → [s7-result.json](evidence/s7-result.json)·[2](evidence/s7-result-2.json)·[3](evidence/s7-result-3.json), raw는 evidence의 s7-raw·s7-raw-2·s7-raw-3 폴더(세션·스레드 ID 가림). 채점 [s7-score.md](evidence/s7-score.md), tester 독립 재채점 일치.
- S-6 새 verify 실사용: 사전 검토 원장(`REVIEW-LOG.jsonl`·`review-records/`)과 구현 후 원장(`evidence/REVIEW-LOG.jsonl`·`evidence/review-records/`) — 자동 재검토(`rereview_of`), 3회째 `stage: diagnose`, 다음 호출 종료 16, 근거 없는 진단 기록 거부, 진단 뒤 전체 검토(`rereview_of` null), `ask_user` 뒤 결정 기록까지 실제로 관측.

## 리뷰

- 사전 검토(Codex, 새 verify): R1 fail(3) → R2 fail(1, 자동 재검토) → R3 fail(1) → [진단](evidence/diagnosis-1.md)(design: S-7 경계 사례를 한 줄씩 덧붙임 → 사례 표) → R4 전체 검토 fail(3) → [캡틴 결정](evidence/user-decision-1.md)("누락 고치고 구현 진행") → PRE-REVIEW waiver.
- tester(새 맥락 Claude, 같은 세션): 1차 fail(tools.md 종료 16 서술) · 2차 pass · 3차 fail(`--void`가 열린 단계를 우회) · 4차 pass · 5차 pass(should_fix: 다른 대상 판정 기록 복구 시험 → 반영, 검출 확인).
- 구현 후 reviewer(Codex, 새 verify, 대상 `evidence/impl-diff.patch`): R1 fail(4) → R2 fail(3, 자동 재검토) → R3 fail(3) → [진단](evidence/diagnosis-post-1.md)(design: 원장 밖 우회로 → 원장을 유일 근거로, 경로 고정·void 제한) → R4 전체 검토 fail(3+1) → [캡틴 결정](evidence/user-decision-post-1.md)("3건 고치고 1건은 이슈로"): 복구 대상 귀속 버그 수정, diff 같은 경로 갱신·주기 중 종료 10 시 `--allow-same-provider` 문서화, 2단계 판정은 이슈.
- 남김+이유: 2단계 판정 원장 반영(설계 필요, 캡틴 결정으로 이슈).
- 교본: typescript — 안티패턴 대조(원장 항목은 검증 뒤 타입 단언, 오류는 계약 종료 코드로). 문서 변경은 교본 해당 없음.

## 남긴 것

- 이슈 `2단계-검토-판정-원장-미반영`: goal-review 2단계 blocking을 원장에 확정하는 절차(도구 확정 명령 또는 PM 집계 규칙) 설계.
- 프로젝트 이슈 `codex-같은-세션-재검토-불가`는 자동 재검토(원장의 직전 원문·바뀐 줄 전달)로 목적이 해소됐다 — 이번 커밋에서 닫는다.
- 설치본은 병합 뒤 `bash scripts/install.sh`로 재설치해야 새 verify·스킬이 쓰인다.
- 발견(브레인 후보): 진단 뒤 전체 검토는 매번 새 갈래를 찾아 사용자 결정까지 갔다 — 독립 reviewer의 전체 검토는 수렴하지 않는 경향이 있고, 범위를 지정한 재검토와 사용자 결정 게이트가 실제로 반복을 끊었다. 결함 주입 tester는 스크래치패드 복사본에서 돌리면 작성자 편집과 충돌하지 않는다.
