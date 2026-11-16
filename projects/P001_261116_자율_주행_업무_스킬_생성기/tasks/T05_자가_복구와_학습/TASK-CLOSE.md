# T05 자가 복구와 학습 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

목표(주행 중 UI·API 변경을 진단·해결하고 검증된 해결만 지도에 반영해 다음 주행부터 그대로 통과)는 상위 목적에 정합하고 **달성**으로 판단한다 — 치유 라이브러리 `tools/healer.mjs`(`detect`·`diagnose`·`propose`·`checkPatch`·`learn`·`promoteStaged`·`rollback`·`migrateApprovals`·`driveWithHealing`·`recoverJournal`·`pendingHumanChecks`), 웹 관찰 `tools/heal-web.mjs`, 복구 규약 `references/healing.md`(버전 1)가 생겼고, T03 생성기로 만든 가상 플레이북에 주입한 변경 5종(버튼 이동·라벨 속성 변경·메뉴 경로 변경·새 공지 팝업·API 필드 이름 변경)이 각각 첫 주행에서 치유·반영·이어 완료되고 반영 뒤 같은 변경으로 다시 주행하면 치유 호출 0으로 통과한다(`evidence/e2e-healing.txt`, 새 기준 캡처는 픽셀로 가림 확인). 안전장치: 허용 경로(위치 필드)만 수정, 검증(`expectChecked`)·회귀(후보 단계를 덮는 사례) 통과분만 반영, 비가역·자동 대상이 아닌 후보는 후보 해시·계정·업무에 묶인 사용자 확인 뒤에만(임시 지도 overlay로 첫 수행이 검증, 성공 시 승격), 시도 한도, 원자적 반영(저널·commit/undo·실행 기록 이관), 결과 불명 단계 재실행 0, 화면 문구·응답은 데이터. 한계: ① 승인 요청 요약의 경로 원문 노출은 합의 범위(사용자 결정 2026-11-17) — 확인하는 사람에게만 보이고 지도·history·versions·치유 상태·승인 기록 같은 파일 기록은 승인 뒤에만 한다(`healer.test.mjs` "검토4 경계"가 승인 전 파일 기록 0을 단언). ② 소문자로 쓴 이름이 든 경로는 어휘 안 단어가 아니면 사용자 확인을 거치지만 확인 없는 구조 어휘 안의 값은 막지 못한다. ③ 웹 `expectChecked`는 읽기 대상의 관찰(표시·내용 변화)이지 `expect`·`success` 문장의 의미 평가가 아니다(검토 4·5 should_fix). ④ 재시작 뒤에는 승격할 후보 객체(새 기준 캡처 포함)를 다시 준비할 수 없어 확인을 다시 받는다(`staged-lost`)이고 `healStore`를 생략하면 시도 횟수가 호출 사이에 유지되지 않는다. 실제 서비스 시범은 T06.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1: `skill-doc.test.mjs` "T05 S-1"(절·핵심어·버전 = `HEAL_VERSION`·SKILL.md 링크·도구 위치·`screen.dismiss` 사전 행), `agent-map.test.mjs`·fixture 사용, `driver-runtime.test.mjs`(`createWebRuntime`의 `screen.dismiss`) |
| T-2 | 통과 | S-2·S-9: `healer.test.mjs` — 분류 10종, 진단에 값·문구 0, `createApiRuntime.observe`(경로 이름·상태 코드만) |
| T-3 | 통과 | S-3·S-8: `healer.test.mjs`(허용 경로·제한 경로 15종 거부·동점·임계 미달·민감 형식·해시, `dismiss` 규칙 자동/승인, 구조 선택자만·경로 어휘), `heal-web.test.mjs` |
| T-4 | 통과 | S-4: 검증 실패·`expectChecked` 없음·회귀 0건·후보 단계를 덮지 않는 사례·회귀 실패·`needs-user`는 미반영(바이트 불변), 비가역은 승인 전 `verifyStep` 0 |
| T-5 | 통과 | S-5: 저장 경계 7곳 실패 주입 바이트 불변, 저널(끊김·commit 실패·history 실패, 외부 실행 기록 포함)·`rollback`(수행 기록 보존·state 필수)·`rebaseline` 새 box 반영·`pendingHumanChecks` |
| T-6 | 통과 | S-6·S-6b: 승인 후보 해시·계정·업무·단계·키(키 없는 옛 승인 거부)·다른 단계 학습 뒤 유지·시도 한도 |
| T-7 | 통과 | S-7: 비치유 상태 치유 0, 비가역 overlay 격리·승격·재개 재실행 0(실행 기록 이관), 읽기 검증 값 `sink` 미전달 |
| T-8 | 통과 | S-10·e2e: 합성 값·주입 문구가 저장된 모든 파일에 0건, `gate`·`risk`·단계 목록 불변, 팝업 닫기는 닫기 어휘 요소로만 |
| T-9 | 통과 | S-11: `healer-e2e.test.mjs`·`evidence/e2e-healing.txt` — 5종 모두 치유·재주행 치유 0 |
| T-10 | 통과 | `evidence/check-tsc.txt`·`evidence/check-test.txt`·`evidence/secret-scan.txt` |

