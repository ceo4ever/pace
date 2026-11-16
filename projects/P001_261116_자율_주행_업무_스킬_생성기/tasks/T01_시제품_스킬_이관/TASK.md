# T01 시제품 스킬 이관

- 프로젝트: [P001](../../PROJECT.md) · 백로그: [BL261116_01_자율_주행_업무_스킬_생성기](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

## 목적

시제품 스킬·도구를 기능 변경 없이 PACE `skills/pace-playbook-maker/`로 옮겨, 이후 확장(T02~T05)이 바뀐 것을 이관 탓과 확장 탓으로 갈라 볼 수 있게 한다. 상위 목적(P-1·P-7·P-8)은 [PROJECT.md](../../PROJECT.md), 범위·완료 기준은 [BR01](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR01_시제품_스킬_이관.md).

## 재료

- 이관 원본: 사례 저장소 기준 커밋 <기준 커밋>(읽기 전용 `git show`). 옮길 것: 스킬 3파일, `tools/flow/{build,capture-core}.mjs`, 테스트 4파일.
- 설치기: `src/setup/install.ts` `copySkill`은 `SKILL.md`가 있는 스킬 폴더를 통째로 복사한다(`tools/*.mjs` 포함) — 설치기 변경 불필요.
- 테스트 실행기: `scripts/test.ts`는 `test/**/*.test.ts`만 실행 → `.mjs` 테스트는 `test/playbook/`에 두고 `.test.ts` 래퍼가 실행·건수 확인.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 이관본 생성기로 사례 저장소 흐름 9개를 저장소 밖 빈 폴더에서 다시 만들면 파일 목록·바이트가 <기준 커밋>와 같다(머리말 생성 명령 줄만 자리표시) — P-1 |
| T-2 | 이관 파일(스킬·fixture)에 서비스 실값 0건, 이름·경로(`name`·제목·도구 위치·`GEN`)가 `pace-playbook-maker`·PACE 경로로 바뀌고 본문 절차·생성기 동작은 그대로 — BR01 |
| T-3 | 사례 의존 테스트가 비식별 fixture(사전의 모든 필드를 쓰는 가상 흐름)로 바뀌고, 그 fixture가 사전 모든 행을 쓴다 |
| T-4 | `npm run check`·`node scripts/secret-scan.ts` 통과, `.mjs` 테스트(생성기·코어·스킬 문서)가 실제 실행된 건수가 출력으로 확인된다 — P-8 |
| T-5 | 재설치(격리 HOME) 뒤 설치본·도구 폴더 위치에서 생성기 실행과 코어 import가 되고, 기존 사용자 스킬(같은 계열 이름 포함)은 바이트 불변, 추가는 `pace-playbook-maker` 하나 — P-7 |
| T-6 | 사례 저장소 작업 사본 `git status` 깨끗, 사례 저장소 테스트 4종 결과가 이관 전후 같다 — P-7 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | e2e | T-1 | <기준 커밋>의 steps.json·shots 9흐름 | 빈 임시 폴더에서 이관본 생성기 실행 후 `git show` 바이트와 비교 | 9흐름·106파일 불일치 0, 생성기를 바꾼 대조군은 9흐름 모두 불일치 | `evidence/compare-identity.mjs` |
| S-2 | unit | T-2 | 스킬 문서·소스 | 금지어·실값 형식 검사, name·링크·절 검사 | 통과 | `test/playbook/skill-doc.test.mjs` S-1·S-2·S-5 |
| S-3 | unit | T-3 | fixture `test/fixtures/playbook/sample-flow` | 필드 수집기·사전 행 대조·생성 | 사전 행 중 fixture가 안 쓰는 것 0, 생성 4단계 | `skill-doc.test.mjs` S-3·S-5, `build.test.mjs` S-6 |
| S-4 | unit | T-4 | 전체 | `npm run check` | 통과, 래퍼가 `.mjs` 40건 이상 실행·실패 0 확인 | `test/playbook-maker.test.ts` |
| S-5 | unit | T-5 | 격리 HOME에 기존 사용자 스킬 | `install()` 후 스냅샷 비교, 설치본에서 `build.mjs` 실행·`capture-core.mjs` import | 기존 항목 해시 불변, 추가 `pace-playbook-maker`, 생성·import 성공 | `test/playbook-install.test.ts` |
| S-6 | check | T-6 | 사례 저장소 `tools/{flow,service-a,service-b,service-c}` | 이관 전후 `npm test` 결과·`git status` 비교 | 결과 같고 status 깨끗 | `evidence/case-baseline.txt` |

## 접근

- 파일 이동: 스킬 3파일 → `skills/pace-playbook-maker/{SKILL.md,references/}`, 도구 → `tools/`, 테스트 → `test/playbook/`. `tools/flow/package.json`은 옮기지 않는다 — `.mjs`는 늘 ESM이고 테스트는 PACE 실행기가 돌린다(`사례 저장소-flow-tools` 이름도 서비스 고유).
- 바꾸는 곳은 이름·경로뿐: SKILL.md `name`·제목·도구 위치 표, 생성기 `GEN`(머리말 명령 줄)·사용 주석, schema.md API 단계 첫 사례 문장 일반화, 테스트의 import·스킬 경로, 사례 의존 테스트(`CASES`·service-a 비교)를 fixture로.
- 스킬 문서 테스트 S-2의 주민번호 형식 검사는 `tools/`(가림 검사용 합성 표본이 있다)를 뺀 문서만 대상으로 한다 — 스킬 폴더 안에 도구가 들어와 생긴 변화. 금지어 검사는 `tools/`까지 포함한다.
- 업무 저장소 vendoring·해시 버전 표기는 이 태스크 범위 밖(T03 이후, PROJECT "배포" 절).
