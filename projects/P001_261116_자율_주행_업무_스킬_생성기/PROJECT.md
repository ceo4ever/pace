# P001 자율 주행 업무 스킬 생성기

- 상태: 진행
- 규모: L(태스크 6개)
- 출처: [BL261116_01_자율_주행_업무_스킬_생성기](../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)
- 브랜치: `project/P001` · worktree: `../pace.wt/P001/`
- 작업자:
- 시작: 2026-11-16

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
프로젝트 상태: 정의 → 진행(출처로 착수 결정 뒤) → 병합 대기(finish) → 완료(merge) · 보류.
태스크 상태(태스크 표): 대기 · 진행 · 완료 · 보류.
규모별 생략:
- 작은 일(버그·문구, diff를 한 문장으로 말할 수 있음): 프로젝트를 만들지 않고 바로 커밋한다.
- 태스크 없는 프로젝트: "태스크" 절을 지운다. TASK.md의 "테스트" 표를 "기준" 아래에 옮겨 쓰고, e2e/·evidence/는 이 프로젝트 폴더에 둔다. 마감은 PROJECT-CLOSE.md 하나.
- 태스크 있는 프로젝트: 모든 절을 쓴다. "설계"는 이때만.
범위·기준은 다른 문서를 다시 쓰지 않고 링크한다.
-->

## 목적

반복되는 웹·API 업무를 에이전트가 사람 없이 수행하고, 서비스 화면·API가 바뀌어도 스스로 고쳐 계속 돌게 한다. 이를 위해 목표 하나를 받아 인터뷰 → 수행하며 기록 → **플레이북**(업무 스킬 한 벌)을 만드는 스킬 `pace-playbook-maker`를 PACE에 둔다. 상위 목적·용어·결정 D1~D9는 [백로그](../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)를 따른다.

## 재료

- 백로그: [BACKLOG.md](../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)·BR01~06, 인계 문서 로컬 보관(비공개)
- 시제품 원본: 사례 저장소 작업 사본 `<사례 저장소 경로>`(`<사례 저장소 원격>`, 읽기 전용 — 고치지 않는다). 기준 커밋 <기준 커밋>(main 이력 안). <기준 커밋>..main(2026-11-16, <이후 main 커밋>)에서 `tools/flow`·`tools/{service-a,service-b,service-c}`·`.claude/skills/시제품 스킬` 변경 0
  - 스킬: `.claude/skills/시제품 스킬/SKILL.md`(7.5KB)·`references/{schema,adapter}.md`
  - 도구: `tools/flow/build.mjs`(생성기)·`capture-core.mjs`(캡처 코어)·`tests/{build,capture-core,skill-doc}.test.mjs`·`dom-stub.mjs`
  - 기존 어댑터가 이미 Orca 브라우저 CLI를 쓴다: `tools/service-a/lib.mjs`, `tools/service-b/packages/core/lib.mjs`, `tools/service-b/packages/flowdoc/capture.mjs`
- PACE: 테스트 실행기 `scripts/test.ts:7`(`test/**/*.test.ts`), 비밀 검사 `scripts/secret-scan.ts`, 스킬 설치 `src/setup/install.ts`(`skills/<이름>/SKILL.md` 폴더를 설치본·`~/.claude/skills`로 복사), 선례 `.mjs` 도구 `skills/pace-canvas-skills/*/tools/*.mjs`
- 브라우저: Orca 브라우저 CLI(`orca` 1.4.258, 이 PC 설치 확인) — `orca-cli` 스킬
- 브레인:
  - `.pace\brain\pages\synthesis\pace-intent-의도-파악-기획-구조와-함정.md` — 인터뷰(한 번에 한 질문) 방식 재사용(BR03)
  - `.pace\brain\pages\concept\canvas-추출-도구-봉인과-설치-경계.md` — 스킬 폴더 안 `.mjs` 도구 설치 경계 선례
  - `.pace\brain\pages\flow\작업-하네스-흐름.md` — 하네스 절차

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 이관본 생성기로 사례 저장소 흐름 9개를 저장소 밖 빈 폴더에서 다시 만들면 <기준 커밋> 생성물과 파일 목록·바이트가 같다(머리말 생성 명령 줄만 자리표시 비교) | T01 비교 스크립트 출력 |
| P-2 | `agentView`를 켠 흐름만 `agent/index.json`·`S0n.json`·`S0n.html`이 생기고 스키마 검사(box·extract·API 단계·해시·민감 형식 거부)를 통과한다 | T02 테스트 |
| P-3 | 가상 서비스(로컬 웹 페이지·가짜 API)로 인터뷰 기록 → 수행·기록 → 플레이북 생성이 끝까지 되고, 민감 값 주입 시 저장된 모든 파일에 원문 0건 | T03 e2e·테스트 |
| P-4 | 생성된 플레이북을 주행 규약대로 브라우저 흐름·API 흐름 각 하나 끝까지 수행하고, 관문·해시 불일치·운영 명령 부분 실패에서 규약대로 멈추거나 재개한다(되돌릴 수 없는 행동 중복 0) | T04 e2e·테스트 |
| P-5 | 주입한 UI·API 변경 5종이 자가 복구·반영되고 다음 주행은 진단 없이 통과하며, 안전장치(첫 확인·미검증 미반영·한도 멈춤·가림 유지·회귀·주입 무시)가 동작한다 | T05 테스트·e2e |
| P-6 | 실제 읽기 전용 웹 업무 하나로 만든 플레이북을 새 세션이 다른 입력으로 끝까지 수행하고, 지도 없는 세션보다 시간·도구 호출 중앙값이 적다(각 3회 이상) | T06 주행 기록 |
| P-7 | 사례 저장소 무영향: PACE 새 버전 설치 전후 사례 저장소 흐름 9개 바이트 동일·사례 저장소 테스트 4종 결과 같음·사례 저장소 작업 사본 `git status` 깨끗·`~/.claude/skills` 기존 항목 불변(추가는 `pace-playbook-maker` 하나) | T01·T06 목록·해시 비교 |
| P-8 | `npm run check`·`node scripts/secret-scan.ts` 통과 | 명령 출력 |

