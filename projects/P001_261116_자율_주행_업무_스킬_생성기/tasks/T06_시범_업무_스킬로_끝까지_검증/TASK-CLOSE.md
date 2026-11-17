# T06 시범 업무 스킬로 끝까지 검증 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 미달 — T-4 미충족, T-6 일부 미확인. 태스크 상태 **보류**(캡틴 결정 A 2026-11-17, main 판단으로 실행 방법 확정). TASK.md는 고치지 않았다.

## 목표 달성 판정

목표("실제 웹 업무 하나로 인터뷰 → 생성 → 자율 주행 → 변경 학습이 끝까지 되는지 확인하고 사례 저장소가 새 구조로 넘어갈 수 있게 인계")는 상위 목적(사람 없이 반복 업무 수행 + 화면·API가 바뀌어도 스스로 고침)에 정합한다. 판정은 **부분 달성**이다.

- **달성 — 생성·주행·인계**: 공개 GitHub 저장소 조회 업무를 `pace-playbook-maker`로 처음부터 만들었고(사람 확인 해시 9fd8d5cd92b5로 캡처 승인, `evidence/pilot-build.txt`), 새 세션이 만들 때와 다른 입력 3종을 지도만으로 수행했다. 3라운드 측정에서 P-6 충족(아래). 사례 저장소 무영향(`evidence/case-impact.txt`)·인계 문서(`evidence/handoff-check.txt`)·유출 0(`evidence/leak-check.txt`).
- **미달 — 실제 페이지 변경 학습(T-4)**: 일부러 낡게 만든 선택자(기본 브랜치 요소)는 **가림 대상 요소라 복구 후보에서 빠져** 복구되지 않았다(`evidence/pilot-heal.txt` ③ `unresolved`/`element-missing`). 이 업무는 추출 대상 5개가 모두 가림 대상이라 어떤 요소의 선택자 손상도 자동 복구되지 않는다 — 값 보호 설계(healing.md "가림 규칙에 덮이는 요소는 후보에서 뺀다")와 목표의 충돌이다. 같은 실행에서 **위치 밀림(커밋 링크 box, IoU 0.36)은 실제 페이지에서 rebaseline으로 복구·반영**됐다(①). 캡틴 결정: 설계는 유지하고 미달로 기록, 개선은 아이디어로 발의(`가림-요소-사람-확인-복구-후보`, `사람-확인-대기-완료-표시-명령`).
- **일부 미확인 — 공존 세션(T-6 ⑥)**: 7번째 세션(1회·재시도 없음)의 init에 사례 저장소 프로젝트 스킬 4개와 `pace-playbook-maker`가 모두 로드됐다(이름 5개 서로 다름). 그러나 허용 도구가 Read뿐이라 세션이 스킬 목록을 조회하지 못해 **답변으로 5개를 구별해 말하는 부분은 미확인**(`evidence/coexist-session.json`).

**P-6 측정(규칙 고정, 있는 그대로)** — 같은 입력 3종(anthropics/claude-code·microsoft/vscode·nodejs/node), sonnet·게스트 프로필·허용 도구·프롬프트 바이트 동일(`evidence/groups.txt`), 실패 표본도 중앙값에 포함.

| 라운드 | 플레이북 정확·시간·호출 | 지도 없음 정확·시간·호출 | P-6 | 라운드 사이 보완 |
|---|---|---|---|---|
| 1 | 2/3 · 29.2s · 9 | 3/3 · 43.7s · 8 | 미충족 | — (p2 실패: 화면이 줄인 커밋 제목) |
| 2 | 3/3 · 28.5s · 8 | 3/3 · 38.2s · 8 | 미충족(호출 동률) | 지도: 열기 단계 접기, 다섯 값 읽기 식(펼침 단추로 전체 제목), orca 명령 형태 · 라이브러리: 말줄임 값 멈춤 |
| 3 | 3/3 · 24.0s · 7 | 2/3 · 36.1s · 8 | **충족** | 생성기: SKILL.md 흐름 색인에 단계 지도 경로(탐색용 `ls` 제거) |

