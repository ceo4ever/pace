# PACE — 개인 비서 에이전트

> Claude Code · Codex · Gemini CLI · Cursor · Antigravity에서 세션을 열면 올라오는 **나만의 비서 에이전트**.
> **PACE = Personal Assistant for Context and Execution** — **맥락을 기억하고 일을 실행하는 개인 비서**.

사용자와 프로젝트의 기억을 유지하고, 그 맥락을 바탕으로 일상 업무·조사·기획·개발을 실행하고 검증합니다. **기억·맥락·업무 실행**이 PACE의 목적입니다.

**PACE(페이스)는 제품 이름**입니다. 비서의 이름과 정체성은 프로필에서 정하며, 예를 들어 **알투**라는 비서를 여러 LLM 도구에서 동일하게 이어 쓸 수 있습니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 현재 버전 PACE 0.1.0 (`pace --version`).

## 무엇을 하나

- **한 에이전트, 여러 도구**: 세션 시작 훅이 `pace boot`를 호출해 정체성·규칙·메모리를 주입한다. 어느 LLM 도구에서 열어도 같은 에이전트다.
- **프로필 = 독립 에이전트**: 프로필마다 정체성(`SOUL.md`), 사용자 정보(`USER.md`), 메모리(개인 규칙 포함), 스킬, 설정을 따로 가진다. 운영 규칙(`RULES.md`)은 모든 프로필에 같고 PACE와 함께 갱신된다.
- **기본 구성만**: 실행은 각 LLM 도구의 기능(계획 모드, 서브에이전트, 스킬, MCP)을 그대로 쓴다(제공자가 다른 에이전트가 필요할 때만 `pace agent`).
- **작업 하네스**: 업무를 프로젝트(`projects/P###`)와 태스크로 수행한다. `pace project`가 번호·worktree·게이트(태스크 check, 마감 finish, 병합 merge)를, `pace-project-dev` 스킬이 계약(목적·재료·기준)과 테스트·리뷰·보안 기준을 맡는다. Orca 안에서는 worktree 작업자 세션을 띄우고 main 세션이 코디네이터가 된다.
- **Canvas 읽기·와이어프레임**: Canvas Studio가 배포한 묶음을 `skills/pace-canvas-skills/` 경로로 통째 설치하고, 에이전트에는 `canvas-read`(Canvas 문서에서 프레임·요소를 정보와 이미지로 꺼냄)·`canvas-wireframe`(좌표 없는 명세로 편집 가능한 `.canvas.json`을 만들고 겹침·잘림을 검사) 두 스킬 입구가 보인다. 묶음 본문·배포 식별자·해시는 Canvas Studio 배포본 그대로 두고 설치 경로만 PACE 이름을 쓴다. 도구는 Node 22 이상과 렌더에 설치된 Google Chrome(또는 `CHROME_PATH`)이 필요하다. 앱 확인과 사람 편집은 수행 여부를 구분해 보고한다.
- **의도 파악 기획**: `pace-intent` 스킬이 한 줄 요청이나 아이디어에서 목적을 찾아(프로젝트 문서·메모리·브레인·URL·검색 수집 → 한 번에 한 질문 인터뷰) 빈틈 없는 기획으로 만들고, 크기에 맞게 대화·프로젝트·백로그로 넘긴다. 화면 기획은 편집 가능한 Canvas와 유스케이스·IA·흐름·시퀀스·기능 명세 HTML을 사용하며 `pace intent verify`로 의미 연결을 검사한다. `pace intent preview <폴더> [--root <제품 저장소>]`는 Canvas 제품 프레임과 명시한 이동으로 이미지 미리보기를 만들고, `--verify`는 그 출처와 파일이 최신인지 확인한다.

## 정보를 두는 곳

| | 항상 불러옴 (짧게) | 필요할 때 검색 (길게) |
|---|---|---|
| 프로필 | `USER.md`, 프로필 메모리 | (예정) 프로필 브레인 |
| 프로젝트 | `AGENTS.md`, `docs/README.md`(정의서), 프로젝트 메모리 `.pace/memory/` (진행 상황·규칙·이슈·할 일) | 프로젝트 브레인 `.pace/brain/` |

| 위치 | 내용 |
|---|---|
| `PACE_HOME` (기본 `~/.pace`) | 프로필·프로필 메모리, 워크스페이스 등록부(`projects/`), 작업자 설정(`worker-settings.json`), daemon 데이터 |
| `~/.pace` | 설치본 `app/`, 명령 `bin/pace`(Windows `bin/pace.cmd` + Git Bash용 `bin/pace`), 설치 기록 `install.json` — `PACE_HOME`과 무관하게 사용자 홈 기준 |
| 저장소 `.pace/` | `AGENT.md`(프로젝트 정의), 프로젝트 메모리·브레인 |

