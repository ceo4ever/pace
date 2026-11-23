# 보안

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

민감 경로 — 설계에서 건드리면 PROJECT.md 보안 영향에 적고, 그 태스크 reviewer가 보안 관점을 먼저 본다. 테스트는 실패 경로(거부·오류)까지.

| 경로 | 왜 민감한가 |
|---|---|
| `src/setup/`, `scripts/install.*` | 사용자 홈의 도구 설정(`~/.claude`·`~/.codex` 등) 쓰기·백업·삭제 |
| `src/boot.ts`, `src/project/situation.ts` | 모든 세션 시작 경로 — 오류·지연이 세션을 막으면 안 된다(종료 코드 0, git timeout) |
| `src/core/fsutil.ts` | 원자적 파일 교체와 실패한 임시 파일 정리 — 이 호출이 만든 파일만 정리 |
| `src/test-runner/` | 경로·glob·실경로와 실행 대상을 검사, 고정 Node·Python·vitest 어댑터만 인자 배열로 실행(vitest file/unit은 프로젝트 루트 안의 로컬 `node_modules/vitest` 사용자 의존성 코드를 실행). 작업본 구성은 선택 범위 증거이며 사용자 코드 실행을 격리하지 않음. 테스트 코드는 결과 채널을 조작할 수 있으므로 신뢰한 코드만 실행하고 결과를 보안 증거로 취급하지 않음. `all`은 신뢰한 저장소의 검사 선언을 셸로 실행 |
| `src/project/backlog.ts`, `harness.ts` (new·done) | BL·BR·BACKLOG 파일 생성·기존 문서 상태 쓰기 — 실제 경로의 backlogs 포함 확인·외부 링크 거부·검증 후 쓰기, git 이력으로 복구 |
| `src/project/harness.ts` (merge·finish·start) | git 병합·브랜치 삭제·rebase, 파일 이동·덮어쓰기, 정의서에 선언된 명령을 `sh -c`로 실행(검사·보안 검사·worktree 준비·의존성 감사), Orca 작업자 세션 실행(`launchWorker`) |
| `src/scout/**` | 외부 URL 읽기(사용자가 준 링크·검색 결과, GET·시간 제한·크기 상한), 받은 콘텐츠를 HTML로 렌더(모두 이스케이프, 스크립트 실행 경로 없음), 실행 폴더 안에만 쓰기 |
| `src/intent/**` | 스킬 폴더 안 파일 읽기·`INDEX.md` 쓰기(references·렌즈 폴더 심볼릭 링크 거부, 렌즈는 일반 파일만 읽음, 형식 문제가 있으면 쓰지 않음). `render`는 사용자 데이터(plan.json)를 HTML로 — 데이터는 JSON 블록에만(`<`·U+2028/9 이스케이프), 화면은 텍스트 노드로만, 링크는 문서 ID와 http(s)만, 외부 스크립트·폰트 없음. `verify --root`는 근거 경로가 root 밖이면 실패로 본다. `preview`는 OUT 안의 Canvas를 스냅숏으로 읽고 묶음 도구를 인자 배열로 실행하며 소유·해시를 확인한 결과만 교체하고 실패 시 복원한다; `preview --verify`는 원본·파생물 해시를 확인한다. 경로의 동시 교체에 대한 원자성은 보장하지 않는다. |
| `src/memory/`, `src/profile/`, `src/project/brain.ts` | 사용자 파일 쓰기(`PACE_HOME` 프로필·메모리, 저장소 `.pace/` 메모리·브레인) — 경로가 해당 폴더 밖으로 나가지 않게 |
| `src/team/`, `src/core/worker-tiers.ts` | 팀 원본·native 생성물·개인 등급 설정 쓰기. 조상/파일 링크·nlink·파일 크기·foreign 충돌을 검사하고 관리 표지의 원본이 맞는 출력만 갱신한다. 표지는 진위 서명이 아니며 본문 속 표지로 소유권을 인정하지 않는다. 전체 사전 검사 뒤 파일별 원자 교체이며 다중 파일 트랜잭션/악의적 동시 경로 교체 방어를 보장하지 않는다. tools는 지침이고 부모 권한을 제한하지 않으므로 기존 native 제한의 이전 영향은 별도 확인한다([TEAM](TEAM.md)) |
| `skills/pace-playbook-maker/tools/` | 실제 서비스 화면·응답의 값을 읽고 캡처·승인·지도·실행 기록·이력을 쓴다 — 값 비기록(쓰기 전 민감 형식 검사), 가림 fail-closed(추출 값의 다른 노출 위치 검사 포함), 승인은 단계·행동·원본 해시와 계정·업무에 결속, 되돌릴 수 없는 행동은 수행 전 기록·조회로 판정(중복 0), 복구 반영은 저널로 원자적 |

체크리스트: `pace-project-dev` 스킬 `references/security.md`의 기본 체크리스트 + 위 민감 경로. 셸 실행은 인자 배열(`spawnSync`) — 예외는 정의서에 선언한 명령의 `sh -c` 실행과 Windows 온보딩의 LLM CLI 실행(`src/setup/onboard.ts`, `shell: win32`), 비밀 값은 환경 변수 이름만, 테스트는 실제 사용자 홈·Orca·도구 설정을 건드리지 않는다.
