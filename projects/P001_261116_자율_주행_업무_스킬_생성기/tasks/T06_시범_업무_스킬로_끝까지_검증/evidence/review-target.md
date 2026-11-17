# T06 구현 후 검토 대상

작업 위치: 이 저장소(worktree, 브랜치 project/P001). 마지막 커밋(T05) 대비 작업 중 변경이 대상이다 — `git diff HEAD -- skills test docs`와 새 파일.

## 1. 제품 변경(스킬 `skills/pace-playbook-maker/`)

| 파일 | 변경 | 이유 |
|---|---|---|
| `tools/capture-core.mjs` | `leakScript`·`leakProblems` — 추출 대상 값이 대상 요소 밖 다른 위치에 가려지지 않고 보이는지 센다(이름·개수만) | 시범 캡처 반려(같은 값이 파일 목록 등 다른 곳에 보임) |
| `tools/orca-adapter.mjs` | `captureStep`이 캡처 전에 값 노출 검사, 실패·결과 없음은 거부(fail-closed). 관찰 `filled` 판정이 입력칸만 value를 읽음 | 위와 같음 / button 값 버그 |
| `tools/driver.mjs` | 웹 실행기: 읽기 값이 말줄임(`…`·`...`)으로 끝나면 넘기지 않고 `truncated`로 멈춤. 읽기·상태 판정에서 value는 INPUT·SELECT·TEXTAREA만, 그 밖은 글자 | 실제 GitHub 화면이 긴 커밋 제목을 줄임(1라운드 실패) / 실제 `<button>`(기본 브랜치)이 빈 value로 읽혀 expect-failed |
| `tools/build.mjs` | `buildFlow(dir,{dirLabel})` — 머리말 `--dir`이 실행 위치 밖이면 절대 경로 대신 `<흐름 폴더>` 자리표시 | 플레이북 머리말에 사용자 이름이 든 임시 경로가 들어감(유출 검사에서 발견) |
| `tools/playbook.mjs` | SKILL.md 흐름 색인에 단계 지도 파일 경로를 모두 적음, 임시 복사본 빌드 때 머리말을 `<플레이북 폴더>/references/flows/<흐름>`으로 | 측정 2라운드에서 플레이북 세션이 파일 위치 탐색(ls)에 호출을 씀 / 위 경로 |
| `references/driving.md` | 추출 절에 말줄임 규칙 한 문장 | 위 |
| `SKILL.md` | 도구 위치 표의 깨진 행(열 수) 수정 | 문서 결함 |
| 시험 | `capture-core.test.mjs`(값 노출), `orca-adapter.test.mjs`(노출·결과 없음 거부), `driver-runtime.test.mjs`(T06 S-11 말줄임, S-12 button 글자), `build.test.mjs`(T06 S-13 머리말), `playbook.test.mjs`(색인 경로 실재·머리말 임시 경로 없음), 래퍼 `test/playbook-pilot-harness.test.ts`(측정 도구 단위 시험 13건) | |
| 문서 | `docs/README.md`·`docs/ARCHITECTURE.md` 구성 요소 표에 플레이북 생성기 행·민감 경로 행 | T-8 |

## 2. 시범·측정 도구(프로젝트 폴더, 설치되지 않음)

`tasks/T06…/pilot/harness/`: `build-pilot`(인터뷰→캡처→사람 확인 해시 승인→생성, `round2.mjs` 지도 보완: 열기 단계 접기·읽기 식·orca 명령 형태), `run-session`·`run-measure`(헤드리스 세션 측정), `truth`·`score`·`analyze`(정답·판정·기록 해석), `scrub`·`rescrub`(기록 가리기 — 사용자 경로·단축 이름·`orca tab list` 결과), `check-read`(긴 제목 실페이지), `heal-check`(S-4), `case-impact`(S-6), `coexist-session`(S-6b), `handoff-check`(S-7), `leak-check`(S-5), `build-check`(S-1), `group-compare`(S-3).

## 3. 결과 증거(`evidence/`)

- 측정: 1·2·3라운드(`sessions-round1/`, `sessions-round2/`, `sessions/` + `score.txt`·`sessions-*.json`), 조건 비교 `groups.txt` — 3라운드 P-6 충족(플레이북 3/3·24.0s·7회 vs 지도 없음 2/3·36.1s·8회)
- `pilot-build.txt`(S-1) · `pilot-heal.txt`(S-4, T-4 미충족 — 가림 요소는 복구 후보 제외) · `leak-check.txt`(S-5) · `case-impact.txt`(S-6) · `coexist-session.json`(S-6b, 로드 확인·답변 구별 미확인) · `handoff-check.txt`(S-7) · `round2-longtitle*.jsonl`(긴 제목 실페이지) · `pilot-rebuild.txt`
- 인계 문서는 저장소 밖(비공개) — 검사 요약만 `handoff-check.txt`