프로필 선택은 `PACE_PROFILE` → 기본 프로필 순이고, 메모리 명령은 `--profile <이름>`으로 대상 프로필을 지정할 수 있다.

## 설치

필요: Node.js 24 이상, git. 신규 설치와 업데이트는 같은 스크립트를 쓴다.

```bash
# macOS · Linux
bash scripts/install.sh            # 저장소 안에서
curl -fsSL https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/install.sh | bash
```

```powershell
# Windows (PowerShell 5.1 / 7) — 실행 정책과 무관하게 동작
scripts\install.cmd               # 저장소 안에서 (PowerShell은 .\scripts\install.cmd)
irm https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/get.ps1 | iex   # 원격 설치
```

원격 설치는 저장소를 `~/.local/share/pace`(Windows `%LOCALAPPDATA%\pace`)에 받는다. 설치 스크립트는 설치까지만 하고, 성공하면 결과 한 줄(`✓ PACE 0.1.0 설치 완료` 또는 `업데이트 완료`)만 보인다. 온보딩은 `pace onboard` 또는 새 세션 첫 메시지로 시작한다.

| 상황 | 스크립트 동작 |
|---|---|
| 신규 | 설치본 복사, 부트 훅·대체 규칙·스킬 등록, PATH에 `~/.pace/bin` 등록 |
| PACE 있음 (`~/.pace/install.json`) | 코드 업데이트 후 다시 설치 (결과가 같으면 바꾸지 않음) |

옵션: `--yes`, `--dry-run`(바꿀 내용만 보기), `--repo <dir>`, `--ref <브랜치>` (PowerShell은 `-Yes` 등). `--no-profile`은 예전 호환용으로 받기만 한다. 저장소·브랜치는 `PACE_REPO_URL`·`PACE_REPO`·`PACE_REF`로도 바꿀 수 있다.
Antigravity IDE의 시작 훅은 공식 공유 설정 `~/.gemini/config/hooks.json`에 등록한다. 같은 경로를 사용하는 Antigravity CLI에서도 훅이 로드될 수 있으며, CLI의 설치나 동작 검증은 포함하지 않는다. 같은 이름의 사용자 훅은 덮어쓰지 않는다.
Cursor 시작 훅은 비차단이며 대체 규칙의 전역 적용 여부도 확인이 필요하다. 도구 실행이 거절되거나 불가능하면 프로젝트 역할의 수신을 성공으로 가정하지 않는다.

### 소유권

설치·제거는 PACE가 소유한 것만 바꾼다.

- 스킬은 PACE 표지 파일(`.pace-managed`)이 있는 폴더만 교체·제거한다. 표지가 없는 같은 이름 폴더(사용자 스킬 등)는 보존하고 결과에 `기존 스킬 보존`으로 알린다. `canvas-read`·`canvas-wireframe` 입구도 같은 규칙이다.
- 훅: 설치는 PACE 부트 훅을 SessionStart 맨 앞에 추가하고 다른 사용자 훅은 그대로 둔다. 제거는 PACE 부트 명령(`~/.pace` 설치본)을 가리키는 항목만 지운다. 텍스트 블록은 `# === PACE START ===`(Gemini)·`# >>> PACE developer_instructions >>>`(Codex) 표지 안만, Cursor 규칙은 `000-pace-agent.mdc`, Antigravity 훅은 `pace-session-start` 키만 PACE 것으로 본다.
- `~/.pace/bin`의 명령 파일이 PACE가 쓴 내용과 다르면 설치를 멈추고 그 파일을 보존한다.

### 알려진 한계

- Codex에 기존 `developer_instructions`가 있으면 PACE 대체 규칙을 덮어쓰지 않고 건너뛴다. 이 경우 SessionStart 훅 신뢰 승인 전에는 PACE 대체 규칙이 자동으로 제공되지 않는다.
- 실제 사용자 홈에서의 PACE 설치·제거와 실세션 부트는 이 문서 작성 시점에 확인하지 않았다.

### 되돌리기·복구

