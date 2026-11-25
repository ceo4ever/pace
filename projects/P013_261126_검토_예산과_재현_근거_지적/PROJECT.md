# P013 검토 예산과 재현 근거 지적

- 상태: 진행
- 규모: L(태스크 8개 — BR0n = T0n)
- 출처: [BL261124_04_검토_예산과_재현_근거_지적](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/BACKLOG.md)
- 브랜치: `project/P013` · worktree: `../pace.wt/P013/`
- 작업자: codex
- 작업자 역할: pace-project-lead
- 팀 측정: v1
- 시작: 2026-11-26

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

독립 검토를 "blocking 0까지 도는 열린 관문"에서 "예산 안에서 검토 종류별 판정 질문 하나에 답하는 일"로 바꾼다. 백로그·태스크 검토에 회차·호출 상한을 두고, 사전 검토의 구현 지적은 note로 넘기며, 상한 뒤 남은 blocking은 허브 공동 시도(최대 2회) 뒤 정리해서 owner가 결정한다. 상위 목적: owner가 자리를 비워도 프로젝트가 자율로 끝까지 가고, 품질을 지키면서 검토 반복(백로그 작성 때 20회 이상, 사전 검토의 구현 지적)에 시간·토큰을 낭비하지 않는다([백로그 목표](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/BACKLOG.md#목표)).

## 재료

- 백로그 [BL261124_04](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/BACKLOG.md)와 BR01~BR08 — 범위·완료 기준·설계 세부 결정(O1~O5)의 정본. owner 결정 원문 [owner-decisions-2026-11-25.md](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/owner-decisions-2026-11-25.md)(Q1~Q5, O1=b, C1=a). Codex 교차 검토 R1~R5(R5 pass), [진단](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/diagnosis-2026-11-26.md), [공동 시도 1](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/joint-attempt-1-2026-11-26.md).
- 선행 BL261124_05(P011) 결정 권한 정본 `skills/pace-project-dev/references/decision-rights.md` — A-3·B 절차를 이 프로젝트가 바꾼다. 후속 BL261125_01 BR02가 공동 시도에 문제 해결자 호출을 연결하고 Q3·Q5를 최종 인수한다(C1).

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스: 명시적 증명 범위와 영향 분류로 검토를 집중하고 PM/user를 기록한다; 옛 주체는 unknown이며 일반 갭은 재검증 후 보고한다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/concept/작업-하네스-실측-함정.md` — 작업 하네스 실측 함정: 정의서 라벨은 한 번만·표 첫 칸에, 계획 행 번호, 링크 증거 경로, 마감 문서의 비밀 예시, 커밋 칸·마감 상태는 done·finish가, stash 공유, list는 worktree 작업본 우선

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01~BR08 각 완료 기준이 해당 태스크(T01~T08)에서 충족된다 | 각 TASK-CLOSE 기준 대조 |
| P-2 | 백로그·태스크 검토가 단계마다 예산(전체 1 + 범위 재검토 1)과 호출 상한에서 멈추고, 예산 소진 뒤 공동 시도는 태스크 전체 합산 최대 2회, 그 뒤 정리된 owner 결정 요청이 생기며 PM 잔여 blocking 수용 경로가 없다 | 시험(`npm run check`) |
| P-3 | 검토 종류별 판정 질문이 프롬프트에 들어가고 사전 검토·백로그 검토의 구현·설계 방식 지적은 note로 낮춰지며, 필수 기준 증거가 없음·미확인이면 pass가 안 된다 | 시험·실제 다른 제공자 verify 1회 원문 |
| P-4 | `pace project stats`가 원장 기준 검토 지표를 내고 PROJECT-CLOSE에 전후 비교표가 있다 | stats 출력·PROJECT-CLOSE |
| P-5 | 기존 원장·옛 태스크와 P011 문구 고정 시험이 그대로 통과한다(회귀 없음) | `npm run check` |

## 설계

태스크별 설계는 각 BR 범위를 따른다(BR01 `src/agent/review-log.ts`·`verify-cli.ts` 예산·호출 상한, BR02 공동 시도·escalation과 `decision-rights.md` A-3·B, BR03 `src/agent/verify.ts` 판정 질문·구조화된 지적, BR04 증거 상태, BR05 `src/project/harness.ts`·`pre-review.ts` 허가 범위 게이트, BR06 verify 밖 고정·PRE-REVIEW 생성, BR07 측정, BR08 문서 축소). 보안 영향: BR05가 민감 경로 `harness.ts`(check·done·commit-msg 게이트)를 바꾼다 — `docs/SECURITY.md` 체크리스트. 호환: 기존 `REVIEW-LOG.jsonl`·옛 태스크는 지금 동작 그대로, P011 문구 고정 시험(`test/project-dev-skill.test.ts`)을 깨지 않는다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/agent/review-log.ts`·`verify.ts`·`verify-cli.ts` | 예산·호출 상한·판정 질문·구조화된 지적·escalation |
| `src/project/harness.ts`·`pre-review.ts` | 허가 범위 게이트·PRE-REVIEW 생성 |
| `src/project/metrics*.ts` | 검토 지표 |
| `skills/pace-project-dev/references/decision-rights.md`·`reviewer.md`·`tester.md`·`cross-verify.md`·`task-steps.md` | 판정 질문·예산·escalation·문서 축소 |
| `docs/AGENT-CALL.md`·`docs/WORK-PROCESS.md` | 도구 계약·사건 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 태스크 단위 검토 예산과 범위 재검토 | 대기 | |
| T02 | 예산 소진 뒤 공동 시도와 owner 결정 요청 | 대기 | |
| T03 | 검토 종류별 판정 질문과 구조화된 지적 | 대기 | |
| T04 | 영향 문턱과 기준별 증거 상태 | 대기 | |
| T05 | 허가 범위 게이트와 고치고 진행 | 대기 | |
| T06 | verify 밖 검토 고정과 사전 검토 기록 생성 | 대기 | |
| T07 | 검토 측정과 전후 비교 | 대기 | |
| T08 | 작은 계획 경고와 검토 문서 축소 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-26 00:45 | 정의 작성 |
| 2026-11-26 01:30 | 착수 결정 — 출처: BL261124_04(Codex 교차 검토 R5 pass, owner 결정 Q1~Q5·O1·C1)와 owner 지시(2026-11-26 "착수해줘"). 작업자 codex, 역할 pace-project-lead, 태스크 8개(BR0n = T0n) |
