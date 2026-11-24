---
type: synthesis
title: 에이전트 설정과 daemon 자동 실행 함정
summary: "schtasks ONLOGON은 일반 권한에서 액세스 거부 → HKCU Run + 숨김 VBS 런처, 외부 명령 출력은 콘솔 코드 페이지(949)로 해독, 로그인 확인은 claude auth status(JSON)·codex login status(종료 코드), 감지·계획·적용 분리"
tags: [daemon, install, windows, macos, agent-setup]
sources: [code:src/daemon/autostart.ts, code:src/agent/setup.ts, code:src/core/console-decode.ts, code:src/daemon/install-wizard.ts]
related: [telegram-어댑터-설계-함정, pace-agent-acp-실측]
created: 2026-11-12
updated: 2026-11-24
status: active
---

1. **Windows 자동 실행은 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`** — 작업 스케줄러 `/SC ONLOGON`은 일반 권한 PowerShell에서 "액세스가 거부되었습니다"로 실패한다(2026-11-12 실사용). Run 값은 관리자 권한이 필요 없다. 콘솔 창을 숨기려고 값은 `wscript.exe //B //Nologo "<PACE_HOME>\daemon-launch.vbs"`이고 VBS가 `WScript.Shell.Run cmd, 0, False`(창 스타일 0, 기다리지 않음)로 node를 띄운다. VBS는 BOM 있는 UTF-16LE로 써서 한글 경로를 ANSI 코드 페이지에 맡기지 않는다. `[추정]`: 재로그온 뒤 창 없이 뜨는지·wscript 정책 차단 여부는 실기에서 확인(사람 확인 항목). 옛 작업 스케줄러 항목이 있으면 지우려 시도하고 실패하면 안내 — 둘 다 있어도 daemon 중복 기동은 인스턴스 포트가 막는다.
2. **외부 명령 출력은 UTF-8이 아니다** — Windows 콘솔 도구(`reg`·`schtasks`)는 OEM 코드 페이지(한국어 949)로 쓴다. `decodeConsoleOutput`은 UTF-8(fatal)로 먼저 시도하고 실패하면 `chcp`로 얻은 코드 페이지의 TextDecoder로 해독한다. 같은 PC에서 PowerShell은 65001, Git Bash는 949라 코드 페이지는 실행 환경마다 다르다 — 상수로 정하지 않는다. `reg`·`schtasks`는 PATH가 아니라 `%SystemRoot%\System32`의 exe를 직접 부른다.
3. **로그인 상태 확인 명령** `[확인: 2026-11-12 이 PC]` — `claude auth status`는 JSON(`loggedIn`)을 내고 로그인 상태면 종료 0, 로그인 명령은 `claude auth login`. `codex login status`는 "Logged in using ChatGPT"·종료 0, 로그인은 `codex login`. 미로그인일 때 `codex login status`의 종료 코드·문구는 **미확인** — 비 0으로 가정하고 문구는 보지 않는다. 확인하지 못한 것(실패·시간 초과·알 수 없는 출력)은 미로그인으로 취급해 체인에 넣지 않는다.
4. **`pace agent setup`은 감지(읽기만) → 계획·확인 → 적용** 순서다 — 기존 `default` 체인을 바꾸는 확인이 풀리지 않으면 로그인·npm 설치·파일 쓰기를 하나도 하지 않는다. 로그인은 공식 CLI를 상속 입출력으로 실행할 뿐 토큰·자격증명 파일을 읽거나 복사하지 않는다. 어댑터는 읽기 전용 강제를 실측한 `@agentclientprotocol/claude-agent-acp@0.81.1`로 고정해 설치한다 — 다른 버전은 `acp-executor`가 읽기 전용 요청을 거부한다. codex는 ACP 읽기 전용 강제 미확인이라 기본 체인에서 -p를 쓴다.
5. ACP 어댑터(stdio 서버)는 `--version`을 주면 입력을 기다릴 수 있어 직접 실행하지 않고 `where`/`command -v`로 존재만 본다. Windows의 npm은 `.cmd`라 `win-command`가 거부하므로 이 node 옆의 `node_modules\npm\bin\npm-cli.js`를 node로 실행한다.
6. 재설치(`pace install`)가 등록 경로를 갱신하는 조건은 "이 데이터 폴더(PACE_HOME)의 런처가 있고 레지스트리 값이 그 런처를 가리킬 때"다 — 런처가 없으면 레지스트리를 묻지도 않아 시험·개발용 임시 PACE_HOME 설치가 실제 레지스트리를 건드리지 않는다.

## macOS launchd 실사용 함정 (P005 T04, 2026-11-23~24)

- **launchd PATH**: launchd는 시스템 기본 PATH만 준다. `~/.local/bin`의 claude·codex·claude-agent-acp를 못 찾으므로 등록 때 PATH를 plist에 넣는다(main 3970e51).
- **강제 종료 뒤 재기동**: 로드된 항목에 `launchctl load`는 "Load failed: 5"를 내면서도 종료 0이다. 그래서 `launchctl list`로 로드 여부를 먼저 보고 `start`/`load`를 고른다(main 521e3b8). KeepAlive false라 daemon이 죽으면 저절로 다시 뜨지 않는다 — 부재 중 자동 복구는 운영 결정 사항.
- **stop 직후 start**: `pace daemon stop` 직후 바로 `start`하면 서비스가 뜨지 않은 사례가 있다(두 번째 start로 기동, 이슈 daemon-stop-직후-start-무시). 재기동 스크립트는 상태가 stopped가 된 것을 확인한 뒤 start한다.
- **읽기 전용 ACP 모드**: Claude ACP plan 모드는 작업 폴더 밖 읽기를 권한 요청 없이 실행한다 — 읽기 전용은 default 모드 + 강제 거절(main a3dfdbd, [[pace-agent-acp-실측]]). 쓰기 모드에서도 작업사본 안 읽기 전용 셸은 PACE 승인 없이 실행된다.

