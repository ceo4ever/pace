# T03 플레이북 작성과 업무 스킬 생성 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

목표(인터뷰 → 수행하며 기록 → 플레이북 생성을 끝내는 절차와 도구)는 상위 목적에 정합하고 **달성**으로 판단한다 — 인터뷰 기록 검사·최초 저장 보호(`interview.mjs`), 인터뷰 합의에서 만든 흐름 뼈대와 API 단계 기록(`scaffold.mjs`), 보호 저장소를 거치는 수행 관찰·가림 캡처·대기·승인(`orca-adapter.mjs`), 합의 대조·선별 복사·허용 목록 검사로 플레이북 폴더를 만드는 생성기(`playbook.mjs`)가 실제 브라우저 e2e까지 통과한다(`evidence/e2e-playbook.txt`: 인터뷰·화면·가짜 API 응답의 합성 민감 값이 도구가 만든 어떤 파일에도 없고, 저장된 캡처 이미지는 픽셀로 가림 색 확인·대조군은 같은 검사 실패). 한계: 탐지 가능한 형식만 막는다(형식 없는 값 완전 차단 비보장 — T02 사용자 결정 A). 어댑터 라이브러리는 서비스 고유 화면 판정·탭 범위·로그인을 대신하지 않는다. 주행(T04)·복구(T05)·실제 서비스 시범(T06)은 아직이다. 독립 검토(codex) 2차에서 blocking 0, pass(`evidence/review-goal-2.md`).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1·S-2: `test/playbook/interview.test.mjs` — 필수 항목 누락 보고(성공 기준·위험 행동 등)·`noRiskyActions`·`noOutputs` 명시적 없음 통과·민감 형식(문자열·키) 거부·오류에 값 없음·CLI 종료코드·`sensitiveKinds`가 종류 이름만 반환 |
| T-2 | 통과 | S-3: `test/playbook/scaffold.test.mjs` — `initFlow`가 인터뷰 합의(resultTo·allowedOrigins·risks·rules·base)를 steps.json 뼈대에 채우고, 불완전·잘못된 이름·중복·민감 형식은 거부(파일 없음) |
| T-3 | 통과 | S-4: `test/playbook/orca-adapter.test.mjs` — 보호 저장소(쓰기 전 거부·쓰기 경로 기록·저장소 밖 경로 거부), `observeStep`, 캡처→대기→승인(shots·captureRecord·shotHash·recordHash 기록, 대기 메타에 숫자·해시뿐), 거부 시 대기·원본 0개, 승인 거부(해시 불일치·대기 없음·캡처 금지)는 상태 불변 |
| T-4 | 통과 | S-5·S-5b·S-6·`playbook-guard.test.mjs`: `test/playbook/playbook.test.mjs` — 폴더 구조·SKILL.md 합의 보존(서로 다른 인터뷰가 서로 다른 생성물)·`checkPlaybook` 통과, 파생물만 낡으면 재생성해 통과, 승인 증거 무효·인터뷰 불완전·형식 위반은 거부하고 outDir 미생성, 합의 불일치 8+3종 거부, 원본 먼저 검사·선별 복사(미승인 이미지·txt·bin 반출 안 됨), 임시 폴더 미잔존 |
| T-5 | 통과 | S-7·S-7c: `test/playbook/playbook-e2e.test.mjs`, `evidence/e2e-playbook.txt` — Orca 브라우저, 인터뷰 답·화면·API 응답 합성 값, 단계 직후 새 파일 스캔 0건, 픽셀 검증(저장 이미지 영역 평균 색 ≈ 가림 색, 대조군 ≈ 원래 배경), 액션 생략·잘못된 대상·잘못된 추출 거부 |
| T-6 | 통과 | S-8: `skill-doc.test.mjs` — SKILL.md 링크·크기(8KB 이하)·금지어, `references/playbook-making.md`(인터뷰·기록·생성 절차)·`adapter.md` "어댑터 템플릿" 절 키워드 |
| T-7 | 통과 | `evidence/check-tsc.txt`·`evidence/check-test.txt`·`evidence/secret-scan.txt` |

## 단위 테스트

- `.mjs` 112건 전부 통과 — `node --test test/playbook/*.test.mjs`(건너뜀 0, Orca 사용 가능). 래퍼 `test/playbook-maker.test.ts`가 파일 12개·112건 이상 실행을 확인(건너뜀은 Orca e2e 둘까지만 허용).
- 코디네이터 지시로 바뀐 부분 위주 검사: `node --test test/playbook/*.test.mjs test/playbook-install.test.ts test/canvas-skills.test.ts` 122건 통과(`evidence/check-test.txt`), tsc exit 0(`evidence/check-tsc.txt`), secret-scan 통과 727개 파일(`evidence/secret-scan.txt`). 전체 `npm run check`는 finish 전 1회 돌린다(T01·T02에서는 전체 878건·fail 0 확인).

