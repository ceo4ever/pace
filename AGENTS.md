# PACE

LLM CLI 세션 시작 훅으로 올라오는 개인 비서 에이전트. TypeScript, Node 24+에서 빌드 없이 실행, 런타임 의존성 없음.

## 명령

- 검사: `npm run check` (타입 검사 `tsc` + `node --test`)
- 개발 중 빠른 검사: `pace test changed` — 커밋되지 않은 변경과 기준 브랜치의 `.pace/test-map.json`·`checks`를 사용한다. 구성 채택 전/공통·미분류 변경은 선언된 전체 검사로 전환한다. 태스크·finish의 전체 검사는 유지한다(`docs/README.md`, 사용자 예시는 `README.md`).
- 실행: `./bin/pace.ts <명령>` — 개발·테스트는 `PACE_HOME`을 임시 폴더로 지정한다. `~/.pace`은 설치 때 복사한 설치본이다 — 소스 변경은 `bash scripts/install.sh`를 다시 실행해야 반영된다

## 꼭 지킬 것

- 상대 import는 `.ts` 확장자를 붙이고, 타입 전용 문법만 쓴다(`erasableSyntaxOnly` — enum·namespace 금지).
- `pace boot`는 어떤 오류에도 종료 코드 0과 유효한 훅 형식을 낸다. 세션 시작을 막지 않는다.
- 공유 목차(`INDEX.md`, `index.md`)는 직접 고치지 않고 파일 목록에서 다시 만든다.
- `scripts/install.ps1`은 UTF-8 BOM을 유지한다 — PowerShell 5.1이 BOM 없는 파일의 한글을 깨뜨린다. 스크립트로 고친 뒤 `head -c3`로 `efbbbf` 확인.
- 설치 스크립트는 설치까지만 한다 — 성공하면 결과 한 줄만, 실패할 때만 상세 출력. 온보딩 실행·안내 없음.
- 백로그(`BL{YYMMDD}_{NN}_이름/`) → 프로젝트, 브리프(영어 brief, `BR{NN}_이름.md`) → 같은 번호 태스크. 상태를 바꾸면 `BACKLOG.md` 현황 표도 고친다(`pace project done`은 함께 갱신). 완료 백로그에는 덧붙이지 않고 새 백로그·메모리 `idea`로 발의한다.
- 작은 일이 아니면 프로젝트(`pace project`)로 한다 — worktree에서 태스크마다 check 통과·done 뒤 커밋, 병합은 main에서 사람 승인 뒤. 작은 일은 main 직접 커밋, 설치(`scripts/install.*`)는 main에서만. 절차는 `pace-project-dev` 스킬.
- `docs/README.md` 환경의 하네스 라벨(`검사`·`보안 검사`·`worktree 준비`)은 이름을 바꾸지 않는다 — `pace project`가 읽는다.

## 더 보기

- 작업 시작 때: `docs/README.md` — 정의서(지도): 구성 요소·환경·작업 프로세스, 상세 문서 위치(문서 표)
- 경로를 고칠 때: 정의서 문서 표에서 그 경로가 적용 범위인 서브 문서(`docs/*.md` — 예: `src/daemon/**` → `docs/DAEMON.md`, 민감 경로 → `docs/SECURITY.md`)
- 작업: 프로젝트 `pace project list` (`projects/P###_…`), 백로그 `backlogs/BL…/` (`BACKLOG.md` 개요·결정, `BR…` 브리프)
- 진행 상황·이슈·할 일: `pace memory list --project` · 상세 `pace memory show <slug> --project`
- 결정의 이유·도구별 훅 동작·설치 함정: `pace brain search "<질의>"` (`.pace/brain/`)
