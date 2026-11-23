# P007 검토 반복 실패 근본 진단 하네스 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-23

## 목표 달성 판정

- 상위 목적: 독립 검토가 같은 대상에서 거듭 fail할 때 땜질 반복을 끊는다 — 재검토는 직전 지적과 바뀐 부분 중심, 연속 3회 fail이면 원인 층 근본 진단, 진단 뒤에도 fail이면 사용자에게 설명하고 결정(캡틴 요청 2026-11-23). 규칙이 아니라 도구가 단계를 알리고 멈춰 세운다.
- 판정: **달성**. 도구(T01)가 원장으로 재검토 기준점과 단계를 정하고 열린 단계에서 실행을 막으며, 스킬(T02)이 그 단계마다 PM의 행동을 정본 절 하나로 정의한다. 실사용 근거: T02의 사전·구현 후 검토가 새 verify로 "자동 재검토 → 3회째 diagnose → 진단 기록(근거 없으면 거부) → 전체 검토 → ask_user → 사용자 결정"을 두 번 끝까지 밟았다. 바뀐 스킬을 다른 제공자가 읽고 행동한 S-7 시나리오는 3회 모두 통과했다.
- 한계: goal-review 2단계(호스트) blocking은 원장에 안 들어간다(캡틴 결정으로 이슈). 사용자 결정 원문의 진위·void 근거의 타당성은 PM 책임이다. 원장·기록을 손으로 고치면 우회할 수 있다(기존 "이력·증거 조작" 한계와 같은 급).
- 독립 판정: T01 tester pass(4차)·reviewer 4차 fail 뒤 캡틴 결정, T02 tester pass(5차)·reviewer 4차 fail 뒤 캡틴 결정 — 각 태스크 TASK-CLOSE.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | T01 T-1·T-2(S-1·S-2·S-3·S-9h·S-9k), 기준점 원장 자동 선택·현재 산출물 맥락·판정 범위 지시 |
| P-2 | 통과 | T01 T-3(S-1·S-4·S-9d·S-9j), 원장·review-records 자동 기록 |
| P-3 | 통과 | T01 T-4(S-5·S-6·S-7·S-9c·S-9i), T02 `--void` 단계 제한(S-9m·S-9n) |
| P-4 | 통과 | T01 T-5(S-8·S-9g), T02 결정 원문 PM 책임 명시 |
| P-5 | 통과 | T02 T-1~T-6, S-7 행동 시나리오 3회 통과 |
| P-6 | 통과 | `npm run check` 1031개 실패 0(T02 마감 시), 기존 verify 시험 유지 |

## 태스크 결과

- T01 verify 재검토 모드와 반복 실패 단계 — 통과 · [TASK-CLOSE](tasks/T01_verify_재검토_모드와_반복_실패_단계/TASK-CLOSE.md)
- T02 스킬 진단·결정 절차 — 통과 · [TASK-CLOSE](tasks/T02_스킬_진단·결정_절차/TASK-CLOSE.md)

## 보안

- 기계 검사: `node scripts/secret-scan.ts` 통과(태스크 커밋마다, finish가 다시 실행).
- 판단: 새 파일 쓰기는 대상 폴더 안(원장·기록·잠금)이고 rename 교체로 링크·하드링크 너머 파일을 고치지 않는다. `--out`은 관리 파일 이름을 가리킬 수 없다(대소문자 무시). 기록에서 구조화된 세션 ID를 지운다. 기록에는 대상·검토 원문이 들어가므로 노출 범위는 그 TASK와 같다(docs/AGENT-CALL.md 명시).
- 증거 비밀: 검토 기록·S-7 결과의 session_id는 null, S-7 raw의 thread·session ID는 가렸다.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `src/agent/verify.ts` | 반영 | 재검토 프롬프트 |
| `src/agent/verify-cli.ts` | 반영 | 명령 처리·원장·단계·복구·review-note |
| `src/agent/review-log.ts` | 반영 | 원장·단계·비교·잠금 |
| `src/agent/contract.ts` | 반영 | `review_escalation: 16` |
| `src/cli.ts` | 반영 | 위임·도움말 |
| `test/agent-review-log.test.ts` | 반영 | S-1~S-9o |
| `test/project-dev-skill.test.ts` | 반영 | 시나리오 S1~S7 |
| `skills/pace-project-dev/SKILL.md` | 반영 | 2·4단계, §6 |
| `skills/pace-project-dev/references/reviewer.md` | 반영 | 반복 실패 정본 절 |
| `skills/pace-project-dev/references/task-steps.md` | 반영 | 재검토·escalation |
| `skills/pace-project-dev/references/tools.md` | 반영 | verify 종료 의미·경로 |
| `skills/pace-project-dev/references/coordinator.md` | 반영 | 반복 지적·멈춤 조건 |
| `skills/pace-project-dev/evals/scenarios.md` | 반영 | S7 |
| `docs/AGENT-CALL.md` | 반영 | 검토 원장·단계·void·공유 범위 |
| `skills/pace-project-dev/` | 반영 | SKILL.md·references 4개·evals S7 |
| `README.md` | 해당 없음 | 사용자 명령 예시는 개발 절차라 스킬·AGENT-CALL에 둔다 |
| `.pace/brain/` | 반영 | `검토-반복-실패-하네스` 페이지 |

## 남은 일

- 이슈 `2단계-검토-판정-원장-미반영` — 2단계 판정 확정 절차 설계.
- 병합 뒤 `bash scripts/install.sh`로 재설치해야 새 verify·스킬이 쓰인다(설치는 main에서).
- 기존 시험 간헐 실패 이슈 2건(`gateway-인증-시간-초과-시험-부하-민감`, `telegram-flow-s-4b-단독-실행-실패`).
- P005 T04: PRE-REVIEW 기록 보완(새 원장 기준) 뒤 S-0 재개.

## 회고

- 잘된 것: 요구 자체를 도구로 검증했다 — 이 프로젝트의 검토가 만든 반복을 새 도구가 실제로 멈춰 세웠고, 진단은 매번 설계 층의 땜질(경로 금지 목록, 시나리오 한 줄씩, 원장 밖 우회로)을 구조로 바꾸게 했다.
- 바꿀 것: 진단 뒤 전체 검토도 새 갈래를 찾는다 — 사용자 결정까지 가는 비용이 컸다. 병렬 tester 중 작업본 편집으로 혼선을 한 번 만들었다(복사본 주입으로 해결).

## 지표

[지표 집계](METRICS.md)

러닝 약 4시간(T01 84분·T02 159분), 게이트 실패 2회(T02 증거 경로 표기). 코디네이터 토큰은 같은 세션의 P005 대화가 섞여 있어 이 프로젝트만의 비용으로 읽지 않는다.

## 배포

해당 없음 — 병합 뒤 설치본 재설치(`bash scripts/install.sh`)만.
