# T03 시험 저장소 e2e와 안내 문서

- 프로젝트: [P002](../../PROJECT.md) · 백로그: 대화 2026-11-16
- 상태: 완료
- 사전 검토: v1

## 목적

T01·T02가 만든 `pace adopt opal`이 **실제로 맥락을 살려 내는지**(가져온 메모리·브레인·역할이 부트·검색에 나오고, 교체된 훅이 실제 `git commit`을 막는지)를 e2e로 증명하고, 다른 PC에서 OPAL 프로젝트를 만난 사용자가 따라 할 절차를 README·정의서에 적는다. 프로젝트 기준 P-1(부트 확인)·P-6(검사·문서). 상위 목적: PACE를 독립 제품으로 쓰면서 기존 작업 맥락을 잃지 않는다 — 파일이 옮겨졌다는 사실(T01·T02)만으로는 이 목적의 달성 증거가 아니다.

## 재료

- [PROJECT.md](../../PROJECT.md) 기준 P-1·P-6, 결정 메모 "(사용자 결정) 프로필 이전 범위 밖 확정 — 새 PC는 온보딩으로 새 프로필".
- T01·T02 TASK-CLOSE "남긴 것": 부트에 표본 메모리 제목·브레인 검색·역할 문구가 나오는지 단언, 실제 `git commit` 경로의 훅 동작, OPAL→PACE 이름 대응표, `adopt` 출력의 참조 목록 사용법.
- 형식 전제(OPAL v2 ↔ PACE 메모리·브레인 동일): `git diff c5ffef4c~1 HEAD -- src/memory/memory.ts src/project/brain.ts`가 비어 있다(OPAL 시절 마지막 소스와 동일). 단 시험 표본은 PACE 도구로 만든 파일을 `.opal`로 옮겨 OPAL 정의처럼 꾸민 것이라 OPAL이 만든 원본 파일은 아니다 — 한계로 남긴다.
- 부트: `pace boot --host plain --cwd <저장소>` 출력(프로젝트 역할·프로젝트 메모리 요약). 메모리·브레인 명령: `pace memory list --project`, `pace brain search`.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | e2e: OPAL 표본(AGENT.md 역할 문구, 메모리 3종 type, 브레인 페이지)을 `pace adopt opal --apply`로 가져온 뒤, 같은 `PACE_HOME`에서 `pace boot --host plain --cwd`가 ① 표본 역할 문구 ② 표본 메모리 제목(최소 이슈·할 일 각 1건) 을 출력하고, `pace memory list --project`에 표본 메모리가 나오며, `pace brain search "<표본 용어>"`가 표본 브레인 페이지를 찾는다. 가져오기 전(`.opal`만 있는 상태)에는 같은 부트가 표본 문구를 출력하지 않는다(대조) (P-1) |
| T-2 | e2e: 가져온 저장소에서 실제 `git commit`이 `project/P###` 브랜치 + 메시지 `(P###/T##)`에서 `pace project check`를 부르고(가짜 `pace`를 PATH 앞에 둠) 실패하면 커밋이 거부되고 성공하면 커밋되며, 다른 브랜치·태그 없는 메시지는 부르지 않고 통과한다. 가져오기 전(OPAL 훅)에는 `opal` 명령을 찾는다는 것을 대조한다. 가짜 `pace`는 호출 인자(`project check P001 T01`)와 작업 폴더(대상 저장소)를 기록해 단언하며, 조건 밖 두 사례(다른 브랜치·태그 없는 메시지)는 각각 한 조건만 바꾸고 호출 기록을 비운 뒤 호출 0건을 단언한다. **이 기준의 충족은 S-2가 skip이 아니라 실행·통과했을 때만 인정한다** — 이 작업 환경(Windows, Git의 `sh`)에서 S-2 실행 결과(통과·skip 수)를 TASK-CLOSE에 적고, skip이면 T-2는 미충족이다. 실제 `pace project check`의 내부 판정은 이 시험의 대상이 아니다(훅 연결과 종료 코드 전달만 본다) (P-3) |
| T-3 | 문서: `README.md`에 "OPAL에서 넘어올 때" 절 — 순서(6단계) **① OPAL 제거 ② PACE 설치 ③ 온보딩으로 새 프로필(`pace onboard`) ④ 프로젝트마다 `pace adopt opal`(미리보기 → `--apply`) ⑤ 변경을 확인하고 직접 커밋 ⑥ `pace backlog refresh`**. 프로필(`~/.opal`)은 옮기지 않는다는 것, 멈춤 조건(`.pace` 공존·미커밋 변경 등)과 대처, OPAL→PACE 이름 대응표(명령 `opal`→`pace`, `opal-*` 스킬→`pace-*`, `opi`→`pace-project-init`)와 adopt 출력의 "OPAL 명령·스킬 참조" 목록으로 수동 수정하는 법을 적는다 (P-6) |
| T-4 | 문서: `docs/README.md`에는 상세 절차를 중복하지 않고 README 절로 연결하며, 정의 수준 요약(구성 요소 표의 `adopt` 모듈 행 추가, 작업 프로세스 또는 환경 절에서 README의 절차로 연결)과 문서 표 갱신. 하네스 라벨(`검사`·`보안 검사`·`worktree 준비`)은 이름·위치를 바꾸지 않는다 (P-6) |
| T-5 | 검사: 이 태스크의 변경 파일에 대해 `pace test file …`(부분 검사)와 `node scripts/secret-scan.ts` 통과. 전체 `npm run check`는 프로젝트 합의(코디네이터 판단)에 따라 finish 전 1회만 실행한다 (P-6) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | e2e | T-1 | 임시 저장소(`.opal` 표본 커밋) + 임시 `PACE_HOME`(프로필 1개) | 가져오기 전 부트 → apply → 부트·`memory list --project`·`brain search` | 전: 표본 문구 없음 / 후: 역할 문구·메모리 제목 2건·브레인 페이지가 나옴 | test/adopt-opal-e2e.test.ts (`runPace` 자식 프로세스) |
| S-2 | e2e | T-2 | S-1 저장소에 OPAL 훅 설치 후 apply, 가짜 `pace`(실패/성공) 두 벌 | `project/P001` 브랜치에서 `git commit -m "feat(P001/T01): x"` 실패·성공, `feature/x` 브랜치, 태그 없는 메시지 | 실패 시 커밋 거부(종료 비0·HEAD 불변), 성공 시 커밋·HEAD 전진, 조건 밖은 가짜 `pace`를 부르지 않고 커밋됨. 가져오기 전 OPAL 훅은 `opal`을 찾고 가짜 `opal`을 부름 | 같은 파일 |
| S-3 | check | T-3·T-4 | 문서 | 문서 시험 — README.md·docs/README.md에 필수 문구(절 제목·순서 단계 6개·`pace adopt opal --apply`·"프로필"·이름 대응표·참조 목록) 존재와 순서 | 모두 통과(필수 문구 검사는 보조) | test/adopt-opal-docs.test.ts |
| S-3b | check | T-3·T-4 | 문서 | 사람이 읽는 문서 검토 항목: 멈춤 조건별 대처(`.pace` 공존·미커밋 변경·v1·링크·등록부 충돌) 문단, 구성 요소 표 `adopt` 행, 문서 표 갱신, 정의서→README 링크, 하네스 라벨 3종(`검사`·`보안 검사`·`worktree 준비`)의 이름·위치 불변(`git diff`로 확인) | 항목별 확인 결과를 TASK-CLOSE에 | 확인 결과 기록 |
| S-4 | check | T-3 | 문서 내 명령 | 문서의 `pace adopt opal` 사용 예가 실제 CLI 인자(`--apply`, `--cwd`)와 일치 | HELP 출력과 대조해 일치 | 같은 파일 |
| S-5 | check | T-5 | 변경 파일 | `pace test file test/adopt-opal-e2e.test.ts test/adopt-opal-docs.test.ts` · `node scripts/secret-scan.ts` | 통과 | 명령 출력(TASK-CLOSE) |

