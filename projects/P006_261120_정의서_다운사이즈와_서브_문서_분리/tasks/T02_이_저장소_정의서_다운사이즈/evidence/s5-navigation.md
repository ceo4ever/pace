# S-5 — 정의서 하나에서 출발한 탐색(지도 기능)

- 수행: 호스트 새 맥락 에이전트(anthropic). 출발점은 `docs/README.md` 하나, 규칙은 파일 읽기만(검색·셸 금지), 링크나 문서 표 경로로 도달한 파일만 열기, 파일 변경 없음. 도구 사용 6회(읽기).
- 채점(PM, TASK 정답 근거 대조):

| # | 질문 | 답 | 경로(링크 수) | 도착 절 | 판정 |
|---|---|---|---|---|---|
| 1 | daemon 쓰기 승인 | 시작 전 승인 필요(기본 읽기 전용), 작업·범위·사용자·대화·만료·기동 ID에 묶여 한 번만, 재시작 뒤 무효·needs_review | 정의서 구성 요소 → DAEMON.md (1) | `## 상시 실행 daemon` | 통과 |
| 2 | 대시보드 PC 경로 | `backlogs/dashboard/local.js`, init이 만드는 `backlogs/dashboard/.gitignore`로 제외(`git check-ignore -v`로 판단) | 정의서 → DASHBOARD.md (1) | 본문 둘째 문단(절 제목 없음) | 통과 |
| 3 | `src/test-runner/` 민감 이유 | 경로·실행 대상 검사, 고정 어댑터 인자 배열 실행, vitest 로컬 의존성 코드 실행, 격리 없음·결과를 보안 증거로 보지 않음, `all`은 선언 셸 실행 | 정의서 `## 보안` → SECURITY.md (1) | 민감 경로 표 | 통과 |
| 4 | `pace test changed` | 변경 관련 단위·명시 사전 검사, 불확실하면 전체 선언, Vitest는 전체로 전환 | 구성 요소 → TESTING.md#검사-선택 (1) | `## 검사 선택` | 통과 |
| 5 | 보안 검사 명령 | `node scripts/secret-scan.ts` | 정의서 환경 표 (0) | `## 환경` | 통과 |
| 6 | 작업자 모델 설정 | `pace worker show/set/reset`, `PACE_HOME/worker-settings.json` | 작업 프로세스 → WORK-PROCESS.md (1) | `## 작업자 모델 설정` | 통과 |

- 에이전트 평가 원문 요약: "정의서만 보고도 6개 질문 모두 링크 한 번 안에 답할 위치를 찾았다. 구성 요소 표의 요약 · 상세 열과 문서 표의 적용 범위가 지도 역할을 잘 했다."
- 지적과 처리:
  - 환경 표 `선택 검사` 행이 사용자 README 절을 글로만 가리킴 → 원문 뒤에 링크 `[바로 가기](../README.md#변경-기반-빠른-검사)` 추가(반영).
  - DAEMON.md가 거대한 한 문단, DASHBOARD.md에 하위 절 제목 없음 → 기준의 "원문 그대로 옮김"(T01) 때문 — 상세 문서 안 구조 정리는 남긴 것(T02 범위 밖).

## S-5b — 새 세션처럼 AGENTS.md에서 출발 (tester 1단계 제안의 실측)

- 수행: 호스트 새 맥락 에이전트, 출발점 AGENTS.md 하나, 파일 읽기만(검색·셸 금지), 도구 6회.
- A `src/daemon/core.ts` 수정 전 기준 문서 → AGENTS → README 문서 표(`src/daemon/**`) → DAEMON.md: 승인 규칙(기본 읽기 전용·시작 전 승인·작업·범위·사용자·대화·만료·기동 ID 결속·재시작 무효·needs_review·quarantine) 정답. 통과.
- B 보안 검사 제외 → README 환경 표 링크 → TESTING.md "보안 검사": 네 가지 제외 조건 정답. 통과(AGENTS에서 직접은 아니고 정의서 한 번 경유).
- C `scripts/install.sh` → 문서 표 적용 범위로 SECURITY.md·SETUP.md: 민감 이유(사용자 홈 도구 설정 쓰기·백업·삭제)와 설치 상세 정답. 통과.
- 에이전트 평가: "AGENTS.md 더 보기의 '작업 시작 때 docs/README.md'·'경로를 고칠 때 문서 표의 적용 범위'와 예시로 시작점이 분명했다."
- 같은 시점 reviewer 1단계 지적(test-runner·playbook 도구 경로로 찾아간 TESTING·PLAYBOOK이 SECURITY로 이어지지 않음)을 반영해 민감 경로를 다루는 서브 문서 5개 머리말에 SECURITY 링크를 넣었다(대조 도구 참조 대조에 항목 추가).