- `pace uninstall --dry-run`으로 지울 대상을 먼저 보고 `pace uninstall`로 PACE 훅·대체 규칙·관리 스킬·명령·설치본을 치운다. `PACE_HOME`의 프로필·메모리 등 데이터는 지우지 않는다.
- 제거 후에도 빈 Gemini 공유 설정이나 스킬·명령 폴더가 남을 수 있다. 기존 사용자 설정을 보존하기 위해 공유 경로를 일괄 삭제하지 않는다.
- 제거 뒤 `~/.pace/install.json`이 남으면 다음 설치 스크립트는 설치를 업데이트로 표시할 수 있다.
- 설치·제거가 기존 설정 파일을 고치거나 치울 때 원본을 `~/.pace-install-backup-<시각>-<임의값>/`에 둔다. 마지막 설치에서 쓴 위치는 `~/.pace/install.json`의 `backupDir`에 있다. 원본이 필요하면 이 폴더에서 손으로 복원한다.
- Antigravity 공유 훅에 PACE 참조가 남았거나 확인할 수 없으면 제거는 명령·설치본을 보존하고 수동 확인을 안내한다.

## 사용

```bash
pace onboard                           # LLM CLI를 열어 인터뷰로 첫 프로필 만들기
pace profile create default            # 또는 터미널에서 대화형으로
pace boot --host plain                 # 세션에 주입될 내용 확인
pace memory add --type rule --name "확인 후 커밋" --description "승인 뒤에만 커밋"          # 프로필 메모리
pace memory add --project --type issue --name "…" --description "…"                     # 프로젝트 메모리
pace memory status --project --body "06 진행 중 · 다음: 07"                              # 진행 상황
pace workspace register /path/to/repo --name "내 프로젝트"  # 정의를 확인하거나 만들고 전역 등록
pace workspace list                     # 유효한 등록 워크스페이스
pace workspace move <ID> /new/path      # 같은 정의의 새 위치로 변경
pace adopt opal [--apply]                # OPAL(.opal) 프로젝트 정의 가져오기 — 기본 미리보기 (아래 "OPAL에서 넘어올 때")
pace project new "예약 발송"           # 프로젝트 정의 (main) → 계약 승인 뒤 start로 worktree
pace project start P001                # worktree ../<저장소>.wt/P001 (Orca 안이면 작업자 세션)
pace project task P001 "저장"          # 태스크 TASK.md (worktree) → 구현·테스트 → TASK-CLOSE
pace project check P001 T01            # 커밋 게이트 확인
pace project done P001 T01             # 게이트 통과 시 상태 완료(태스크·백로그·커밋 칸) → 커밋 · finish P001 (마감) · merge P001 (main, 승인 뒤)
pace project list                      # 프로젝트 상태·진행 태스크·worktree
pace brain init && pace brain search "부트 훅"
```

워크스페이스 등록부는 `PACE_HOME/projects/`에 있고 `.pace/AGENT.md`의 v2 표지·ID와 연결됩니다. `AGENTS.md`는 저장소 작업 규칙이며, Git worktree의 작업 관리는 `pace project`가 맡습니다. 정의가 없으면 등록 때 생성하고, 미지원 형식은 덮어쓰지 않습니다.

프로젝트 정의의 frontmatter에는 `pace_agent_version: 2`와 등록부의 `workspace_id`가 필요합니다. 파일 전체(frontmatter 포함)는 JavaScript 문자열 기준 1,500자 이하여야 합니다. 형식·길이 오류가 나면 원본을 직접 고친 뒤 등록에 실패했던 항목은 `pace workspace register`를 다시 실행하고, 기존 활성 항목은 `pace workspace list`로 확인하세요. PACE는 초과한 정의를 임의로 자르지 않습니다.

`.pace/AGENT.md`는 프로젝트와 함께 Git에서 추적할 정본입니다. `.gitignore`가 `.pace/` 디렉터리 전체를 무시한다면 그 규칙을 아래처럼 좁히고 `git check-ignore .pace/AGENT.md`가 경로를 출력하지 않는지 확인하세요. 다른 기존 규칙도 이 파일을 무시하는지 확인해야 합니다.

```gitignore
.pace/*
!.pace/AGENT.md
```

전체 명령은 `pace --help`.

## OPAL에서 넘어올 때

다른 PC에 PACE를 설치했는데 기존 프로젝트가 OPAL(`.opal/`)로 정의되어 있으면, PACE는 `.pace/`만 읽으므로 프로젝트 메모리·브레인·역할이 사라진 것처럼 보이고 OPAL의 커밋 게이트 훅 때문에 PACE 게이트도 설치되지 않는다. 프로젝트 폴더에서 `pace adopt opal`로 OPAL 정의를 PACE로 옮긴다.

