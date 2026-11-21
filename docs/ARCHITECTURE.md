# PACE 아키텍처

> PACE 0.1.1.

## 실행과 구성

`bin/pace.ts`에서 `src/cli.ts`로 진입해 명령을 분기한다. Node.js에서 TypeScript를 직접 실행한다. 근거: `bin/pace.ts`, `src/cli.ts`, `package.json`.

데이터 루트는 `PACE_HOME`(기본 `~/.pace`, `src/core/paths.ts`), 프로필 선택은 `PACE_PROFILE` → 기본 프로필(`src/profile/profile.ts`)이고 메모리 명령은 `--profile`로 대상을 지정한다. 저장소 메타데이터는 `.pace/`(`AGENT.md`의 `pace_agent_version: 2`, 메모리, 브레인)이다.

| 영역 | 경로 | 책임 |
|---|---|---|
| 공통 | `src/core/` | 경로, 파일, frontmatter 등 공통 기능 |
| 부트 | `src/boot.ts` | 프로필·메모리·프로젝트 맥락을 모아 호스트 형식으로 출력 |
| 프로필·메모리 | `src/profile/`, `src/memory/` | 프로필과 메모리 저장·조회 |
| 프로젝트 | `src/project/` | 작업 하네스, 브레인, 워크스페이스, 대시보드 |
| 에이전트 | `src/agent/` | 에이전트 호출 계약과 실행기, 체인, ACP 실행 훅(이벤트·권한·MCP·맥락·이어가기) |
| PACE 도구 서버 | `src/mcp/` | `pace mcp` — 워크스페이스·접근 권한을 고정한 stdio MCP 서버(메모리·프로젝트·백로그·브레인) |
| 기획 도구 | `src/intent/`, `src/scout/` | plan의 의미 연결 검사·비와이어프레임 HTML 렌더와 보고서 처리; Canvas 제품 프레임을 이미지 미리보기로 생성하고 출처·해시를 검증하며 예전 wireframe HTML은 명시적 호환 렌더 |
| 설치 | `src/setup/`, `scripts/` | 훅·스킬 설치와 환경 작업 — 스킬 묶음(`skills/pace-canvas-skills/`, 본문·해시는 Canvas Studio 배포본 그대로)은 manifest 해시 대조 뒤 app에 통째로 올리고 도구 폴더에는 하위 스킬 입구만 둔다. 설치·제거는 `.pace-managed` 표지가 있는 스킬, PACE 부트 명령을 가리키는 훅, PACE 표지 블록만 바꾼다 |
| 지침·템플릿 | `skills/`, `templates/` | 에이전트 절차와 생성 문서 원본 |
| 플레이북 | `skills/pace-playbook-maker/` | 목표 → 인터뷰 → 수행·기록 → 플레이북 생성, 지도(`agent/`)를 읽고 도는 자율 주행 라이브러리, 변경을 진단·검증·반영하는 자가 복구·학습 — 무빌드 `.mjs` 도구와 규약 문서(주행 v1·복구 v1). 설치 스킬은 하나이고 만든 플레이북은 업무 저장소가 갖는다 |

근거: `docs/README.md` 구성 요소(모듈별 상세는 문서 표의 서브 문서), 각 경로 및 `src/cli.ts` import.

## 대표 흐름