## 기록 메모

- 문항 ③은 TASK의 "민감 경로 목록"을 더 구체적인 "`src/test-runner/`가 민감한 이유"로 바꿔 물었다(정답 근거·허용 경로는 같다: SECURITY.md, 링크 1).
- S-5 뒤 바뀐 링크 세 곳(선택 검사 행 사용자 README 링크, 서브 문서 5개 SECURITY 머리말, 워크스페이스 등록부 `—`)은 탐색을 다시 돌리지 않았다 — 링크 추가·막다른 링크 제거라 탐색 경로를 줄이지 않는다. 대조 도구의 링크·참조 검사로 확인.

## 응답 원문 — S-5 (정의서 출발)

1. daemon의 쓰기 작업 승인 — 답: 쓰기 작업은 시작 전에 승인을 받아야 하고, 기본은 읽기 전용이다. 승인은 작업·범위·사용자·대화·만료·기동 ID에 묶이고 한 번만 처리된다. 강제 종료나 재시작이 일어나면 이전 승인은 모두 무효가 된다. 실행 중이던 쓰기 작업은 자동으로 다시 돌지 않고 `needs_review` 상태로 남는다. 경로: 정의서 구성 요소 표의 "상시 실행 daemon" 행 → `docs/DAEMON.md` (링크 1회). 찾은 곳: `docs/DAEMON.md`, `## 상시 실행 daemon` 절.
2. 대시보드의 PC별 경로 — 답: `backlogs/dashboard/local.js`에 둔다. 이 파일은 `pace backlog init`이 함께 만들고 커밋하는 `backlogs/dashboard/.gitignore` 때문에 Git에서 빠진다. 실제로 빠지는지는 `git check-ignore -v`로 그 `.gitignore`가 빼는지 보고 판단한다. 기존 `.gitignore`가 맞지 않으면 init은 실패한다. 경로: 정의서 → `docs/DASHBOARD.md` (링크 1회). 정의서 구성 요소 표에도 "PC 경로는 Git 밖 `local.js`"라고 미리 나와 있다. 찾은 곳: `docs/DASHBOARD.md` 본문 둘째 문단(절 제목 없음).
3. `src/test-runner/`가 민감한 이유 — 답: 경로·glob·실경로와 실행 대상을 검사하고, 고정된 Node·Python·vitest 어댑터를 인자 배열로 실행한다. vitest의 file/unit은 프로젝트의 로컬 `node_modules/vitest`, 즉 사용자 의존성 코드를 실행한다. 사용자 코드 실행을 격리하지 않으며, 테스트 코드가 결과 채널을 조작할 수 있어서 결과를 보안 증거로 보지 않는다. `all`은 저장소에 선언된 검사를 셸로 실행한다. 경로: 정의서 `## 보안` → `docs/SECURITY.md` (링크 1회). 찾은 곳: `docs/SECURITY.md` 민감 경로 표.
4. `pace test changed`의 동작 — 답: 작업본 변경과 관련된 단위와 명시된 사전 검사를 실행한다. 불확실하면 그 프로젝트의 전체 선언 검사를 실행한다. Vitest는 부분 실행 대신 실제 전체 검사로 전환한다. 경로: 정의서 구성 요소 표의 "검사 선택" 행 → `docs/TESTING.md#검사-선택` (링크 1회). 찾은 곳: `docs/TESTING.md`, `## 검사 선택` 절.
5. 보안 검사 명령 — 답: `node scripts/secret-scan.ts`. 커밋될 파일에서 비밀 원문을 찾는다. 경로: 정의서만 봐도 된다(링크 0회). 제외 목록 같은 상세는 `docs/TESTING.md`에 있다(링크 1회). 찾은 곳: `docs/README.md` `## 환경` 표 `보안 검사` 행, 상세는 `docs/TESTING.md` `## 보안 검사` 절.
6. 작업자 모델·effort 설정 — 답: `pace worker show`, `pace worker set <도구> <model|effort> <값>`, `pace worker reset <도구> <model|effort>`. 설정은 `PACE_HOME/worker-settings.json`에 저장되며, 설치본을 바꿔도 영향받지 않는다. `project start --model/--effort`를 주면 그 실행에서는 이 값이 우선한다. 경로: 정의서 `## 작업 프로세스` → `docs/WORK-PROCESS.md` (링크 1회). 찾은 곳: `docs/WORK-PROCESS.md`, `## 작업자 모델 설정` 절.

