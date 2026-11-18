# P003 대시보드 PC 경로 분리

- 상태: 완료
- 규모: 작은 프로젝트(태스크 없음) — main 직접
- 출처: 대화 2026-11-18
- 브랜치: `project/P003` · worktree: `../pace.wt/P003/`
- 작업자: 
- 시작: 2026-11-18

## 목적

백로그 대시보드 진입 HTML(`backlogs/README.html`)이 설치 PC의 절대 file URL을 담아, PC·clone마다 Git 변경이 생기고 커밋하면 다른 PC에서 화면이 깨진다. 커밋되는 파일에서 PC 경로를 빼고 PC별 경로는 Git 밖 파일로 분리해, 공유 저장소의 대시보드가 어느 PC에서도 Git 변경 없이 동작하게 한다.

## 재료

- 대화 2026-11-18: `pace backlog init` 뒤 `backlogs/README.html`의 `file:///C:/Users/roi.kang/...` → `file:///C:/Users/root-user/...` 한 줄 변경 확인. 캡틴이 "경로 파일 분리" 방식과 main 직접 진행을 결정.
- 코드: `src/project/dashboard-layout.ts:32` `renderDashboardEntry()`가 `pathToFileURL`로 공용 자산 절대 URL을 박는다 · `src/dashboard/backlog/page.html` 템플릿 · `src/project/dashboard-init.ts` init 전환 · `src/project/dashboard.ts:202` `refreshDashboard` · `src/project/adopt-opal.ts:287,467` OPAL 진입점 판별·교체
- 브레인: `.pace\brain\pages\concept\백로그-대시보드-자동-갱신과-git-경계.md` — "진입 HTML의 참조는 설치 PC에 종속된다. 다른 PC에서는 opi/init으로 재연결" (이번에 바꾸는 결정)
- 브레인: `.pace\brain\pages\concept\opal-가져오기-adopt-opal-결정과-함정.md` — 진입점은 원문 일치만 전환
- 문서: `docs/README.md:84-90`, `skills/pace-project-init/SKILL.md:144`

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 생성된 `backlogs/README.html`에 `file:` URL·설치 경로가 없고, 서로 다른 설치본으로 init해도 바이트가 같다 | `test/dashboard-init.test.ts` 설치본 두 개 재연결 시험 |
| P-2 | init 뒤 PC 경로는 `backlogs/dashboard/local.js`에만 있고, 같이 만든 `backlogs/dashboard/.gitignore`로 Git에 잡히지 않는다 — 다른 설치본으로 다시 init해도 `git status`에 변경이 없다 | 시험: init·커밋 → 다른 설치본 init → `git status --porcelain` 빈 출력 |
| P-3 | 기존 v1 진입점(file URL 포함, 수정 안 한 것)은 init이 새 형식으로 바꾸고, 사용자가 고친 진입점은 보존한다 | 시험: v1 생성본 전환 · 수정본 보존 |
| P-4 | 진입점이 새 형식이고 `local.js`가 없을 때(새 clone·worktree) `pace backlog refresh`가 `local.js`를 만든다 | 시험: local.js 지운 뒤 refresh |
| P-5 | OPAL 공용 진입점 가져오기가 계속 판별·전환되고 새 형식과 local.js를 만든다 | `test/adopt-opal.test.ts` |
| P-6 | 실제 브라우저에서 새 진입점이 화면(스타일·자료·앱)을 그리고, local.js가 없으면 init 안내 문구가 보인다 | 임시 저장소를 Chrome으로 열어 캡처 (`evidence/`) |
| P-7 | 저장소 검사 통과 | `npm run check` |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | P-1 | 서로 다른 설치본 두 벌(특수 문자 경로 포함) | 같은 저장소에서 차례로 `backlog init` | 진입 HTML 바이트 동일·`file:` 없음, local.js만 설치본별 URL | `test/dashboard-init.test.ts` "installed runtime URLs…"·"shared dashboard init…" |
| S-2 | unit | P-2 | 설치본 A로 init·커밋한 저장소 | 설치본 B로 init | `git status --porcelain` 빈 출력, local.js는 B 경로, `check-ignore` 통과 | `test/dashboard-init.test.ts` "P-2…" |
| S-3 | unit | P-3 | 다른 PC v1 생성본(LF·CRLF)·고친 v1 | refresh 뒤 init | refresh는 v1 불변·local 없음, init은 생성본만 v2로·고친 v1 보존 | `test/dashboard-init.test.ts` "P-3…" |
| S-4 | unit | P-4 | v2 커밋 저장소에서 local.js 삭제 | `backlog refresh` | local.js 재생성, 추적 변경은 data.js뿐 | `test/dashboard-init.test.ts` "P-4…" |
| S-5 | unit | P-5 | OPAL 진입점(역사 원문 2판 포함) | `adopt opal --apply` | v2 진입점·local.js·제외 규칙, 수정본·링크는 보존 | `test/adopt-opal.test.ts` T02-S-3 묶음 |
| S-6 | e2e | P-6 | 임시 저장소 2개(local 있음·없음) | headless Chrome으로 README.html 렌더·DOM 덤프 | 있음: 스타일·자료·앱 화면 / 없음: init 안내 문구 | `evidence/browser-local-ok.png`·`evidence/browser-no-local.png` |
| S-7 | check | P-7 | 환경 실패 제외 | `npm run check` | 변경으로 생긴 실패 0 | `evidence/check-summary.md` |

