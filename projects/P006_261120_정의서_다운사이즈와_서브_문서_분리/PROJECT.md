# P006 정의서 다운사이즈와 서브 문서 분리

- 상태: 진행
- 규모: 작은 프로젝트(태스크 없음)
- 출처: 대화 2026-11-20
- 브랜치: `project/P006` · worktree: `../pace.wt/P006/`
- 작업자:
- 시작: 2026-11-20

## 목적

정의서 `docs/README.md`(40.7KB)는 구조·도구·환경을 다 담고 있지만 너무 무거워 세션에서 읽히지 않는다. 그래서 에이전트가 매번 bash로 구조를 다시 찾는다. 정의서를 한 번에 읽을 수 있는 지도로 줄이고, 상세는 모듈·주제별 서브 문서로 옮겨 필요한 것만 읽게 한다.

## 재료

- 대화 2026-11-20: 캡틴 지시 "docs/README.md의 문서를 다운사이즈하고, 서브 문서로 분리".
- 하네스가 정의서에서 읽는 것: 환경 표 라벨 `검사`·`보안 검사`·`worktree 준비`·`의존성 감사`(`src/project/harness.ts:350`, `:366`), `작업자 도구:`(`:575`).
- 정의서 내용을 검사하는 테스트: `test/adopt-opal-docs.test.ts` S-3(OPAL 행·README 링크·문서 표 README 행·라벨 행).
- 정의서를 가리키는 곳: `AGENTS.md:24`(더 보기), `docs/ARCHITECTURE.md:24·29`, 스킬 `pace-project-dev` references(환경·문서 표만 가리킴 — 두 절은 남는다).
- opi 템플릿 `skills/pace-project-init/references/project-docs.md` — 정의서 절(개요·원칙·범위·구성 요소·환경·작업 프로세스·문서·용어)과 `docs/SECURITY.md` 분리 예시.
- 브레인:
  - `.pace\brain\pages\flow\작업-하네스-흐름.md` — 정의서는 `docs/README.md` 하나로 고정, 기준 문서는 문서 표 용도·적용 범위로 고름
  - `.pace\brain\pages\concept\작업-하네스-실측-함정.md` — 정의서 라벨은 한 번만·표 첫 칸에
  - `.pace\brain\pages\concept\백로그-대시보드-자동-갱신과-git-경계.md` — 대시보드 절의 근거
  - `.pace\brain\pages\concept\canvas-추출-도구-봉인과-설치-경계.md` — Canvas 묶음 설치 문단의 근거

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | `docs/README.md`가 원래(40,703바이트)의 절반 이하다 | `wc -c docs/README.md` ≤ 20,351 |
| P-2 | 하네스가 읽는 선언 4개(`검사`·`보안 검사`·`worktree 준비`·`의존성 감사`)가 전후 같다 | 하네스 `declaredCommand`로 전후 값 비교 스크립트 |
| P-3 | 정의서에서 빠진 상세 문장은 서브 문서에 그대로 있다(새로 쓴 한 줄 요약 제외) | 삭제된 문장·표 칸이 `docs/*.md`에 있는지 대조하는 스크립트 |
| P-4 | 새 서브 문서는 모두 정의서 문서 표에 용도·적용 범위와 함께 등록되고, 정의서·서브 문서의 상대 링크가 모두 실제 파일을 가리킨다 | 문서 표 대조 + 링크 대조 스크립트 |
| P-5 | 정의서 구성 요소 표에서 각 행이 한 줄 요약과 상세 문서 링크를 갖고, 빠져 있던 `src/dashboard/`가 등록된다 | 표 검토 |
| P-6 | 옮긴 절을 가리키던 문서(`AGENTS.md`·`docs/ARCHITECTURE.md`)와 브레인 근거가 새 위치를 가리킨다 | `grep`·`pace brain lint` 오류·경고 0 |
| P-7 | 저장소 검사와 보안 검사가 통과한다 | `npm run check`(S-3 포함) · `node scripts/secret-scan.ts` |