## E2E

- S-7·S-7c(통과): Orca 내장 브라우저(320×240) — 인터뷰(실값 → 종류만) → `initFlow` → 거부 시나리오 3종 → 수행·관찰·가림 캡처·승인 → 픽셀 검증(대조군 포함) → `addApiStep`(응답 값 폐기) → `generatePlaybook` → 생성물 13개 파일 스캔 0건. 출력 `evidence/e2e-playbook.txt`. 이 e2e는 Orca 탭을 열었다 닫고(약 1분), Orca가 없거나 `PACE_SKIP_BROWSER_E2E=1`이면 건너뛴다 — 그 경우 마감 증거는 Orca에서 실행한 결과가 필요하다.

## 리뷰

- 사전 검토: codex `--kind task` 규칙 상한(2회) 내 1·2차 fail(blocking 3·2, `evidence/pre-review-task-1.md`·`evidence/pre-review-task-2.md`), 지적은 TASK.md에 반영. 캡틴 결정 "A로 진행해 줘"(2026-11-16, `evidence/user-gate-decision-t03.md`)의 3회차 1회(반영 확인) **pass**(`evidence/pre-review-task-3.md`, blocking 0, should_fix 2건 — S-7의 덮어쓴 steps.json 재검사·S-5b에 `scope` 포함 — 구현 테스트로 반영). `PRE-REVIEW.json` attempts 3건(1·2차 해시는 반영 전후 판을 역변환으로 복원), 예외 없음.
- 구현 후 reviewer(codex, openai, cross:true, 파일 열람·메모리 재현): 1차(`evidence/review-goal-1.md`) **fail** — blocking 3(인터뷰 합의와 흐름 불일치를 생성 때 대조하지 않음·검사 전 복사와 미승인 파일 반출·인터뷰 최초 저장이 쓰기 전 검사되지 않음) + should_fix 1(수행 관찰 보장 범위가 문서보다 좁음). 모두 반영: `checkAgreement`(+결과물 충족 `checkCoverage`)로 합의 대조, 원본 먼저 검사·`shotHash`와 해시가 같은 캡처만 선별 복사·`checkPlaybook` 허용 목록, `saveInterview`(쓰기 전 검사), 문서에 보장 범위 명시와 `expects` 항상 넘기기. 2차(`evidence/review-goal-2.md`) **pass**(blocking 0, should_fix 2: 결과물 합의 대조가 한 방향·가역 행동 관문 비대조) → 같은 날 반영(`checkCoverage`·형식 대조·가역 관문 대조, 회귀 테스트 3종 추가).
- tester: 워크트리 PM 판정 pass — 실행 증거 `check-test.txt`·`e2e-playbook.txt`·`secret-scan.txt`.
- 교본: typescript — 코드 변경은 테스트 래퍼(`.ts`) 한 곳뿐(`erasableSyntaxOnly`·`noUncheckedIndexedAccess` 준수), 본체는 시제품과 같은 `.mjs` 스타일(주변 코드 우선). 보안: 입력 검증·비밀·경로(쓰기 직전 검사·저장소 밖 경로 거부·허용 목록)를 `security.md` 기준으로 대조.

## 남긴 것

- **T04**: `references/driving.md`는 머리말만 있는 자리 파일(`규약 버전: 1`) — 본문과 `DRIVING_VERSION` 연동 갱신은 T04가 한다. 플레이북 SKILL.md는 규약을 복사하지 않고 스킬 이름·경로와 버전만 적는다.
- **승인 단계 정책**: 대기 파일은 승인 실패 때 남고(재승인·반려 가능) 캡처 단계 실패 때만 지운다 — 어댑터가 쓰는 쪽에서 `rejectPending`을 부른다. `observeStep`은 선택자 존재·액션·visible/filled만 본다(추출값 정확성은 판정하지 않음).
- **T06**: 업무 저장소로의 vendoring·해시 버전 확인은 시범에서 방식 확인. docs/README.md·ARCHITECTURE.md 구성 요소 표 갱신도 T06에서.
- **함정(브레인 후보)**: ① `IDENT.test(String(undefined))`는 통과한다 — 식별자 검사는 `typeof v==='string'`을 먼저 본다(T02 지도 검사의 같은 패턴도 고침). ② Windows 셸 heredoc이 정규식 백슬래시를 지운다 — 코드·정규식 패치는 Write 도구로 만든 스크립트로. ③ 합의 대조를 생성 단계에 두지 않으면 지도 검사는 통과하는 불일치(결과 위치·민감도)가 생긴다.
- 서비스별 어댑터 연결(탭 범위·`screen` 판정·로그인)은 업무 저장소 몫이다 — 이 라이브러리가 대신하지 않는다.