평가 원문: 정의서만 보고도 6개 질문 모두 링크 한 번 안에 답할 위치를 찾았다. 구성 요소 표의 "요약 · 상세" 열과 문서 표의 적용 범위가 지도 역할을 잘 했다. 아쉬운 곳은 세 군데다 — 환경 표 `선택 검사` 행은 "README.md의 '변경 기반 빠른 검사'"를 일반 텍스트로만 적어 링크가 없다. `DAEMON.md`는 거대한 한 문단이라 승인 규칙을 찾으려면 본문을 훑어야 한다. `DASHBOARD.md`는 하위 절 제목이 없어 "찾은 절"을 특정하기 어렵다.

## 응답 원문 — S-5b (AGENTS.md 출발)

A. `src/daemon/core.ts` 수정 전 — 읽어야 할 문서는 `docs/DAEMON.md`의 「상시 실행 daemon」 절이다. 정의서 문서 표에서 이 문서의 적용 범위가 `src/daemon/**`이다. `src/**` 전체에 걸리는 `docs/ARCHITECTURE.md`도 적용 범위에 들어가지만 열어 보지는 않았다. 쓰기 승인 규칙: 기본은 읽기 전용, 쓰기 작업은 시작 전 승인. 승인은 작업·범위·사용자·대화·만료·기동 ID에 묶이고 한 번만 처리. 강제 종료나 재시작 뒤 이전 승인은 모두 무효, 실행 중이던 쓰기 작업은 `needs_review`. 회수를 증명하지 못한 경로는 격리(`quarantine`)되고 `pace daemon release`로만 풀린다. Telegram 승인 버튼 콜백에는 승인 ID만, 판정은 코어. 연 순서: AGENTS.md → docs/README.md → docs/DAEMON.md.
B. 보안 검사 제외 대상 — `docs/TESTING.md` 「보안 검사」 절. 검사 대상은 커밋될 파일(추적 + 무시되지 않는 새 파일). 제외는 교본 원문 예시 파일 5개, 테스트 파일의 가짜 값(이유 표기), 대시보드 `data.js`는 통째로 빼지 않고 JSON을 풀어 값마다 검사(코드 파일 키만 표현식 완화), Canvas 묶음 2.0.1 JS 오탐 5개는 경로와 SHA-256이 정확히 일치할 때만. `docs/SETUP.md` 「Canvas 묶음 설치」 절에도 같은 내용. 연 순서: README.md 환경 표 `보안 검사` 행(TESTING 링크) → docs/TESTING.md.
C. `scripts/install.sh` 수정 — 민감 경로가 맞다. 근거는 `docs/SECURITY.md` 민감 경로 표: `src/setup/`과 `scripts/install.*`는 사용자 홈의 도구 설정(`~/.claude`·`~/.codex` 등)을 쓰고 백업하고 지운다. 따라서 PROJECT.md 보안 영향에 적고 reviewer는 보안 관점을 먼저 본다, 테스트는 실패 경로까지. 설치 상세는 `docs/SETUP.md` 「설치」 절(PACE 표지가 있는 것만 바꾸고 원본은 `~/.pace-install-backup-…`에 백업). AGENTS.md 규칙: 설치는 main에서만, 성공하면 결과 한 줄만. 연 순서: docs/SECURITY.md·docs/SETUP.md(README.md 문서 표 적용 범위 `scripts/**`·`scripts/install*`).

평가 원문: 분명했다. 「더 보기」에 "작업 시작 때 `docs/README.md`"와 "경로를 고칠 때 문서 표의 적용 범위"가 있고, `src/daemon/**` → DAEMON.md, 민감 경로 → SECURITY.md 예시까지 있어 바로 찾아갔다. 다만 B는 AGENTS.md에서 바로 가지 못하고 README.md 환경 표의 링크를 한 번 거쳐야 했다.