- 세션 시작: CLI의 boot 분기 → `src/boot.ts`가 프로필·메모리·프로젝트를 조회 → 호스트에 맞는 훅 출력. 부트 실패가 세션 시작을 막지 않는 계약은 `AGENTS.md`에 있다.
- 프로젝트 마감: `src/project/harness.ts`가 정의서의 검사 명령을 실행하고 통과 시 병합 대기로 전환한다. 명령 선언 경계는 `docs/WORK-PROCESS.md` "선언 명령과 커밋 게이트"를 따른다(선언 자체는 `docs/README.md` 환경 표).
- 기기 설정(3단계 분리): ① `install.cmd`·`install.sh`가 pace를 설치(설치까지만) → ② `pace agent setup`(`src/agent/setup.ts`)이 claude·codex CLI·로그인·ACP 어댑터를 감지(읽기만)하고 계획·확인을 모두 푼 뒤에만 공식 로그인·어댑터 설치·프로필 `agent-chains.json`의 `default` 체인 병합을 적용 → ③ `pace daemon install`(`src/daemon/install-wizard.ts`)이 계획을 보인 뒤 확인(`--yes` 또는 터미널 `[y/N]`)을 받고, 체인이 없으면 ②를 이어서 실행하고 기기 이름·Telegram(봇 확인과 getUpdates로 chat id·허용 사용자 찾기)·워크스페이스를 선택으로 받은 뒤 관리자 권한 없는 자동 실행을 등록한다(Windows `HKCU…Run`의 `PACE Daemon` 값 + 콘솔 창 없는 VBS 런처 `PACE_HOME/daemon-launch.vbs`, macOS 사용자 launchd `io.pace.daemon` — `src/daemon/autostart.ts`), 끝에 지금 시작할지 묻는다(`pace daemon start`는 같은 방식으로 백그라운드 기동, `run`은 포그라운드). 이후 `pace install`(재설치)은 이 기기에 등록이 이미 있을 때만 등록 경로를 새 설치본으로 갱신한다. 외부 명령 출력은 콘솔 코드 페이지로 해독한다(`src/core/console-decode.ts`).
- 상시 실행: `pace daemon run` → `src/daemon/index.ts`가 인스턴스 포트(단일 소유)→설정·상태→코어(`core.ts`)→Gateway를 띄운다. 채널 어댑터·Gateway의 수신 → 허용 사용자·수신 ID 중복 확인 → 결정적 명령이면 직접 처리, 아니면 대상 고정 작업 생성(쓰기는 승인 대기) → 처리기가 `preparing`으로 잠금·슬롯 예약 → 처리기 밖 준비(경로 동일성·시작 스냅샷) → 재확인 뒤 `running` 저장 → 실행자(`runner.ts` → `runChain`·ACP 훅)가 돌고 결과·이벤트를 채널로 돌려준다. 재시작 때는 이전 기동의 비종료 작업을 정리하고(자동 재실행 없음) 회수를 증명하지 못한 경로를 격리한다. Telegram 채널(`src/daemon/telegram/`)은 어댑터가 롱폴링 update를 받아 chat·사용자·등록 토픽 관문을 통과시킨 뒤 `Inbound`(대화=`<chat>:<thread>`, 수신 ID=`m<message_id>`, `bindWorkspace`)로 코어에 넘기고, 코어의 응답·진행 편집·승인 요청을 `send`·`edit`·`askApproval`로 받아 4096자 분할·파일 첨부·인라인 버튼으로 내보낸다. 파일 조회(`/backlog`·`/memory`)와 `/new` 경로 검증은 워커 스레드가 수행한다. 메시지는 마크다운을 Telegram HTML로 바꿔 보낸다(`markdown.ts` — b·i·s·code·pre·a·blockquote 화이트리스트, 모든 텍스트 이스케이프, 코드·표·인용·본문 단위로 나눠(표는 폭에 따라 접히는 고정폭 대신 행마다 블록 — 열이 둘이면 `첫열 — 둘째열` 한 줄, 셋 이상이면 첫 열 굵게 + `머리글: 값` 줄) 조각마다 태그가 닫히게 4096 안으로 분할, 변환·서버 해석이 실패하면 평문). 명령 안내는 명령 한 줄에 하나(`/명령 <인자> — 설명`)다. 실행 중에는 진행·시작 메시지를 보내거나 고치지 않고 그 토픽에 `sendChatAction typing`을 약 4초마다 보내 입력 중 표시를 유지하며(대기·승인 대기 중에는 멈추고, 대기열에서 기다리게 되면 대기 한 줄만 보낸다), 끝나면 최종 답변을 새 메시지로 보낸다(작업 ID는 최종·실패 메시지와 `/queue`·`/status`에 있다). `/명령@봇이름`은 이 봇(getMe의 username)을 가리킬 때만 처리하고 다른 봇을 가리키면 응답하지 않는다.
- 설치·제거: `src/cli.ts` installCommand → `src/setup/install.ts`. 데이터(등록부)는 `PACE_HOME`, 설치본·명령·`install.json`은 사용자 홈의 `~/.pace`에 둔다. 기존 설정을 고치거나 치울 때 원본을 `~/.pace-install-backup-<시각>-<임의값>/`에 복사한다. 제거는 `PACE_HOME` 데이터를 지우지 않는다.
- 기능 명령: `src/cli.ts`의 분기에서 해당 기능 모듈을 호출한다. 구현별 경계와 결정은 `docs/README.md` 문서 표와 프로젝트 브레인을 참조한다.

## 테스트와 변경

`test/*.test.ts`는 `node:test`를 사용하고 함수 검사와 CLI 검사를 포함한다. `npm run check`는 타입 검사와 전체 테스트를 실행한다. 새 기능 추가 시 CLI 분기와 해당 모듈, 테스트 및 필요하면 정의서·스킬·템플릿을 대조한다. `test/helpers.ts`는 실행마다 임시 루트를 만들어 `TMPDIR`·`TMP`·`TEMP`·`PACE_HOME`을 그 안으로 돌리고 `PACE_PROFILE`을 지워 실제 PACE 데이터를 건드리지 않는다. 근거: `package.json`, `test/backlog.test.ts`, `test/helpers.ts`, `src/cli.ts`.

이 문서는 관찰된 구조를 요약한다. 모듈 사이에 일률적인 의존 방향을 강제하는 규칙은 확인하지 않았다.
