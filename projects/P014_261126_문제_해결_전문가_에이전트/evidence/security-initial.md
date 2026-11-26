# P014 최종 보안 검토 결과

blocking은 0건, should_fix는 2건, note는 5건입니다. 다만 이번 세션에는 Read·Grep·Glob만 있어 `git diff`·SHA256 계산·secret-scan을 실행하지 못했습니다. 대신 태스크별 `implementation.patch`와 현재 소스, 문서, 증거를 직접 읽어 검토했습니다. 파일은 고치지 않았고 외부 접속이나 외부 실행도 하지 않았습니다.

## 관측 대상과 SHA

- **현재 HEAD:** 전체 SHA는 확인하지 못했습니다. 이 worktree의 git 상태는 `/Volumes/Data/AiStudio/workspace/pace/.git/worktrees/P014/`에 있는데, 읽기 권한 요청이 승인되지 않았습니다. 세션 시작 시점의 git 상태에는 `9936978`(T05 커밋)이 가장 최근 커밋으로 나옵니다.
- **T04 고정값 `8a6a5d83…c4529b`:** T04 `evidence/implementation-final.patch`의 SHA-256입니다(`evidence/security.txt:2`). 해시는 다시 계산하지 못했습니다. 대신 패치가 추가하는 고유 문장 21개를 작업본에서 대조했고, 다섯 파일 모두 있었습니다.

  | 파일 | 일치 |
  |---|---|
  | `SKILL.md` | 1 |
  | `scenarios.md` | 4 |
  | `coordinator.md` | 2 |
  | `reviewer.md` | 7 |
  | `required-roles.md` | 7 |

  바이트 단위로 같은지는 확인하지 않았습니다.
- **제품 범위 밖 변경:** `backlogs/dashboard/data.js`와 `.pace/memory/status.md`가 수정 상태입니다. diff를 볼 수 없어 내용은 판정하지 못했습니다. 패턴 검색에서 새 비밀은 나오지 않았고, data.js에 보이는 `/Users/me`·`sample@example.com`은 기존 합성 예시입니다.

## should_fix

### S1. 이전 버전으로 되돌리면 Claude 호출 훅이 종료 코드 2를 냄
- **위치:** `src/setup/install.ts:622-624`, `install.ts:629-634`, `bin/pace.ts:8`, `src/cli.ts:995`
- **현상:**
  - 훅 명령은 `'<pace>' agent call-hook --host claude # pace-managed-agent-call-v1`이고, 실패를 0으로 바꾸는 장치가 없습니다.
  - `call-hook`을 모르는 이전 버전을 다시 설치하는 경우가 문제입니다. 이전 설치기의 `removeHookGroups`는 부트 명령만 지우므로 호출 훅이 남습니다.
  - 남은 훅은 이전 버전 실행본을 부르고, 이전 버전은 `UsageError`를 던집니다. 이것이 `exitCode = 2`가 됩니다.
  - Claude에서 `SubagentStop`의 종료 코드 2는 서브에이전트 종료를 막고, `PostToolUse`의 2는 stderr를 모델에게 보냅니다. 체크리스트의 "되돌리기" 항목에 걸립니다.
- **조치:** 명령을 `… agent call-hook --host claude >/dev/null 2>&1 || true # pace-managed-agent-call-v1`처럼 감싸 항상 종료 0을 보장합니다. 이전 버전의 Claude 설정에 훅이 남은 상태도 설치 시험에 넣습니다.

### S2. 증거에 로컬 사용자 홈 경로가 노출됨
- **위치:** `projects/P014_…/tasks/T04_호출_절차_연결/evidence/h01-handoff-chain.json:36`
- **현상:** 기록된 모델 응답에 `~/.agents/skills/pace-project-dev/references/…` 링크가 세 번 들어 있습니다. 로컬 사용자명이 커밋되는 증거에 남습니다. 비밀은 아니지만 "식별자·내부 경로 노출"에 해당합니다.
- **조치:** `~/.agents/…` 또는 저장소 상대 경로로 가리고, 마스킹했다는 사실을 증거 메모에 적습니다. P014 폴더 전체에서 이 경로가 나온 곳은 이 파일 하나입니다.

## note