## 접근

- e2e 표본은 `addMemory`·`initBrain` 같은 PACE 도구로 `.pace`에 만든 뒤 커밋하고 `git mv .pace .opal`로 옮기고 AGENT 키를 `opal_agent_version`으로 바꿔 OPAL 정의처럼 만든다(독립 원문이 아니라는 한계를 TASK-CLOSE에 적음). 훅 시험은 실제 `git commit`(sh가 있을 때만, 없으면 skip)로 한다.
- 부트 시험은 `PACE_HOME`을 임시로 두고 프로필을 만든 뒤 호스트 설치 없이 `pace boot --host plain` 출력만 본다(AGENTS.md 지침: 개발·테스트는 `PACE_HOME` 임시 폴더).
- README에는 사용자용 절차를, `docs/README.md`에는 구성 요소·프로세스 수준의 정의와 README 링크를 쓴다. 하네스 라벨 표 위치는 건드리지 않는다.
- 형식 호환성 한계: 소스 동일성(`git diff c5ffef4c~1 HEAD -- src/memory/memory.ts src/project/brain.ts` 비어 있음)은 두 파일의 읽기·쓰기 코드가 같다는 증거일 뿐 생성 경로·설정·다른 파서까지 같다는 증거가 아니며, 시험 결과를 "OPAL 원본 호환성 전체 증명"으로 확대 해석하지 않는다(TASK-CLOSE에 그대로 적음).
- 인계/한계: 실제 OPAL이 만든 원본 파일 표본은 아니다(형식 전제는 소스 동일성으로 보강). 다른 PC의 실제 사용자 환경(OPAL 설치본 제거 등)은 문서 절차이며 자동화하지 않는다.
