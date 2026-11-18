# PACE

## 개요

| 항목 | 값 |
|---|---|
| 목적 | Claude Code·Codex·Gemini CLI·Cursor·Antigravity 어디서 세션을 열어도 올라오는 **개인 비서 에이전트**. 정체성·메모리·브레인만 두고, 실행은 각 LLM 도구의 기능을 그대로 쓴다 |
| 유형 | 개발 |
| 단계 | 진행 중 — PACE (`0.1.0`) |
| 사용자 | 개발자 본인(캡틴), 이후 PACE 사용자 |

## 변경 기록

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

| 요소 | 경로 | 스택·형식 | 비고 |
|---|---|---|---|
| CLI 진입점 | `bin/pace.ts`, `src/cli.ts` | TypeScript | 명령 분기 |
| 부트 | `src/boot.ts` | TypeScript | 부트 맥락, 플랫폼별 출력, 화면 인사 |
| 에이전트 호출 | `src/agent/` | TypeScript | `pace agent setup [--agents claude,codex] [--yes] [--login] [--install-adapters]`(`setup.ts` — 감지(읽기만) → 계획·확인 → 적용, 공식 CLI 로그인만 쓰고 토큰·자격증명 파일은 읽거나 복사하지 않는다, 프로필 `agent-chains.json`의 `default` 체인은 기존 파일을 보존·병합하고 바꾸기 전 확인과 `.bak`) · `pace agent` — 호출 계약(`contract.ts`: 입력·정규화 결과·오류 코드·능력 검사)과 실행기 등록(`registry.ts`). 실행기: `-p`(`p-executor.ts`)·ACP(`acp-executor.ts`), 프로세스 수명·env 허용 목록(`process.ts`), 체인·폴백(`chain.ts`·`limits.ts`·`snapshot.ts`, `pace agent run --chain <이름>` — 프로필 `agent-chains.json`의 단계 순서대로, 한도·인증·실행기 없음이면 다음 단계로 폴백하고 쓰기 요청이 시작된 뒤에는 기본적으로 `handoff_required`로 사람에게 넘긴다. 읽기 전용 요청은 읽기 전용 강제가 실측으로 확인된 단계만 실행), ACP 보강(`hooks.ts`·`acp-executor.ts` — 실행 훅: 이벤트 스트림 `onEvent`(상한 큐, 원본 `--raw-dir` 저장은 별도 64MB 상한)·권한 위임 `onPermission`(식별 실패·읽기 전용의 허용 밖은 강제 거절, 읽기 전용에서 콜백은 허용을 낮추기만)·`paceMcp`·정체성 맥락 `context`·이전 대화 요약 `handoffSummary`, 대화 이어가기 `session/resume`은 호출자 보관 `savedSession` 대조 필수, 읽기→쓰기 전환은 `continueSession`이 새 세션+요약으로), 교차 검증(`verify.ts`, `pace agent verify` — 다른 제공자 에이전트가 읽기 전용으로 독립 검토, 불가하면 미실행·질문). Codex 호스트에서 쓸 때는 호스트 샌드박스의 네트워크 허용이 필요하고(기본 차단 → 타임아웃), Codex를 다시 부르려면 호스트 샌드박스 해제가 필요하다. Claude ACP는 모델을 보고하지 않아 교차 검증 근거로 쓸 수 없다(`-p` 사용). 회수 보증: POSIX는 프로세스 그룹, Windows는 최선 노력(`process_cleanup: best-effort-unverified`, 실기 검증은 병합 후). 용어: **에이전트**(도구를 쓰며 일하는 프로그램: Claude Code·Codex) · **모델** · **제공자**(모델 회사) · **호출 방식**(`p` 헤드리스 단발 / `acp` 세션) · **Client**(ACP에서 부르는 쪽 = pace agent). 프롬프트는 stdin·파일만(argv 금지), 기본 읽기 전용, 미지원 옵션은 오류 |
| 검사 선택 | `src/test-runner/`, `.pace/test-map.json` | TypeScript·Node·Python unittest·vitest | 파일·단위 선택과 확인 불가 판정(vitest는 단위의 파일을 한 프로세스로), 전체는 기존 검사 선언 사용 |
| 공통 | `src/core/` | TypeScript | 경로·파일·frontmatter |
| 메모리 | `src/memory/` | TypeScript | 프로필·프로젝트 공용 저장소 |
| 프로필 | `src/profile/` | TypeScript | 프로필 생성·복제, 온보딩 질문 원본 |
| 프로젝트 | `src/project/` | TypeScript | 상황 판별, 브레인, 작업 하네스(`harness.ts`) |
| PACE 도구 서버 | `src/mcp/` | TypeScript | `pace mcp --workspace <경로> --access read-only|write` — ACP 세션에 `mcpServers`로 주입되는 stdio MCP 서버. 워크스페이스·접근 권한은 기동 때 고정하고 도구마다 서버가 강제한다: 읽기 전용이면 변경 도구(`memory_add`) 직접 호출도 거부, 다른 워크스페이스·링크·하드링크·상한 초과 거부(`safefs.ts`의 `scan` 앞뒤 비교). 도구: 메모리 조회·추가, 프로젝트·백로그 조회, 브레인 검색. 쓰기 세션과 다른 세션의 동시 실행 금지는 호출자(daemon)의 전제 |
| 상시 실행 daemon | `src/daemon/` | TypeScript | `pace daemon run|start|status|stop [--force]|logs|release|install|uninstall|telegram init|telegram reset-offset` — 기기당 하나(정규화한 `PACE_HOME` 해시의 loopback 인스턴스 포트를 잡는 쪽이 소유자 — OS가 해제하므로 인계 판정 없음, 응답 없는 소유자가 있어도 실패)로 상시 실행되며 채널 어댑터(`ChannelAdapter`)·Gateway가 넘긴 요청을 `core.ts`가 받아 대상(워크스페이스·워크트리·체인·access)을 수신 때 고정하고, 워크트리(조상·자손 포함)당 하나씩 직렬화·전체 동시 상한으로 실행한다. 모든 상태 변경은 단일 직렬 처리기를 거치고 상태는 `PACE_HOME/daemon/state.json`에 원자적으로 쓴다. 쓰기 작업은 시작 전 승인(작업·범위·사용자·대화·만료·기동 ID에 묶여 한 번만 처리)이 필요하고 기본은 읽기 전용이다. 강제 종료·재시작 뒤에는 이전 승인을 모두 무효로 하고 실행 중이던 쓰기 작업은 자동 재실행 없이 `needs_review`로 두며, 회수를 증명하지 못한 경로는 영속 격리(`quarantine`)해 `pace daemon release`로만 푼다. 수신 ID 중복 제거(7일·10,000개, 24시간 안 기록은 개수 상한으로 지우지 않고 하드 상한 100,000에서는 새 수신을 거절), 알림은 outbox로 최소 한 번 전송. 상태·로그·송신 본문에는 `redact`(자기 봇 토큰·봇 토큰 형태 제거)를 저장 직전에 적용한다. Telegram 어댑터(`src/daemon/telegram/`, `secrets/telegram.json`이 있을 때만 연결)는 `fetch`로 Bot API를 롱폴링하는 포럼 토픽 채널이다 — 허용 chat → 허용 사용자(코어 정책) → 등록 토픽 순으로 통과한 입력만 처리하고, General은 코디네이터(`/workspaces`·`/new`·`/status`·`/help`), 프로젝트 토픽은 워크스페이스에 결속되며 승인은 인라인 버튼(콜백은 승인 ID만, 판정은 코어)이다. 메시지는 마크다운을 Telegram HTML로 바꿔 보낸다(`markdown.ts` — b·i·s·code·pre·a·blockquote 화이트리스트, 모든 텍스트 이스케이프, 코드·표·인용·본문 단위로 나눠(표는 폭에 따라 접히는 고정폭 대신 행마다 블록 — 열이 둘이면 `첫열 — 둘째열` 한 줄, 셋 이상이면 첫 열 굵게 + `머리글: 값` 줄) 조각마다 태그가 닫히게 4096 안으로 분할, 변환·서버 해석이 실패하면 평문). 명령 안내는 명령 한 줄에 하나(`/명령 <인자> — 설명`)다. 실행 중에는 진행·시작 메시지를 보내거나 고치지 않고 그 토픽에 `sendChatAction typing`을 약 4초마다 보내 입력 중 표시를 유지하며(대기·승인 대기 중에는 멈추고, 대기열에서 기다리게 되면 대기 한 줄만 보낸다), 끝나면 최종 답변을 새 메시지로 보낸다(작업 ID는 최종·실패 메시지와 `/queue`·`/status`에 있다). `/명령@봇이름`은 이 봇(getMe의 username)을 가리킬 때만 처리하고 다른 봇을 가리키면 응답하지 않는다. offset은 처리 뒤 저장하고 장기 무수신 뒤에는 생략한다. 기본 실행자(`runner.ts`)는 체인(`pace agent run --chain`)·ACP 훅·취소 신호를 결선한다. Gateway(`gateway.ts`)는 127.0.0.1 로컬 WebSocket + 토큰(`PACE_HOME/secrets/gateway-token`, 소지자=기기 관리자)·Origin 거부. `install`은 체인(`default`)이 없으면 `pace agent setup`을 이어서 실행하고, 대화형에서만 기기 이름(기본은 컴퓨터 이름)·Telegram(봇 토큰 → getMe로 봇 확인 → 그룹에 보낸 메시지에서 getUpdates로 포럼 chat id·허용 사용자 ID 후보를 찾아 확인받아 저장, webhook이 걸려 있으면 원인 안내, 수동 입력도 가능)·워크스페이스(현재 폴더가 git 저장소면 기본 제안, 이미 등록된 것은 건드리지 않음)를 묻고, 관리자 권한 없이 Windows는 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`의 `PACE Daemon` 값(콘솔 창 없는 VBS 런처 `PACE_HOME/daemon-launch.vbs`)·macOS는 사용자 launchd(`io.pace.daemon`)로 로그온 자동 실행을 등록한다 — `--yes` 또는 터미널의 `[y/N]` 확인 없이는(표준 입력이 TTY가 아니면 `--yes`만 인정) 계획만 출력하고 아무것도 실행하지 않는다. 등록 뒤에는 지금 시작할지 묻고(비대화형은 `--start`), 이미 실행 중이고 설정이 바뀌었으면 `stop` 뒤 `start` 재시작을 안내한다. `pace daemon start`는 등록과 같은 방식(Windows wscript 숨김 VBS, macOS launchctl)으로 지금 백그라운드 기동하고 `run`은 포그라운드로 남는다. `pace install`(재설치)은 이 기기에 등록이 있을 때만 등록 경로를 새 설치본으로 바꾼다. Claude 구독 상시 자동 실행의 약관 범위는 캡틴이 확인했다(2026-11-12). 한계: Windows는 자손 회수를 증명하지 못해 강제 종료 뒤 격리가 남을 수 있다. 이벤트 스트림(`text_delta`·`tool`·`plan`)은 비밀 제거 없이 받은 조각 그대로 전달한다(사용자 결정, 후속 과제). 실제 봇·하루 상시 실행은 사람 확인 항목 |
| 기회 탐색 | `src/scout/` | TypeScript | `pace scout` — 탐색 실행 폴더(main이면 `backlogs/`, 아니면 `$PACE_HOME/scout/`), 출처 수집(`fetch`·`add`), 보고서 렌더(`render`, schema·템플릿은 `templates/scout/`), 아이디어 카드(`card`), 증명 검사(`verify`), 브라우저 자막 추출(`transcript` — `orca`·`agent-browser`를 인자 배열로 실행). 스킬 pace-scout의 기계적 일 |
| 의도 파악 기획 | `src/intent/` | TypeScript | `pace intent` — 렌즈 형식 검사(`lint`)와 렌즈 머리말에서 `references/INDEX.md` 다시 만들기(`index`). 인계 문서(BACKLOG·BR·PROJECT) 빈 칸·필수 절 검사(`check`). 기능·화면 설계 문서: `docs/plan.json` → 연결 계산·증명 검사·HTML(`render`·`verify`, 템플릿은 `skills/pace-intent/templates/<종류>/` 폴더 — 추가는 폴더만), Canvas 제품 프레임 이미지 미리보기 생성·출처 검사(`preview`·`preview --verify`), 템플릿 예시 다시 만들기(`examples`). 스킬 pace-intent의 기계적 일 |
| 워크스페이스 등록부 | `src/project/workspace-registry.ts`, `src/project/agent-definition.ts` | TypeScript | `PACE_HOME/projects/` 후보·활성 워크스페이스와 `.pace/AGENT.md` 정의(`pace_agent_version: 2`) 연결. Git worktree 관리는 기존 작업 하네스 책임 |
| OPAL 가져오기 | `src/project/adopt-opal.ts` | TypeScript | `pace adopt opal [--cwd <폴더>] [--apply]` — 기본 미리보기, `--apply`는 계획을 다시 만들어 같을 때만 `.opal/`→`.pace/` `git mv`·AGENT 표지 변환(`opal_agent_version`→`pace_agent_version`, 본문 `.opal/`→`.pace/`)·`workspace_id` 승계 등록, 알려진 OPAL 커밋 게이트 훅 교체(원본 `commit-msg.opal-backup`)·OPAL 공용 대시보드 진입점의 PACE 공용 참조 전환, `AGENTS.md`·`CLAUDE.md`·`docs/**`의 `opal` 참조는 `파일:줄`로 보고만 한다. 저장소 안 경로만 다루며(링크 거부) 실패하면 이번에 바꾼 것만 되돌린다. OPAL 홈 프로필은 옮기지 않는다. 사용자 절차는 README.md의 "OPAL에서 넘어올 때" |
| 설치 | `src/setup/`, `scripts/install.sh`, `scripts/install.ps1`·`install.cmd` | TypeScript·sh·PowerShell | 훅·대체 규칙·스킬 등록, `pace onboard`. 데이터는 `PACE_HOME`, 설치본·명령·`install.json`은 사용자 홈 `~/.pace`. 스킬은 `.pace-managed` 표지가 있는 것만, 훅·블록은 PACE 부트 명령·PACE 표지가 있는 것만 바꾸고 다른 사용자 훅·스킬은 그대로 둔다. 고친 설정 원본은 `~/.pace-install-backup-<시각>-<임의값>/`에 둔다. Antigravity IDE의 공식 전역 훅은 CLI와 공유하는 설정 경로에 있어 CLI에서도 로드될 수 있으며 CLI 지원 검증을 뜻하지 않음 |
| 스킬 | `skills/` | Markdown (Agent Skills) | pace-onboarding · pace-memory · pace-brain · pace-project-init · pace-project-dev(프로젝트·태스크 워크플로우) · pace-prompt · pace-scout(링크·주제에서 사업 아이디어 탐색 보고서) · pace-intent(요청의 목적 파악·인터뷰·기획·인계, 본문 영어·출력 한국어) · pace-tech-handbook(언어별 교본, 라이선스 확인된 원문만) · pace-canvas-skills(Canvas Studio 배포 묶음 2.0.1, 본문·해시 봉인 — canvas-read·canvas-wireframe 두 스킬, 묶음 통째 설치) · html-plan(대화형 HTML 계획, 외부 원본) |
| 플레이북 생성기 | `skills/pace-playbook-maker/`(`SKILL.md`, `references/{schema,adapter,playbook-making,driving,healing}.md`, `tools/*.mjs`) | Markdown + Node `.mjs` 도구(무빌드·런타임 의존성 없음) | 목표 하나를 받아 인터뷰 → 실제 수행·가림 캡처(사람이 확인한 해시로만 승인) → **플레이북**(업무 스킬 한 벌: `SKILL.md` + 에이전트 지도 `agent/` + 학습 이력) 생성(`interview`·`scaffold`·`orca-adapter`·`playbook`·`build`). 주행 라이브러리 `driver`(승인 관문·지도 최신 확인·결과 불명 처리·재개·값은 `sink`로만)와 자가 복구·학습 `healer`·`heal-web`(허용 경로만 고치고 검증·회귀·사용자 확인 뒤 원자적 반영·되돌리기). 규약 문서는 주행 규약 v1(`driving.md`)·복구 규약 v1(`healing.md`) — 플레이북은 규약을 복사하지 않고 경로·버전만 적는다. 테스트는 `test/playbook/`(래퍼 `test/playbook-maker.test.ts`, Orca 실제 브라우저 e2e 포함). 설치되는 스킬은 `pace-playbook-maker` 하나이고 만든 플레이북은 업무 저장소에 둔다 |
| 템플릿 | `templates/RULES.md`, `templates/profile/`, `templates/brain/`, `templates/project/`, `templates/backlog/`, `templates/scout/` | Markdown·YAML·JSON·HTML | 시스템 운영 규칙(부트가 직접 읽음), 프로필·브레인·프로젝트(PROJECT·TASK·마감·E2E 시나리오) 원본 |
| 테스트 | `test/` | `node:test` | 단위·CLI. E2E 프레임워크 없음 — 실측은 태스크 `evidence/` |
| 비밀 탐지 | `scripts/secret-scan.ts` | TypeScript | 커밋될 파일의 비밀 원문 탐지 |

## 환경

| 구분 | 명령 / 값 | 확인 |
|---|---|---|
| 런타임 | Node.js 24 이상 (로컬 24.22.3) | ✅ 2026-11-19 |
| Windows 에이전트 | OS 기본 Windows PowerShell 5.1과 .NET Add-Type이 필요하다. 감시자 프로세스에만 실행 정책 Bypass를 적용하며 그룹 정책이나 제한 언어 모드가 준비를 막으면 에이전트를 실행하지 않고 오류를 안내한다 | Windows 실측 |
| 설치 | `npm install` (devDependencies만) | ✅ |
| 검사 | `npm run check` — `tsc` 타입 검사 + Node 테스트; Windows는 파일 동시성 4, macOS·Linux는 Node 기본 동시성을 사용. 명시 변경은 `npm test -- --test-concurrency=2` | ✅ 2026-11-19 · P004 T03 전체 5회 연속 실패 0 |
| 보안 검사 | `node scripts/secret-scan.ts` — 커밋될 파일(추적 + 무시되지 않는 새 파일)의 비밀 원문(제외: 교본 원문 예시 파일 5개, 테스트 파일의 가짜 값(별도 이유 표기), 대시보드 data.js는 JSON을 풀어 값별 검사(코드 파일 키만 표현식 완화), Canvas 묶음 2.0.1의 JS 오탐 5개는 정확한 경로와 SHA-256이 일치할 때만 제외) | ✅ 2026-10-23 |
| worktree 준비 | `npm ci --no-audit --no-fund` (새 worktree에 `node_modules`가 없어 `tsc`가 없다. 취약점 조회는 main과 같은 잠금이라 생략 — `의존성 감사`가 맡는다) | ✅ 2026-11-13 |
| 의존성 감사 | `npm audit --omit=dev` (finish가 잠금 파일이 base 대비 바뀐 브랜치에서만 실행. 런타임 의존성 0이라 보통 생략된다) | ✅ 2026-11-13 |
| 실행 | `./bin/pace.ts <명령>` (`pace --help`) | ✅ 2026-11-15 (`pace --help`) |
| 설치(PC) | `bash scripts/install.sh` · `scripts\install.cmd` · 원격 Windows `irm …/scripts/get.ps1 \| iex`(ASCII 입구 — BOM 있는 install.ps1을 임시 파일로 받아 `-File` 실행) | ⬜ 실제 사용자 홈 설치 미확인 |
| 선택 검사 | `pace test file <경로>` · `pace test unit <id>` · `pace test all` — 단위 구성 `.pace/test-map.json`, 부분 검사는 전체 회귀를 대체하지 않음 | |
| 테스트 위치 | `test/*.test.ts` (임시 `PACE_HOME`·TMP, `PACE_PROFILE` 제거, 세션 환경 변수 격리 — `test/helpers.ts` `sessionFreeEnv`) | |
| E2E | 프레임워크 없음 — 실제 도구 세션·임시 저장소 실측을 태스크 `evidence/`에 기록 | |
| 환경변수 | `PACE_HOME` (기본 `~/.pace`), `PACE_PROFILE` (기본 프로필 대신) | |

신규 AGENT의 `<!-- pace:profile-heading -->` 바로 다음 자동 표제는 부트 전달 시 현재 프로필 이름으로 표시하고 예약된 관리 주석만 단독 행이면 본문 어디에서든 전달하지 않는다. 원본 파일은 변경하지 않으며 표지가 없는 기존 정의와 표지를 제거한 사용자 정의 표제는 그대로 전달한다.

테스트는 프로세스마다 소유한 임시 루트를 만들고 정상 종료와 일반적인 테스트 실패 뒤 정리한다. 자식 프로세스는 임시 경로를 상속하며 helper를 불러오는 자식은 독립 루트를 소유한다. 테스트가 비동기 자식을 직접 만들면 `spawnTestChild`로 생성하거나 `registerTestChild`로 등록해 종료를 기다린다. 제한 시간에 끝나지 않거나 예외·명시 종료 시 등록 자식이 아직 살아 있으면 해당 루트를 보존하고 실패로 보고한다. 등록하지 않은 임의의 자식은 자동으로 관리하지 않는다. 디버깅할 때만 `PACE_KEEP_TEST_TMP=1 npm test`로 보존하며, SIGINT·SIGTERM·SIGHUP, 강제 종료 등 정리 훅이 실행되지 않는 경우와 같은 사용자 권한 프로세스가 검사와 삭제 사이 경로를 동시에 교체하는 경우의 원자성은 보장하지 않는다.

개발·테스트에서는 `PACE_HOME`을 임시 폴더로 지정한다. `~/.pace`는 설치 때 복사한 설치본이다(코드 `~/.pace/app/`, 스킬은 각 도구 폴더에 복사본). 소스를 고친 뒤에는 `bash scripts/install.sh`로 다시 설치해야 반영된다.

## 화면 기획과 Canvas

화면이 필요한 백로그는 pace-intent가 IA와 화면 ID를 정리해 canvas-wireframe에 맥락을 전달하고 BR과 `docs/canvas/` 산출물을 연결한다. 화면이 없으면 BACKLOG의 `## 확정된 결정`에 생략 이유를 남긴다. `docs/plan.json`의 IA·흐름·상태와 명시적 연결은 의미 정본, Canvas는 시각 정본이며 HTML은 렌더된 뷰다. 자동 왕복 동기화는 없으며 변경 시 화면 ID로 대조해 동기화한다. 기존 Canvas 덮어쓰기는 해당 파일에 대한 명시적 허가가 필요하다. 기존 문서의 소급 이전은 요구하지 않는다.

## 백로그 대시보드

공통 화면·스타일·레이아웃 정본은 `src/dashboard/backlog/`다. 설치 시 PACE app에 포함되며 각 프로젝트 화면은 실행한 PACE 패키지의 공용 자산을 file URL로 불러온다. 설치 CLI로 생성하면 설치본을 참조한다. 화면을 고쳐 PACE를 업데이트하면 공용 참조를 쓰는 프로젝트 화면도 새로고침 시 같은 코드를 사용한다. 프로젝트에 JS/CSS를 복제하지 않는다.

PC 경로는 커밋되는 파일에 두지 않는다. 진입 HTML `backlogs/README.html`(표지 `pace:backlog-shared:2`)은 모든 PC에서 같은 바이트이고 `dashboard/data.js`와 `dashboard/local.js`만 읽는다. `backlogs/dashboard/local.js`는 이 PC의 공용 자산 file URL을 담아 CSS를 붙이고 core → app 순서로 실행하는 PC별 파일이며, init이 함께 만드는 `backlogs/dashboard/.gitignore`(커밋)로 Git에서 빠진다. local.js가 없으면(새 clone·worktree) 화면은 `pace backlog init` 안내를 보이고, 다음 refresh·하네스 자료 갱신이나 init이 만든다. refresh는 수정하지 않은 v2 진입점이고 제외가 이미 될 때만 local.js를 맞추며 Git 변경을 새로 만들지 않는다. 안전 경계: 제외는 `backlogs/dashboard/.gitignore`가 실제로 빼는지(`git check-ignore -v` 출처, 부정 규칙 아님)로 판단해 이 PC에만 있는 규칙에 기대지 않고, 기존 .gitignore는 고치지 않으며(맞지 않으면 init 실패), Git이 추적 중인 local.js나 사용자가 고친 local.js(URL 줄만 다른 생성본이 아님)는 쓰지 않고, 부분 실패는 이번에 쓴 파일만 되돌린다. 설치본 file URL을 직접 담은 v1 진입점(`pace:backlog-shared:1`)은 수정하지 않은 생성본일 때 init이 v2로 바꾸며, 이 한 번의 HTML·.gitignore 변경은 사용자가 커밋한다. init은 자동 add/commit을 하지 않으며 하네스의 초안·미커밋 변경 보호를 우회하지 않는다.

프로젝트별 생성 자료는 `backlogs/dashboard/data.js`에 둔다. 이 경로는 기존 Git 인덱스·자동 커밋 정책을 유지한다. 원본 문서를 직접 편집한 뒤 `pace backlog refresh`로 자료를 갱신하며 화면 새로고침은 이미 생성된 자료만 다시 연다. 자료 수집의 Git ignore/info-exclude·민감/숨김·symlink·크기 제한과 실패 시 snapshot 보존 규칙은 유지한다.

opi 신규·기존·최신화 마무리는 `pace backlog init`을 실행한다. 새 프로젝트에는 진입 HTML·자기 자료·`.gitignore`와 이 PC의 local.js만 생성한다. PC/PACE 설치 경로가 바뀌면 init이 local.js만 다시 쓴다 — 커밋되는 파일은 바뀌지 않는다. 공용 참조가 아닌 기존 화면은 바이트를 보존하고 전환하지 않았음을 알린다. 추가 사용자 파일은 제거하지 않는다.

Git 작업 트리 안에서는 상위 저장소 루트를 사용하며 없으면 현재 폴더에서 git init한다. Git 실행/조회 오류는 부재로 오인하지 않는다. HOME/파일시스템 루트 자체는 새로 초기화하지 않는다. 자동 add/commit/remote/push는 하지 않는다. 생성 실패 후 새 .git은 보존하고 재시도 방법을 알린다. unborn 상태에서도 대시보드 생성·갱신·조회는 가능하지만 new/brief와 프로젝트 하네스는 첫 commit/main 조건이 필요하다.

refresh는 기존 완성 대시보드만 갱신한다. 완전 부재는 init 안내 후 건너뛰고 부분 상태는 기존 파일을 보존해 복구 안내 오류를 낸다. 저장소 개발용 대안은 node scripts/backlog-dashboard.ts이며 설치본에는 scripts가 포함되지 않는다. 조회 PC에는 PACE 설치본이 필요하고 별도 웹서버는 사용하지 않는다.

각 BACKLOG.md의 `- 프로젝트 기준 경로: projects/`는 저장소 루트 기준이며 생략하면 같은 기본값을 쓴다. 보관 시 projects/backup/으로 한 줄을 바꾸며 backlogs/backup/BL…/으로 백로그를 이동해도 목록·ID·태스크·자료 연결은 유지한다. 이동 전 상대 링크는 조회 시 대응하며 원문은 일괄 재작성하지 않는다.

`skills/pace-canvas-skills/`는 Canvas Studio 배포 폴더(2.0.1) 전체이며(본문·배포 식별자·해시는 봉인 — 폴더 이름만 PACE) 루트에 SKILL.md가 없다. 설치기는 복사 전에 `manifest.json`의 파일 목록·SHA-256이 폴더와 정확히 같은지 읽기만으로 대조하고(어긋나면 설치 전체를 멈춘다), 묶음을 `~/.pace/app/skills/pace-canvas-skills/`로 통째 교체해 낡은 파일을 남기지 않는다. 각 도구 스킬 폴더에는 `canvas-read`·`canvas-wireframe` 입구(SKILL.md + `.pace-managed`)만 설치하며 본문은 설치본 정본의 절대 경로를 가리킨다. PACE 관리 표지(`.pace-managed`)가 없는 같은 이름 입구는 보존된다. 비밀 검사는 묶음 JS 5개의 오탐을 경로+SHA-256 일치일 때만 제외한다.

## 작업 프로세스

문서 템플릿은 개발 업무의 예시다. 업무별 형식·추적과 명령용 최소 구조는 [문서 형식과 추적](../skills/pace-project-dev/references/document-shape.md)을 따른다.

독립 검토는 [목표 대조 절차](../skills/pace-project-dev/references/goal-review.md)의 첫 판단을 받은 뒤 작업 문서를 대조한다. 마감의 목표 달성 판정은 기준 대조와 별도로 남긴다.

- 관리 방식: 백로그(기획) + 프로젝트(실행)
- 백로그: `backlogs/BL{YYMMDD}_{NN}_{이름}/BACKLOG.md`·`BR{NN}_{이름}.md`. 백로그 → 프로젝트, 브리프(영어 brief) → 같은 번호 태스크. `pace backlog new·brief`로 만들고 `pace project new --from <BL 폴더 또는 앞부분>`으로 착수한다. 상태 원본은 BR 파일, BACKLOG.md 현황 표는 함께 갱신한다(`done` 자동). BACKLOG.md 전체 상태는 start 성공 시 진행, worktree 프로젝트는 실제 merge 성공 시 완료, main 직접 프로젝트는 finish 성공 시 완료로 갱신한다. 전체 백로그가 보류면 자동 전환을 거부하고 개별 보류 BR은 그대로 둔다. 보류 해제는 사용자가 결정해 백로그 원본을 갱신하고 대시보드를 새로 생성한 뒤 명령을 다시 실행한다. 마감 때 BR·태스크·현황의 번호와 완료/보류 상태가 일치하지 않으면 멈춘다. 완료 백로그에는 덧붙이지 않고 새 백로그 또는 메모리 `idea`로 발의한다.
- 프로젝트: `projects/P{NNN}_{YYMMDD}_{이름}/` — `pace project new·start·task·check·done·finish·merge·stats`, 절차는 `pace-project-dev` 스킬.
- 브랜치: 작은 일(버그·문구·단발 수정)은 main 직접 커밋. 프로젝트는 worktree(`../ai-framework.wt/P###`, 브랜치 `project/P###`). Orca 안이면 start가 작업자 세션을 띄우고 main 세션이 코디네이터
- 지표: `pace project stats P### [--json]` — 프로젝트·태스크 시간, 도구별 토큰, 게이트 실패, 리뷰 지적 수·개선 후보. main에서도 소유 worktree를 조회한다. `projects/P###_…/log.jsonl`은 커밋하는 사건 기록(`{ts,p,t?,type,by,msg,ok?,src?,ref?,data?}` — 시간대 포함 ISO·작성자 cli/agent/coordinator/user·짧은 메시지·수치 data)이며 기록 오류는 명령을 막지 않는다. finish·merge는 프로젝트의 `METRICS.md`(프로젝트 기준·태스크 기준·태스크 밖 집계)와 `projects/METRICS.md`(비교표)를 자동 생성한다. PROJECT-CLOSE `## 지표`는 METRICS.md 링크와 에이전트 해석 1~3줄이며 누락 시 finish 실패. 개선 후보를 메모리·브레인으로 올릴지는 사람이 고른다
- 새 태스크의 `사전 검토: v1`은 `PRE-REVIEW.json`의 마지막 판정·대상 해시·증거를 check/done/finish에서 확인한다. 작성법과 교차 대체 조건은 `skills/pace-project-dev/references/reviewer.md`의 사전 검토 기록 v1을 따른다. 과거 마커 없는 태스크는 기존 방식이며, 마커와 기록 삭제·허위 기록 우회 및 검토 의미·실제 선행 시점은 기계가 보증하지 않는다.
- 사건 작성: `pace project log P### [T##] --type decision|change|review|question|answer|escalation|note --msg "한 줄" [--src "사용자 결정|main 판단|자체 판단"] [--ref 프로젝트의_상대파일] [--by agent|coordinator|user]`. decision/change는 PROJECT 결정 표도 자동 반영하므로 손으로 두 번 쓰지 않는다. review 메시지는 `tester pass blocking 0 should_fix 0` 또는 `reviewer fail blocking 1 should_fix 2`처럼 판정·지적 수를 적는다. start는 도구·선택 출처·launch 결과 및 PROJECT 출처 기반 착수 결정을, merge는 사용자 승인·커밋 수를 함께 기록한다. 출력 원문·세션 내용·코드 diff·비밀은 남기지 않는다
- 대기 구분: 질문·에스컬레이션→같은 태스크(또는 프로젝트)의 답변까지 구간을 겹침 없이 합쳐 질의 대기로 보고 러닝 시간에서 빼 작업 경과를 계산한다. finish→merge(미병합이면 조회 시각)는 병합 승인 대기다. 결정/변경/리뷰 사건 수는 log 도입 후 기준이고 미도입 태스크의 리뷰 등급은 TASK-CLOSE로 보완한다. 착수는 출처(백로그 지시·확정된 대화)를 결정으로 기록하고 승인 대기 없이 바로 수행한다. 과거 계약 승인 사건은 기존 지표에서 계속 읽는다
- 측정 범위: 사건 시간 우선, 과거 기록은 git author 시각 근사(rebase가 바꾸는 committer 시각은 쓰지 않음). 태스크 토큰 구간은 Codex [착수, done], Claude/Gemini (착수, done], 진행 중은 조회 시각까지. Claude 주/서브 세션, Codex rollout별 첫 메타로 세션을 고정한 마지막 누적값−착수 전 마지막 누적값(없으면 0), Gemini 메시지별 수치를 읽기만 한다. 계정별 홈·설정 경로·Orca Codex 홈을 찾고, 기록 없는 도구는 상세 METRICS.md에서 행을 생략한다. 작업자는 PROJECT 헤더 worktree 경로(삭제 후에도 문자열 귀속), 코디네이터는 main 경로의 start→merge 구간으로 따로 집계하며 같은 시간의 다른 대화 혼입 가능성이 있다. 캐시·추론은 도구마다 의미가 달라 필드를 더해 공통 총량을 만들지 않는다. 파일 삭제·형식 변경에 따라 일부 사용량은 빠질 수 있다
- 선언 명령: `검사`·`보안 검사`·`worktree 준비`·`의존성 감사`는 실행 전에 명령을 출력한다. `의존성 감사`(선택)는 finish가 보안 검사 뒤, 잠금 파일(`package-lock.json`·`pnpm-lock.yaml`·`yarn.lock`·`poetry.lock`·`uv.lock`·`Cargo.lock`·`go.sum` 등)이 base 대비 바뀐 브랜치에서만 실행하고 실패하면 멈춘다 — 같은 잠금을 다시 조회하지 않는다. 기존 패키지의 새 취약점은 main 주기 점검이 맡는다(하네스 밖). worktree 선언이 main과 다르면 main 선언을 쓰며 차이를 알린다. main에 선언이 없으면 worktree 선언을 사용한다. 명령이 부르는 작업본 스크립트까지 격리하는 기능은 아니다.
- 병합: finish(worktree) → main에서 사용자 승인 뒤 `pace project merge` — rebase 뒤 fast-forward, 태스크 커밋 유지. 미리보기는 환경 선언 변경과 worktree 제거 때 함께 지워질 무시 항목(무시된 폴더는 한 줄, 낱개 파일은 이름 — 앞 20곳·총수)을 보여 준다. 설치(`bash scripts/install.sh`)는 병합 뒤 main에서만
- 상태 값: 태스크·브리프 대기 · 진행 · 완료 · 보류 / 프로젝트 정의 · 진행 · 병합 대기 · 완료
- 진행 상황·이슈·할 일: 프로젝트 메모리 (`pace memory list --project`)
- 결정의 이유·실측 결과·함정: 프로젝트 브레인 (`.pace/brain/`) — 백로그가 닫혀도 남길 지식
- 커밋 게이트: start가 저장소 git 내부에 PACE commit-msg 훅(`# PACE commit gate v1`)을 멱등 설치한다. 사용자 훅·링크·외부 또는 상대 hooksPath는 덮어쓰지 않고 경고한다. project/P### 브랜치의 `(P###/T##)` 태그마다 check 실패 시 커밋을 거부한다. pace 부재는 경고 후 허용한다. 훅 검사는 로그를 쓰지 않는다. finish는 완료 태스크의 태그 커밋 존재를 확인하므로 무태그 우회 이력도 마감에서 드러난다.
- 커밋: 메시지는 한국어 `type(범위): 요약`, 태스크는 `feat(P###/T##): …`

## 보안

민감 경로 — 설계에서 건드리면 PROJECT.md 보안 영향에 적고, 그 태스크 reviewer가 보안 관점을 먼저 본다. 테스트는 실패 경로(거부·오류)까지.

| 경로 | 왜 민감한가 |
|---|---|
| `src/setup/`, `scripts/install.*` | 사용자 홈의 도구 설정(`~/.claude`·`~/.codex` 등) 쓰기·백업·삭제 |
| `src/boot.ts`, `src/project/situation.ts` | 모든 세션 시작 경로 — 오류·지연이 세션을 막으면 안 된다(종료 코드 0, git timeout) |
| `src/core/fsutil.ts` | 원자적 파일 교체와 실패한 임시 파일 정리 — 이 호출이 만든 파일만 정리 |
| `src/test-runner/` | 경로·glob·실경로와 실행 대상을 검사, 고정 Node·Python·vitest 어댑터만 인자 배열로 실행(vitest는 프로젝트 루트 안의 로컬 `node_modules/vitest`만 — 사용자 의존성 코드를 실행한다). 작업본 구성은 선택 범위 증거이며 사용자 코드 실행을 격리하지 않음. 테스트 코드는 결과 채널을 조작할 수 있으므로 신뢰한 코드만 실행하고 결과를 보안 증거로 취급하지 않음. `all`은 신뢰한 저장소의 검사 선언을 셸로 실행 |
| `src/project/backlog.ts`, `harness.ts` (new·done) | BL·BR·BACKLOG 파일 생성·기존 문서 상태 쓰기 — 실제 경로의 backlogs 포함 확인·외부 링크 거부·검증 후 쓰기, git 이력으로 복구 |
| `src/project/harness.ts` (merge·finish·start) | git 병합·브랜치 삭제·rebase, 파일 이동·덮어쓰기, 정의서에 선언된 명령을 `sh -c`로 실행(검사·보안 검사·worktree 준비·의존성 감사), Orca 작업자 세션 실행(`launchWorker`) |
| `src/scout/**` | 외부 URL 읽기(사용자가 준 링크·검색 결과, GET·시간 제한·크기 상한), 받은 콘텐츠를 HTML로 렌더(모두 이스케이프, 스크립트 실행 경로 없음), 실행 폴더 안에만 쓰기 |
| `src/intent/**` | 스킬 폴더 안 파일 읽기·`INDEX.md` 쓰기(references·렌즈 폴더 심볼릭 링크 거부, 렌즈는 일반 파일만 읽음, 형식 문제가 있으면 쓰지 않음). `render`는 사용자 데이터(plan.json)를 HTML로 — 데이터는 JSON 블록에만(`<`·U+2028/9 이스케이프), 화면은 텍스트 노드로만, 링크는 문서 ID와 http(s)만, 외부 스크립트·폰트 없음. `verify --root`는 근거 경로가 root 밖이면 실패로 본다. `preview`는 OUT 안의 Canvas를 스냅숏으로 읽고 묶음 도구를 인자 배열로 실행하며 소유·해시를 확인한 결과만 교체하고 실패 시 복원한다; `preview --verify`는 원본·파생물 해시를 확인한다. 경로의 동시 교체에 대한 원자성은 보장하지 않는다. |
| `src/memory/`, `src/profile/`, `src/project/brain.ts` | 사용자 파일 쓰기(`PACE_HOME` 프로필·메모리, 저장소 `.pace/` 메모리·브레인) — 경로가 해당 폴더 밖으로 나가지 않게 |
| `skills/pace-playbook-maker/tools/` | 실제 서비스 화면·응답의 값을 읽고 캡처·승인·지도·실행 기록·이력을 쓴다 — 값 비기록(쓰기 전 민감 형식 검사), 가림 fail-closed(추출 값의 다른 노출 위치 검사 포함), 승인은 단계·행동·원본 해시와 계정·업무에 결속, 되돌릴 수 없는 행동은 수행 전 기록·조회로 판정(중복 0), 복구 반영은 저널로 원자적 |

체크리스트: `pace-project-dev` 스킬 `references/security.md`의 기본 체크리스트 + 위 민감 경로. 셸 실행은 인자 배열(`spawnSync`) — 예외는 정의서에 선언한 명령의 `sh -c` 실행과 Windows 온보딩의 LLM CLI 실행(`src/setup/onboard.ts`, `shell: win32`), 비밀 값은 환경 변수 이름만, 테스트는 실제 사용자 홈·Orca·도구 설정을 건드리지 않는다.

## 문서

| 문서 | 설명 | 용도 | 적용 범위 | 참조 시점 |
|---|---|---|---|---|
| `AGENTS.md` | 일하는 법 요약과 길 안내 | — | 전체 | 항상 (자동) |
| `docs/README.md` §보안 | 민감 경로와 보안 체크리스트 | security | `src/setup/**`, `scripts/**`, `src/boot.ts`, `src/core/fsutil.ts`, `src/project/**`, `src/memory/**`, `src/profile/**`, `src/scout/**`, `src/intent/**` | 작업 시 |
| `README.md` | 소개·설치·사용·OPAL에서 넘어올 때 (사용자용) | — | — | 요청 시 |
| `skills/pace-project-init/references/` | 정의서·백로그 형식, 분석 방법 | convention | `docs/**`, `backlogs/**`, `skills/pace-project-init/**` | 작업 시 |
| `skills/pace-project-dev/references/` | 테스트·E2E·리뷰·보안 기준 | test | 전체 | 작업 시 |
| `.pace/brain/` | 결정과 이유, 도구별 훅 동작, 설치 함정 (`pace brain search`) | — | — | 작업 시 |
| `docs/ARCHITECTURE.md` | 구성과 주요 실행 흐름 | architecture | `src/**`, `bin/**`, `skills/**`, `templates/**` | 작업 시 |

## 용어

브레인의 LLM Wiki 용어: ingest=추가 · query=질의 · lint=점검 · file back=되적립 · stale claims=낡은 주장.

| 용어 | 뜻 |
|---|---|
| 프로필 | 독립 에이전트 하나 (`PACE_HOME/profiles/<이름>/`, 기본 `~/.pace`: SOUL·USER·메모리·스킬·설정. 운영 규칙 RULES는 모든 프로필 공통) |
| 부트 | 세션 시작 훅이 `pace boot`로 에이전트 정의·메모리·상황을 주입하는 것 |
| 대체 규칙 | 훅이 동작하지 않는 도구에서 `pace boot`를 실행하게 하는 지침 한 줄 (Codex·Gemini·Cursor) |
| 상황 | 세션을 연 위치: PACE 프로젝트 / 정의 없음 / 새 프로젝트 / 프로젝트 밖 |

작업자 모델·effort는 `pace worker show`, `pace worker set <도구> <model|effort> <값>`, `pace worker reset <도구> <model|effort>`로 관리한다. 설정은 `PACE_HOME/worker-settings.json`에 저장되며 설치본 교체와 독립적이다. `project start --model ... --effort ...`는 해당 실행에서 우선하고 `--effort default`는 도구 기본값을 선택한다. 초기 모델은 Codex `gpt-6.1-sol`, Claude `claude-opus-5-5`이며 effort는 도구 기본값이다.

