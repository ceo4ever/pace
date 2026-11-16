# P002 OPAL 프로젝트 가져오기 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-16

## 목표 달성 판정

- 상위 목적(PACE를 독립 제품으로 쓰면서 OPAL로 정의된 기존 프로젝트의 맥락과 커밋 게이트를 잃지 않는다)에 대한 프로젝트 목표 `pace adopt opal`: **합성 OPAL 표본 기준으로 달성, 실제 OPAL이 만든 데이터 호환성은 미확인(한계)**.
  - 달성 근거(관측): 미리보기 무변경·`--apply`의 `git mv` 이력 유지·AGENT 표지 변환과 `workspace_id` 승계·등록·재실행 무변경·멈춤 9종·실패 시 되돌림(T01 시험 29건대), 훅·진입점·참조 보고(T02), 가져온 뒤 부트에 역할·이슈·할 일, `memory list`·`brain search`·`workspace list` 확인과 가져오기 전 대조, 실제 `git commit`에서 교체된 훅이 `pace project check P001 T01`을 부르고 실패→커밋 거부·성공→허용·조건 밖 무호출(T03 e2e). 시험 59건 통과(skip 0).
  - 독립 목표 대조(codex, `evidence/goal-review-codex.md`, 1단계 — 목적과 관측 결과물만 전달): 목표는 상위 목적에 부합, 달성은 **미확인**. 지적 2건 blocking: ① 수정한 OPAL 훅이 자동 교체 대상에서 빠지면 OPAL 제거 뒤 검사 없이 통과해 게이트를 잃을 수 있음 → **수정**(adopt 경고·README 1단계·표에 "PACE 게이트가 빠진 상태"를 명시, 커밋 `ce00acd8`; 해당 경고 시험 포함). ② 실제 OPAL 산출물과의 호환성 근거 부족(표본이 PACE 도구로 만든 파일을 옮긴 것) → **해소하지 못함 — 한계로 남김**: 이 저장소 이력(PACE 0.1.0 정리)에는 OPAL이 만든 `.opal` 표본이 없고, OPAL 설치본이 없는 환경이다. 근거는 `git diff c5ffef4c~1 HEAD -- src/memory/memory.ts src/project/brain.ts` 비어 있음(OPAL 시절 마지막 소스와 동일)뿐이며 생성 경로·설정·다른 파서 동일성까지 증명하지 않는다. should_fix: 실제 `pace project check`의 판정까지의 관측은 없음(가짜 `pace`로 연결·종료 코드 전달만 확인), 전체 검사 실패 3건의 분류는 아래.
  - **사용자 확인 요청**: 실제 OPAL 산출물 호환성이 계약 목표에 필수라면 병합 전에 OPAL이 만든 표본(다른 PC의 실제 프로젝트 1개)으로 `pace adopt opal` 미리보기·적용·부트를 한 번 관측해야 한다. 이 환경에서는 할 수 없다.
- 계약 밖(범위 확정): OPAL 홈(`~/.opal`) 프로필 이전은 하지 않는다(캡틴 결정, PROJECT.md 결정 메모) — 문서 절차는 새 프로필 온보딩.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | (합성 표본 기준 — 실제 OPAL 표본은 미확인, 위 한계) T01 S-2·S-3, T03 S-1 — 미리보기 무변경, apply 뒤 `git mv`(rename으로 보임)·부트에 역할·메모리·브레인. 실제 OPAL 표본은 미확인(위 한계) |
| P-2 | 통과 | T01 S-2·S-3·S-6·S-7 — `opal_agent_version`→`pace_agent_version`, ID 일치, 재실행 무변경, 같은 경로·다른 ID/다른 경로·같은 ID 거부, 같은 경로 다중 항목 순서 무관 |
| P-3 | 통과 | T02 S-1~S-6 + T03 S-2 — 알려진 OPAL 훅만 교체·백업, 사용자·수정 훅 보존, 진입점은 원문 일치만 전환, 실제 `git commit` 4분기 |
| P-4 | 통과 | T01 S-4·S-5·S-6·S-7, T02 S-5 — 공존·미커밋(staged/untracked/숨김 플래그)·v1·형식 불명·링크·비 git·하위 폴더·크기 초과 멈춤, 단계별 실패 주입 복원(복구 실패 보고) |
| P-5 | 통과 | T02 S-4 + 보안 수정 — `파일:줄`만 출력(본문 제외), 읽지 못한 파일은 이유와 함께 알림, 파일 불변, 자동 커밋·push 없음 |
| P-6 | 통과 | `npm run check` 942건 중 933 통과·3 실패·6 skip(아래), `node scripts/secret-scan.ts` 통과(662개 파일), README·`docs/README.md` "OPAL에서 넘어올 때"(T03 S-3·S-4) |

전체 검사(`npm run check`, 2026-11-16 21:56:49 시작, 약 48분, **끊김 없음** — 이전 20:2x~21:4x 실행은 P001 작업자의 프로세스 종료로 끊겨 결과로 인정하지 않음): 실패 3건 — (1) `windows-job-stress`(동시 부하 잡 회수 5초): main 체크아웃 기준선에서도 같은 실패(이 변경과 무관), (2) `get.ps1을 iex로…`(worktree 브랜치에서 설치 코드 업데이트 분기가 돎): 시험 결함으로 main `896def74`에서 격리됨 — 병합 때 반영, (3) `simultaneous stale-lock recovery`(backlog-dashboard): 단독 재실행 18/18 통과(부하성). 마감 직전 수정(보안 반영·훅 경고)은 부분 검사 `pace test unit adopt-opal` 59/0과 `tsc`로 확인했고 전체를 다시 돌리지 않았다(코디네이터 판단: 전체 1회).

