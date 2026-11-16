---
type: concept
title: 설치·실행 함정 모음
summary: "< /dev/tty로 넘기면 Claude Code(Bun)가 kqueue EINVAL로 죽음, 처음 폴더는 신뢰 창 기본값이 종료, ps1은 BOM 필수, 자동 모드는 자기 설정 수정과 rm -rf를 막음"
tags: [install, pitfalls, macos, windows]
sources: [code:scripts/install.sh, code:scripts/install.ps1, code:src/setup/onboard.ts, 실측:2026-10-22, code:src/project/harness.ts, test:test/project-harness.test.ts, code:src/project/brain.ts, test:test/brain.test.ts, code:src/setup/install.ts, test:test/install-windows-wrapper.test.ts, test/intent-preview.test.ts]
related: [llm-cannot-speak-first]
created: 2026-10-22
updated: 2026-11-16
status: active
---

| 함정 | 증상 | 대응 |
|---|---|---|
| `cmd < /dev/tty`로 Claude 실행 | Bun이 `EINVAL: invalid argument, kqueue`로 즉시 종료 (macOS kqueue가 경로로 연 tty를 못 감시) | 표준입력이 이미 터미널일 때만 리다이렉트 없이 실행 |
| 처음 쓰는 폴더에서 Claude 실행 | "이 폴더를 신뢰하나요?" 기본값 **No, exit** → Enter 한 번에 종료 | 온보딩은 항상 `~/.pace`에서 연다 |
| `[ -r /dev/tty ]` 검사 | 있다고 나와도 에이전트 셸에선 열 수 없음 | `{ : < /dev/tty; }`로 실제로 열어 본다 |
| PowerShell 5.1 + BOM 없는 UTF-8 | 한글이 깨지고 구문 오류 | ps1은 BOM 유지, `.ps1` 대신 `.cmd` 실행 파일 |
| `.\scripts\install.ps1` 직접 실행 | Windows 클라이언트 기본 실행 정책(모든 범위 Undefined → Restricted)이 `UnauthorizedAccess`로 차단 | 설치는 `scripts\install.cmd` 래퍼(`.cmd`는 정책 대상 아님, 프로세스 한정 Bypass로 ps1 실행). 2026-11-11 Restricted 재현·래퍼 DryRun 확인 |
| Claude 자동 모드 | 자기 설정(`~/.claude/settings.json`) 수정·`rm -rf`·훅 신뢰 우회 플래그를 거부 | 설치는 사용자가 직접 실행, 삭제는 git rm·백업 이동 |
| `$( [ -t 1 ] )` 측정 | 명령 치환 안에서는 출력이 항상 파이프 → 거짓 음성 | 치환 밖에서 검사 |
| 설치본이 체크아웃에 링크 | 저장소에서 브랜치를 바꾸거나 worktree에서 설치하면 모든 세션의 부트가 그 코드를 실행 | 복사 설치(`~/.pace/app/`, 스킬은 `.pace-managed` 표지 복사본). 그래도 설치는 병합 뒤 main에서만 — worktree에서 설치하면 그 브랜치 코드가 복사된다 |
| Orca 안의 Codex 별도 홈 | Orca Codex는 `…/orca/codex-runtime-home/home`을 써서 PACE 부트 훅을 처음 보면 신뢰 확인 화면에서 멈추고 Orca는 작업자 실행 실패로 판정 | 그 홈에서 한 번 승인하면 훅 명령이 바뀌지 않는 한 유지. 실패한 작업은 같은 터미널로 `worker-start --retry-of`. 우회 플래그(`--dangerously-bypass-hook-trust`)는 쓰지 않음 |

## Windows CRLF 템플릿과 하네스 절 검색 (2026-11-05)

Windows 설치본 템플릿이 CRLF일 때 `pace project new --from BL…`가 `절이 없다: ## 태스크`로 실패할 수 있었다. `appendRow`의 LF 전용 제목 검색뿐 아니라 태스크 표 읽기·기존 5칸 판별·상태 셀 갱신·마감 절 검사가 같은 전제를 공유했다. 설치본은 git 저장소가 아니므로 설치 후 git 설정만 바꿔도 이미 복사된 파일의 줄바꿈은 달라지지 않는다. 루카스 PC의 `core.autocrlf`가 변환 원인인지는 확인하지 않았고, 원인과 무관하게 CRLF 입력을 처리해야 한다.

