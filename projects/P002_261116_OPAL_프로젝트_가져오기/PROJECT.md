# P002 OPAL 프로젝트 가져오기

- 상태: 진행
- 규모: L(태스크 3개)
- 출처: 대화 2026-11-16
- 브랜치: `project/P002` · worktree: `../pace.wt/P002/`
- 작업자:
- 시작: 2026-11-16

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

다른 PC처럼 기존 프로젝트가 OPAL로 정의된 곳에서 PACE를 설치하면, PACE는 `.pace/`만 읽어 프로젝트 메모리·브레인·역할이 사라진 것처럼 보이고 OPAL 커밋 게이트 훅 때문에 PACE 게이트도 설치되지 않는다. 0.1.0에서 OPAL 전환 코드를 지웠으므로, 프로젝트 폴더에서 한 줄로 OPAL 정의를 PACE로 옮기는 명령 `pace adopt opal`을 만든다. 상위 목적: PACE를 독립 제품으로 쓰면서 기존 작업 맥락을 잃지 않는다.

## 재료

- 대화 2026-11-16: 캡틴 "다른 PC에서 설치했는데 기존 프로젝트들이 OPAL로 설정된 경우" → P002 제안 승인("1번 P002로 만들고")
- 현재 동작(실측 2026-11-16, 시험 폴더): `.opal/`만 있고 `AGENTS.md`가 있는 저장소를 PACE가 "PACE 프로젝트"로 판별하지만 `.opal/memory`·`brain`·`AGENT.md`는 읽지 않는다. `.pace/AGENT.md`가 형식에 맞지 않으면 `pace workspace register`가 "AGENT 역할·임무·경계·지식 절이 필요하다"로 거부, 없으면 새로 만든다.
- 커밋 게이트: `src/project/harness.ts:701` `installCommitHook` — 기존 `commit-msg`가 PACE 표지로 시작하지 않으면 보존하고 경고만 낸다. 이 저장소에도 `# OPAL commit gate v1` 훅이 남아 P001 태스크 커밋 검사가 빠졌다(2026-11-16 main 세션이 PACE 훅으로 교체, 원본 `commit-msg.opal-backup`).
- 대시보드: `backlogs/README.html`이 OPAL 설치본을 참조하면 `pace backlog init`이 공용 참조가 아닌 화면으로 보고 보존한다(`docs/README.md` "백로그 대시보드").
- 지운 전환 코드(참고): 백업 번들 `D:/DockerStudio/backup/pace-history-261116.bundle` 커밋 c5ffef4c — `src/project/migrate-v1.ts`(.opal v1 계획·이동·`.gitignore` 경고·브레인 보존), `src/setup/migrate-v2.ts`(OPAL 홈 프로필 → PACE 홈, plan→apply 지문·덮어쓰기 금지·실패 시 되돌리기), `src/project/agent-definition.ts:30`(`opal_agent_version` 키). 읽기만 하고 그대로 되살리지 않는다.
- 브레인:
  - `.pace/brain/pages/flow/작업-하네스-흐름.md` — 커밋 게이트·하네스

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | OPAL v2 형식 시험 저장소(`.opal/AGENT.md`·`memory/`·`brain/`)에서 `pace adopt opal`(기본 미리보기)은 아무것도 바꾸지 않고 바꿀 목록을 보여 주며, `--apply` 뒤에는 `.pace/`로 옮겨지고(`git mv`, 이력 유지) 부트에 그 메모리·브레인·프로젝트 역할이 나온다 | e2e 테스트 |
| P-2 | AGENT.md의 `opal_agent_version`이 `pace_agent_version`으로 바뀌고 OPAL의 `workspace_id`를 이어받아 워크스페이스 등록부에 등록된다. 같은 경로·ID가 이미 있으면 거부하지 않고 결과가 같다(재실행 무변경) | 테스트 |
| P-3 | OPAL 커밋 게이트 훅을 PACE 훅으로 바꾸고 원본을 백업하며, 사용자가 만든 다른 훅은 보존한다. OPAL 대시보드 진입점은 PACE 공용 참조로 다시 연결하고 사용자 파일은 보존한다 | 테스트 |
| P-4 | `.pace/`가 이미 있거나, 커밋 안 한 변경이 `.opal/`에 있거나, AGENT.md 형식을 판별할 수 없으면 원본을 바꾸지 않고 이유와 함께 멈춘다. 실패 도중이면 이번에 바꾼 것만 되돌린다 | 테스트 |
| P-5 | `AGENTS.md`·`docs/`·`CLAUDE.md`의 `opal` 명령·`opal-*` 스킬 이름은 자동으로 바꾸지 않고 파일:줄 목록으로 보고한다. 자동 커밋·push 없음 | 테스트 |
| P-6 | `npm run check`·`node scripts/secret-scan.ts` 통과, README·`docs/README.md`에 "OPAL에서 넘어올 때" 절차(OPAL 제거 → PACE 설치 → 프로젝트마다 `pace adopt opal`) | 명령 출력·문서 |