## 단위 테스트

- 변경 범위 `node --test test/playbook/*.test.mjs test/playbook-install.test.ts test/playbook-maker.test.ts test/canvas-skills.test.ts` 전부 통과·건너뜀 0(Orca 사용 가능, `evidence/check-test.txt`). 이 태스크 추가분: `healer.test.mjs` 24건, `heal-web.test.mjs` 3건, `healer-e2e.test.mjs` 2건, `driver.test.mjs`·`driver-runtime.test.mjs` 보강, `skill-doc.test.mjs` 1건. 래퍼 `test/playbook-maker.test.ts`는 파일 18개·168건 이상, 건너뜀 4(Orca e2e)까지 허용으로 갱신. 전체 `npm run check`는 finish 전 1회(코디네이터 지시).
- **S-8 편차(자체 판단)**: TASK는 웹 관찰을 DOM 스텁으로 시험한다고 했으나 스텁이 한글·따옴표 속성 선택자를 지원하지 않아 단위 테스트는 스크립트 구조(유효 type·구조 선택자·가림 제외)와 Node 쪽 해석만 보고 실제 DOM 동작은 Orca e2e에서 확인한다.

## E2E

- S-11(통과): Orca 내장 브라우저(320×240, 가상 서비스 화면은 별도 프로세스의 로컬 HTTP) + 로컬 가짜 API 서버 — 출력 `evidence/e2e-healing.txt`. 브라우저 흐름은 Orca가 없거나 `PACE_SKIP_BROWSER_E2E=1`이면 건너뛴다(API 흐름은 항상 실행). 브라우저 흐름은 Orca 호출 지연으로 5~6분 걸린다.

## 리뷰