- **N1. 범위 영수증이 계속 쌓임** (`src/agent/call-hook.ts:53-62`): `<git common dir>/pace/native-call-scopes/<hash>.json`을 서브에이전트 호출마다 만들고 정리하지 않습니다. 영수증에는 checkout의 절대 경로가 들어 있습니다. 로컬 파일이고 커밋되지는 않으며, 해시 이름만 쓰므로 위험은 낮습니다. 보존 기한이나 정리 방법을 문서에 적을 것을 권합니다.
- **N2. 훅이 사용자의 모든 Claude 세션에서 실행됨** (`call-hook.ts:100-105`, `src/agent/call-context.ts:58-64`): PACE 배치(`project/P###` 브랜치, `projects/…/PROJECT.md`, 등록된 역할)를 흉내 낸 저장소라면 그 작업본에 `calls/log.jsonl`과 잠금 파일을 씁니다. 링크·nlink·크기 검사가 있어 경로 탈출은 없습니다. 저장소별 동의 없이 자동으로 쓴다는 점은 SECURITY.md에 한 줄 적어 두는 편이 좋습니다.
- **N3. 수동 기록으로 외부 검토 연결을 막을 수 있음** (`src/cli.ts:798-801`, `src/agent/review-hand.ts` `externalCallLink`): 수동 `agent_call` 행이 범위 안의 검토 기록 파일을 `ref`로 먼저 가리키면, 나중에 오는 정식 `--call-id` 연결이 "이미 연결됨"으로 거부됩니다. 자기 신고 모델이라 문서상 한계(SECURITY.md:30) 안에 있습니다. 수동 입력에서 `review-records/` 아래를 `ref`로 쓰지 못하게 하는 방안을 검토할 만합니다.
- **N4. 역할 권한 경계가 프롬프트뿐** (`.claude/agents/pace-troubleshooter.md`, `.codex/agents/pace-troubleshooter.toml`): `tools: []`이고 부모 도구를 그대로 물려받습니다. "작업본 수정 안 함"은 지침으로만 지켜집니다. 문서가 보안 경계가 아니라고 명시하고 있어(SECURITY.md:32) 정합성은 맞습니다. 다만 Codex에는 `sandbox_mode = "read-only"`, Claude에는 Edit·Write 차단 같은 생성물 수준 제한을 후속 백로그로 발의할 것을 권합니다.
- **N5. 훅 최악 지연이 timeout 10초를 넘을 수 있음** (`call-hook.ts`, `src/team/resource-lock.ts:72`): git 호출(각 5초 제한)이 여러 번 있고, 잠금 대기가 최대 3초, 영수증 재시도가 200ms입니다. 시간을 넘기면 호스트가 훅을 끝내고 행을 버립니다. 세션 시작(`boot`)과는 분리돼 있어 차단 위험은 없고, 기록 누락만 생길 수 있습니다.

## 문제없음으로 확인한 경계

- **입력·경로:** `parseAgentCall`은 키를 정확히 맞추고 ID·시각·태스크·출처를 검증하며 음수를 거부합니다(`agent-calls.ts:49-96`). `ref`는 `permissionPath`로 `..`·`.git`·제어문자를 막고, `safeTeamPath`로 링크를 거부한 뒤 범위 안의 기존 일반 파일만 받습니다. 원장 읽기는 `regularBytes`(nlink 1, O_NOFOLLOW, 32MiB)입니다.
- **중복·부분 실패:**
  - 같은 ID는 `enrich`로 합치고, 값이 충돌하면 거부합니다.
  - 잠금은 owner 프로세스가 죽은 것이 확인될 때만 회수합니다. 잠금 파일 `*.local.json`은 gitignore 대상입니다.
  - 외부 검토에서는 원장 기록보다 claim 예약을 먼저 합니다. 원장 쓰기가 실패해도 같은 예약으로 다시 실행해 복구됩니다.
  - 집계는 호출 원장과 검토 원장을 합산하지 않고, 읽을 수 없으면 "보류"로 표시합니다.
- **비밀·식별자:**
  - 호스트의 `session_id`·`agent_id`·`prompt_id`는 도메인을 분리한 sha256으로만 남습니다.
  - 모델·effort 값은 `callIdentifier` 비밀 검사를 거칩니다.
  - 경고는 고정 문구만 출력합니다(`call-context.ts:103`).
  - 검토 기록은 `session_id: null`입니다.
  - 증거의 UUID는 PACE가 만든 call_id·recovery_id·trigger이고 호스트 세션 ID가 아닙니다.
- **설치:** 관리 표지가 붙은 정확한 명령만 제거·교체하고 사용자 훅은 보존합니다. 백업, 링크 거부, 홈 상대 백업 경로가 유지됩니다. SessionStart 부트 훅도 바뀌지 않았습니다.

## 비밀 검사

- **secret-scan:** 이번 세션에서는 실행할 수 없었습니다. 기존 기록은 2026-11-26T15:24:52Z에 8,798개 파일이 통과했다는 것입니다(`T04/evidence/security.txt`). 그 뒤에 추가된 파일이 있는지는 알 수 없으므로, finish 전에 마지막 파일까지 다시 실행해야 합니다.
- **대체 패턴 검색:** P014 폴더 전체를 대상으로 했습니다. `sk-`, `sk-ant-`, `ghp_`, `github_pat_`, `AKIA`, `xox*`, PEM 개인키, `AIza`, JWT, `key/token/password=` 형식이 **모두 0건**입니다. 이 검색은 secret-scan 도구와 같지 않습니다.
