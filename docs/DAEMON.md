# 상시 실행 daemon

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

## 상시 실행 daemon

- 경로: `src/daemon/`
- 스택·형식: TypeScript

### 저장소에서 워크스페이스 추가

`pace daemon workspace add [<경로>] [--name <이름>] [--yes]`로 저장소를 추가한다. 경로를 생략하면 현재 폴더가 속한 Git 저장소의 최상위를 쓴다. 먼저 이름·실경로·등록 및 `.pace/AGENT.md` 생성 여부·접근 기본값(read-only)·토픽 이름·확인 가능한 Telegram 포럼 이름을 보여 준다. 터미널에서는 `[y/N]`으로 확인받고, 비대화형 실행은 사람이 계획을 확인한 뒤 `--yes`로 승인한다.

활성 등록이 있으면 등록부의 이름과 ID를 재사용한다. 이미 daemon 이름을 승인한 같은 ID는 그 이름을 유지한다. 이름 형식이 맞지 않거나 다른 저장소가 쓰는 이름이면 `--name`을 지정한다. `pace daemon workspace list`는 승인한 워크스페이스와 등록 연결 상태를 보여 준다.

daemon이 정지 중이면 설정은 다음 기동 때 적용된다. 실행 중이면 인증된 Gateway로 요청해 바로 적용한다. 출력은 설정 반영과 토픽 결속을 따로 표시한다. 미결속이면 포럼의 해당 토픽에서 `/bind <이름>`으로 결속할 수 있다. 실행 중 `install`의 기기 설정을 변경하려면 daemon을 정지한 뒤 다시 실행한다.

`pace workspace move`로 등록부 위치를 옮기거나 승인된 디렉터리가 교체되면 daemon은 다시 승인할 때까지 그 경로의 요청을 거부한다. 새 경로에서 다시 `workspace add`를 승인하면 같은 ID에 결속한 토픽을 계속 쓸 수 있다. 이전 경로의 사용자 지정 워크트리 항목은 다시 지정해야 한다. 등록 ID가 없는 기존 설정은 기존 방식으로 동작한다. 디렉터리 교체 검사는 `workspace add`가 승인 시 저장한 신원 값을 사용한다. 등록 ID를 설정에 직접 추가한 경우 `workspace add`로 승인 신원을 기록한다. Telegram offset은 daemon을 정지한 뒤 초기화한다.

### 기동과 요청 처리