## 설계

- 명령: `pace adopt opal [--cwd <dir>] [--apply]` — 기본은 미리보기(plan). apply는 plan을 다시 만들어 같은 내용일 때만 쓴다. 저장소 루트 기준, git 저장소에서만(이동을 `git mv`로).
- 모듈: `src/project/adopt-opal.ts`(plan·apply), CLI 분기 `src/cli.ts`. 브레인·메모리 파일 형식은 OPAL v2와 PACE가 같다는 전제를 테스트로 확인하고, 다르면 해당 항목을 보고로 돌린다.
- 대상 밖: OPAL v1 형식(`MEMORY.json`) — 판별되면 멈추고 안내만. OPAL 홈(`~/.opal`) 프로필 이전은 이번 범위가 아니다(캡틴 확인 대기 — 결정 메모).
- 보안 영향: 저장소 안 경로만 다룬다(심볼릭 링크·저장소 밖 경로 거부), 훅 파일은 일반 파일만 교체, 비밀 검사 대상 경로 변화 없음.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/project/adopt-opal.ts`, `src/cli.ts` | 새 명령 |
| `src/project/harness.ts` | 커밋 게이트 훅 교체 로직 재사용(필요 시 export) |
| `test/adopt-opal.test.ts`, `test/fixtures/opal-project/**` | 테스트·OPAL 형식 표본 |
| `README.md`, `docs/README.md` | OPAL에서 넘어올 때 절차 |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 프로젝트 정의 옮기기(plan·apply·등록) | 완료 | f2737640 |
| T02 | 커밋 게이트·대시보드·문서 보고 | 완료 | 81d23ca7 |
| T03 | 시험 저장소 e2e와 안내 문서 | 완료 | a50228ca |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-16 15:30 | 정의 작성 |
| 2026-11-16 15:40 | 착수 결정(캡틴, 대화): "1번 P002로 만들고" — `pace adopt opal` 프로젝트 변환 명령. OPAL 홈 프로필 이전 포함 여부는 캡틴 확인 대기(지금 범위 밖). P001과 병행 — Windows 전체 검사 동시 실행은 메모리 부족 이력이 있어 작업자끼리 시간이 겹치면 부분 검사로 진행하고 finish 전 전체 검사 1회 |
| 2026-11-16 15:32 | T01: task 명령이 T04를 새로 만들어 T01로 정정(표 행·폴더) |
| 2026-11-16 15:55 | (사용자 결정) 프로필 이전 범위 밖 확정 — OPAL 홈(~/.opal) 프로필은 옮기지 않는다. 새 PC는 온보딩으로 새 프로필을 만든다. 안내 문서 절차: PACE 설치 → 온보딩으로 새 프로필 → 프로젝트마다 `pace adopt opal` (T03 문서에 반영). 전달: 코디네이터(main) |
| 2026-11-16 21:28 | T03: 사전 검토 2회(1차 fail blocking1 skip 가능성 → 반영, 2차 pass). 1차 hash는 TASK 해시 미보존으로 증거 파일 해시 대체 |

