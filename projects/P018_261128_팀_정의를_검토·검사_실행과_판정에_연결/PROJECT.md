# P018 팀 정의를 검토·검사 실행과 판정에 연결

- 상태: 정의
- 규모: L(태스크 3개)
- 출처: [BL261128_01_팀_정의를_검토·검사_실행과_판정에_연결](../../backlogs/BL261128_01_팀_정의를_검토·검사_실행과_판정에_연결/BACKLOG.md)
- 브랜치: `project/P018` · worktree: `../pace.wt/P018/`
- 작업자: claude
- 작업자 역할: pace-project-lead
- 팀 측정: <!-- 새 역할 start에서 v1 활성화. 옛 프로젝트 비소급 -->
- 시작: 2026-11-28

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

PACE를 쓰는 프로젝트의 검토·검사가 팀에 정한 역할 정의와 effort로 실행되고, 위험 크기에 맞는 판정으로 검토 반복을 끝내며, 팀 지표가 실제 참여를 보여 주게 한다. 상위 목적은 owner가 자리를 비워도 품질을 지키며 프로젝트를 끝내고 검토 반복에 시간·토큰을 낭비하지 않는 것이다. 범위와 완료 기준의 정본은 출처 백로그와 BR01~BR03이다.

## 재료

- 출처 백로그의 목표·근거 E1~E17·설계 G1~G7·owner Q1/Q2·측정·선행 관계.
- 백로그 `review-records/R4.json`: 다른 제공자 검토 pass, blocking 0, note F7·F9. 2026-11-28 허브 검토 시 BACKLOG 본문과 R4 snapshot의 텍스트 동일성을 확인했다. 이후 추가된 프로젝트 연결·진행 기록은 목표·설계·기준을 바꾸지 않는다. F7·F9는 기존 기준과 구현 설계에서 대조한다.
- 선행 P017: 2026-11-28 소유 worktree 확인 시 T01 완료·T02 진행·T03 대기이며 아직 병합되지 않았다. main 사본보다 소유 worktree의 상태를 우선한다.
- 현재 코드: `src/project/harness.ts`의 `newProject`, `src/team/worker-role.ts`의 역할 선택, `src/core/worker-tiers.ts`의 `resolveTeamSettings`, `src/agent/verify.ts`의 `VerifyOptions`·`buildVerifyPrompt`, `src/agent/call-context.ts`, `src/agent/structured-review.ts`, `src/project/team-metrics.ts`. 인용 행과 동작은 P017 병합 뒤 다시 확인한다.
- 기준 문서: `AGENTS.md`, `docs/README.md`, `docs/SECURITY.md`, `docs/WORK-PROCESS.md`, `docs/TEAM.md`, `docs/TEAM-METRICS.md`, `docs/AGENT-CALL.md`, `docs/TESTING.md`, `docs/SKILLS.md`, `skills/pace-project-dev/references/`.

- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 작업 하네스 흐름: 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다
  - `.pace/brain/pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md` — 프로젝트 지표 해석과 세션 기록 함정: 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정
  - `.pace/brain/pages/flow/저장소-팀-설계와-갱신-흐름.md` — 저장소 팀 설계와 갱신 흐름: 팀 원본의 위치로 신규·갱신·이전을 선택하고 실제 업무 근거와 결정 권한에 따라 팀을 갱신한다
  - `.pace/brain/pages/concept/작업-하네스-실측-함정.md` — 작업 하네스 실측 함정: 정의서 라벨은 한 번만·표 첫 칸에, 계획 행 번호, 링크 증거 경로, 마감 문서의 비밀 예시, 커밋 칸·마감 상태는 done·finish가, stash 공유, list는 worktree 작업본 우선
  - `.pace/brain/pages/concept/검토-반복-실패-하네스.md` — 검토 반복 실패 하네스: 명시적 증명 범위와 영향 분류로 검토를 집중하고 PM/user를 기록한다; 옛 주체는 unknown이며 일반 갭은 재검증 후 보고한다

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | BR01 완료 기준 전부: lead 정확히 1명일 때 새 PROJECT 역할 채움, 없음·복수·손상은 빈칸 성공, 기존 start 선택 규칙 유지, 실제 launch에서 프로필+lead 정의 및 팀 측정 v1 관측 | T01 임시 Git/격리 PACE_HOME 시험·실제 Orca 세션 증거 |
| P-2 | BR02 완료 기준 전부: run·verify의 구성원 정의 본문 및 등급 model·effort 적용, 필드별 명시값 우선, 미등록 이름 실행 전 거부, sandbox·ignore-user-config 유지 | T02 가짜 실행기 양성·음성 및 실제 verify/tester run 원장 대조 |
| P-3 | BR02 effort 미지정/등급 effort의 고정 프롬프트 관측 보고, 정의 지문 있는 호출만 팀 사용 집계, 옛 라벨 행은 사용으로 세지 않음 | T02 effort-none-probe·호출 원장 요청/실제값·팀 마감 지표 대조 |
| P-4 | BR03 완료 기준 전부: 사전 detection 질문 제거·응답 note 판독, 공통 minor 지시 정렬, 과거 기록 형식 유지, 실제 경로 중대 결함은 사전·사후 차단 | T03 분류 시험·고정 P017 입력과 실제 결함 입력 인수 사례 |
| P-5 | 문서·스킬과 도구 의미 일치, team sync --check 차이 없음, pace intent check 해당 원본 오류 없음, 전체·보안 검사 통과 | 태스크 check·finish, 변경한 고정 문구 시험의 이유는 TASK-CLOSE 기록 |

