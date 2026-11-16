# T04 자율 주행 규약 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

목표(모든 플레이북이 같은 방식으로 지도를 읽고 주행하게 하는 공통 규약 + 기계로 검증할 수 있는 부분의 라이브러리)는 상위 목적에 정합하고 **달성**으로 판단한다 — `references/driving.md`(규약 버전 1, 10개 절)와 주행 라이브러리 `tools/driver.mjs`(`drive`·`driveOperation`·`recordApproval`·`createWebRuntime`·`createApiRuntime`)가 생겼고, T03 생성기로 만든 가상 플레이북을 규약대로 API 흐름(로컬 가짜 서버)·브라우저 흐름(Orca)으로 끝까지 주행한다(`evidence/e2e-driving.txt`). 승인 관문은 **지도 선언(gate)과 사용자 승인 기록 둘 다** 있어야 자율이고 gate 없는 비읽기 단계는 항상 멈춘다(`no-map-rule`, BR04 원문 — 캡틴 결정). 되돌릴 수 없는 행동은 수행 전 `in-progress` 기록·결과 불명 시 `lookup`·`settle` 확인 뒤 재조회까지 거친 뒤에만 재수행하고, 운영 명령도 같은 `runId`·관문·상태 전이를 쓴다. 값은 `sink`로만 흐르고 반환·상태·로그·중단 보고에는 건수와 허용 어휘 코드만 남는다. 한계: ① 체크포인트 없이 행동하고 던지는 운영 명령은 라이브러리가 판정할 수 없다(규약이 읽기 전용 단계에만 쓰게 함). ② 값이 전달되지 않은 채 조회로 완료만 확인된 단계는 `undelivered`로 보고할 뿐 값을 복구하지 못한다. ③ 서비스 고유 판정(로그인·탭 범위)은 호출자 주입. 자가 복구(T05)·실제 서비스 시범(T06)은 아직이다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1: `test/playbook/skill-doc.test.mjs` "T04 S-1" — 10개 절·핵심어, 머리말 버전 = `DRIVING_VERSION`, SKILL.md 링크·도구 위치 행(8KB 이하), 생성된 플레이북 SKILL.md는 경로·버전만(본문 복사 없음) |
| T-1b | 통과 | S-2b: `driver.test.mjs` — 같은 `runId` 재개는 완료 재수행 0, 새 `runId`는 모든 단계를 실제 수행 |
| T-2 | 통과 | S-2: 낡은 지도 3종(steps 수정·캡처 교체·`agent/*` 수기 수정) `stale-map`·runtime 호출 0 |
| T-3 | 통과 | S-3·S-6: 읽기 자율·gate 없는 비읽기 `no-map-rule`·`once` 소모·`standing` 재사용·해시 변경 시 재질문·`recordApproval` 값 없음 |
| T-4 | 통과 | S-4·S-4b·S-4c: 결과 불명·상태 재개·`settle` in-flight/settled(재조회 포함)·운영 명령 체크포인트 재개·중복 0·범위 안 관문, 경계(시도 기록·재호출 상한·once 실행 예약·failedAt 정상 반환) |
| T-5 | 통과 | S-5: 반환·상태·로그·중단 보고에 값 0건(이유·예외·sink 오류·보고 필드·요소 번호 포함), 전달 위치 없음·선언 밖 값 처리, 상태 쓰기 전 민감 형식 검사 |
| T-6 | 통과 | S-7·S-8: `driver-runtime.test.mjs`(웹 판정·첫 낱말 규칙·box 충돌 보고·지연 대기·늦은 덮개) + `driver-e2e.test.mjs`·`evidence/e2e-driving.txt`(API: 승인 없음 POST 0→승인 뒤 1→standing 재주행, 허용 밖·리다이렉트 호출 0, 운영 명령 관문; 브라우저: 덮개 닫기·입력·클릭·지연 결과·sink 전달, 결과 안 오면 `expect-failed`·다음 단계 0) |
| T-7 | 통과 | `evidence/check-tsc.txt`·`evidence/check-test.txt`·`evidence/secret-scan.txt` |

## 단위 테스트

- `.mjs` 전체 통과 — `node --test test/playbook/*.test.mjs test/playbook-install.test.ts test/playbook-maker.test.ts test/canvas-skills.test.ts` 149건 통과·건너뜀 0(Orca 사용 가능). 이 태스크 추가분: `driver.test.mjs` 14건, `driver-runtime.test.mjs` 8건, `driver-e2e.test.mjs` 2건, `skill-doc.test.mjs` 1건. 래퍼 `test/playbook-maker.test.ts`는 파일 15개·133건 이상, 건너뜀 3(Orca e2e)까지 허용으로 갱신. tsc exit 0, secret-scan 통과 744개 파일. 전체 `npm run check`는 finish 전 1회(코디네이터 지시).