## 설계

정의서는 opi 템플릿의 절을 모두 유지하고 본문만 줄인다. 상세 문단·표 칸은 고쳐 쓰지 않고 그대로 서브 문서로 옮긴다. 새로 쓰는 것은 정의서의 한 줄 요약과 링크뿐이다.

| 서브 문서 | 옮기는 것 | 적용 범위 |
|---|---|---|
| `docs/AGENT-CALL.md` | 구성 요소 `src/agent/`·`src/mcp/` 상세 | `src/agent/**`, `src/mcp/**` |
| `docs/DAEMON.md` | 구성 요소 `src/daemon/` 상세 | `src/daemon/**` |
| `docs/PLANNING-TOOLS.md` | `src/scout/`·`src/intent/` 상세, "화면 기획과 Canvas" 절 | `src/scout/**`, `src/intent/**`, `skills/pace-intent/**`, `skills/pace-scout/**` |
| `docs/ADOPT-OPAL.md` | OPAL 가져오기 상세(정의서에는 S-3이 요구하는 행 유지) | `src/project/adopt-opal.ts` |
| `docs/SETUP.md` | 설치 상세, Canvas 묶음 설치 문단 | `src/setup/**`, `scripts/install*`, `skills/pace-canvas-skills/**` |
| `docs/PLAYBOOK.md` | 플레이북 생성기 상세 | `skills/pace-playbook-maker/**` |
| `docs/DASHBOARD.md` | "백로그 대시보드" 절 | `src/dashboard/**`, `src/project/dashboard*.ts`, `backlogs/**` |
| `docs/TESTING.md` | 검사 선택 상세, 테스트 임시 루트 문단, 보안 검사 제외 상세 | `test/**`, `src/test-runner/**`, `scripts/secret-scan.ts` |
| `docs/WORK-PROCESS.md` | 작업 프로세스 세부(백로그 상태 전환·지표·사전 검토·사건 작성·대기·측정·선언 명령·커밋 게이트), 작업자 모델 설정 | `src/project/**`, `projects/**` |
| `docs/SECURITY.md` | "보안" 절 전체(민감 경로·체크리스트) — 문서 표 `security` 행을 이 파일로 | 기존 `§보안` 적용 범위 그대로 |

- 정의서에 남기는 것: 하네스 라벨 행(명령 그대로), 런타임·설치·실행·환경변수 행, 설치본 재설치 문단, 작업 프로세스 핵심 줄(관리 방식·백로그·프로젝트·브랜치·병합·상태 값·기록 위치·커밋), 문서 표, 용어.
- 덤으로 고치는 것: 작업 프로세스의 worktree 예시 `../ai-framework.wt/` → `../pace.wt/`, 대시보드 절 끝의 Canvas 묶음 문단은 설치 문서로.
- `docs/ARCHITECTURE.md`의 자체 구성 표는 이번 범위 밖(근거 문구만 고침) — 중복 정리는 idea로.
- 보안 영향: 문서만 바뀐다. 하네스가 읽는 선언·문서 표 `security` 용도 행의 적용 범위는 그대로 유지해 기준 문서 선택이 달라지지 않게 한다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `docs/README.md` | 본문 축소, 구성 요소 한 줄·링크, 문서 표 등록 |
| `docs/*.md` (새 서브 문서) | 옮긴 상세 |
| `docs/ARCHITECTURE.md` | 옮긴 절을 가리키는 근거 문구 |
| `AGENTS.md` | 더 보기의 정의서·서브 문서 안내 |
| `.pace/brain/` | 옮긴 문단을 근거로 쓰는 페이지의 근거 경로 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-20 19:51 | 정의 작성 |
| 2026-11-20 20:05 | 착수 결정 — 출처: 대화 2026-11-20 캡틴 지시. worktree 프로젝트로 진행: main 직접 finish는 커밋된 브레인 변경을 보지 못하는 이슈(main-직접-finish-브레인-반영-검사-모순) 때문 |
