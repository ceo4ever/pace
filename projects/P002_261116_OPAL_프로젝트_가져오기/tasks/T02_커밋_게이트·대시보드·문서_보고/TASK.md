# T02 커밋 게이트·대시보드·문서 보고

- 프로젝트: [P002](../../PROJECT.md) · 백로그: 대화 2026-11-16
- 상태: 완료
- 사전 검토: v1

## 목적

`pace adopt opal`이 `.opal`을 `.pace`로 옮긴 뒤에도 남는 OPAL 흔적 셋을 정리한다: ① OPAL 커밋 게이트 훅 때문에 PACE 게이트가 설치되지 않는 문제, ② OPAL 공용 대시보드 진입점, ③ 지침·문서의 `opal` 명령·`opal-*` 스킬 이름(자동으로 고치지 않고 보고). 프로젝트 기준 P-3·P-5. 상위 목적: 기존 작업 맥락을 잃지 않고 PACE로 넘어온다 — 게이트가 빠지면 태스크 커밋 검사가 조용히 없어진다.

## 재료

- [PROJECT.md](../../PROJECT.md) 재료·설계. T01 구현(`src/project/adopt-opal.ts`)과 TASK-CLOSE "남긴 것".
- 훅: `src/project/harness.ts`의 `installCommitHook`은 사용자 훅을 보존한다(PACE 표지로 시작하지 않으면 경고만). OPAL v1 훅 원문은 첫 줄 `# OPAL commit gate v1`, 본문이 `opal`·`OPAL_COMMIT_CHECK`를 쓴다(이 저장소의 `commit-msg.opal-backup`으로 확인).
- 대시보드: OPAL 공용 진입점은 `<!-- opal:backlog-shared:1 -->`로 시작하고 `style.css`·`core.js`·`app.js`를 file URL로 참조하며 본문 문구만 OPAL/PACE로 다르다(OPAL 시절 `dashboard-layout.ts`, 커밋 c5ffef4c~1 확인). 현재 PACE의 `renderDashboardEntry()`가 같은 모양을 PACE 표지로 만든다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `commit-msg` 훅이 **알려진 OPAL v1 원문과 같을 때만**(CRLF 차이 무시) PACE 게이트 훅으로 바꾸고 원본을 `commit-msg.opal-backup`(있으면 `-2`…)에 남긴다. 사용자 훅·수정된 OPAL 훅(원문과 다름)·PACE 훅은 그대로 둔다. 수정된 OPAL 훅이면 보존했다고 경고한다. hooksPath(상대)·링크 등 `installCommitHook`이 거부하는 경로는 같은 규칙(`commitHookPath`)으로 건너뛰고 훅을 확인하지 못했다고 알린다. 기존 백업 파일은 덮어쓰지 않고 새 이름을 고른다. 교체된 훅은 차단 조건(`project/P###` 브랜치·메시지의 `(P###/T##)`·검사 실패)에서 실패 종료하는 게이트로 실제 동작한다 (P-3) |
| T-2 | `backlogs/README.html`이 OPAL 공용 진입점(표지+원문이 OPAL 템플릿과 URL 외 일치)이면 PACE 공용 참조로 바꾼다. 수정된 진입점·이미 PACE인 진입점·링크인 진입점·다른 파일(`data.js`·사용자 파일)은 건드리지 않는다. 판별 시험의 입력은 판별기와 독립적으로 OPAL 시절 `page.html` 원문(커밋 abb7cf40·5898950d, 문구 두 판)에서 가져온다. 자료 갱신은 `pace backlog refresh`로 안내만 한다 (P-3) |
| T-3 | `AGENTS.md`·`CLAUDE.md`·`docs/**`(하위 폴더 포함, 파일 수 제한 없음)의 `opal` 명령·`opal-*` 스킬 이름을 `파일:줄: 내용`으로 보고하고 파일은 바꾸지 않는다. `.opal/` 경로 언급은 보고 대상이 아니되, 같은 줄에 `opal` 명령이 따로 있으면 그 줄은 보고한다. **보고 범위를 조용히 줄이지 않는다** — 읽지 못한 파일(링크·5MB 초과·읽기 실패·폴더 접근 실패)은 `검색하지 못한 파일` 목록과 이유로 출력해 보고가 완전하지 않음을 알린다. 자동 커밋·push 없음 (P-5) |
| T-4 | 훅·진입점 교체는 T01의 계획·재검증·복구 틀 안에 든다: 미리보기는 목록만 보이고, apply는 계획 이후 훅 또는 진입점이 바뀌면(각각) 멈추며 변경본을 보존하고, 이동·등록·훅 쓰기·진입점 쓰기 중 어느 단계가 실패해도 훅·새 백업·진입점·이동이 적용 전과 같아진다(기존 백업 보존) (P-4) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | OPAL 원문 훅 / 기존 `.opal-backup`이 있음 / 교체 뒤 훅 실행 | 미리보기·apply·재실행 | 미리보기는 훅 불변, apply 뒤 PACE 훅+원본 백업(기존 백업 불변, 새 이름 `-2`), 재실행은 이미 가져옴, 교체된 훅을 `sh`로 실행하면(가짜 `pace`가 실패) 호출·실패 종료를 확인 | test/adopt-opal.test.ts |
| S-2 | unit | T-1 | 사용자 훅 / 줄을 덧붙인 OPAL 훅 / 상대 hooksPath | apply | 훅 바이트 불변·백업 없음, 수정본은 경고, hooksPath는 확인하지 못했다는 안내 | 같은 파일 |
| S-3 | unit | T-2 | OPAL 진입점+data.js+사용자 파일 / 역사적 원문 두 판 / 수정된 진입점 / PACE 진입점 / 링크 진입점(저장소 밖 파일) | apply | 원문 일치만 PACE 진입점으로, 나머지(링크 대상 포함) 바이트 불변 | 같은 파일 |
| S-4 | unit | T-3 | AGENTS.md·docs에 `opal` 명령·`opal-*`·`.opal/` 언급, 한 줄에 `.opal/`+`opal` 명령, 5MB 초과 파일, 링크 | apply | `.opal/`만 있는 줄은 제외·같은 줄에 명령이 있으면 보고, 읽지 못한 파일은 이유와 함께 목록, 모든 파일 바이트 불변 | 같은 파일 |
| S-5 | unit | T-4 | 등록 실패 / 훅 쓰기 실패(백업 생성 뒤) / 진입점 쓰기 실패(훅 교체 뒤, 기존 백업 존재) | apply | 훅·새 백업·기존 백업·진입점·저장소 상태가 적용 전과 같음 | 같은 파일 |
| S-6 | unit | T-4 | 계획 뒤 훅이 바뀜 / 계획 뒤 진입점이 바뀜 | apply | 각각 멈추고 바뀐 파일은 그대로 | 같은 파일 |