## 설계

백로그 "설계 때 정할 것" 1~4 확정(2026-11-16 캡틴, 아래 결정 메모)과 브라우저 결정을 따른다.

- 위치: `skills/pace-playbook-maker/` — `SKILL.md`(생성기 절차), `references/`(schema·adapter·주행 규약 `driving.md`·학습 규칙), `tools/*.mjs`(생성기·캡처 코어·주행·학습 도구). 테스트는 `test/*.test.ts`에서 실행한다.
- 언어: 생성기·코어·도구는 `.mjs`(업무 저장소 어댑터가 그대로 import, 바이트 동일 비교 용이).
- 배포: 설치본 스킬 폴더가 정본, 업무 저장소는 코어를 복사(vendoring)하고 해시로 버전을 확인한다 — 낡으면 검사로 알린다. 방식 세부는 T01 설계.
- 스킬 하나: `pace-playbook-maker`가 생성·주행 규약·학습을 함께 담고, 플레이북은 규약을 복사하지 않고 버전 표기로 링크한다.
- 브라우저: **Orca 브라우저 CLI**(`orca`)를 기본 어댑터로 쓴다(사례 저장소 어댑터가 이미 사용). 어댑터 계약은 엔진 비의존으로 두되, 구현·e2e·시범은 Orca로 한다.
- 기존 `flow.html`·`flow/*.md` 형식은 유지(D6), 폐지는 사례 저장소 전환 뒤 별도 결정.
- 보안 영향: 캡처 가림(fail-closed)·민감 형식 탐지·실값 금지·되돌릴 수 없는 행동의 관문·화면/API 내용을 지시로 받지 않음. 시범·e2e는 가상 값만, 사례 저장소 실값을 PACE로 옮기지 않는다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `skills/pace-playbook-maker/**` | 새 스킬(절차·참조·도구) |
| `test/playbook-*.test.ts`, `test/fixtures/playbook/**` | 이관·확장 테스트, 가상 서비스 fixture |
| `src/setup/install.ts` (필요 시) | `.mjs` 도구 포함 스킬 설치 |
| `docs/README.md`·`docs/ARCHITECTURE.md` | 구성 요소 표에 플레이북 생성기 |
| `.pace/brain/` | 구조·함정·결정(T06) |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | 시제품 스킬 이관 | 완료 | |
| T02 | 에이전트 지도 구조 | 진행 | |
| T03 | 플레이북 작성과 업무 스킬 생성 | 대기 | |
| T04 | 자율 주행 규약 | 대기 | |
| T05 | 자가 복구와 학습 | 대기 | |
| T06 | 시범 업무 스킬로 끝까지 검증 | 대기 | |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-16 13:23 | 정의 작성 |
| 2026-11-16 14:00 | 착수 결정(캡틴, 이 세션 대화): "제안대로 진행" — ① 도구 언어 `.mjs` 유지 ② 코어는 업무 저장소에 복사 + 해시 버전 확인 ③ 스킬 하나(`pace-playbook-maker`, 주행 규약은 참조 문서) ④ 기존 `flow/*.md` 폐지는 사례 저장소 전환 뒤 별도 결정. 브라우저는 Orca 브라우저 CLI로 진행(캡틴). 사례 저장소는 `<사례 저장소 경로>`에 clone(<작업 계정> 계정) — 읽기 전용 |
| 2026-11-16 14:32 | (자체 판단) T01: 구현이 사전 검토보다 먼저 끝남 — 사후 교차 검토(pace agent verify, codex)로 대체 |
| 2026-11-16 14:32 | (자체 판단) T01: tools/flow/package.json 미이관(.mjs는 ESM, 서비스 고유 이름)·.mjs 테스트는 test/playbook/+래퍼 .test.ts |
| 2026-11-16 15:10 | (사용자 결정) T01: 같은 제공자 대체(캡틴 승인 ①): codex 읽기 전용으로 파일 열람 불가 → claude 새 맥락 reviewer pass |
| 2026-11-16 15:28 | (사용자 결정) T01: 사례 이름 비식별화로 TASK.md 문구가 바뀌어 PRE-REVIEW 해시 재기록(검토 내용 불변, 이름만 자리표시) |