- 사전 검토: codex `--kind task` 1·2차 fail(blocking 3·2, `evidence/pre-review-task-1.md`·`evidence/pre-review-task-2.md`) → 지적 반영 → 반영 확인 1회 **pass**(`pre-review-task-3.md`, 규칙 2회+1, 코디네이터 확인). 캡처 승인 정책은 캡틴 결정 A(`evidence/user-gate-decision-t05.md` 1). `PRE-REVIEW.json` attempts 3건(1·2차 해시는 반영 전후 TASK 판을 역변환으로 복원), 예외 없음. 반영 내용: 비가역 후보는 정본에 쓰지 않고 실행 한정 임시 지도로 검증 후 승격, 캡처 후보는 후보 때 새 기록을 준비해 해시에 결합, `retry` 후보, 메뉴 경로 범위(단계 추가는 `needs-user`), 저장 경계별 실패 주입.
- 구현 후 reviewer(codex, openai, cross:true, 파일 열람): 1차(`evidence/review-goal-1.md`) **fail** blocking 7 — 승격 단계 실행 기록 미이관·승인 계정/업무 미결속·공개 반영 경로·닫기 버튼 제출 판정·저장 중단 원자성·선택자의 화면 문구 속성·`expect` 미평가. 모두 반영. 2차(`review-goal-2.md`) **fail** blocking 4(주행 관문 key 미검사·외부 실행 기록 저널 밖·URL 경로 값·rollback 수행 기록) → 반영. 3차(`review-goal-3.md`, 반영 확인 1회 허용 main 판단) **fail** blocking 2(재개 진입점 저널 복구·URL 값 후보) → 반영, 캡틴 결정 "A"(키 없는 옛 승인 거부 포함, `user-gate-decision-t05.md` 2). 4차(`review-goal-4.md`, 3건만 확인) 키 없는 승인 거부·저널 선행 복구는 **달성**, URL 후보 요약의 경로 원문은 blocking으로 남았고 캡틴 결정 "A 승인 요약엔 허용"(`user-gate-decision-t05.md` 3)으로 합의 범위에 넣어 마감. should_fix(숫자 접미사 어휘 검사 우회)는 같은 날 수정·시험. 이 마감은 **구현 후 검토가 pass하지 않은 채 캡틴 결정으로 닫은 예외**다 — 검토 4회(blocking 7→4→2→1)가 모두 같은 주제(승인 결속·원자성·값 비기록)를 좁혀 갔고 마지막 1건은 설계 충돌(확인하는 사람은 경로를 봐야 함)이었다.
- tester: 워크트리 PM 판정 pass — 실행 증거 `check-test.txt`·`e2e-healing.txt`·`secret-scan.txt`.
- 교본: typescript — 코드 변경은 테스트 래퍼(`.ts`) 한 곳뿐, 본체는 같은 `.mjs` 스타일. 보안: 값의 경로(관찰 메모리→후보 구조 이름·경로)·승인 키 결속·원자적 반영·허용 경로를 `security.md` 기준으로 대조.

## 남긴 것

- **T06**: 실제 서비스 시범에서 `recapture`·`verifyStep`·`regress`·`observe` 주입 구현(Orca 어댑터 기준 예: 이 태스크 e2e), 치유 이력의 `기준 캡처 사람 확인: 대기`를 사람이 확인하는 절차(`pendingHumanChecks`), docs/README.md·ARCHITECTURE.md 구성 요소 표에 `healer`·`heal-web`·`driver` 추가, vendoring·`DRIVING_VERSION`·`HEAL_VERSION` 확인 방식.
- **후속 개선(should_fix)**: 웹 `expectChecked`가 `expect`·`success` 문장을 평가하도록(업무별 판정 주입), 재시작 뒤 승격이 되도록 staged에 후보 준비 기록을 안전하게 보존, `healStore` 생략 시 시도 한도 유지, 키 없는 승인 저장소 마이그레이션 도구.
- **함정(브레인 후보)**: ① 테스트 프로세스가 Orca를 동기 호출(`spawnSync`)하는 동안에는 같은 프로세스의 HTTP 서버가 응답하지 못한다 — 가상 화면 서버는 별도 프로세스로. ② Orca 탭을 쌓아 두면 호출이 점점 느려진다 — 시나리오마다 닫는다. ③ 해시 앞 12자를 history에 그대로 쓰면 ~1.5%가 계좌·전화 형식으로 오탐된다 — 숫자를 `g~p`로 바꿔 쓴다. ④ 학습으로 원본 해시가 바뀌면 같은 실행의 완료 기록이 모두 불일치가 된다 — 행동이 그대로인 단계(와 승격한 단계)의 실행 기록을 새 해시로 옮겨야 끝난 비가역 단계가 다시 실행되지 않는다. ⑤ DOM의 `button.type`은 폼 밖에서도 `submit`이다 — 제출 판정은 `form` 소속까지 본다. ⑥ 검증 수행은 읽기 단계를 한 번 더 실행하므로 결과 값이 같으면 신선도 비교에 걸린다 — 결과에 실행 횟수 같은 변하는 요소가 필요하다(시험 페이지).
