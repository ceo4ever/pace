# PACE

## 개요

| 항목 | 값 |
|---|---|
| 목적 | Claude Code·Codex·Gemini CLI·Cursor·Antigravity 어디서 세션을 열어도 올라오는 **개인 비서 에이전트**. 정체성·메모리·브레인만 두고, 실행은 각 LLM 도구의 기능을 그대로 쓴다 |
| 유형 | 개발 |
| 단계 | 진행 중 — PACE (`0.1.2`) |
| 사용자 | 개발자 본인, 이후 PACE 사용자 |

이 문서는 지도다. 각 절은 요약과 상세 문서 링크만 담고, 상세는 아래 [문서](#문서) 표의 서브 문서에 있다.

## 변경 기록

- 0.1.2 (2026-11-25) — 저장소별 팀 역할과 Claude·Codex 동기화, 역할 기반 작업자 시작, 인계 기록·공유 자원 잠금·팀 회고, 반복 검토 실패 진단과 승인 경계, 상시 실행 daemon과 Telegram 워크스페이스 연결. 새 팀 원본은 `.pace/team/agents/`에 생성하며 기존 경로도 읽는다.
- 0.1.1 (2026-11-19): 플레이북 생성기(`pace-playbook-maker`), OPAL 가져오기(`pace adopt opal`), 선택 검사 러너 vitest 지원, Windows 전체 검사 시간 절반으로 단축(동시성 4·Git 준비 재사용, 같은 PC 중앙값 약 23.8분 → 11.7분)과 변경 기반 빠른 검사(`pace test changed`), 백로그 대시보드 진입 HTML에서 PC 경로 분리(v2 + Git 밖 `local.js`), Windows 원격 설치 `irm | iex` 수정. 넘어올 때: 이미 대시보드가 있는 저장소는 업데이트 뒤 PC마다 `pace backlog init` 한 번.
- 0.1.0 (2026-11-16): 첫 공개 버전.

## 원칙과 기준

- **기본 구성만**: 에이전트에 필요한 정체성·메모리·브레인만 만든다. 계획·실행·서브에이전트·스킬·MCP는 LLM 도구의 것을 쓴다 — 이는 사용자와 대화하는 오케스트레이션 세션의 작업 방식이며, 제공자가 다른 에이전트가 필요할 때 그 세션이 쓰는 도구(`pace agent`)는 방침을 뒤집지 않는다(호스트가 직접 부를 수 있으면 호스트 기능이 먼저).
- **어디서나 같은 에이전트**: 도구별 차이는 부트 출력 형식(`--host`)과 설치기에만 둔다.
- **빌드 없음, 런타임 의존성 없음**: TypeScript를 Node 24+ 타입 제거로 바로 실행한다. devDependencies는 `typescript`·`@types/node`뿐.
- **세션을 막지 않는다**: 부트는 어떤 오류에도 종료 코드 0과 유효한 훅 형식을 낸다.
- **완료는 실측으로**: 테스트와 실제 도구 세션에서 확인한 것만 완료로 본다.

## 범위

- 하는 것: 프로필(독립 에이전트) 생성·온보딩, OPAL(`.opal`) 프로젝트 정의 가져오기(`pace adopt opal` — 절차는 [README.md](../README.md#opal에서-넘어올-때)), 세션 부트(상황 판별·메모리 주입·화면 인사), 프로필·프로젝트 메모리, 프로젝트 브레인, 작업 하네스(`pace project` — 프로젝트·태스크의 계약·게이트·기록), 설치·제거, 기본 스킬
- 하지 않는 것(1차): 다중 프로필 운영, 에이전트끼리의 자동 위임망(`pace agent`는 오케스트레이션 세션이 필요할 때 부르는 도구), 프로필 브레인

## 구성 요소

| 요소 | 경로 | 스택·형식 | 요약 · 상세 |
|---|---|---|---|
| CLI 진입점 | `bin/pace.ts`, `src/cli.ts` | TypeScript | 명령 분기 · [ARCHITECTURE](ARCHITECTURE.md#실행과-구성) |
| 부트 | `src/boot.ts` | TypeScript | 부트 맥락, 플랫폼별 출력, 화면 인사 · [ARCHITECTURE](ARCHITECTURE.md#대표-흐름) |
| 에이전트 호출 | `src/agent/` | TypeScript | `pace agent setup`·`run`·`verify` — 다른 제공자 에이전트를 `-p`·ACP로 부르는 호출 계약·체인·폴백 · [AGENT-CALL](AGENT-CALL.md#에이전트-호출) |
| 검사 선택 | `src/test-runner/`, `.pace/test-map.json` | TypeScript·Node·Python unittest·vitest | `pace test changed·file·unit·all` — 변경 관련 단위·지정 단위·선언 전체 검사(불확실하면 전체) · [TESTING](TESTING.md#검사-선택) |
| 공통 | `src/core/` | TypeScript | 경로·파일·frontmatter · [ARCHITECTURE](ARCHITECTURE.md#실행과-구성) |
| 저장소 팀 | `src/team/`, `src/core/worker-tiers.ts`, `templates/team/` | TypeScript·Markdown·TOML | 원본·호스트 동기화, 실제 적재 점검과 참여 자원 잠금 · [TEAM](TEAM.md) |
| 메모리 | `src/memory/` | TypeScript | 프로필·프로젝트 공용 저장소 · [ARCHITECTURE](ARCHITECTURE.md#실행과-구성) |
| 프로필 | `src/profile/` | TypeScript | 프로필 생성·복제, 온보딩 질문 원본 · [ARCHITECTURE](ARCHITECTURE.md#실행과-구성) |
| 프로젝트 | `src/project/` | TypeScript | 상황 판별, 브레인, 작업 하네스(`harness.ts`) · [WORK-PROCESS](WORK-PROCESS.md) |
| PACE 도구 서버 | `src/mcp/` | TypeScript | `pace mcp` — ACP 세션에 주입되는 워크스페이스·권한 고정 stdio MCP 서버 · [AGENT-CALL](AGENT-CALL.md#pace-도구-서버) |
| 상시 실행 daemon | `src/daemon/` | TypeScript | `pace daemon` — 기기당 하나, 채널(Telegram)·Gateway 요청을 승인·직렬화해 실행 · [DAEMON](DAEMON.md) |
| 기회 탐색 | `src/scout/` | TypeScript | `pace scout` — 스킬 pace-scout의 기계적 일(수집·렌더·검사) · [PLANNING-TOOLS](PLANNING-TOOLS.md#기회-탐색) |
| 의도 파악 기획 | `src/intent/` | TypeScript | `pace intent` — 스킬 pace-intent의 기계적 일(렌즈·인계 문서 검사, 설계 문서 렌더·미리보기) · [PLANNING-TOOLS](PLANNING-TOOLS.md#의도-파악-기획) |
| 워크스페이스 등록부 | `src/project/workspace-registry.ts`, `src/project/agent-definition.ts` | TypeScript | `PACE_HOME/projects/` 후보·활성 워크스페이스와 `.pace/AGENT.md` 정의(`pace_agent_version: 2`) 연결. Git worktree 관리는 기존 작업 하네스 책임 · — |
| OPAL 가져오기 | `src/project/adopt-opal.ts` | TypeScript | `pace adopt opal [--cwd <폴더>] [--apply]` — `.opal/`→`.pace/` 전환(기본 미리보기) · [ADOPT-OPAL](ADOPT-OPAL.md) |
| 백로그 대시보드 | `src/dashboard/`, `src/project/dashboard*.ts` | JS·CSS·TypeScript | `pace backlog init·refresh` — 백로그·프로젝트 현황 HTML, PC 경로는 Git 밖 `local.js` · [DASHBOARD](DASHBOARD.md) |
| 설치 | `src/setup/`, `scripts/install.sh`, `scripts/install.ps1`·`install.cmd` | TypeScript·sh·PowerShell | 훅·대체 규칙·스킬 등록, `pace onboard` — PACE 표지가 있는 것만 바꾼다 · [SETUP](SETUP.md) |
| 스킬 | `skills/` | Markdown (Agent Skills) | 설치되는 기본 스킬 묶음(프로젝트·메모리·브레인·기획·교본·Canvas 등) · [SKILLS](SKILLS.md) |
| 플레이북 생성기 | `skills/pace-playbook-maker/` | Markdown + Node `.mjs` 도구 | 목표 → 인터뷰 → 수행·가림 캡처 → 플레이북(업무 스킬 한 벌) 생성, 주행·자가 복구 · [PLAYBOOK](PLAYBOOK.md) |
| 템플릿 | `templates/RULES.md`, `templates/profile/`, `templates/brain/`, `templates/project/`, `templates/backlog/`, `templates/scout/` | Markdown·YAML·JSON·HTML | 시스템 운영 규칙(부트가 직접 읽음), 프로필·브레인·프로젝트(PROJECT·TASK·마감·E2E 시나리오) 원본 · [ARCHITECTURE](ARCHITECTURE.md#실행과-구성) |
| 테스트 | `test/` | `node:test` | 단위·CLI. E2E 프레임워크 없음 — 실측은 태스크 `evidence/` · [TESTING](TESTING.md) |
| 비밀 탐지 | `scripts/secret-scan.ts` | TypeScript | 커밋될 파일의 비밀 원문 탐지 · [TESTING](TESTING.md#보안-검사) |

## 환경

| 구분 | 명령 / 값 | 확인 |
|---|---|---|
| 런타임 | Node.js 24 이상 (로컬 24.22.3) | ✅ 2026-11-19 |
| Windows 에이전트 | OS 기본 Windows PowerShell 5.1과 .NET Add-Type이 필요하다. 감시자 프로세스에만 실행 정책 Bypass를 적용하며 그룹 정책이나 제한 언어 모드가 준비를 막으면 에이전트를 실행하지 않고 오류를 안내한다 | Windows 실측 |
| 설치 | `npm install` (devDependencies만) | ✅ |
| 검사 | `npm run check` — `tsc` 타입 검사 + Node 테스트; Windows는 파일 동시성 4, macOS·Linux는 Node 기본 동시성을 사용. 명시 변경은 `npm test -- --test-concurrency=2` | ✅ 2026-11-19 · P004 T03 전체 5회 연속 실패 0 |
| 보안 검사 | `node scripts/secret-scan.ts` — 커밋될 파일의 비밀 원문(제외 목록은 [TESTING](TESTING.md#보안-검사)) | ✅ 2026-10-23 |
| worktree 준비 | `npm ci --no-audit --no-fund` (새 worktree에 `node_modules`가 없어 `tsc`가 없다. 취약점 조회는 main과 같은 잠금이라 생략 — `의존성 감사`가 맡는다) | ✅ 2026-11-13 |
| 의존성 감사 | `npm audit --omit=dev` (finish가 잠금 파일이 base 대비 바뀐 브랜치에서만 실행. 런타임 의존성 0이라 보통 생략된다) | ✅ 2026-11-13 |
| 실행 | `./bin/pace.ts <명령>` (`pace --help`) | ✅ 2026-11-15 (`pace --help`) |
| 설치(PC) | `bash scripts/install.sh` · `scripts\install.cmd` · 원격 Windows `irm …/scripts/get.ps1 \| iex`(ASCII 입구 — BOM 있는 install.ps1을 임시 파일로 받아 `-File` 실행) | ⬜ 실제 사용자 홈 설치 미확인 |
| 선택 검사 | `pace test changed` · `pace test file <경로>` · `pace test unit <id>` · `pace test all` — 단위 구성 `.pace/test-map.json`, 부분 검사는 전체 회귀를 대체하지 않음. changed 채택·종료 코드·신뢰 범위는 README.md의 "변경 기반 빠른 검사" ([바로 가기](../README.md#변경-기반-빠른-검사)) | |
| 테스트 위치 | `test/*.test.ts` (임시 `PACE_HOME`·TMP, `PACE_PROFILE` 제거, 세션 환경 변수 격리 — `test/helpers.ts` `sessionFreeEnv`) — 임시 루트 규칙은 [TESTING](TESTING.md#테스트-임시-루트) | |
| E2E | 프레임워크 없음 — 실제 도구 세션·임시 저장소 실측을 태스크 `evidence/`에 기록 | |
| 환경변수 | `PACE_HOME` (기본 `~/.pace`), `PACE_PROFILE` (기본 프로필 대신) | |

신규 AGENT의 `<!-- pace:profile-heading -->` 바로 다음 자동 표제는 부트 전달 시 현재 프로필 이름으로 표시하고 예약된 관리 주석만 단독 행이면 본문 어디에서든 전달하지 않는다. 원본 파일은 변경하지 않으며 표지가 없는 기존 정의와 표지를 제거한 사용자 정의 표제는 그대로 전달한다.

개발·테스트에서는 `PACE_HOME`을 임시 폴더로 지정한다. `~/.pace`는 설치 때 복사한 설치본이다(코드 `~/.pace/app/`, 스킬은 각 도구 폴더에 복사본). 소스를 고친 뒤에는 `bash scripts/install.sh`로 다시 설치해야 반영된다.

## 작업 프로세스

세부(백로그 상태 전환·지표·사전 검토·사건 작성·대기·측정·선언 명령·커밋 게이트·작업자 모델)는 [WORK-PROCESS](WORK-PROCESS.md).

- 관리 방식: 백로그(기획) + 프로젝트(실행)
- 백로그: `backlogs/BL{YYMMDD}_{NN}_{이름}/BACKLOG.md`·`BR{NN}_{이름}.md`. 백로그 → 프로젝트, 브리프(영어 brief) → 같은 번호 태스크. `pace backlog new·brief`로 만들고 `pace project new --from <BL 폴더 또는 앞부분>`으로 착수한다.
- 프로젝트: `projects/P{NNN}_{YYMMDD}_{이름}/` — `pace project new·start·task·check·done·finish·merge·stats`, 절차는 `pace-project-dev` 스킬.
- 브랜치: 작은 일(버그·문구·단발 수정)은 main 직접 커밋. 프로젝트는 worktree(`../pace.wt/P###`, 브랜치 `project/P###`). Orca 안이면 start가 작업자 세션을 띄우고 main 세션이 코디네이터
- 병합: finish(worktree) → main에서 사용자 승인 뒤 `pace project merge` — rebase 뒤 fast-forward, 태스크 커밋 유지. 미리보기는 환경 선언 변경과 worktree 제거 때 함께 지워질 무시 항목(무시된 폴더는 한 줄, 낱개 파일은 이름 — 앞 20곳·총수)을 보여 준다. 설치(`bash scripts/install.sh`)는 병합 뒤 main에서만
- 상태 값: 태스크·브리프 대기 · 진행 · 완료 · 보류 / 프로젝트 정의 · 진행 · 병합 대기 · 완료
- 진행 상황·이슈·할 일: 프로젝트 메모리 (`pace memory list --project`)
- 결정의 이유·실측 결과·함정: 프로젝트 브레인 (`.pace/brain/`) — 백로그가 닫혀도 남길 지식
- 커밋: 메시지는 한국어 `type(범위): 요약`, 태스크는 `feat(P###/T##): …`

## 보안

민감 경로와 보안 체크리스트는 [SECURITY](SECURITY.md) — 설계에서 민감 경로를 건드리면 PROJECT.md 보안 영향에 적는다.

## 문서

| 문서 | 설명 | 용도 | 적용 범위 | 참조 시점 |
|---|---|---|---|---|
| `AGENTS.md` | 일하는 법 요약과 길 안내 | — | 전체 | 항상 (자동) |
| `docs/SECURITY.md` | 민감 경로와 보안 체크리스트 | security | `src/setup/**`, `scripts/**`, `src/boot.ts`, `src/core/fsutil.ts`, `src/core/worker-tiers.ts`, `src/team/**`, `src/project/**`, `src/memory/**`, `src/profile/**`, `src/scout/**`, `src/intent/**` | 작업 시 |
| `docs/HANDOFF.md` | 원문 로컬 보존·승인/위임/종결·전송 선기록·요청 집계 | spec | `src/team/handoff-*.ts`, `src/project/handoff-*.ts`, `src/team/resource-events.ts` | 작업 시 |
| `docs/TEAM-METRICS.md` | 팀 부담·품질·역할 관측, 기준선 비교·회고 입력과 finish | spec | `src/project/team-*.ts`, `src/project/metrics-report.ts`, `src/project/metrics-document.ts` | 작업 시 |
| `docs/TEAM.md` | 팀 원본·생성물·모델 매핑·보존/권한 경계 | spec | `src/team/**`, `src/core/worker-tiers.ts`, `templates/team/**` | 작업 시 |
| `README.md` | 소개·설치·사용·OPAL에서 넘어올 때 (사용자용) | — | — | 요청 시 |
| `skills/pace-project-init/references/` | 정의서·백로그 형식, 분석 방법 | convention | `docs/**`, `backlogs/**`, `skills/pace-project-init/**` | 작업 시 |
| `skills/pace-project-dev/references/` | 테스트·E2E·리뷰·보안 기준 | test | 전체 | 작업 시 |
| `.pace/brain/` | 결정과 이유, 도구별 훅 동작, 설치 함정 (`pace brain search`) | — | — | 작업 시 |
| `docs/ARCHITECTURE.md` | 구성과 주요 실행 흐름 | architecture | `src/**`, `bin/**`, `skills/**`, `templates/**` | 작업 시 |
| `docs/WORK-PROCESS.md` | 작업 프로세스 세부 — 백로그 상태 전환·지표·사건 기록·선언 명령·커밋 게이트·작업자 모델 | convention | `src/project/**`, `projects/**` | 작업 시 |
| `docs/TESTING.md` | 검사 선택·테스트 임시 루트·보안 검사 제외 | test | `test/**`, `src/test-runner/**`, `scripts/secret-scan.ts` | 작업 시 |
| `docs/AGENT-CALL.md` | 에이전트 호출(`pace agent`)과 PACE 도구 서버(`pace mcp`) | architecture | `src/agent/**`, `src/mcp/**` | 작업 시 |
| `docs/DAEMON.md` | 상시 실행 daemon·Telegram 어댑터·Gateway | architecture | `src/daemon/**` | 작업 시 |
| `docs/PLANNING-TOOLS.md` | 기회 탐색·의도 파악 기획·화면 기획과 Canvas | architecture | `src/scout/**`, `src/intent/**`, `skills/pace-intent/**`, `skills/pace-scout/**` | 작업 시 |
| `docs/ADOPT-OPAL.md` | OPAL 가져오기(`pace adopt opal`) 동작 | architecture | `src/project/adopt-opal.ts` | 작업 시 |
| `docs/SETUP.md` | 설치 경계와 Canvas 묶음 설치 | ops | `src/setup/**`, `scripts/install*`, `skills/pace-canvas-skills/**` | 작업 시 |
| `docs/PLAYBOOK.md` | 플레이북 생성기 구조 | architecture | `skills/pace-playbook-maker/**` | 작업 시 |
| `docs/DASHBOARD.md` | 백로그 대시보드 — 공용 자산·PC 경로 분리·init·refresh | architecture | `src/dashboard/**`, `src/project/dashboard*.ts`, `backlogs/**` | 작업 시 |
| `docs/SKILLS.md` | 설치되는 기본 스킬 목록과 각 스킬의 역할 | architecture | `skills/**` | 작업 시 |

## 용어

브레인의 LLM Wiki 용어: ingest=추가 · query=질의 · lint=점검 · file back=되적립 · stale claims=낡은 주장.

| 용어 | 뜻 |
|---|---|
| 프로필 | 독립 에이전트 하나 (`PACE_HOME/profiles/<이름>/`, 기본 `~/.pace`: SOUL·USER·메모리·스킬·설정. 운영 규칙 RULES는 모든 프로필 공통) |
| 부트 | 세션 시작 훅이 `pace boot`로 에이전트 정의·메모리·상황을 주입하는 것 |
| 대체 규칙 | 훅이 동작하지 않는 도구에서 `pace boot`를 실행하게 하는 지침 한 줄 (Codex·Gemini·Cursor) |
| 상황 | 세션을 연 위치: PACE 프로젝트 / 정의 없음 / 새 프로젝트 / 프로젝트 밖 |