`pace daemon run|start|status|stop [--force]|logs|release|install|uninstall|telegram init|telegram reset-offset` — 기기당 하나(정규화한 `PACE_HOME` 해시의 loopback 인스턴스 포트를 잡는 쪽이 소유자 — OS가 해제하므로 인계 판정 없음, 응답 없는 소유자가 있어도 실패)로 상시 실행되며 채널 어댑터(`ChannelAdapter`)·Gateway가 넘긴 요청을 `core.ts`가 받아 대상(워크스페이스·워크트리·체인·access)을 수신 때 고정하고, 워크트리(조상·자손 포함)당 하나씩 직렬화·전체 동시 상한으로 실행한다. 모든 상태 변경은 단일 직렬 처리기를 거치고 상태는 `PACE_HOME/daemon/state.json`에 원자적으로 쓴다. 쓰기 작업은 시작 전 승인(작업·범위·사용자·대화·만료·기동 ID에 묶여 한 번만 처리)이 필요하고 기본은 읽기 전용이다. 강제 종료·재시작 뒤에는 이전 승인을 모두 무효로 하고 실행 중이던 쓰기 작업은 자동 재실행 없이 `needs_review`로 두며, 회수를 증명하지 못한 경로는 영속 격리(`quarantine`)해 `pace daemon release`로만 푼다. 수신 ID 중복 제거(7일·10,000개, 24시간 안 기록은 개수 상한으로 지우지 않고 하드 상한 100,000에서는 새 수신을 거절), 알림은 outbox로 최소 한 번 전송. 상태·로그·송신 본문에는 `redact`(자기 봇 토큰·봇 토큰 형태 제거)를 저장 직전에 적용한다. Telegram 어댑터(`src/daemon/telegram/`, `secrets/telegram.json`이 있을 때만 연결)는 `fetch`로 Bot API를 롱폴링하는 포럼 토픽 채널이다 — 허용 chat → 허용 사용자(코어 정책) → 등록 토픽 순으로 통과한 입력만 처리하고, General은 코디네이터(`/workspaces`·`/new`·`/status`·`/help`), 프로젝트 토픽은 워크스페이스에 결속되며 승인은 인라인 버튼(콜백은 승인 ID만, 판정은 코어)이다. 메시지는 마크다운을 Telegram HTML로 바꿔 보낸다(`markdown.ts` — b·i·s·code·pre·a·blockquote 화이트리스트, 모든 텍스트 이스케이프, 코드·표·인용·본문 단위로 나눠(표는 폭에 따라 접히는 고정폭 대신 행마다 블록 — 열이 둘이면 `첫열 — 둘째열` 한 줄, 셋 이상이면 첫 열 굵게 + `머리글: 값` 줄) 조각마다 태그가 닫히게 4096 안으로 분할, 변환·서버 해석이 실패하면 평문). 명령 안내는 명령 한 줄에 하나(`/명령 <인자> — 설명`)다. 실행 중에는 진행·시작 메시지를 보내거나 고치지 않고 그 토픽에 `sendChatAction typing`을 약 4초마다 보내 입력 중 표시를 유지하며(대기·승인 대기 중에는 멈추고, 대기열에서 기다리게 되면 대기 한 줄만 보낸다), 끝나면 최종 답변을 새 메시지로 보낸다(작업 ID는 최종·실패 메시지와 `/queue`·`/status`에 있다). `/명령@봇이름`은 이 봇(getMe의 username)을 가리킬 때만 처리하고 다른 봇을 가리키면 응답하지 않는다. offset은 처리 뒤 저장하고 장기 무수신 뒤에는 생략한다. 기본 실행자(`runner.ts`)는 체인(`pace agent run --chain`)·ACP 훅·취소 신호를 결선한다. Gateway(`gateway.ts`)는 127.0.0.1 로컬 WebSocket + 토큰(`PACE_HOME/secrets/gateway-token`, 소지자=기기 관리자)·Origin 거부. `install`은 체인(`default`)이 없으면 `pace agent setup`을 이어서 실행하고, 대화형에서만 기기 이름(기본은 컴퓨터 이름)·Telegram(봇 토큰 → getMe로 봇 확인 → 그룹에 보낸 메시지에서 getUpdates로 포럼 chat id·허용 사용자 ID 후보를 찾아 확인받아 저장, webhook이 걸려 있으면 원인 안내, 수동 입력도 가능)·워크스페이스(현재 폴더가 git 저장소면 기본 제안, 이미 등록된 것은 건드리지 않음)를 묻고, 관리자 권한 없이 Windows는 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`의 `PACE Daemon` 값(콘솔 창 없는 VBS 런처 `PACE_HOME/daemon-launch.vbs`)·macOS는 사용자 launchd(`io.pace.daemon`)로 로그온 자동 실행을 등록한다 — `--yes` 또는 터미널의 `[y/N]` 확인 없이는(표준 입력이 TTY가 아니면 `--yes`만 인정) 계획만 출력하고 아무것도 실행하지 않는다. 등록 뒤에는 지금 시작할지 묻고(비대화형은 `--start`), daemon 실행 중에는 마법사의 기기 설정 쓰기가 거부된다. 기기 설정을 바꾸려면 daemon을 정지하고 `install`을 다시 실행한다. 실행 중 에이전트 체인을 바꾼 경우 `stop` 뒤 `start` 재시작을 안내한다. `pace daemon start`는 등록과 같은 방식(Windows wscript 숨김 VBS, macOS launchctl — 강제 종료 뒤처럼 항목이 이미 로드돼 있으면 `launchctl start`, 아니면 `load`; 로드된 항목의 `load`는 실패해도 종료 0이라 결과로 판단하지 않는다)으로 지금 백그라운드 기동하고 `run`은 포그라운드로 남는다. `pace install`(재설치)은 이 기기에 등록이 있을 때만 등록 경로를 새 설치본으로 바꾼다. Claude 구독 상시 자동 실행의 약관 범위는 캡틴이 확인했다(2026-11-12). 한계: Windows는 자손 회수를 증명하지 못해 강제 종료 뒤 격리가 남을 수 있다. 이벤트 스트림(`text_delta`·`tool`·`plan`)은 비밀 제거 없이 받은 조각 그대로 전달한다(사용자 결정, 후속 과제). 실제 봇·하루 상시 실행은 사람 확인 항목
