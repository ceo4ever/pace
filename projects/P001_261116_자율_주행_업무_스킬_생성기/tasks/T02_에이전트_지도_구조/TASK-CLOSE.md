# T02 에이전트 지도 구조 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

목표(단계마다 화면+위치+액션+추출을 한 번에 읽는 지도 `agent/`를 정본 steps.json에서 생성)는 상위 목적에 정합하고 **달성**으로 판단한다 — 가상 표본에서 `index.json`·`S0n.json`·`S0n.html`이 생성되고(`evidence/e2e-position.txt`: 실제 브라우저에서 기록 box ↔ 실측 rect, 번호 박스 렌더 위치 일치), 실값 경로는 합의 범위(탐지 가능 형식 거부·출처 제한·`contentHash`)에서 막혀 있으며, 꺼진 흐름 출력은 바이트 동일(`evidence/identity-result.txt`). 한계: 형식 없는 값(이름·주소)의 완전 차단은 사용자 결정으로 보장하지 않는다. 승인 기록의 진위(누가 승인했는가)는 서명 체계가 없어 증명하지 않는다. 실제 무인 주행·복구 성공은 T04·T05·T06에서 확인한다. 독립 검토(codex)의 1단계 판정은 10차에서 "지도 생성 목표 달성, blocking 없음, pass"(`evidence/review-goal-10.md`).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1: `evidence/identity-result.txt` — 흐름 9개·파일 106개 불일치 0(`agent/` 폴더 생성 0) |
| T-2 | 통과 | S-2·S-2b·S-2e: `test/playbook/agent-map.test.mjs` — `agent/` 3종, 고정 기대값(요소 3개 n→find→box→번호 박스 %), 지도 읽기 시뮬레이션 |
| T-3 | 통과 | S-3·S-3b·S-3c·S-3d·S-3e·S-3f: `test/playbook/agent-core.test.mjs`·`agent-map.test.mjs`·`agent-strict.test.mjs` — box·가림 증거 숫자·불리언뿐, 부분 가림 거부·합집합 허용, 승인 연결, 좌표 출처 `captureRecord` 하나 |
| T-4 | 통과 | S-4·S-4b: 낡음 보고(steps.json·캡처·생성물 수기 수정·옛 파일·관리 밖 파일), 생성 거부(캡처 누락·shotHash/recordHash 불일치), CLI `--check-agent` 종료코드 |
| T-5 | 통과 | S-5(스텁 환산·dpr 혼동·비비례 불일치)·S-5r(실제 브라우저): `test/playbook/agent-core.test.mjs`·`position-e2e.test.mjs`, `evidence/e2e-position.txt` |
| T-6 | 통과 | S-2c·S-2d·S-2f·S-2g·S-6·`agent-strict.test.mjs`: 민감 형식(토큰류·인코딩·객체 키·숫자·정규식 이스케이프)·`valueReview`·허용 필드·URL 문법·접근 범위·형식 선언(수집은 막지 않음)·서술 필드 재확인 |
| T-7 | 통과 | S-7·S-7b·S-7c: 출력 경로 집합(생성기 `validateOutput`과 테스트 허용 집합), 필수 키, 해시 분류 독립 기대값, 단계 json 8KB 이하, `skill-doc.test.mjs`(사전 행 전부 fixture가 사용) |
| T-8 | 통과 | `evidence/check-tsc.txt`·`evidence/check-test.txt`·`evidence/secret-scan.txt` |

## 단위 테스트

- `.mjs` 84건(생성기·코어·지도·엄격성·스킬 문서·실제 브라우저 e2e 1건) 전부 통과 — `node --test test/playbook/*.test.mjs`. 래퍼 `test/playbook-maker.test.ts`가 파일 6개·84건 이상 실행을 확인(건너뜀은 Orca e2e 하나만 허용).
- 전체: `node scripts/test.ts` tests 878 / pass 872 / fail 0 / skipped 6(기존 skip, `evidence/check-test.txt`; 래퍼는 1건으로 센다) · `check-tsc.txt`(tsc exit 0, `test/playbook-install.test.ts` 타입 수정 뒤 재실행) · `secret-scan.txt`.

## E2E

- S-5r(통과): Orca 내장 브라우저로 가상 로컬 페이지(`test/fixtures/playbook/position-page.html`)를 열어 코어 오버레이 box를 실측 → 창 크기 1200×900·640×480·배율 2에서 다시 측정해 비례 요소 일치·고정 폭 요소 불일치, 생성된 `S01.html`을 열어 번호 박스 5개 위치를 렌더 rect와 비교(허용 2px). 4회 연속 통과를 확인했고(첫 호출 응답 끊김은 재시도로 흡수), 출력은 `evidence/e2e-position.txt`.
- S-1 동일성(통과): `evidence/compare-identity.mjs`(T01 스크립트 사본) 재실행, 출력 `evidence/identity-result.txt`.

## 리뷰