## E2E

- S-8(통과): 로컬 가짜 API 서버 + Orca 내장 브라우저(320×240) — 출력 `evidence/e2e-driving.txt`. 브라우저 흐름은 Orca가 없거나 `PACE_SKIP_BROWSER_E2E=1`이면 건너뛴다(API 흐름은 항상 실행). 브라우저 흐름은 Orca 호출 지연 때문에 1~2분 걸린다.

## 리뷰

- 사전 검토: codex `--kind task` 1~3차 fail(`evidence/pre-review-task-1.md`·`evidence/pre-review-task-2.md`·`evidence/pre-review-task-3.md`), 캡틴 결정 A로 게이트 예외(waiver, `evidence/user-gate-decision-t04.md`: 반영 확인에서 4건 중 3건 해소, 남은 승인 정책 1건은 BR04 원문대로 no-map-rule 반영 — 범위 변경 아닌 구체화). `PRE-REVIEW.json`에 1~3차 fail 이력과 waiver. 반영 확인의 should_fix(`driveOperation`의 `runId`·`settle` 공유, S-4 "settled 확인 뒤 재수행")는 구현·시험에 포함했다.
- 구현 후 reviewer(codex, openai, cross:true, 파일 열람): 1차(`evidence/review-goal-1.md`) **fail** blocking 5 — settled 뒤 재조회 없는 재수행·운영 명령 시도 기록/재호출 상한·부분 성공 뒤 once 승인 재사용·보고/이유 코드 값 유출·운영 명령 미전달을 done 처리. 모두 반영. 2차(`review-goal-2.md`) **fail** blocking 2(보고 `element` 임의 정수·lookup 복구의 미전달) → 반영, 같은 지적이 2회라 규칙대로 중단하고 코디네이터에 상신: 반영 확인 1회 허용(main 판단). 3차(`review-goal-3.md`) **fail** blocking 1(일반 주행 같은 `runId` 재호출에서 미전달이 done으로 숨겨짐) → 반영, 캡틴 결정 "A로 진행해 줘"(`user-gate-decision-t04.md`). 4차(`review-goal-4.md`) **pass**(blocking 0, should_fix 1: 재호출에서 미전달 보고가 후속 단계의 다른 중단 뒤로 밀림 — `lost`로 상태는 보존되므로 후속 개선 대상). 반영 내용: `settle` 뒤 재조회·시도 기록·`once` 실행 예약(`reserved`)·허용 어휘 이유 코드와 지도에서 만든 보고·`delivered` 상태(`undelivered`)·`failedAt`/체크포인트 계약 문서화.
- tester: 워크트리 PM 판정 pass — 실행 증거 `check-test.txt`·`e2e-driving.txt`·`secret-scan.txt`.
- 교본: typescript — 코드 변경은 테스트 래퍼(`.ts`) 한 곳뿐, 본체는 같은 `.mjs` 스타일. 보안: 값의 경로(반환→sink만)·API 호출 범위·승인 해시 결합을 `security.md` 기준으로 대조.

## 남긴 것

- **T05**: 중단 보고(`locate.report`: 단계·요소 번호·이유 코드·`sourceHash`·`shotSha256`)와 상태 파일 `drive-state.json`이 복구·학습의 입력이다. `bad-range`·`undelivered` 같은 새 상태 코드는 규약 §10에 있다.
- **T06**: ① 업무 저장소 vendoring·`DRIVING_VERSION` 확인 방식과 docs/README.md·ARCHITECTURE.md 구성 요소 표 갱신. ② 실제 서비스 어댑터가 `lookup`·`settle`·`attemptKey` 지원 여부 확인. ③ should_fix 후속: 재호출에서 미전달 보고를 즉시 반환할지, 지도 읽기를 index 한 번 공유로 줄일지(검토 6번).
- **함정(브레인 후보)**: ① Orca CLI 호출은 호출마다 수백 ms라 가짜 시계 기반 대기(폴링 횟수)와 실제 시간이 어긋난다 — 결과가 끝내 안 오는 시나리오는 페이지 쪽에서 만든다(`?never`). ② `eval`은 항상 값을 돌려줘야 한다(`undefined`는 JSON 해석 실패). ③ 이유·오류 코드는 모양 검사(`^[a-z0-9-]+$`)가 아니라 허용 어휘 목록으로 거른다 — 모양만 맞는 실값이 통과한다. ④ 승인 `once`는 소모뿐 아니라 실행 예약이 있어야 부분 실패 뒤 다른 실행이 재사용하지 못한다.