- 근거: `evidence/sessions-round1/score.txt`·`evidence/sessions-round2/score.txt`·`evidence/score.txt`, 세션별 `sessions*/[pn]N.json`·`.stream.jsonl`(가림), `evidence/sessions-playbook.json`·`evidence/sessions-nomap.json`. 측정 세션은 캡틴 승인 범위(1라운드 6회+p1 재실행 1회, 2·3라운드 각 6회)만 썼다.
- 유의: 여유는 호출 7 대 8(1회)이다. 3라운드 지도 없음 n2의 실패는 vscode 최신 커밋 제목(95자)이 화면에서 잘린 것으로, 같은 입력의 플레이북 p2는 펼침 읽기로 정답을 맞혔다 — 2라운드 보완이 측정 안에서 실제로 쓰인 표본이다. 1·2라운드 입력은 제목이 짧아 잘림이 없었다. 지도는 같은 입력군으로 두 번 보완했다(새 입력군 재측정은 하지 않음). S02 요소 `expect` 문구의 예시 "124k"는 측정 입력 하나의 화면 표기와 같다(만들 때 쓴 예시 문구, 측정한 지도는 다시 만들지 않음).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 `evidence/pilot-build.txt` — 인터뷰 완전·실값 0, 승인 캡처 = 사람 확인 해시, `checkPlaybook`·`checkAgentFresh` 통과, 플레이북 9개 파일에 입력별 값 0·자리표시 `<owner/repo>` 사용. 재생성 기록 `evidence/pilot-rebuild.txt`(보완은 캡처를 바꾸지 않는 행동·서술 필드만, stale 0) |
| T-2 | 통과 | S-2 3라운드 플레이북 3회 정답 일치·사람 개입 0, 세션별 지표 `evidence/sessions-playbook.json`·`evidence/groups.txt` |
| T-3 | 통과 | S-3 같은 조건 지도 없음 3회, 규칙대로 판정(1·2라운드 미충족 → 캡틴 결정으로 보완·재측정, 3라운드 충족) `evidence/score.txt`·`evidence/groups.txt`, 지도 실제 읽음 3/3 |
| T-4 | 미충족 | S-4 `evidence/pilot-heal.txt` — ① 손상 전 값 5/5 정확(단 위치 밀림 rebaseline 1회) ② 손상 직후 `conflict`·S02·요소 1·`missing`·넘긴 값 0 ③ `unresolved`(가림 요소 후보 제외) ④ 미실행. 학습 상태·이력 `evidence/heal-state/` |
| T-5 | 통과 | S-5 `evidence/leak-check.txt` — 텍스트·JSON 134개 위반 0(파일 종류별, 뺀 메타데이터 종류별 개수 보고), 캡처 5장 box별 가림색 비율 ≥0.5·낯선 픽셀 ≤0.05, 가림 없는 대조군은 가림색 <0.2·낯선 픽셀 0.79~0.85. 식별 정보 grep `evidence/grep-check.txt` 0건. 강화한 값 노출 관문 실페이지 확인 `evidence/leak-gate-live.txt` |
| T-6 | 일부 미확인 | S-6 `evidence/case-impact.txt` 통과(흐름 9개 106파일 바이트 동일, 테스트 4종 baseline 건수, 작업 사본 git status 0·HEAD 불변, 실제 `~/.claude/skills` 목록 불변, 임시 HOME 추가 1개·기존 파일별 해시 불변·이름 5개 서로 다름). S-6b `evidence/coexist-session.json` — 로드 확인, 답변 구별 미확인. 실제 `~/.claude/skills`는 스킬 폴더 14개·이름·스킬 파일 불변이고, `synced/` 관리 파일 2개(manifest.json·.last-complete-round)는 실행 중인 Claude Code의 주기 동기화로 바뀌었다(측정 세션이 없던 10:33·10:55에도 다시 쓰임, stat) — 이 검사와 무관 |
| T-7 | 통과 | S-7 `evidence/handoff-check.txt` — 인계 문서 `~/.pace-private/`(비공개), 코어 import 9곳 `file:line` 실재(그 줄이 코어 import), 그 밖 변경 위치 4곳 실재, 검사 명령 5종, 이 프로젝트가 더한 글자에 사례 저장소 금지어 0 |
| T-8 | 통과 | S-8 `docs/README.md`·`docs/ARCHITECTURE.md` 구성 요소 표·민감 경로 행(하네스 라벨 불변), 브레인 2페이지(구조와 결정·함정 모음), `pace brain lint` 오류 0·경고 0 |
| T-9 | 통과 | S-9 `evidence/secret-scan.txt` 통과, `evidence/check.txt`(전체 `npm run check`) |

## 단위 테스트

