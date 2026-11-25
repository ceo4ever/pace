# P012 pace-team 신규·갱신 모드와 필수 역할

- 상태: 진행
- 규모: L(태스크 5개 — BR0n = T0n)
- 출처: [BL261125_02_pace-team_신규·갱신_모드와_필수_역할](../../backlogs/BL261125_02_pace-team_신규·갱신_모드와_필수_역할/BACKLOG.md)
- 브랜치: `project/P012` · worktree: `../pace.wt/P012/`
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

`pace-team`이 팀 없는 저장소에는 신규 생성, 팀 있는 저장소에는 기존 에이전트 기준·최근 기록 기반 갱신을 하고, 어느 모드든 필수 역할(백로그 기획자, 문제 해결자)을 점검하게 한다. 첫 필수 역할로 `pace-backlog-planner`를 만든다. 상위 목적: owner가 자리를 비워도 프로젝트가 자율로 끝까지 가고, 팀은 실제 업무에 맞게 계속 개선되며, 허브 PM은 판단과 owner 소통에 집중한다([백로그 목표](../../backlogs/BL261125_02_pace-team_신규·갱신_모드와_필수_역할/BACKLOG.md#목표)).

## 재료

- 백로그 [BL261125_02](../../backlogs/BL261125_02_pace-team_신규·갱신_모드와_필수_역할/BACKLOG.md)와 BR01~BR05 — 범위·완료 기준의 정본. 교차 검토 R1~R4(Codex), 3회 fail 진단(planning 층, [진단](../../backlogs/BL261125_02_pace-team_신규·갱신_모드와_필수_역할/evidence/diagnosis-2026-11-25.md)), owner 결정 A(완료 범위 = 필수 역할 장치 + 백로그 기획자, [원문](../../backlogs/BL261125_02_pace-team_신규·갱신_모드와_필수_역할/evidence/owner-decision-2026-11-25-scope.md)).
- 선행 BL261124_05(P011, 2026-11-25 병합) — 결정 권한 정본 `skills/pace-project-dev/references/decision-rights.md`.
- 순서: 이 프로젝트 병합 뒤 BL261125_01(문제 해결 전문가) 착수 — 문제 해결자 요건 등록·판정은 그쪽 담당.

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/synthesis/pace-intent-의도-파악-기획-구조와-함정.md` — pace-intent 의도 파악 기획 구조와 함정: 프로세스·렌즈/템플릿·pace intent 증명 3레이어, B는 지금 착수 신호일 때만, 렌더 보안(JSON 블록·텍스트 노드·CSP·블록 schema), 근거 경로 realpath, 에이전트 기록의 한계는 두 사람 방식으로

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01~BR05 각 완료 기준이 해당 태스크(T01~T05)에서 충족된다 | 각 TASK-CLOSE의 기준 대조 |
| P-2 | 필수 역할 정본(`skills/pace-team/references/required-roles.md`)과 점검이 신규·갱신·이전 세 분기에서 동작하고, 등록 누락과 미충족을 따로 보고하며, 문제 해결자는 "요건 미등록(BL261125_01 담당)"으로 표시된다(owner 결정 A) | `skills/pace-team/evals/scenarios.md` eval 원응답 |
| P-3 | 조건부·허브 쪽 역할의 비참여가 세 구분으로 기록되고 기존 팀 프로젝트 finish·merge·측정이 변경 전후 같다 | `npm run check` |
| P-4 | 이 저장소에 `pace-backlog-planner`가 맞춤 정의로 추가되고 `pace team sync --check --json` 통과·`pace team verify`로 적재되며, 기획자 요건 대조표의 등록 누락이 0이다 | 명령 출력·대조표 |
| P-5 | 허브 위임 경로(새 백로그·기존 백로그 갱신)가 문서와 eval 시나리오로 확인된다 | eval 원응답 |

## 설계

태스크별 설계는 각 BR 범위를 따른다(T01 정본·점검 문서와 pace-team eval 신설, T02 `src/project/team-metrics.ts` 측정 분류와 필수 역할 표지 형식, T03 모드 분기·갱신 검토표, T04 기획자 요건·적용, T05 허브 위임 문서). 보안 영향: 표지가 `src/team/`에 닿으면 민감 경로 — `docs/SECURITY.md` 체크리스트 적용, `team-metrics.ts`는 finish·merge가 거치므로 같은 체크리스트를 적용한다. 옛 설치본 호환(새 키·새 파일을 옛 판독기가 거부하지 않음)은 T02 시험으로 확인한다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `skills/pace-team/SKILL.md`·`references/required-roles.md`(새)·`references/role-archetypes.md`·`evals/scenarios.md`(새) | 모드 분기·필수 역할 점검·갱신 절 |
| `src/project/team-metrics.ts`(+필요 시 `src/team/`) | 조건부·허브 쪽 역할 비참여 분류, 필수 역할 표지 |
| `docs/TEAM.md`·`docs/TEAM-METRICS.md` | 갱신 모드·필수 역할·측정 분류 |
| `.pace/team/agents/pace-backlog-planner.md`(새)와 생성물 | 기획자 맞춤 정의 |
| `skills/pace-intent`·`skills/pace-project-dev/references/backlog.md`·`coordinator.md` | 허브 위임 경로 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 필수 역할 정본과 점검 | 완료 | |
| T02 | 필수 역할 측정 분류 | 대기 | |
| T03 | 팀 갱신 모드 | 대기 | |
| T04 | 백로그 기획 에이전트 | 대기 | |
| T05 | 허브 위임 연결 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-25 20:07 | 정의 작성 |
| 2026-11-25 19:40 | 착수 결정 — 출처: BL261125_02(교차 검토·진단·owner 결정 A 반영)와 owner 지시(2026-11-25 "A (추천): Codex 작업자, 역할 pace-project-lead로 착수하고 모니터링해요"). 작업자 codex, 역할 pace-project-lead, 태스크 5개(BR0n = T0n) |