## S-5 2차 — TASK 문항 그대로 (reviewer 2단계 F1)

- 수행: 새 맥락 에이전트, 정의서 하나에서 출발, 파일 읽기만, 도구 7회. 질문은 TASK S-5의 여섯 문항 그대로(③ 민감 경로 목록).
- 채점(PM): ① DAEMON.md(1) 정답 ② DASHBOARD.md(1) 정답 ③ SECURITY.md(1) — 민감 경로 표의 15개 항목 전부 나열, 정답 ④ TESTING.md 검사 선택(1) + 사용자 README 변경 기반 빠른 검사(링크 합계 2) 정답 ⑤ 정의서 환경 표(0) 정답 ⑥ WORK-PROCESS.md(1) 정답. 6/6 통과, 모두 허용 경로(링크 2번 이내), 검색 우회 없음.
- 에이전트가 짚은 것(남긴 것): TESTING "검사 선택"은 한 문장이라 상세는 사용자 README까지 가야 함, DAEMON.md 한 문단, 정의서 문서 표의 SECURITY 적용 범위가 SECURITY.md 민감 경로 표와 다름(`src/test-runner/`·`skills/pace-playbook-maker/tools/`·`src/project/situation.ts`가 범위에 없음 — 기준선 범위를 계약대로 유지했고, 대신 서브 문서 머리말에서 SECURITY로 잇는다).

### 응답 원문

1. 상시 실행 daemon의 쓰기 작업 승인 규칙은?
(a) 쓰기 작업은 시작하기 전에 승인을 받아야 하고, 기본은 읽기 전용이다. 승인은 작업·범위·사용자·대화·만료·기동 ID에 묶이며 한 번만 처리된다. 강제 종료나 재시작 뒤에는 이전 승인이 모두 무효가 된다. 실행 중이던 쓰기 작업은 자동으로 다시 실행하지 않고 `needs_review`로 둔다. 회수를 증명하지 못한 경로는 영속 격리(`quarantine`)하며 `pace daemon release`로만 푼다. Telegram에서는 인라인 버튼으로 승인한다. 콜백에는 승인 ID만 담기고 판정은 코어가 한다.
(b) `docs/README.md` → `docs/DAEMON.md` (링크 1회, 구성 요소 표의 `[DAEMON](DAEMON.md)`)
(c) `docs/DAEMON.md` — `## 상시 실행 daemon`

2. 백로그 대시보드에서 PC마다 다른 경로는 어느 파일에 두며, 그 파일이 Git에서 빠지는 방법은?
(a) PC마다 다른 경로는 `backlogs/dashboard/local.js`에 둔다. 이 PC의 공용 자산 file URL을 담는 PC별 파일이다. `pace backlog init`이 함께 만드는 `backlogs/dashboard/.gitignore`가 이 파일을 Git에서 뺀다. 이 `.gitignore`는 커밋하는 파일이다. 제외 여부는 이 `.gitignore`가 실제로 빼는지를 `git check-ignore -v`의 출처로 판단하며, 부정 규칙이 아니어야 한다. 이 PC에만 있는 규칙에는 기대지 않는다. 기존 `.gitignore`가 맞지 않으면 고치지 않고 init이 실패한다. 진입 HTML `backlogs/README.html`(`pace:backlog-shared:2`)은 모든 PC에서 같은 바이트다.
(b) `docs/README.md` → `docs/DASHBOARD.md` (링크 1회, 구성 요소 표의 `[DASHBOARD](DASHBOARD.md)`)
(c) `docs/DASHBOARD.md` — 절 제목 없음. 최상위 `# 백로그 대시보드` 아래 두 번째 문단이다.

3. 이 저장소의 민감 경로 목록은?
(a) `src/setup/` · `scripts/install.*` · `src/boot.ts` · `src/project/situation.ts` · `src/core/fsutil.ts` · `src/test-runner/` · `src/project/backlog.ts` · `src/project/harness.ts` (new·done) · `src/project/harness.ts` (merge·finish·start) · `src/scout/**` · `src/intent/**` · `src/memory/` · `src/profile/` · `src/project/brain.ts` · `skills/pace-playbook-maker/tools/`
(b) `docs/README.md` → `docs/SECURITY.md` (링크 1회, `## 보안` 절의 `[SECURITY](SECURITY.md)`)
(c) `docs/SECURITY.md` — `# 보안` 아래 민감 경로 표. 별도 하위 절은 없다.