하네스는 절 본문 위치를 LF·CRLF 공통으로 찾고 표 행을 줄 단위로 읽으며, 행 추가와 상태 변경 시 기존 CRLF를 보존한다. 모든 Markdown 템플릿을 CRLF로 바꾼 git 없는 임시 설치본에서 백로그 프로젝트 생성·예정 태스크 번호 재사용·추가 태스크·실패 기준 검출·done과 백로그 상태 갱신을 검증한다. 기존 5칸 표도 번호와 상태 열을 보존한다. 이 검증은 CRLF 데이터 회귀이며 실제 Windows 프로세스 실행을 대신하지 않는다.

근거: `src/project/harness.ts`, `test/project-harness.test.ts`의 CRLF 설치본/기존 5칸 테스트. 수정 배포는 해당 Windows PC에서 갱신된 소스를 다시 설치해야 반영된다.

## Windows 브레인 파일 ID와 폴더 추출 (2026-11-06)

루카스 Windows 환경에서 실제 페이지가 있어도 본문·related 링크 6개를 찾지 못하고 새 페이지 추가가 폴더 `undefined` 오류로 거부됐다. 프로젝트 main과 작업 worktree에 동일하게 나타나므로 브레인 문서를 수정하거나 게이트를 생략해서 해결할 문제가 아니다. `src/project/brain.ts`의 파일명·제목 기본값·부모 폴더 추출이 경로를 `/`로만 나누는 것이 원인이었다. Windows 경로로 기존 추출식을 평가하면 파일 ID에 전체 경로가 남고 부모 폴더는 비었다.

파일명은 `basename(path, ".md")`, 부모 분류는 `basename(dirname(path))`로 추출한다. 파일 시스템 경로의 구분자는 운영체제 API에 맡기고, 위키 ID와 Markdown 링크의 `/` 표기는 별도 논리 형식으로 유지한다. 기존 페이지의 본문·링크는 고치지 않는다. 네이티브 경로 회귀는 기존 순환 링크 6개의 lint, 새 페이지 add·update, 목차 상대 링크와 제목 기본값을 검증하고 실제 없는 링크 거부도 확인한다. macOS에서 Windows·POSIX 경로 규칙의 추출식을 별도로 대조했으며 실제 Windows 프로세스·재설치는 해당 PC에서 추가 확인해야 한다.

## Claude 비대화형 응답 지연 관측 (2026-11-03)

Claude Code 2.1.316에서 합성 `-p` 요청이 초기화·thinking 이벤트 뒤 120초 동안 끝나지 않은 사례가 있었다. 같은 주요 설정을 격리 프로젝트에서 다시 시험하자 기본 모델과 작업자 기본 모델이 정상 응답했고, stdin EOF와 열린 PIPE, 빈 도구 목록과 기본 도구 목록에서도 각각 성공했다. 당시 지연 원인과 각 변수의 인과관계는 미확인이다. 훅 시간과 전체 모델 응답 시간을 구분하고 stream-json 이벤트·wall time을 기록하며, 전역 MCP 서버의 원치 않는 실행을 막으려면 격리 시험에서 `--strict-mcp-config`를 유지한다.

## Windows Git Bash 실행 파일 (2026-11-11)

PowerShell과 cmd에서는 pace.cmd를 쓰고 Git Bash에서는 확장자 없는 sh 래퍼가 같은 Node 진입점을 실행한다. 설치·재설치는 PACE가 관리하는 본문만 교체하며 사용자 파일이나 링크 충돌은 보존한다. 제거도 소유권이 확인된 래퍼만 처리한다. 격리 설치·재설치·제거와 실제 Git Bash 커밋 훅을 Windows에서 검증했다. [근거: scripts/install.ps1, src/setup/install.ts, test/install-windows-wrapper.test.ts]

## Windows 격리 홈과 Chrome DevTools (2026-11-15)

Chrome 157은 임시 USERPROFILE과 별도 형제 AppData 경로를 쓰면 기본 사용자 데이터 경로를 판별하지 못해 별도 프로필에도 DevTools를 거부할 수 있다. 임시 홈 아래 AppData/Roaming, AppData/Local, AppData/LocalLow, Desktop, Documents, Downloads를 만들고 HOME·USERPROFILE·APPDATA·LOCALAPPDATA를 그 구조로 맞추면 사용자 홈을 쓰지 않고 실렌더 및 소유 Chrome 정리 시험이 통과했다. 일반 홈 단독 통과와 격리 실행은 구분한다. [근거: test/intent-preview.test.ts]
