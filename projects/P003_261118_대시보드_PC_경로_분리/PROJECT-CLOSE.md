# P003 대시보드 PC 경로 분리 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-18

## 목표 달성 판정

**달성** — 상위 목적("공유 저장소의 대시보드가 어느 PC에서도 Git 변경 없이 동작", 캡틴 대화 2026-11-18)에 대해:

- 커밋되는 진입 HTML에서 PC 경로가 사라졌다(설치본 두 벌로 init해도 바이트 동일, `file:` 0). PC 경로는 Git 밖 `local.js`에만 있고 다른 설치본으로 다시 init해도 `git status`가 비어 있다(P-1·P-2 시험). 이 저장소 대시보드도 v2로 전환했다(`904ea0f`).
- 실제 화면: headless Chrome에서 스타일·자료·앱이 그려지고, local.js가 없으면 init 안내가 보인다(P-6 캡처).
- 넘어올 길·하네스: 수정 안 한 v1은 init이 전환하고 고친 v1·사용자 local.js·추적 중 local.js·기존 .gitignore는 보존(P-3, 리뷰 B1·B2). 실제 `project start` worktree에서 local.js가 자동 생성되고 추적 변경은 하네스 소유 파일뿐(`evidence/worktree-flow.md`).
- 독립 검토: 다른 제공자(codex) 1단계 fail(blocking 3) → 2단계 fail(blocking 4) → 3차 fail(blocking 1) → 4차 반영 확인 **pass**. 1단계는 작업 문서 없이 목적·diff만으로 판정. 2단계 이후는 세션 재개가 안 돼(codex `p` 모드 `--resume` 미지원) 매 차수 새 세션에 직전 지적 원문을 넘겼다 — 같은 검토자의 연속 판단은 아니다.
- 한계: 이 PC는 symlink 권한이 없어(개발자 모드 꺼짐) 전체 검사의 symlink 시험 50개를 이 PC에서 확인하지 못한다 — 이 변경과 무관한 환경 실패(`evidence/check-summary.md`).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | `test/dashboard-init.test.ts` "installed runtime URLs…"(설치본 두 벌 진입 HTML 바이트 동일)·"shared dashboard init…"(`file:` 없음) |
| P-2 | 통과 | `test/dashboard-init.test.ts` "P-2…"(커밋 뒤 다른 설치본 init → `git status --porcelain` 빈 출력) |
| P-3 | 통과 | `test/dashboard-init.test.ts` "P-3…"(LF·CRLF v1 전환, 주석·리소스 경로 수정본 보존, refresh는 v1 불변) |
| P-4 | 통과 | `test/dashboard-init.test.ts` "P-4…", 실제 worktree `evidence/worktree-flow.md` |
| P-5 | 통과 | `test/adopt-opal.test.ts` T02-S-3 묶음 6개(v2·local.js·제외 확인 추가) |
| P-6 | 통과 | `evidence/browser-local-ok.png`·`evidence/browser-no-local.png` |
| P-7 | 통과 | 변경으로 생긴 실패 0 — 1차 전체 검사 실패 53개 중 변경 원인 1개(legacy script 시험 의존 목록) 수정, 나머지 52개는 환경(symlink 50·Python PATH 1·telegram S-9f 1, 변경 전 HEAD에서도 재현) `evidence/check-summary.md`. 최종 전체 검사는 finish의 `검사` |

## 보안

- 새 쓰기 경로 2개(`backlogs/dashboard/local.js`·`.gitignore`) 모두 링크·디렉터리 바꿔치기 거부(lstat·realpath), Git 추적 local.js 거부, 사용자 파일 소유권 확인(생성 정본 일치만), 부분 실패는 이번에 쓴 내용 그대로인 파일만 복구.
- local.js에는 설치본 file URL을 `JSON.stringify`로만 넣는다(스크립트 주입 없음). Git은 셸 없이 인자 배열로 호출. codex 2단계 확인: 셸·스크립트 주입 지점 없음.
- 비밀·민감 경로 변경 없음. 의존성 변경 없음.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `src/dashboard/backlog/page.html` | 반영 | v2 진입 HTML |
| `src/project/dashboard-layout.ts` | 반영 | v2 표지·v1 판별(같은 기반 경로)·local.js 생성·안전 경계 |
| `src/project/dashboard-init.ts` | 반영 | v1→v2 전환, local·.gitignore, 실패 복구 |
| `src/project/dashboard.ts` | 반영 | 생성 함수에서 수정 안 한 v2일 때 local 보충 |
| `src/project/adopt-opal.ts` | 반영 | v1 렌더 비교, v2·local 쓰기, 폴더 없음 경고 |
| `docs/README.md` | 반영 | 백로그 대시보드 절 |
| `skills/pace-project-init/SKILL.md` | 반영 | init 설명 |
| 브레인(`.pace/brain/`) | 반영 | `백로그-대시보드-자동-갱신과-git-경계`(결정·버린 길·안전 경계), `opal-가져오기-adopt-opal-결정과-함정`, lint 오류 0 |
| `backlogs/README.html` · `backlogs/dashboard/.gitignore` | 반영 | 이 저장소 대시보드 v2 전환 |

## 남은 일

- 복구 경합(codex should_fix): 내용 확인 직후 다른 작업이 파일을 교체하면 복구가 덮을 수 있는 좁은 창 — init 잠금과 refresh 잠금이 달라 남는다. 필요하면 local.js 쓰기를 refresh 잠금 안으로 옮긴다.
- 설치본 반영: `bash scripts/install.sh`(main) 뒤 설치 CLI로 이 저장소 `pace backlog init`을 다시 돌리면 local.js가 설치본을 가리킨다(지금은 소스 checkout 참조).
- 다른 PC: 이 커밋을 받은 PC는 `pace backlog init`(또는 refresh) 한 번으로 연결 — 커밋할 변경 없음.
- 이 PC 개발자 모드(symlink) — 전체 검사 환경 실패 50개 해소(BL261118_01 측정 전제).

## 회고

첫 구현은 "제외 규칙이 텍스트로 있으면 된다", "첫 줄 표지면 내 파일"처럼 의도만 보고 판정했다. 다른 제공자 검토가 Git의 실제 동작(`check-ignore -v`는 부정 규칙에도 0)과 사용자 편집 경계를 차례로 깨뜨렸다 — 판정은 도구의 실제 출력과 정본 일치로 해야 한다. 하네스 절차(기록·상태·검토)를 처음에 빠뜨려 캡틴 지적으로 보완했다.

## 지표

[지표 집계](METRICS.md) — 태스크 없는 main 직접 프로젝트. 교차 검토 4회가 작업 시간의 큰 몫이고 전체 검사 1회(약 34분)는 환경 실패 분류에 쓰였다.