## 설계

- **진입 HTML v2** (`page.html`, 표지 `<!-- pace:backlog-shared:2 -->`): 자리 표시 없음. `dashboard/data.js`·`dashboard/local.js`를 `defer`로 읽고, 본문은 연결 실패 안내(`pace backlog init`). 모든 PC에서 같은 바이트.
- **`backlogs/dashboard/local.js`** (PC별, Git 밖): 공용 `style.css`·`core.js`·`app.js` file URL을 담고 link·script를 넣는다. script는 `async=false`로 넣어 core → app 순서를 지킨다(data.js는 defer 순서상 먼저 실행). 내용이 같으면 다시 쓰지 않는다.
- **`backlogs/dashboard/.gitignore`** (커밋): `/local.js` 한 줄. 대상 저장소 루트 `.gitignore`를 건드리지 않는다. 없을 때만 만들고 있으면 보존.
- **init**: 새 진입점이면 v2 + local + .gitignore. v1 생성본(경로만 다른 것)은 v2로 교체. v2면 local만 맞춘다. 사용자 수정본은 지금처럼 보존.
- **refresh**: 완성 대시보드이고 진입점이 v2일 때만 local·.gitignore를 맞춘 뒤 자료를 갱신한다. v1 전환은 init 책임으로 남긴다(refresh는 진입 HTML을 바꾸지 않는다).
- **판별**: `dashboardState`는 v1·v2 표지를 모두 공용 진입점으로 본다. `isGeneratedSharedEntry`는 v2 원문 또는 v1 생성본(URL 정규화)을 인정한다. v1 생성은 판별용으로만 남긴다.
- **adopt opal**: OPAL 진입점 판별은 v1 형태와 비교(지금과 같은 결과), 교체는 v2 + local + .gitignore, 실패 시 만든 파일을 되돌린다.
- **보안 영향**: 새 파일 쓰기 경로 2개(`backlogs/dashboard/` 안). 기존과 같이 링크·디렉터리 바꿔치기를 거부한다. local.js 내용은 설치본 경로를 JSON 문자열로만 넣는다(코드 주입 없음). 민감 경로 변경 없음.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/dashboard/backlog/page.html` | v2 진입 HTML |
| `src/project/dashboard-layout.ts` | v2 표지·local 생성·v1 판별 |
| `src/project/dashboard-init.ts` | v1→v2 전환, local·.gitignore 생성 |
| `src/project/dashboard.ts` | refresh 때 local 보충 |
| `src/project/adopt-opal.ts` | v1 기준 판별, v2 쓰기 |
| `docs/README.md` | 대시보드 공용 참조 설명 |
| `skills/pace-project-init/SKILL.md` | init 설명 |
| `.pace/brain/pages/concept/백로그-대시보드-자동-갱신과-git-경계.md` | PC 종속 결정 변경 |
| `backlogs/README.html` · `backlogs/dashboard/.gitignore` | 이 저장소 대시보드를 v2로 전환 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-18 10:15 | 정의 작성 |
| 2026-11-18 10:30 | 착수 결정(캡틴, 대화): 경로 파일 분리 방식 · 태스크 없는 프로젝트로 main 직접. 버린 길: README.html Git 제외(새 clone·worktree가 부분 설치로 판정, pull 시 삭제), 공용 자산 복제(공용 설치본 결정 역행), 현행 유지 |
| 2026-11-18 10:46 | (사용자 결정) 착수: 경로 파일 분리(README.html v2 + Git 밖 local.js) · 태스크 없는 프로젝트로 main 직접 (대화 2026-11-18) — 버린 길: README Git 제외·자산 복제·현행 유지 |
| 2026-11-18 10:46 | (자체 판단) refresh·생성 함수는 .gitignore가 이미 있을 때만 local.js를 맞춘다 — 하네스 미커밋 검사에 새 파일을 만들지 않기 위해 |
| 2026-11-18 10:46 | local.js 보충을 refreshDashboard에서 generateDashboard로 옮김 — CLI refresh·하네스가 생성 함수를 직접 부름 (P-4 시험 실패로 발견) |
| 2026-11-18 16:51 | (사용자 결정) finish 없이 마감 — 하네스 결함(main 직접 브레인 반영 검사)으로 finish 불가, 하네스 문제는 기록만 하고 캡틴이 따로 개선. 전체 검사 2차: 변경 원인 실패 0 |