- `node --test test/playbook/*.test.mjs` 180건 통과·건너뜀 0(Orca 사용 가능, Orca e2e 4파일 포함). 이 태스크 추가분: `capture-core.test.mjs` 값 노출 S-1·S-2(나뉜 글자·입력칸·짧은 값)·S-2b(화면 밖·낱말 경계)·S-3(fail-closed), `orca-adapter.test.mjs` 노출·빈 결과·불완전·검사 못함·해석 불가 거부와 T06 S-14 `recaptureStep`, `driver-runtime.test.mjs` T06 S-11(말줄임 `truncated`)·S-12(button 글자), `build.test.mjs` T06 S-13(머리말 자리표시), `playbook.test.mjs`(흐름 색인 단계 지도 경로 실재·머리말 임시 경로 없음).
- 측정 도구 단위 시험 13건(`pilot/harness/{score,analyze,scrub}.test.mjs`, S-10 판정기 포함) — 래퍼 `test/playbook-pilot-harness.test.ts`로 `npm run check`에 연결.
- 전체 `npm run check` 마감 전 1회 통과 `evidence/check.txt` — 879건, 실패 0, 건너뜀 6(기존 플랫폼별 시험: POSIX 지연 git 대역·install.sh macOS·Linux 전용·Windows 설치 실행 경로·루트 교체 등, 이 태스크와 무관).

## E2E

- 실제 GitHub(공개 페이지, Orca 게스트 프로필): 시범 작성(S-1), 측정 3라운드 18세션(S-2·S-3), 실페이지 자가 복구(S-4 `evidence/pilot-heal.txt`), 긴 제목 읽기 식 실페이지 확인 `evidence/round2-longtitle-first.jsonl`·`evidence/round2-longtitle.jsonl`(rust·vscode 등 긴 제목 정답 일치, python/cpython은 원문 백틱이 화면에서 코드 서식으로 렌더돼 화면 글자로는 정답과 다름 — **판정기 한계**, 측정 입력 아님), 강화한 값 노출 관문 `evidence/leak-gate-live.txt`.
- 사례 저장소(읽기 전용): `evidence/case-impact.txt`, 공존 세션 `evidence/coexist-session.json`.

## 리뷰

- 사전 검토: codex `--kind task` 1차 fail(blocking 2)·2차 fail(blocking 1)·반영 확인 pass(`evidence/pre-review-task-1.md`·`-2.md`·`-3.md`, `PRE-REVIEW.json`).
- 구현 후 reviewer(codex, openai, cross:true): 1차 `evidence/review-goal-1.md` — 검토 세션이 로컬 파일을 하나도 읽지 못해(실행 정책 거부) 판단 불가(revise). 2차 `evidence/review-goal-2.md`(대상 `evidence/review-target-2.md`에 diff·코드·증거 전문 첨부) **revise**: blocking 4 — ① T-4 종단 미성립 → 캡틴 결정 A로 미달 기록(설계 유지) ② 값 노출 검사 빈 결과 통과 ③ 나뉜 노드·입력 value 누락 ④ 복구 재캡처가 관문 우회 → ②~④ 고침(대상별 fail-closed 결과, 가장 작은 요소·입력 value·낱말 경계·뷰포트, 공통 관문 `assertNoValueExposure`·`recaptureStep`) + 시험. should_fix ⑤ 유출 검사 과대 주장(공개 값 필드 전체 제외·이미지 없음 통과) ⑥ 복구 검증기 느슨함 → 고침. 3차 `evidence/review-goal-3.md`(대상 `evidence/review-target-3.md`) **revise**: 2차 지적은 해소, 새 blocking 2 — ① 대상을 품은 부모의 다른 글자 누락 ② 3자 미만 값은 글자 전체 일치만 봄, should_fix ③ 유출 검사가 커밋 제목을 검사 없이 뺌 ④ 픽셀 검사가 가림색 비율만 봄 → 고침(대상 밖 글자 `outText`, 길이 무관 낱말 일치, 제목에도 `scanSensitive`·'긴 토큰'만 허용, box 안 낯선 픽셀 비율 ≤0.05) + 시험 S-2c.
- 3회 연속 미통과로 멈춤 → 캡틴 결정 "A 반영 확인 1회"(fail이면 한계 기록·마감). 4차 반영 확인 `evidence/review-goal-4.md`(대상 `evidence/review-target-4.md`, 목적 `evidence/review-purpose-4.md`, codex 새 세션) **pass(blocking 0)**: ①②③ 해소, ④ **미해소(should_fix)** — 낯선 픽셀 기준이 일부 남은 글자를 놓칠 수 있고 '일부 글자만 남긴 대조군'이 없다 → 남긴 것의 한계로 기록.
- 검토 세션이 파일을 못 읽은 원인: 이 브랜치의 `pace agent verify`(codex `--sandbox read-only`)에 main의 Windows unelevated sandbox 수정(f385e03b)이 없음 — 최소 재현 `evidence/codex-read-failure.txt`(CreateProcess Rejected). finish의 rebase로 함께 고쳐진다(코디네이터 확인). 그래서 2~4차는 diff·코드·증거 전문을 대상 문서에 실었다.
- tester: 워크트리 PM 판정 — 실행 증거 `evidence/check.txt`·`evidence/leak-check.txt`·`evidence/case-impact.txt`·`evidence/pilot-heal.txt`.
- 교본: typescript — 코드 변경은 시험 래퍼(`.ts`) 하나, 본체는 기존 `.mjs` 스타일. 보안: 값 비기록·가림 fail-closed·사람 확인 해시 승인·사용자 환경 정보 가림을 `security.md`·docs 민감 경로 행 기준으로 대조.
- **자체 판단(편차)**: S-5는 TASK에 "세션 기록 줄마다 `scanSensitive`"로 적었으나, 지도용 검사라 UUID·도구 호출 id·커밋 SHA·비용 숫자·epoch가 대량 오탐돼 **파일 종류별로 나누고 런타임 메타데이터 종류를 빼고 검사**했다(뺀 종류·개수를 증거에 보고, 빼기 전에 걸린 글자를 직접 확인 — 이 과정에서 실제 노출을 찾음, 아래). 캡처 픽셀 검사는 평균색 대신 box 안 가림색 비율(기준은 대조군 전에 고정).

