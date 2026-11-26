# P013 검토 예산과 재현 근거 지적

- 상태: 진행
- 규모: L(태스크 9개 — T02a 분할 및 T02b 추가)
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

단계별 검토 예산과 공동 시도 한도를 두고, 사전 검토의 구현 지적은 note로 넘긴다. 기존 기준에 필요한 수정 확인은 수행한 뒤 보고하며, 반복 문턱에 닿으면 허브가 구조를 진단해 필요한 수정과 독립 재검증을 진행한다. owner는 실제 합의 변경과 필수 검증 생략·완화 또는 미확인 증거를 안고 진행하는 선택을 결정한다. 상위 목적은 owner가 자리를 비워도 독립 검토로 품질을 지키며 프로젝트를 자율로 끝내고 반복 검토의 시간과 토큰을 줄이는 것이다. [백로그 목표](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/BACKLOG.md#목표)

## 재료

- 백로그 [BL261124_04](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/BACKLOG.md)와 BR01~BR08 — 범위·완료 기준·설계 세부 결정(O1~O5)의 정본. owner 결정 원문 [owner-decisions-2026-11-25.md](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/owner-decisions-2026-11-25.md)(Q1~Q5, O1=b, C1=a). Codex 교차 검토 R1~R5(R5 pass), [진단](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/diagnosis-2026-11-26.md), [공동 시도 1](../../backlogs/BL261124_04_검토_예산과_재현_근거_지적/evidence/joint-attempt-1-2026-11-26.md).
- 선행 BL261124_05(P011) 결정 권한 정본 `skills/pace-project-dev/references/decision-rights.md` — A-3·B 절차를 이 프로젝트가 바꾼다. 전문가 호출 자동 연결은 후속 BL261125_01 BR04를 따른다.

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스: 명시적 증명 범위와 영향 분류로 검토를 집중하고 PM/user를 기록한다; 옛 주체는 unknown이며 일반 갭은 재검증 후 보고한다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/concept/작업-하네스-실측-함정.md` — 작업 하네스 실측 함정: 정의서 라벨은 한 번만·표 첫 칸에, 계획 행 번호, 링크 증거 경로, 마감 문서의 비밀 예시, 커밋 칸·마감 상태는 done·finish가, stash 공유, list는 worktree 작업본 우선

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01~BR09 각 완료 기준이 해당 태스크(T01~T09)에서 충족된다 | 각 TASK-CLOSE 기준 대조 |
| P-2 | 백로그·태스크 검토는 단계별 예산(전체 1 + 범위 재검토 1)과 호출 상한에서 멈추고 일반 공동 시도는 태스크 전체 또는 백로그 폴더당 최대 2회다. 수정 확인은 같은 지적 ID·원래 위치당 1회 또는 단위 합산 2회 사용 뒤 허브 구조 진단을 거쳐 필요한 재검증을 수행하고 누적 횟수·근거·판정을 사후 보고한다. 실제 합의 변경은 A-1, 필수 검증 생략·완화 및 미확인 증거·잔여 blocking 수용은 A-3으로 결정 요청한다 | 시험(`npm run check`) |
| P-3 | 검토 종류별 판정 질문이 프롬프트에 들어가고 사전 검토·백로그 검토의 구현·설계 방식 지적은 note로 낮춰지며, 필수 기준 증거가 없음·미확인이면 pass가 안 된다 | 시험·실제 다른 제공자 verify 1회 원문 |
| P-4 | `pace project stats`가 원장 기준 검토 지표를 내고 PROJECT-CLOSE에 전후 비교표가 있다 | stats 출력·PROJECT-CLOSE |
| P-5 | 기존 원장·옛 태스크와 P011 문구 고정 시험이 그대로 통과한다(회귀 없음) | `npm run check` |

## 설계

태스크별 설계는 각 BR 범위를 따른다(BR01 `src/agent/review-log.ts`·`verify-cli.ts` 예산·호출 상한, BR02 공동 시도·escalation과 `decision-rights.md` A-3·B, BR03 `src/agent/verify.ts` 판정 질문·구조화된 지적, BR04 증거 상태, BR05 `src/project/harness.ts`·`pre-review.ts` 허가 범위 게이트, BR06 verify 밖 고정·PRE-REVIEW 생성, BR07 측정, BR08 문서 축소). 보안 영향: BR05가 민감 경로 `harness.ts`의 check·done·commit-msg 게이트를 바꾼다. BR08은 같은 후보의 TASK에서 경고를 내며 통과 요건은 유지한다. `docs/SECURITY.md`의 후보·거절 경계를 먼저 검토한다. 호환: 기존 `REVIEW-LOG.jsonl`·옛 태스크는 지금 동작 그대로, P011 문구 고정 시험(`test/project-dev-skill.test.ts`)을 깨지 않는다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/agent/review-log.ts`·`src/agent/verify.ts`·`src/agent/verify-cli.ts` | 예산·호출 상한·판정 질문·구조화된 지적·escalation |
| `src/project/harness.ts`·`src/project/pre-review.ts` | 허가 범위 게이트·PRE-REVIEW 생성 |
| `src/project/metrics*.ts` | 검토 지표 |
| `skills/pace-project-dev/references/decision-rights.md`·`skills/pace-project-dev/references/reviewer.md`·`skills/pace-project-dev/references/tester.md`·`skills/pace-project-dev/references/cross-verify.md`·`skills/pace-project-dev/references/task-steps.md` | 판정 질문·예산·escalation·문서 축소 |
| `docs/AGENT-CALL.md`·`docs/WORK-PROCESS.md` | 도구 계약·사건 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 태스크 단위 검토 예산과 범위 재검토 | 완료 | 7c54e96 |
| T02 | 예산 소진 뒤 공동 시도와 owner 결정 요청 (T02a) | 완료 | c037786 |
| T03 | 검토 종류별 판정 질문과 구조화된 지적 | 완료 | 8ece6f9 |
| T09 | 수정 확인과 상위 근본 검토 | 완료 | 3350c4d |
| T04 | 영향 문턱과 기준별 증거 상태 | 완료 | 139b0b5 |
| T05 | 허가 범위 게이트와 고치고 진행 | 완료 | 4db6bd7 |
| T06 | verify 밖 검토 고정과 사전 검토 기록 생성 | 완료 | 58badc8 |
| T07 | 검토 측정과 전후 비교 | 완료 | 41270bf |
| T08 | 작은 계획 경고와 검토 문서 축소 | 완료 | |

T02a → T03 → T02b(T09) → T04 순서다. 두 자리 식별자를 요구하는 하네스에는 T02b를 T09로 배정한다. [분할 근거](tasks/T02_예산_소진_뒤_공동_시도와_owner_결정_요청/evidence/upper-review.md)

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-26 00:45 | 정의 작성 |
| 2026-11-26 01:30 | 착수 결정 — 출처: BL261124_04(Codex 교차 검토 R5 pass, owner 결정 Q1~Q5·O1·C1)와 owner 지시(2026-11-26 "착수해줘"). 작업자 codex, 역할 pace-project-lead, 태스크 8개(BR0n = T0n) |
| 2026-11-26 01:14 | (main 판단) T01: (main 판단) P013 실제 독립 검토는 병합 전까지 초기 기준 실행본으로 수행한다. 새 검토 동작은 작업본 시험으로 검증하며 T01 최신 변경 재검증은 공동 시도 1회로 기록한다. |
| 2026-11-26 01:17 | (자체 판단) T01: 공동 시도 2: 태스크 루트 TASK.md 기준으로 단계 판별을 고정하고 Markdown 사본과 evidence/TASK.md 회귀를 검증한다. |
| 2026-11-26 07:44 | (사용자 결정) 검토 소진 뒤도 필요한 독립 확인은 실행·사후 보고한다. 검증 생략이나 안전 기준 완화는 A-3으로 owner 결정을 구한다. |
| 2026-11-26 07:54 | (사용자 결정) T01: 허브 전달 owner 원문 a: 이전 3bb679de 지문의 tester·reviewer 1회 추가 확인 승인. |
| 2026-11-26 08:26 | (사용자 결정) T02: 수정 확인은 직전 독립 지적 ID·위치당 1회, 태스크 두 단계 합산과 백로그 폴더마다 최대 2회. 남은 결함·필수 증거 공백은 실제 조치를 A-1 또는 A-3으로 판정한다. |
| 2026-11-26 10:12 | (사용자 결정) T02: A-1에 따라 T02 최신 변경과 직전 확인 뒤 수정 영향의 독립 재검증 한 회를 승인했다. |
| 2026-11-26 10:59 | (main 판단) T02: 수정 확인 문턱은 허브 구조 진단에 연결한다. 필요한 수정·독립 재검증을 사후 보고하고 검토 진입 판정을 한 함수로 모은다. |
| 2026-11-26 11:13 | T02: 기존 필수 독립 판정을 받지 못한 경우 첫 전체 검토를 1회 복구한다. 일반·공동 호출 상한과 완료 기준을 지키는 B1 복구이므로 A-1에 해당하지 않는다. |
| 2026-11-26 11:17 | (main 판단) T02: 상위 계약·설계·백로그 근본 검토 결과가 올 때까지 T02 check·done·커밋을 보류한다. 검증과 필요한 수정은 계속한다. |
| 2026-11-26 11:19 | (main 판단) T02: 상위 근본 검토 결과에 따라 T02a와 T02b를 나누고 T02a·T03·T02b 순서로 진행한다. |
| 2026-11-26 12:52 | (사용자 결정) T09: 상위 재검증 두 차례 뒤에는 문제를 정리해 owner에게 보고한다. 종료 보고에서 실제 조치와 남은 재현, 세 가지 선택과 허브 추천을 확인한다. |
| 2026-11-26 12:56 | (main 판단) T09: 원장 진단과 수정 확인 진단 뒤 같은 단위의 독립 재실패는 예산과 관계없이 상위 검토를 연다. |
