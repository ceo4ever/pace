---
type: concept
title: 설치·실행 함정 모음
summary: "< /dev/tty로 넘기면 Claude Code(Bun)가 kqueue EINVAL로 죽음, 처음 폴더는 신뢰 창 기본값이 종료, ps1은 BOM 필수, 자동 모드는 자기 설정 수정과 rm -rf를 막음"
tags: [install, pitfalls, macos, windows]
sources: [code:scripts/install.sh, code:scripts/install.ps1, code:src/setup/onboard.ts, 실측:2026-10-22, code:src/project/harness.ts, test:test/project-harness.test.ts, code:src/project/brain.ts, test:test/brain.test.ts, code:src/setup/install.ts, test:test/install-windows-wrapper.test.ts, test/intent-preview.test.ts, doc:projects/P004_261118_Windows_테스트_시간_단축/tasks/T02_git_준비_재사용/TASK-CLOSE.md, doc:projects/P004_261118_Windows_테스트_시간_단축/tasks/T02_git_준비_재사용/evidence/existing-test-body-audit.json, code:scripts/install-release.mjs, code:scripts/get.ps1, test:test/install-script.test.ts, doc:docs/SETUP.md]
related: [llm-cannot-speak-first]
created: 2026-10-22
updated: 2026-11-27
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

## Git 준비 변경 뒤 근거 대조 (2026-11-18)

P004 T02는 하네스 시험의 반복 Git 준비를 파일 프로세스별 원본의 독립 복사로 바꿨다. 기존 project-harness 72개·agent-chain 27개 시험 본문은 줄바꿈을 정규화한 해시 대조에서 동일하며 실제 Git/CLI 검증은 유지했다. 하네스·지표·설치 제품 코드는 이번 변경 대상이 아니므로 위 흐름과 함정의 계약을 바꾸지 않는다. Windows 새 전체 968건은 959 통과·실패 0·기존 skip 9 및 사유 동일이며 독립 tester가 기준 원시 3회와 대조했다. 이것은 기존 설치 미실기·범위 한계를 해소한 것으로 확대하지 않는다. 근거는 P004 T02 TASK-CLOSE와 existing-test-body-audit.json이다.

## 변경 기반 검사 추가 뒤 근거 대조 (2026-11-19)

P004 T04의 근거 변경을 대조했다. cli.ts 변경은 test changed 도움말이며 기존 부트·브레인·프로젝트 명령 분기는 그대로다. harness.ts는 정의서 목록 export, changed 전용 검증 commit 인자 및 셸의 구조화된 실행 상태를 추가했다. 인자를 생략한 기존 all/finish의 main 기준과 ok/output 계약은 유지하며, 설치·프로젝트 생명주기·지표·사건·부트 전달은 변경하지 않았다. README의 OPAL 채택 경로도 유지했다. 따라서 위 기존 주장과 실측의 역사적 한계를 유지한다. 원래 시험 본문과 최종995건의 범위/판정 보존은 T04 TASK-CLOSE 및 t03-regression-comparison에 연결되어 있다.

변경 기반 검사는 별도 경계다. 현재 staged/unstaged/untracked 작업본만 대상으로, 기준 commit과 같은 map의 명시 checks를 먼저 실행한다. 숨김 index/sparse·삭제·미분류·불확실성은 실제 전체 검사로 전환하고, 시작 후 실제 실패1·예외 확인 불가3은 성공으로 숨기지 않는다. 커밋된 브랜치 차이는 빠른 범위에 포함하지 않으며 finish 전체 검사를 유지한다. 자세한 근거는 [[변경-기반-검사와-실행-선언-신뢰-경계]]다. Windows 관측을 실제 설치기·POSIX·다른 프로젝트 일반 성능 검증으로 확대하지 않는다.


## 팀 역할 start/finish 추가 뒤 기존 설치 한계 대조 (2026-11-24)

현재 harness.ts는 역할 start에 팀 측정 marker와 버전 사건을 추가하고 finish에 팀/소통 검사를 더했다. 기존 sectionStart/appendRow의 LF·CRLF 처리와 상태 변경 보존, project-harness의 CRLF·기존 표 회귀는 유지된다. 실제 사용자 설치기는 이 변경에서 실행하지 않았으며 기존 OS/Claude 지연/훅 신뢰의 역사적 관측을 새로운 실기 통과로 확대하지 않는다. 팀 정의 적재와 원문 영수증은 별도 참여 프로토콜이고 임의 도구 직접 호출까지 인증하지 않는다.

## P013 근거 대조 (2026-11-26)

P013에서 새 태스크 경고의 CRLF 정규화와 사전 검토 해시의 호환성을 확인했다. CRLF fixture는 태스크 번호·기준과 기존 상태 판정도 대조한다. 실제 Windows 설치는 이 검사의 범위 밖이다.

## 분기된 설치 캐시에서 벗어나는 원격 설치 (2026-11-27)

기존 원격 설치는 장치에 남은 Git 캐시의 fetch·checkout·ff-only에 의존했다. 사용자 브랜치가 원격과 분기되면 프로그램 자체에 문제가 없어도 업데이트가 멈췄다. 캐시를 강제로 맞추면 로컬 커밋을 건드릴 수 있어 공개 정식 릴리즈 아카이브 하나를 임시로 받는 방식으로 바꿨다. 소스 확인이 끝나야 기존 설치 엔진을 실행한다. 캐시를 사용하거나 정리할 필요가 없다. 설치 진입 스크립트의 main은 배포 진입점이며 소스 패키지의 버전은 최신 정식 릴리즈 태그 또는 사용자가 지정한 ref가 정한다. [근거: scripts/install-release.mjs, test/install-script.test.ts, docs/SETUP.md]