## 남긴 것

- **발견·고친 결함(제품)**: ① 읽기 대상 `<button>`의 빈 `value`를 읽어 `expect-failed`(실페이지 기본 브랜치) ② 플레이북 `flow/*.md` 머리말에 사용자 이름이 든 임시 절대 경로 ③ 화면이 줄인 값(`…`)을 그대로 넘김 → `truncated` 멈춤 ④ 값 노출 관문의 빈 결과·나뉜 글자·입력 value·화면 밖·낱말 경계·복구 재캡처 우회(검토 2차) ⑤ 실DOM `children`(HTMLCollection) — 스텁이 못 잡음.
- **사용자 데이터(발견 후 가림, 커밋 전)**: 지도 없음 군이 쓴 `orca tab list` 결과에 캡틴의 다른 Orca 탭 URL·작업 폴더가, Claude 프로젝트 폴더 인코딩·8.3 단축 이름에 사용자 이름이 들어 있었다 — `scrub.mjs` 보강(시험 `scrub.test.mjs`)·`rescrub.mjs`로 모든 세션 기록에 다시 적용, 공존 세션 기록은 개수·가림 이름만 남기고 원문 삭제. 코디네이터 확인·캡틴 보고 완료.
- **후속(아이디어 발의됨)**: 가림 요소 '사람 확인 필수' 복구 후보(구조 선택자·box만, 자동 반영 없음) — T-4를 채우는 길. 사람 확인 대기(`pendingHumanChecks`)를 '확인 완료'로 표시하는 명령.
- **한계(검토 4차 미해소 should_fix)**: 픽셀 가림 검사는 box 안 가림색 비율 ≥0.5와 낯선 픽셀 ≤0.05로 보는데, 일부 글자만 남은 경우(낯선 픽셀이 5% 이하이거나 글자색이 가림색↔흰색 선분에 가까운 경우)를 놓칠 수 있고 '일부 글자만 남긴 대조군'으로 확인하지 않았다 — 가림의 1차 근거는 캡처 코어의 요소 rect 완전 피복(`elementsMasked`)·사후 검사·사람 확인이고 픽셀 검사는 보조다. 커밋 제목의 '긴 토큰' 예외는 이메일·전화 형식이 든 제목을 거부하는 별도 실행 시험이 없다.
- **한계**: 내용 길이에 따라 움직이는 읽기 요소(제목 옆 커밋 링크)는 입력이 바뀌면 box 대조로 멈춰 첫 주행부터 rebaseline 1회가 든다. 판정기는 커밋 제목의 마크다운(백틱)을 화면 렌더와 같게 보지 않는다. 업무 저장소 코어 vendoring·해시 확인은 인계 문서의 수동 명령(`sha256sum`)까지 — 검사 도구는 없다.
- **사례 저장소 세션**: 인계 문서(비공개 `~/.pace-private/`)대로 코어 import 9곳·`agentView`·낡은 안내 정리 — 전환은 사례 저장소 세션의 일.
- 측정 도구(`pilot/harness/`)는 설치되지 않는 프로젝트 도구다. GitHub 공개 API는 익명 시간당 60회 — 재측정은 한도 재설정을 보고 돌린다.