- 사전 검토: 시작 전 codex(`pace agent verify`, 파일 열람) 약 24회 — 매번 설계 지적을 TASK에 반영했으나 경계 사례가 끝없이 나와 수렴하지 않았다(`evidence/pre-review-codex.md`·`evidence/pre-review-task-1.md`~`evidence/pre-review-task-6.md`와 `evidence/pre-review-codex-2.md`~`-18-stage1.md`, 차수별 판정은 모두 revise·fail, 차수별 blocking 항목 수는 아래 표). 캡틴 결정 "둘 다 1번으로 진행해 줘"(2026-11-16)로 **게이트 예외**(`PRE-REVIEW.json` waiver, `evidence/user-gate-decision.md`). pass로 위장하지 않았다. `PRE-REVIEW.json`의 attempts에는 해시를 복원할 수 있는 차수만 넣었다(1~3차는 입력 번들에 실린 본문 기준 해시, 마지막 6차는 기록 당시 TASK 해시) — **한계: 4~24차의 중간 TASK.md 판은 보존되지 않아 해시를 추정하지 않았고 evidence 원문과 아래 표로 대신한다.** 마지막 3건 지적(URL query 인코딩 값·승인 뒤 find 교환·box 추출 범위)은 구현 테스트 항목으로 넣었다(S-2f·S-6·S-3f·`agent-strict.test.mjs`).
- 구현 후 reviewer(codex, openai, cross:true, 파일 열람·메모리 재현): 10차까지 `evidence/review-goal-1.md`~`evidence/review-goal-10.md`. 지적 등급으로 판정 — 1~5차 blocking 있음(중첩 객체 허용 키·승인 증거 의미 검증·기록 구조 키·화면/프레임 변경 증거 재사용·기록 키 민감 형식 등, 모두 코드와 회귀 테스트로 반영), **6~9차 blocking 0(should_fix만, 판정 단어는 revise였으나 verify 프롬프트가 pass|revise|fail을 허용한 탓 — main 5060fa72에서 수정)**, 10차(수정 확인) **blocking 0 · 판정 pass**. 차수별: 1차 blocking 2·sf 2 / 2차 2·1 / 3차 2·1 / 4차 1·2 / 5차 1·2 / 6차 0·3 / 7차 0·2 / 8차 0·2 / 9차 0·2 / 10차 0·0 pass.
- 9차 should_fix 2건 처리: (1) 추출 위치 실행 가능성 → 모든 단계에서 `where.selector`가 번호 요소 `find`와 같아야 하고 API 단계는 `apiPath`만(S9 테스트), (2) 비캡처 웹 단계 최소 정보 → `tool`·`success`·화면 판정(`screen.url` 또는 `identify.anchors`) 필수. 둘 다 10차에서 해소 확인.
- tester: 워크트리 PM 판정 pass — 실행 증거 `check-test.txt`·`e2e-position.txt`·`identity-result.txt`·`secret-scan.txt`.
- 교본: typescript — 코드 변경은 테스트 래퍼 2개뿐(`.ts`, `erasableSyntaxOnly`·`noUncheckedIndexedAccess` 준수: tsc 오류 1건을 `as string`으로 고침), 본체는 시제품과 같은 `.mjs` 스타일(주변 코드 우선).

사전·구현 후 검토 차수별 blocking 항목 수(원문 기준 파싱): pre-review-codex(1차)=1, -2=2, -3=2, -4=2, -5=1, -6=2, -7=1, -8=1, -9=0, -10=1, -11=0, -12=1, -13=1, -14=1, -15·16·17·18 stage1=1·1·1·1, pre-review-task-1~6=1·1·2·1·2·1(4차 판정 fail).

## 남긴 것

- 어댑터 연결(`captureRecord`·`approveStep` 호출)은 이 태스크 범위 밖 — `references/adapter.md` 7번에 의무를 적었다. 생성기·주행 도구가 읽는 쪽(T04)과 어댑터 템플릿(T03)에서 실제 호출을 만든다.
- `allowedPaths`는 `api.endpoint`에만 적용한다. `screen.url`은 정규식이라 `^…$` 고정만 강제(구현 결정, 스키마 문서에 명시).
- 위치 필드(`find`·`screen`·`frames`) 변경 시 캡처 증거는 `stale`로 표시되고 재캡처·재승인(`approveStep`)으로 갱신한다. 자동 복구가 사람 없이 `approveStep`을 부르는 조건은 T05 소관.
- 실제 브라우저 e2e(S-5r)는 `PACE_SKIP_BROWSER_E2E=1`로 건너뛸 수 있고, Orca가 없으면 건너뛴다. 그 경우 마감 증거는 Orca에서 실행한 결과가 필요하다. 이 e2e는 Orca 탭을 열었다 닫는다.
- docs/README.md·docs/ARCHITECTURE.md 구성 요소 표 갱신은 아직 안 했다 — 마지막 태스크(T06)에서 함께 한다.
- T04·T06 인수 조건: 실제 브라우저 주행에서 지도의 box·find·가림 증거가 실제 서비스 화면과 맞는지 확인한다(T02는 가상 페이지로만 검증).
- 함정(브레인 후보): Windows 셸 heredoc이 정규식 백슬래시를 지운다 — 코드·정규식 패치는 Write 도구로 만든 스크립트로 한다. verify 판정 단어·사전 검토 장꼬리는 main에서 도구·규칙으로 수정됨.