## 태스크 결과

- [T01 프로젝트 정의 옮기기](tasks/T01_프로젝트_정의_옮기기/TASK-CLOSE.md) — plan·apply·등록·복구. 사전 검토 8차 이력 복원(캡틴 결정), 구현 후 검토 3차 pass.
- [T02 커밋 게이트·대시보드·문서 보고](tasks/T02_커밋_게이트·대시보드·문서_보고/TASK-CLOSE.md) — 사전 검토 waiver(캡틴 승인), 구현 후 검토 3차 fail → 반영·시험 후 캡틴 수용, 검토 pass 전 커밋(81d23ca7) 절차 위반 기록.
- [T03 시험 저장소 e2e와 안내 문서](tasks/T03_시험_저장소_e2e와_안내_문서/TASK-CLOSE.md) — e2e 2·문서 4 시험, README·정의서, 사전 2회(pass)·구현 후 2회(pass).

## 보안

- 기계 검사: `node scripts/secret-scan.ts` 통과(662개 파일).
- 판단 검사(codex `pace agent verify`, `git diff main...HEAD` 전체 보안 관점 — `evidence/security-review-codex.md`·`-1.md`·`-2.md`): 1차 blocking 1(참조 보고가 문서 본문을 출력해 `hasSecret`이 놓치는 비밀 표현이 노출될 수 있음) → **수정**(본문 제거, `파일:줄`만) + 시험 `보안-1`. should_fix 반영: AGENT.md 일반 파일·64KB 제한(`보안-3`). 2차 blocking 1(검사 뒤 경로 교체 TOCTOU로 저장소 밖 파일을 덮어쓸 수 있음) → 쓰기 직전 `backlogs` 경로 링크 재확인·git 검사 실패 처리(should_fix 3 반영)를 넣고 README에 **"실행 중 같은 저장소를 다른 프로세스가 바꾸지 않는다는 조건에서 안전"**으로 지원 조건을 명시했다. 잔존 위험(사용자 확인): 검사와 쓰기 사이의 동시 변경은 막지 못한다 — 로컬 단일 사용자 CLI·저장소 쓰기 권한이 이미 있는 공격자를 가정한 위협은 범위 밖으로 둔다(3차 재검토 없음 — 같은 부류가 아니라 규칙상 한도 도달이 아니지만 경계 사례로 판단).
- 남긴 should_fix(handoff): 오류·중단 메시지가 저장소 절대 경로·git 진단 원문을 그대로 출력(로컬 CLI·사용자 자기 경로; README가 충돌 위치를 메시지로 확인하라고 안내), AGENT.md 재작성·복구가 POSIX 원래 권한을 보존하지 않음.
- 비밀 노출: 시험·증거는 합성 값만 사용(`example-secret-value` 등 형태 시험은 보안-1에만, 비밀 형식 아님).

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `src/project/adopt-opal.ts`, `src/cli.ts` | 반영 | 새 명령 `pace adopt opal` |
| `src/project/harness.ts` | 반영 | `commitHookPath`·`COMMIT_HOOK`·`COMMIT_HOOK_MARKER` export(동작 불변, `project-harness` 71/71) |
| `test/adopt-opal*.test.ts` | 반영 | 단위·e2e·문서 |
| `test/fixtures/opal-project/**` | 해당 없음 | 계획한 표본 폴더는 만들지 않고 시험 코드가 표본을 생성한다(표본 파일 유지 부담 제거) |
| `README.md`, `docs/README.md` | 반영 | "OPAL에서 넘어올 때", 구성 요소 행, 문서 표. 하네스 라벨 불변 |
| `.pace/test-map.json` | 반영 | `adopt-opal` 단위 추가(`pace test unit adopt-opal`) |
| 브레인(`.pace/brain/`) | 반영 | OPAL 가져오기 설계 결정·함정 페이지 추가 |

## 남은 일

- 병합 전 사용자 판단: ① 실제 OPAL 산출물 표본으로 가져오기 1회 관측(위 한계), ② TOCTOU 지원 조건 수용(README 명시).
- 할 일(메모리): AGENT 복구의 POSIX 권한 보존, 오류 메시지의 절대 경로 노출 정리(필요하면 백로그), OPAL 원본 표본을 시험에 넣을 수 있게 되면 e2e 표본 교체.

## 회고

- 잘된 것: 계획(PROJECT.md 기준 P-1~P-6)에 맞춰 단계별로 시험을 쌓았고, 독립 검토가 실제 결함(숨은 미커밋 변경·다중 등록 항목·정규화 위조·백업 잔존·비밀 출력)을 여러 번 잡았다.
- 다음에 바꿀 것: 계획 단계에서 검토 횟수 상한과 waiver 규칙을 처음부터 따르고, 구현 후 검토가 pass에 이르기 전에 커밋하지 않는다(T02 위반). 검토 한 번마다 다른 경계 사례가 나와 비용이 컸다 — 위협 모델(동시 변경 허용 여부)을 설계에 먼저 적는다. 전체 검사는 시작 전 다른 작업자의 테스트 프로세스 종료 정책과 겹치지 않는지 확인한다.

## 지표

[지표 집계](METRICS.md)

러닝 시간 약 479분(작업 경과 377분, 승인·질의 대기 102분), 게이트 실패 1회(T02). 사전·구현 후·보안 독립 검토가 시간 대부분을 차지했다(T01 140분·T02 112분·T03 24분). 토큰은 작업자 Claude 캐시 읽기가 대부분.

## 배포

해당 없음(병합 뒤 설치는 main에서 `scripts/install.*`로 — 이 프로젝트는 배포를 하지 않는다).
