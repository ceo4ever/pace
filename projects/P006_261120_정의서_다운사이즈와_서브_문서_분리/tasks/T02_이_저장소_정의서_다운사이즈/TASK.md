# T02 이 저장소 정의서 다운사이즈

- 프로젝트: [P006](../../PROJECT.md) · 백로그: 대화 2026-11-20
- 상태: 완료
- 사전 검토: v1

## 목적

T01에서 세운 "정의서 크기와 분리 기준"과 opi 최신화 절차로 이 저장소 정의서(`docs/README.md`, 40,703B)를 한 번에 읽히는 지도로 줄이고, 옮긴 상세를 서브 문서로 분리해 기준을 실증한다. 범위는 [PROJECT 기준](../../PROJECT.md#기준) P-3~P-7.

## 재료

- 기준·절차: `skills/pace-project-init/references/project-docs.md` "정의서 크기와 분리 기준", SKILL.md §4(최신화 — 절 단위 승인은 계약 승인으로 갈음, 사용자 결정), `references/analysis.md` §7 정의서 측정.
- T01 남긴 것: 출발안은 v1 손 분리 초안(로컬 ref `refs/wip/P006-T02-draft` — 정의서 15,699B + 서브 문서 10개). 초안은 비고 150자 초과 2행(스킬 417자·워크스페이스 등록부 155자)이 남아 있다.
- 현재 측정(프로젝트 증거 폴더 measure.ts): 40,703B, 작업 프로세스 4,172자, 비고 150자 초과 10행, 미등록 `src/dashboard/` — 위반 13건.
- 사전 검토 1차(Codex, fail — blocking 3·should_fix 1) 반영: S-3 대상 문서 대조, S-4 문서 표 의미·옛 참조 제거, S-1·S-2 고정 절·라벨 유일성·`resolveAgent` 조건, S-5 답·경로 채점. 2차는 PM의 수정 스크립트 오류로 바뀌지 않은 본문을 다시 검토해 같은 지적(해시 동일 — `evidence/pre-review-hashes.txt`).
- 하네스 선언: 라벨 4개(`검사` `npm run check` · `보안 검사` `node scripts/secret-scan.ts` · `worktree 준비` `npm ci --no-audit --no-fund` · `의존성 감사` `npm audit --omit=dev`), `작업자 도구:` 줄은 이 저장소에 없음. S-3 테스트(`test/adopt-opal-docs.test.ts`)가 정의서의 OPAL 행·README 링크·문서 표 README 행·라벨 행을 요구.
- 옮긴 절을 가리키는 곳: `AGENTS.md:24`(더 보기), `docs/ARCHITECTURE.md:24·29`, 브레인 `concept/canvas-추출-도구-봉인과-설치-경계.md`(Canvas 묶음 문단 → SETUP), `concept/백로그-대시보드-자동-갱신과-git-경계.md`(대시보드 절 → DASHBOARD, 39행 본문 언급, T01 SKILL 변경으로 stale-source 경고 1).
- 덤(계약): 작업 프로세스 worktree 예시 `../ai-framework.wt/` → `../pace.wt/`.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 정의서가 기준을 만족한다: 고정 절(개요·원칙과 기준·범위·구성 요소·환경·작업 프로세스·문서·용어) 모두 있음, 16KB 이하, `구성 요소`·`문서` 외 절 3,000자 이하, 구성 요소 넷째 칸 150자 이하(링크 포함), `src/*/` 최상위 코드 폴더 모두 등록(`src/dashboard/` 포함), 서브 문서 각 24KB 이하 (P-3) |
| T-2 | 하네스 선언 4개가 분리 전후 같은 값으로 읽히고, 각 라벨은 표 첫 칸·목록 맨 앞에 정확히 한 번이며, 저장소 기본 `작업자 도구` 선택 결과(`agent`·`source`, 프로젝트 `- 작업자:` 비움·같은 세션 환경)가 전후 같다(이 저장소는 선언 없음) (P-4) |
| T-3 | 정의서에서 빠진 문장·표 칸은 이동 대응표(`evidence/move-map.json` — 기준선 절·행 → 대상 서브 문서·절)가 정한 대상 문서의 그 절에 원문 그대로 있다(새 한 줄 요약·링크 제외). 예외는 대응표에 전후 값으로 적은 계약 덤 교정(`../ai-framework.wt/` → `../pace.wt/`) 하나 (P-5) |
| T-4 | 새 서브 문서가 모두 문서 표에 용도(정해진 값)·좁은 적용 범위(`전체`·`—` 아님, glob마다 실제 경로가 맞음)·참조 시점과 함께 등록되고(표 머리글 이름으로 열을 찾음), 정의서·서브 문서·AGENTS.md·ARCHITECTURE.md의 상대 링크(앵커 포함)가 실제를 가리키며, AGENTS.md 더 보기가 읽는 시점 형식이고, ARCHITECTURE.md·브레인 근거가 새 위치를 가리키되 영향받은 참조마다 새 위치가 그 내용을 담고 옛 참조는 제거됐다. `pace brain lint` 오류·경고 0 (P-6) |
| T-5 | 정의서가 지도로 기능한다: 처음 보는 에이전트가 정의서에서 출발해 링크만 따라 상세(예: daemon 승인 규칙·대시보드 PC 경로·민감 경로·검사 선택)와 실행 명령을 찾는다 (목적) |
| T-6 | 저장소 검사·보안 검사 통과(기존 간헐 실패 `canvas-미리보기-소유-chrome-관찰-간헐-실패`는 재실행으로 판정) (P-7) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | check | T-1 | 반영본 | 측정 도구 실행 + 대조 도구의 고정 절 검사 | 기준 위반 없음(크기·절·비고·미등록 폴더·미등록 문서·서브 문서 크기), 고정 절 8개 모두 있음 — 고정 절 하나를 지운 사본은 실패 | `node <프로젝트 evidence>/measure.ts .` 종료 0 · `verify.ts` |
| S-2 | check | T-2 | 기준선 a2488d9 대 반영본 | 대조 도구 — `declaredCommand`로 라벨 4개 전후 비교, 라벨 머리 행 개수(각 1), 임시 저장소에 `- 작업자:` 빈 프로젝트를 두고 같은 env로 `resolveAgent`의 `agent`·`source` 전후 비교 | 네 값 같음, 라벨마다 1행, 작업자 선택 전후 같음 — 같은 라벨 행을 뒤에 하나 더한 사본은 실패 | `node <프로젝트 evidence>/verify.ts` |
| S-3 | check | T-3 | 같음 + `evidence/move-map.json` | 대조 도구 — 기준선 단위(문장·표 칸)마다 반영본 정의서에 남았으면 통과, 아니면 대응표가 정한 대상 문서의 그 절 범위에서 원문을 찾음. 대응표 예외는 전후 값 일치로만 통과 | 빠진 단위 0, 대상 아닌 곳에만 있는 단위 0 — 대상 문서에서 문단을 지운 사본(다른 문서에 같은 문장이 있어도)은 실패 | 같음 |
| S-4 | check | T-4 | 반영본 | 대조 도구 — 문서 표를 머리글 이름(문서·용도·적용 범위·참조 시점)으로 읽어 새 서브 문서마다 용도 ∈ {convention, security, architecture, api, test, e2e, ops}, 적용 범위가 `전체`·`—` 아니고 glob마다 실제 경로가 하나 이상 맞음, 참조 시점 비어 있지 않음. 상대 링크·앵커. 참조 대조표(AGENTS 더 보기, ARCHITECTURE 24·29행, 브레인 두 페이지)마다 새 위치 파일이 그 내용을 담는지와 옛 참조(`doc:docs/README.md` 근거·본문의 정의서 언급)가 없는지. `pace brain lint` | 등록·의미 누락 0, 깨진 링크 0, 옛 참조 0, lint 오류·경고 0 — 적용 범위를 `전체`로 바꾼 사본은 실패 | 같음 + `pace brain lint` |
| S-5 | check | T-5 | 정의서 하나만 출발점, 검색 금지(파일 읽기로 링크만 따라감) | 새 맥락 에이전트에게 정의서 경로만 주고 질문 6개의 답·따라간 링크·도착한 절을 묻는다. 정답 근거와 허용 경로: ① daemon 쓰기 작업 승인 규칙 → DAEMON.md(링크 1) ② 대시보드 PC 경로를 두는 파일(local.js, Git 밖) → DASHBOARD.md(1) ③ 민감 경로 목록 → SECURITY.md(1) ④ `pace test changed`의 실행 범위와 전체 전환 → TESTING.md 검사 선택 절(1) ⑤ 보안 검사 명령 `node scripts/secret-scan.ts` → 정의서 환경 표(0) ⑥ 작업자 모델 설정 명령 `pace worker set` → WORK-PROCESS.md(1) | 질문마다 답이 정답 근거와 맞고, 따라간 경로가 허용 경로(링크 2번 이내)이며 검색으로 우회하지 않음 — 답·경로·도착 절을 함께 채점 | 새 맥락 tester(evidence에 원문) |
| S-6 | unit | T-6, T-2 | 작업본 | 저장소 검사(S-3 adopt-opal 정의서 테스트 포함)·보안 검사 | 통과 — intent-preview 소유 Chrome 시험만 실패하면 단독 1회 재실행 | `npm run check` · `node scripts/secret-scan.ts` |

## 접근

- 출발안을 ref에서 꺼내 그대로 쓰고 T01 기준에 맞춘다: 스킬 행 → 한 줄 요약 + 새 `docs/SKILLS.md`(원래 칸 원문, 한 주제: 기본 스킬 목록), 워크스페이스 등록부 행은 원문 유지하고 링크 글자를 줄여 150자 이하. 서브 문서는 출발안 10개 + SKILLS 1개, 조정 이유는 결정 메모.
- 출발안 생성기는 기준선 줄·칸을 그대로 옮긴다(손으로 다시 쓰지 않음). 이동 대응표 `evidence/move-map.json`(기준선 절·구성 요소 행 이름 → 대상 서브 문서·절)을 만들고, 대조 도구가 대응표로 대상 문서의 절을 좁혀 원문을 찾는다.
- AGENTS.md 더 보기를 템플릿 형식(작업 시작 때 정의서 / 경로를 고칠 때 문서 표 적용 범위의 서브 문서)으로, ARCHITECTURE.md 근거 문구 24·29행을 새 위치로.
- 브레인: 두 페이지의 근거를 `pace brain update --sources`(목록 교체 — 옛 `doc:docs/README.md` 제거)와 본문 갱신으로(`docs/SETUP.md`·`docs/DASHBOARD.md`), stale-source 경고는 주장 확인 뒤 update로 해소.
- 대조 도구(verify.ts)를 이번 기준으로 고친다: 고정 절·라벨 유일성·`resolveAgent` 전후, 대응표 기반 원문 대조, 문서 표 머리글 기반 의미 대조, 참조 대조표. 각 검사는 결함 사본(고정 절 삭제·중복 라벨·대상 문단 삭제·적용 범위 `전체`)으로 실패함을 확인한다. 반영본 측정은 measure.ts.
- 기준 문서: 문서 표 `skills/pace-project-init/references/`(convention, `docs/**`) — T01 기준 절. 코드 변경은 증거 도구뿐.