## 접근

- `harness.ts`: `commitHookPath(root)`를 `installCommitHook`에서 꺼내 export(동작 불변 — 기존 `project-harness` 테스트가 보호), `COMMIT_HOOK`·`COMMIT_HOOK_MARKER` export.
- `adopt-opal.ts`: 계획에 `hook`·`dashboard`·`references`를 더하고(지문에 훅·진입점 원문 포함) apply에 undo 스택으로 훅(백업 생성→PACE 훅 쓰기)·진입점 교체를 넣어 실패 시 역순 복원. 훅은 알려진 원문 정확 일치만 교체 — 근거: 사용자가 손댄 훅을 지우지 않기 위해(오탐보다 보존). 진입점은 OPAL 템플릿을 `renderDashboardEntry()`에서 파생해 비교한다(템플릿 복제 없음).
- 참조 검색은 docs 전체를 끝까지 훑고(파일 수 상한 없음), 링크·5MB 초과·읽기 실패는 건너뛰되 `검색하지 못한 파일`로 보고한다. 비밀로 보이는 줄은 내용을 생략한다.
- 알려진 한계: 훅 `chmod` 실행 권한 비교는 Windows에서 의미가 없어 시험하지 않는다(교체된 훅의 실행 가능성은 S-1의 `sh` 실행으로 확인). 훅 교체의 실제 git 커밋 경로 e2e는 T03으로 인계한다.
- 인계: 보고는 자동 수정을 하지 않으므로 OPAL→PACE 이름 대응표는 T03 안내 문서에 적는다.
