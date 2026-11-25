# P011 허브 PM 결정 권한과 어드바이저

- 상태: 진행
- 규모: L(태스크 1개 — BR01 = T01)
- 출처: [BL261124_05_허브_PM_결정_권한과_어드바이저](../../backlogs/BL261124_05_허브_PM_결정_권한과_어드바이저/BACKLOG.md)
- 브랜치: `project/P011` · worktree: `../pace.wt/P011/`
- 작업자: codex
- 작업자 역할: pace-project-lead
- 팀 측정: v1
- 시작: 2026-11-25

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
프로젝트 상태: 정의 → 진행(출처로 착수 결정 뒤) → 병합 대기(finish) → 완료(merge) · 보류.
태스크 상태(태스크 표): 대기 · 진행 · 완료 · 보류.
규모별 생략:
- 작은 일(버그·문구, diff를 한 문장으로 말할 수 있음): 프로젝트를 만들지 않고 바로 커밋한다.
- 태스크 없는 프로젝트: "태스크" 절을 지운다. TASK.md의 "테스트" 표를 "기준" 아래에 옮겨 쓰고, e2e/·evidence/는 이 프로젝트 폴더에 둔다. 마감은 PROJECT-CLOSE.md 하나.
- 태스크 있는 프로젝트: 모든 절을 쓴다. "설계"는 이때만.
범위·기준은 다른 문서를 다시 쓰지 않고 링크한다.
-->

## 목적