## 설계

G1~G3·G5·G6은 기존 정의와 계산 함수를 실행 경로에 연결하고, G4·G7은 범위·질문을 줄인다. 역할 정의를 줄이거나 main native 호출 범위를 추정하는 방안은 팀을 실제 쓰려는 목적과 범위 확장 비용 때문에 채택하지 않는다. 새 CLI 옵션·상태·문턱·구판 전용 경로 없이 신판 경로 하나로 구현한다.

T01 → T02 → T03 순서다. P017 병합 뒤 E1·E5·E7·E11 및 겹치는 문서를 재대조하고 각 TASK에 구체 설계·시험을 쓴 뒤 독립 사전 검토한다. 역할 배정은 기존 `pace-project-lead`(PM), `pace-implementer`(구현), `pace-tester`(실행 검증), `pace-reviewer`(독립 검토), 조건부 `pace-troubleshooter`(진단)이다. PM은 작성한 계약·산출물의 독립 판정을 하지 않는다. 다른 제공자 우선·B1 대체와 원장 기록은 정본을 따른다.

보안 영향: T01의 `src/project/harness.ts`는 민감 경로다. 손상·거부·부작용 없음의 음성 시험을 포함하며 문서 정렬은 BR02에서 수행한다. T02는 팀 원본·등급 계산을 가져다 쓰고 원본 판독기·등급 계산기·호스트 훅은 고치지 않는다. `--ignore-user-config`와 sandbox 인자는 유지한다. 실제 launch·실행 시험은 임시 저장소와 격리 PACE_HOME으로 한다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/project/harness.ts`, `test/project-harness.test.ts` | 새 프로젝트 역할 채움·실패 및 기존 start 회귀(T01) |
| `src/agent/verify*.ts`, `src/cli.ts`의 agent run, `src/agent/call-context.ts`, `src/project/team-metrics.ts`, 관련 test | 구성원 정의·설정 적용·정의 지문과 참여 집계(T02) |
| `docs/AGENT-CALL.md`, `docs/TEAM.md`, `docs/TEAM-METRICS.md`, `docs/WORK-PROCESS.md`, `skills/pace-project-dev/references/`의 coordinator·tester·task-steps·reviewer | call-agent 의미·직접 호출과 손 지시 삭제·관측 경계·new 채움(T02) |
| `src/agent/structured-review.ts`, `test/agent-structured-review.test.ts`, `skills/pace-project-dev/references/reviewer.md` | 사전 질문·공통 impact 지시·동일 규칙 판독(T03) |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 새 프로젝트의 작업자 역할 채우기 | 대기 | |
| T02 | 검토·검사 실행에 팀 정의와 effort 연결 | 대기 | |
| T03 | 위험 크기에 맞춘 검토 판정 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-28 18:37 | 정의 작성 |
| 2026-11-28 18:37 | 허브 검토(main 판단): user의 백로그 검토·프로젝트 진행 지시로 정의를 준비했다. Q1·Q2와 R4 pass를 유지한다. P017은 T02 진행 중이므로 합의한 P017 병합 뒤 착수 조건을 지키고 정의 상태로 준비한다. 병합 뒤 근거 재대조 후 `pace project start P018`로 lead 역할 세션을 띄운다. |
| 2026-11-28 18:37 | 설치는 fin-link P046 병합 뒤 P017과 함께 한다. 최종 합본 설치 후보에 BL261127_01 D5의 설치 전 재생 관문을 다시 실행한다. 병합·설치 승인과 실행은 허브가 대상/기존 승인 원문을 대조한다. 설치 뒤 3개 프로젝트 마감 보고에 이 백로그의 관측값을 합친다. |
| 2026-11-28 18:39 | 백로그 R4 pass와 Q1·Q2를 유지해 프로젝트 정의 준비. P017 병합 후 근거 재대조·lead 역할 start, 설치는 기존 D5 조건 유지. |