4. `pace test changed`의 실행 범위와, 불확실할 때 전체로 전환하는 규칙은?
(a) 범위: staged·unstaged·ignore되지 않은 untracked 파일, 즉 작업본 변경과 관련된 단위의 시험과 명시한 사전 검사(`checks`)를 실행한다. 커밋된 브랜치 차이를 검사하는 명령은 아니다. 부분 실행은 `node-test`와 `python-unittest`만 지원한다. 선언 기준은 로컬 `main`이고, 없으면 `master`, 둘 다 없으면 현재 `HEAD`의 검증된 커밋이다. map과 checks는 그 기준 커밋의 것을 쓴다. 전체 전환 규칙: 불확실하면 그 프로젝트의 전체 선언을 실행한다 — Vitest·미지원 러너·설정·전제가 관련되면 사전 검사 전에 실제 전체 검사로 전환, 작업본 map이 기준 map과 다르면 전체, 공통·미분류·삭제·이름 변경·충돌·모드·submodule·구성 변경은 보수적으로 전체, assume-unchanged·skip-worktree·sparse checkout이면 전체, 선택 결과만 확인할 수 없으면 전체, PACE 자체도 새 checks map이 main에 반영되기 전 worktree에서는 전체, 실제 실패를 후속 시험이나 전체 재실행으로 덮지 않는다.
(b) `docs/README.md` → `docs/TESTING.md` (링크 1회, 구성 요소 표의 `[TESTING](TESTING.md#검사-선택)`). 이어서 `docs/README.md` → `README.md` (링크 1회, 환경 표 `선택 검사` 행의 `[바로 가기](../README.md#변경-기반-빠른-검사)`). 합계 링크 2회.
(c) 요약은 `docs/TESTING.md` — `## 검사 선택`. 상세 범위와 전환 규칙은 `README.md` — `### 변경 기반 빠른 검사`.

5. 보안 검사 명령은?
(a) `node scripts/secret-scan.ts`. 커밋될 파일(추적 파일과 무시되지 않는 새 파일)에서 비밀 원문을 찾는다. 제외 대상: 교본 원문 예시 파일 5개, 테스트 파일의 가짜 값, 대시보드 `data.js`는 JSON을 풀어 값마다 검사, Canvas 묶음 2.0.1의 JS 오탐 5개는 경로와 SHA-256이 일치할 때만 제외.
(b) `docs/README.md` (링크 0회). 제외 목록을 보려고 `docs/TESTING.md`를 열었다.
(c) 명령은 `docs/README.md` — `## 환경` 표의 `보안 검사` 행. 제외 목록은 `docs/TESTING.md` — `## 보안 검사`.

6. 작업자 모델을 설정하는 명령은?
(a) `pace worker set <도구> <model|effort> <값>`이다. 예: `pace worker set codex model gpt-6.1-sol`. 조회는 `pace worker show`, 되돌리기는 `pace worker reset <도구> <model|effort>`다. 설정은 `PACE_HOME/worker-settings.json`에 저장되고 재설치해도 유지된다. 한 번의 실행만 덮어쓰려면 `pace project start P### --model <모델> --effort <값>`을 쓴다. `--effort default`를 주면 도구 기본값을 쓴다. 초기 모델은 Codex `gpt-6.1-sol`, Claude `claude-opus-5-5`이다.
(b) `docs/README.md` → `docs/WORK-PROCESS.md` (링크 1회, `## 작업 프로세스` 절의 `[WORK-PROCESS](WORK-PROCESS.md)`)
(c) `docs/WORK-PROCESS.md` — `## 작업자 모델 설정`

헤맨 곳: TESTING.md의 `## 검사 선택`은 마침표 없이 끝나는 한 문장뿐이라 범위와 전환 규칙을 다 담지 못해 `README.md`까지 가야 했다. DAEMON.md는 하위 절 없이 한 문단이라 승인 규칙을 긴 문단 안에서 찾아야 했다. 또 정의서 문서 표에 적힌 SECURITY 적용 범위는 SECURITY.md 민감 경로 표와 다르다. 문서 표에는 `src/test-runner/`·`skills/pace-playbook-maker/tools/`·`src/project/situation.ts`가 직접 적혀 있지 않아 문서 표만 보면 목록을 잘못 알 수 있다.