허브 PM(main 코디네이터)이 대부분의 결정을 owner 대신 내리고, 워크트리 blocking을 함께 푸는 어드바이저가 되며, owner에게는 예/아니오로 판정 가능한 닫힌 목록(A)에 걸린 결정만 올리게 한다. 상위 목적: owner가 자리를 비워도 프로젝트가 자율로 끝까지 가고, owner는 사람만 할 수 있는 결정·승인에만 개입한다([백로그 목표](../../backlogs/BL261124_05_허브_PM_결정_권한과_어드바이저/BACKLOG.md#목표)).

## 재료

- 백로그 [BL261124_05](../../backlogs/BL261124_05_허브_PM_결정_권한과_어드바이저/BACKLOG.md)와 [BR01](../../backlogs/BL261124_05_허브_PM_결정_권한과_어드바이저/BR01_결정_권한_정본과_어드바이저_절차.md) — 범위·참조로 바꿀 곳·완료 기준의 정본. 교차 검토 R1·R2 fail → Codex 범위 재검토 R3 **pass**(2026-11-25, `review-records/R3.json`), 별도 pace-reviewer 검토 2회(결정·기록 16:14·16:31).
- owner 결정(2026-11-25 대화): 푸시·병합은 owner 승인·허브 실행 / 팀 실행 전 대조 계약 v1 유지 + 정본 참조 보충 문단 / 교차 검토 제공자 불가 시 같은 회사 AI 폴백(교차 아님 기록) / 작은 도구 수정은 허브가 main에서 고치고 커밋·재설치, 사후 보고만.
- 관련 백로그: BL261124_04(검토 예산 — 이 정본을 참조, 다음 착수), BL261125_01(문제 해결 전문가 — B 절차의 재현·원인 판별 연결 예정), BL261125_02(pace-team 필수 역할 — 이 프로젝트 병합 뒤 착수).

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스: 명시적 증명 범위와 영향 분류로 검토를 집중하고 PM/user를 기록한다; 옛 주체는 unknown이며 일반 갭은 재검증 후 보고한다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 정본 `skills/pace-project-dev/references/decision-rights.md`에 A(닫힌 목록 5문항, 예외 포함)·두 층 규칙(실행 전 승인 확인)·B(어드바이저 절차, 공동 시도 상한)·C(owner 보고 3종)가 BR01 범위대로 있다 | 문서 대조표(BR01 범위 항목별) |
| P-2 | BR01 "참조로 바꿀 곳" 전부(스킬 문서·팀 원본 전부와 템플릿·pace-team·RULES 템플릿·도구 출력 `verify.ts`·`review-log.ts`)가 정본 참조로 바뀌고, 금지 문구 grep(BR01 완료 기준의 대상 목록)이 0건이다 | grep 결과 증거 |
| P-3 | 스킬 eval: BR01 완료 기준의 시나리오 전부(허브 (a)·워크트리 (b), A-1~A-5, B1 폴백, S1 위임 예외, 승인 원문 확인)가 통과하고, 기존 S1~S7 회귀 새 차수가 통과한다 | `skills/pace-project-dev/evals/scenarios.md` 실행 방법, 원응답 보존 |
| P-4 | `workerSpec` 출력에 새 지시가 있고 golden fixture·구조 시험이 갱신되며, 팀 원본·템플릿 본문과 workerSpec 지시가 어긋나지 않는다 | `npm run check` |
| P-5 | 팀 원본 전부·템플릿에 정본 참조 보충 문단이 있고 계약 v1 문단은 그대로이며 `pace team list`·`pace team sync --check --json`이 통과한다 | 명령 출력 |

## 설계

정본 한 곳(`decision-rights.md`)을 만들고 coordinator·SKILL §6·reviewer·goal-review·cross-verify·e2e·verification·팀 원본·템플릿·workerSpec·도구 출력이 참조한다 — 세부와 행 번호는 BR01 범위. 보안 영향: 민감 경로 `src/project/harness.ts`(workerSpec)·`src/team/store.ts`(coordinator duty) — `docs/SECURITY.md` 체크리스트 적용. 승인 게이트 입력(`merge --yes`, waiver `by: user`, review-note `--by user`)의 실행 전 확인은 문서 규칙이며 도구 강제는 범위 밖(BL261124_04). 설계에서 확정할 것: BL04 예산 소진 뒤 PM 위험 수용과 A-3 경계, `SKILL.md:71`(병합 대기 중 main 커밋 금지)과 B의 main 수정 관계, RULES 템플릿의 정본 우선 줄과 `:20` "프로필 rule 우선"의 순서, 사후 요약의 원장 기록 방식.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `skills/pace-project-dev/references/decision-rights.md`(새) | 결정 권한 정본 A·두 층·B·C |
| `skills/pace-project-dev/**`(coordinator·SKILL §6·reviewer·goal-review·cross-verify·e2e·verification·evals/scenarios) | 형용사형 올림 기준 → 정본 참조 |
| `src/project/harness.ts`의 workerSpec, `test/fixtures/worker-spec-before-role.txt` | blocking은 코디네이터와 해결, owner 결정은 A 항목만 |
| `src/agent/verify.ts`·`src/agent/review-log.ts` 출력 문구와 시험 | 같은 회사 AI 폴백 안내, 심각한 오류는 B, 정본 포인터 |
| `.pace/team/agents/*.md` 전부, `templates/team/member.md`, `skills/pace-team/SKILL.md`, `src/team/store.ts` | 보충 문단(계약 v1 유지)·결정 요청 경로 |
| `templates/RULES.md` | 프로젝트 하네스 안에서는 정본 우선 한 줄 |
| `docs/WORK-PROCESS.md`, `.pace/brain/pages/flow/작업-하네스-흐름.md` | 영향 분류 정본 포인터·결정 이유 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 결정 권한 정본과 어드바이저 절차 | 완료 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-25 17:50 | 정의 작성 |
| 2026-11-25 17:55 | 착수 결정 — 출처: BL261124_05(Codex 교차 재검토 R3 pass)와 owner 지시(2026-11-25 "최종 검토를 해주고 문제 없으면 프로젝트로 진행해줘. 워크트리는 codex로 해줘"). 작업자 codex, 역할 pace-project-lead(owner가 팀을 사용해 보고 판단하기로 한 결정에 따라 팀 역할로 시작 — main 판단). 태스크 1개(BR01 = T01) |
| 2026-11-25 18:06 | (자체 판단) T01: BL04 전에는 남은 blocking 수용을 A-3으로 판정한다. BL04의 검토 회차와 장애 공동 시도 2회는 별개다. |
| 2026-11-25 18:06 | (자체 판단) T01: 병합 대기 중에는 S1 수정도 main 커밋을 병합 뒤로 미룬다. 병합 자체의 장애는 격리 사본에서 검증해 기존 게이트와 대상을 보존하는 복구를 먼저 시도한다. |
| 2026-11-25 18:06 | (자체 판단) T01: 하네스의 결정 권한은 S1을 포함해 프로필 rule보다 정본을 적용한다. 프로젝트 밖의 승인 원문은 PACE_HOME의 approvals에 남기고, 원장 사용 프로젝트의 사후 요약은 status로 기록한다. |