1. **OPAL 제거** — OPAL 설치본과 시작 훅을 지운다(OPAL의 제거 방법을 따른다). 저장소의 `commit-msg` 훅을 직접 수정했다면 4단계 `pace adopt opal` 미리보기의 훅 경고를 먼저 확인한다 — 수정된 OPAL 훅은 자동 교체되지 않아 OPAL 제거 뒤 검사 없이 통과하게 된다.
2. **PACE 설치** — 위 [설치](#설치)를 따른다.
3. **온보딩으로 새 프로필** — `pace onboard`로 새 프로필을 만든다. OPAL 홈(`~/.opal`)의 프로필은 옮기지 않는다.
4. **프로젝트마다 `pace adopt opal`** — 저장소 루트에서 실행한다. 기본은 미리보기라 아무것도 바꾸지 않고 바꿀 목록만 보여 준다. 목록을 확인한 뒤 `pace adopt opal --apply`로 적용한다.
5. **변경을 확인하고 직접 커밋** — 이동은 `git mv`라 이력이 이어지고, 자동 커밋·push는 하지 않는다. `git status`로 확인한 뒤 직접 커밋한다.
6. **`pace backlog refresh`** — 백로그 대시보드 자료를 PACE 형식으로 갱신한다.

가져오기 전에 `pace memory`를 써서 `.pace/memory`가 먼저 생겼으면 미리보기에 "`.pace/memory` 회수"가 나온다. 커밋된 메모리 파일만 있을 때 `.opal/memory`에 먼저 합친 뒤 옮긴다 — `.opal`에 없는 파일은 합치고, 같은 내용과 목차(`INDEX.md`)는 버리며, 진행 상황(`status.md`)은 커밋이 더 최신인 쪽을 남긴다. 목차는 옮긴 뒤 파일 목록에서 다시 만든다.

적용하면 이렇게 바뀐다.

| 대상 | 바뀌는 것 |
|---|---|
| `.opal/` | `.pace/`로 `git mv`(메모리·브레인·로컬 파일 그대로). `AGENT.md`는 `opal_agent_version`→`pace_agent_version`, 본문의 `.opal/` 경로→`.pace/`만 바뀌고 `workspace_id`는 그대로 이어받아 워크스페이스 등록부에 등록한다 |
| `commit-msg` 훅 | 알려진 OPAL 커밋 게이트 원문이면 PACE 게이트로 바꾸고 원본은 `commit-msg.opal-backup`에 남긴다. 사용자가 만든·수정한 훅은 건드리지 않고 알린다 — 수정된 OPAL 훅이 남으면 OPAL 제거 뒤 `opal` 명령을 못 찾아 검사 없이 통과하므로 PACE 게이트가 빠진 상태다. `pace adopt opal` 출력의 훅 경고를 확인하고 훅을 직접 정리하거나 `pace project check` 호출을 합친다 |
| `backlogs/README.html` | OPAL 공용 진입점이면 PACE 공용 참조로 바꾼다. 수정했거나 링크인 진입점, `data.js`·사용자 파일은 보존한다 |
| `AGENTS.md`·`CLAUDE.md`·`docs/**` | 바꾸지 않는다. `opal` 명령·`opal-*` 스킬 이름이 남은 곳을 `파일:줄` 목록으로 보고하니 그 목록으로 직접 고친다 |

OPAL 이름은 이렇게 바꾼다.

| OPAL | PACE |
|---|---|
| `opal …` 명령 (`opal project …`·`opal memory …` 등) | `pace …` |
| `opal-*` 스킬 (`opal-project-dev` 등) | `pace-*` (`pace-project-dev` 등) |
| `opi` | `pace-project-init` 스킬 |

원본을 바꾸지 않고 멈추는 경우와 대처는 다음과 같다. 멈추면 이유를 출력하고 종료 코드 1이며, 적용 도중 실패하면 이번에 바꾼 것만 되돌린다.

| 멈춤 이유 | 대처 |
|---|---|
| `.pace/`가 이미 있음(메모리 밖 항목, 또는 같은 이름의 다른 메모리) | 어느 쪽이 정본인지 확인해 한쪽을 정리한 뒤 다시 실행한다. `.pace/memory`만 있으면(가져오기 전에 `pace memory`를 쓴 경우) 멈추지 않고 회수한다 — 아래 |
| `.opal/`에 커밋 안 한 변경 | 커밋하거나 되돌린 뒤 다시 실행한다. `assume-unchanged`·`skip-worktree` 숨김 플래그가 걸린 파일이 있어도 멈추므로, `git update-index --no-assume-unchanged <파일>`·`--no-skip-worktree <파일>`로 플래그를 풀고 변경을 다시 확인한 뒤 실행한다 |
| OPAL v1 형식(`MEMORY.json`)·`AGENT.md` 형식 불명·`.opal/` 안의 링크 | 자동 이전을 지원하지 않는다. 원본은 그대로 있으니 직접 정리한다 |
| 저장소 루트가 아님·git 저장소가 아님 | 저장소 루트에서 실행한다 |
| 같은 `workspace_id`가 다른 위치에 등록됨 | 그 위치를 더 쓰지 않는다면(저장소를 옮긴 경우) 충돌한 ID와 위치는 멈춤 메시지에 나온다(`pace workspace list`는 활성 등록만 보이므로 비활성 항목은 등록부 폴더 `$PACE_HOME/projects/`(기본 `~/.pace/projects/`)의 `<ID>.json`을 직접 열어 확인한다). 등록부 파일을 지운 뒤 다시 실행한다. 두 저장소를 모두 쓴다면(복제한 경우) 이 저장소 `.opal/AGENT.md`의 `workspace_id`를 새 UUID(v4)로 바꿔 커밋한 뒤 실행한다 |
| 같은 경로가 다른 `workspace_id`로 등록됨 | `$PACE_HOME/projects/`의 `<ID>.json`을 열어 확인하고 맞지 않는 등록부 파일(`$PACE_HOME/projects/<ID>.json`)을 정리한 뒤 다시 실행한다 |

`pace adopt opal`은 실행하는 동안 같은 저장소를 다른 프로세스가 바꾸지 않는다는 조건에서 안전하다(검사 뒤 경로를 링크로 바꾸는 식의 동시 변경은 막지 못한다). 저장소 안 경로만 다루고 링크는 거부한다.

이관이 끝나면 `pace boot --host plain`으로 프로젝트 역할·메모리가 나오는지, `pace workspace list`로 등록됐는지 확인한다.

## 개발

Node 24+ (TypeScript를 빌드 없이 실행), 런타임 의존성 없음.

```bash
npm install
npm run check      # 타입 검사 + 테스트
PACE_HOME="$(mktemp -d)" ./bin/pace.ts boot --host plain   # 실제 ~/.pace 대신 임시 데이터로 실행
```

- 개발·수동 확인은 `PACE_HOME`을 임시 폴더로 지정한다. `~/.pace`는 설치 때 복사한 설치본이라 소스 변경은 `bash scripts/install.sh`를 다시 실행해야 반영된다.
- `pace install`·`pace uninstall`은 `PACE_HOME`이 아니라 사용자 홈(`~/.pace`와 각 도구 설정)을 바꾼다. 개발 중에는 `--dry-run`으로만 확인한다.
- 테스트 도우미(`test/helpers.ts`)는 실행마다 임시 루트를 만들어 `TMPDIR`·`TMP`·`TEMP`와 `PACE_HOME`을 그 안으로 돌리고 `PACE_PROFILE`을 지운다. 테스트는 실제 PACE 데이터를 쓰지 않는다.

백로그는 `pace backlog new "이름"`, 브리프(brief)는 `pace backlog brief BL261025_01 "이름"`으로 만듭니다. `backlogs/BL{YYMMDD}_{NN}_이름/BACKLOG.md`가 개요이고 `BR{NN}_이름.md`가 브리프입니다. `pace project new "이름" --from BL261025_01`은 백로그 하나를 프로젝트 하나로, BR01을 T01로 연결합니다. 완료 백로그에는 브리프를 덧붙이지 않고 새 백로그를 만듭니다.

작업자 모델은 `pace worker show`로 조회하고 `pace worker set codex model gpt-6.1-terra`, `pace worker set claude effort high`처럼 변경한다. `pace worker reset claude effort`는 해당 항목을 배포 기본값으로 되돌린다. `pace project start P001 --model <모델> --effort <값>`은 한 실행만 덮어쓰며 `--effort default`는 공통 effort 설정을 무시하고 도구 기본값을 쓴다. 설정은 `PACE_HOME/worker-settings.json`에 보관하여 재설치해도 유지된다.
설정 파일이 손상되면 PACE를 종료한 뒤 `PACE_HOME/worker-settings.json`을 다른 이름으로 옮겨 원본을 보존하고 `pace worker show`로 초기값을 확인한 다음 원하는 설정을 다시 입력한다. 기본 `PACE_HOME`은 `~/.pace`이다. 설정 파일에 심볼릭 링크는 사용할 수 없다.
