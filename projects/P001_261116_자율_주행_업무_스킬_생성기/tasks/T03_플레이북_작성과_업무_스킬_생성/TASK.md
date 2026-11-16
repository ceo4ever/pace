# T03 플레이북 작성과 업무 스킬 생성

- 프로젝트: [P001](../../PROJECT.md) · 백로그: [BL261116_01_자율_주행_업무_스킬_생성기](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

## 목적

목표 하나를 받아 **인터뷰 → 수행하며 기록 → 플레이북(업무 스킬 한 벌) 생성**을 끝내는 절차와 도구를 `pace-playbook-maker`에 넣는다(D1·D2·D9). T02가 만든 지도(`agent/`)를 사람이 손으로 스킬에 얹던 것을, 인터뷰 기록과 승인된 흐름에서 자동으로 만든다. 상위 목적·기준: [PROJECT.md](../../PROJECT.md) P-3·P-8, [BR03](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR03_플레이북_작성과_업무_스킬_생성.md).

## 재료

- 앞 태스크: [T02 TASK-CLOSE](../T02_에이전트_지도_구조/TASK-CLOSE.md) — 지도 생성기 `buildFlow`·`checkAgentFresh`, 코어 `captureRecord`·`approveStep`, 민감 형식 탐지 `sensitive.mjs`(코어·생성기 공용), `valueReview`·합의 필드(`resultTo`·`allowedOrigins`·`allowedPaths`·`risk`·`deliverTo`). 남긴 것: 어댑터 연결은 T03(이 태스크)에서, 위치 증거는 find 변경 시 stale.
- 코드: `skills/pace-playbook-maker/tools/{build,agent-map,capture-core,sensitive}.mjs`, `references/{schema,adapter}.md`, fixture `test/fixtures/playbook/{sample-flow,position-page.html}`, 실제 브라우저 e2e 선례 `test/playbook/position-e2e.test.mjs`(Orca CLI를 `orca.exe`로 직접 호출, `eval --expression`·`viewport`·`tab create`).
- 인터뷰 방식: `skills/pace-intent/SKILL.md`의 "한 번에 한 질문" — 질문 절차는 SKILL.md에 요약 링크만 두고 본문을 복제하지 않는다.
- Orca 스크린샷은 `orca screenshot --format jpeg`가 있어 `shots/S0n.jpg` 요구와 맞는다.

## 설계 결정

- **인터뷰 기록** = 작업 폴더의 `interview.json`(중간 기록 — 플레이북이라 부르지 않는다). 필드: `goal`·`scope`·`inputs[]{name,form,source}`·`outputs[]{name,format,sensitivity,deliverTo}`·`resultTo`·`services[]{alias,kind,origin,auth{method,source}}`·`success[]`·`riskyActions[]{name,irreversible,gate}`·`exceptions[]`·`frequency`·`privacy{kinds[],handling}`·`humanPoints[]{step,reason}`. 값이 아니라 **종류·형태·출처 이름**만 적는다(계정·인증은 방식과 환경 변수·시크릿 저장소 이름, 값 자리는 `<기간>`·`<계정>` 자리표시).
- **필수 항목**: `goal`·`scope`·`success`(1개 이상)·`riskyActions`(비면 `noRiskyActions:true`를 명시)·`services`(1개 이상)·`outputs`(비면 `noOutputs:true`)·`privacy`. 하나라도 없거나 비면 `checkInterview`가 `complete:false`와 빠진 항목 이름을 돌려주고 플레이북 생성은 거부된다 — 묻는 일은 SKILL.md 절차(한 번에 한 질문)가 하고 도구는 빠진 항목을 알려 준다.
- **실값 금지**: 인터뷰 기록의 모든 문자열·키는 T02 `scanSensitive`를 거친다(민감 형식이면 기록 거부, 오류에 값 없음). 사용자가 실값을 말했을 때 종류만 남기는 보조 함수 `sensitiveKinds(text)`를 `sensitive.mjs`에 둔다(종류 이름 배열만 반환). 범위는 T02 결정 A와 같다 — 탐지 가능한 형식만 거부하고 완전 차단은 보장하지 않는다.
- **도구**: `tools/interview.mjs`(`checkInterview`·`--check <파일>` CLI), `tools/scaffold.mjs`(`initFlow` — 인터뷰에서 합의 필드(`resultTo`·`allowedOrigins`·`risks`·`base`)를 채운 흐름 `steps.json` 뼈대, `addApiStep` — API 단계를 **관찰한 응답에서 경로·형태 이름만** 추려 `api.response`로 쓰고 값은 버린다, `inferResponseShape`), `tools/orca-adapter.mjs`(서비스 비의존 어댑터 라이브러리: **`observeStep`**(단계의 `actions[]`(`click`·`fill` — `find`·값 자리표시)를 실제로 수행하고 `expect` 관찰(요소가 보이는가·비어 있지 않은가 — 값 자체는 반환하지 않고 불리언만)을 확인해 `{ok,failed:[]}`를 돌려주며, 액션 생략·잘못된 대상·관찰 실패면 `ok:false`), `captureStep`은 `observeStep`이 ok일 때만 진행한다; 모든 파일 쓰기는 **보호 저장소 `createStore`**를 거친다 — 쓰기 직전 내용을 `scanSensitive`로 검사해 민감 형식이면 쓰지 않고 거부하며 쓴 경로를 기록한다; `createOrcaBrowser`·`captureStep`·`approvePending` — 코어 `runCapture`→`captureRecord`→대기 폴더(저장소 밖)→`approvePending`이 `approveStep`·`shots/S0n.jpg` 이동·steps.json 갱신), `tools/playbook.mjs`(`generatePlaybook`·`checkPlaybook`).
- **어댑터 템플릿 범위**: 라이브러리는 브라우저 호출(`evalJs`·`screenshot`·`discard`·`sleep`)·대기 저장·해시 대조 승인·`captureRecord`/`approveStep` 연결만 맡고, 서비스 고유의 화면 판정(`screen`)·탭 범위·로그인은 `adapter.md`의 계약·템플릿 절을 따라 업무 저장소가 얹는다. 대기 폴더는 저장소 밖(`os.tmpdir()` 아래 또는 지정 경로)이고 대기 메타에는 숫자·해시뿐이다. **관측 범위**: 도구가 만드는 파일은 모두 보호 저장소가 쓰기 직전에 검사한다(S-4가 거부 시 파일이 생기지 않음을 확인). Orca 스크린샷 파일은 Orca가 직접 쓰는 경로라 보호 저장소 밖이지만, 스크린샷은 가림 오버레이를 그린 **뒤**에 찍히고(`runCapture` 순서) 이미지는 픽셀 검사로 검증하며, 원본 스크린샷 경로는 `discard`로 지운다(실패하면 거부).
- **플레이북 생성** `generatePlaybook({workDir,outDir,name})`: 입력은 `interview.json` + `workDir/flows/<흐름>/`(steps.json·shots/ — `agentView:true`, 승인 완료). 순서: ① 인터뷰 완전성 ② 흐름마다 **`buildFlow`로 파생물(`flow.html`·`flow/*`·`agent/*`)을 재생성**하고(`steps.json`·승인 캡처에서 다시 만드는 일이라 파생물만 낡은 것은 거부 사유가 아니다) 이어 `checkAgentFresh`로 일치를 확인 — **승인·증거가 무효(`shotHash`·`recordHash`·`valueReview` 불일치, 캡처 누락, 민감 형식)이면 `buildFlow`가 던져 생성을 거부한다** ③ 산출 `outDir/SKILL.md`(frontmatter `name`=폴더 이름·`description`; 본문 = 언제 쓰는지·시작 조건·입력·결과와 저장 위치·안전 규칙(위험 행동·관문)·사람과 함께하는 지점·흐름 색인·주행 규약 링크(버전 표기)·학습 이력 링크), `references/flows/<흐름>/`(steps.json·shots/·agent/·flow.html·flow/), `references/history.md`(빈 학습 이력 머리말) ④ `checkPlaybook`. **인터뷰 합의는 생성물에 보존한다**: SKILL.md의 "범위"(`scope`)·"성공 기준"(`success[]`)·"안전 규칙"(`riskyActions`)·"개인정보 처리"(`privacy.kinds`·`handling`)·"인증 출처"(`services[].auth.method|source` — 이름만)·"예외와 빈도"(`exceptions[]`·`frequency`)·"입력"(`inputs[]` 형태)·"결과와 저장 위치"(`outputs[]`·`resultTo`) 절에 문장 그대로 옮기고(8KB를 넘으면 `references/agreements.md`로 옮기고 SKILL.md에는 요약과 링크), `interview.json` 자체는 산출물에 넣지 않는다(작업 중간 기록). 하나라도 실패하면 `outDir`를 만들지 않는다(임시 폴더에서 만든 뒤 이동).
- **주행 규약 링크**: 규약은 플레이북에 복사하지 않고 `pace-playbook-maker` 스킬의 `references/driving.md`(T04가 작성)를 가리키는 한 줄 + 규약 버전 번호(`DRIVING_VERSION`)만 SKILL.md에 적는다. T03은 링크 문구·버전 표기만 만들고 `driving.md` 본문은 T04가 쓴다 — T03이 `references/driving.md`를 **머리말만 있는 자리 파일**(`규약 버전: 1`, 본문은 T04)로 만들어 링크 대상을 실재하게 하고, 테스트가 그 머리말의 버전이 `DRIVING_VERSION`과 같은지 대조한다. 플레이북 SKILL.md의 규약 언급은 상대 링크가 아니라 스킬 이름·참조 경로 텍스트다(설치 위치는 기기마다 다르므로 `pace-playbook-maker` 스킬을 찾아 읽는다고만 적는다).
- **형식 검사** `checkPlaybook(dir)`: SKILL.md frontmatter `name`이 폴더 이름과 같고 `^[a-z0-9][a-z0-9-]{0,63}$`, `description` 한 줄 20~1024자, SKILL.md 8KB 이하(CRLF 기준), 본문 상대 링크가 실재, 흐름마다 `checkAgentFresh` 통과, 모든 텍스트 파일에 민감 형식 0건(`scanSensitive` 문자열 단위), `interview.json`·대기 파일이 산출물 폴더에 없음.
- **보안 영향**: 새로 읽는 값 경로는 없다. 인터뷰·승인·생성의 모든 저장 지점에 T02 민감 형식 거부를 건다. 작성 중 임시·대기 파일도 검사 대상이고 대기 폴더는 저장소 밖이다.
- 하지 않는 것: 주행 규칙·`driving.md` 본문(T04), 학습(T05), 업무 저장소로의 vendoring·해시 버전 확인(PROJECT 설계 "배포" — T06 시범에서 방식 확인), 실제 서비스 어댑터.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `checkInterview`가 필수 항목(성공 기준·위험 행동 등)이 빠지면 `complete:false`와 빠진 항목 이름을 돌려주고, `noRiskyActions:true`처럼 명시적 "없음"은 통과하며, 민감 형식이 든 기록은 거부(오류에 값 없음)한다 — P-3 |
| T-2 | `scaffold`의 `initFlow`가 인터뷰에서 합의 필드를 채운 `steps.json` 뼈대를 만들고, 인터뷰 없이/불완전하면 거부한다 |
| T-3 | 어댑터 라이브러리가 **보호 저장소를 거쳐** 가림 캡처→대기 저장(숫자·해시뿐)→해시 대조 승인으로 `shots/S0n.jpg`·`captureRecord`를 steps.json에 쓰고, 해시 불일치·대기 없음·`capture:false` 단계는 거부하며 거부·실패 시 대기·원본 파일이 남지 않으며, 보호 저장소는 민감 형식 내용을 쓰기 전에 거부하고 쓰지 않는다(쓴 경로 기록으로 확인) |
| T-4 | `generatePlaybook`이 인터뷰 합의(범위·성공 기준·위험 행동·개인정보 처리·인증 출처·예외·빈도·입력·결과 위치)를 생성물에 그대로 보존하고 서로 다른 인터뷰로 만들면 생성물이 그 인터뷰대로 달라지며, 가상 서비스(로컬 웹 페이지·가짜 API 단계)로 만든 승인 흐름에서 플레이북 폴더(SKILL.md·references/flows/<흐름>/·history.md)를 만들고 `checkPlaybook`을 통과하며, 인터뷰 불완전·승인 증거 무효·형식 위반이면 `outDir`를 만들지 않고, 파생물만 낡은 경우는 재생성해 통과한다 — P-3 |
| T-5 | **민감 값 주입 작성 시나리오(e2e, Orca 실제 브라우저)**: 가상 서비스 **화면**(입력·클릭으로 상태가 바뀌는 페이지)과 **가짜 API 응답**과 **인터뷰 답**에 합성 민감 값(주민번호·계좌·비밀번호 형식)을 넣고 처음부터 끝까지(화면 단계 기록→승인, API 단계 기록, 생성) 작성하며 **실제로 액션을 수행해 상태 변화와 추출 대상을 관찰**하면(액션 생략·잘못된 대상·잘못된 추출이면 기록·승인이 거부된다), 각 단계 직후와 끝에 도구가 만든 모든 파일(인터뷰 기록·steps.json·대기 폴더·생성물, 보호 저장소가 기록한 쓰기 경로 포함)에서 텍스트 원문 0건이고, **캡처 이미지는 픽셀로 검증한다** — 합성 값 영역의 저장 이미지가 가림 색으로 덮였고 가림 전 이미지를 저장하면 같은 검사가 실패한다 — P-3 |
| T-6 | 스킬 절차 문서(SKILL.md의 인터뷰·기록·생성 절차, adapter.md의 어댑터 템플릿 절)가 갖춰지고 스킬 문서 검사(크기·링크·금지어)를 통과한다 |
| T-7 | `npm run check`·`node scripts/secret-scan.ts` 통과 — P-8 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 완전한 인터뷰 · 항목별로 하나씩 빠진 인터뷰 · `noRiskyActions:true` · 민감 형식 문자열·키 | `checkInterview` · `interview.mjs --check` | 완전은 통과, 빠진 항목은 이름 보고(성공 기준·위험 행동 필수), 명시적 없음 통과, 민감 형식 거부·종료코드 1·오류에 값 없음 | `test/playbook/interview.test.mjs` |
| S-2 | unit | T-1 | 사용자가 실값을 말한 답 문자열 | `sensitiveKinds` | 종류 이름 배열만, 값 없음 | 같은 파일 |
| S-3 | unit | T-2 | 완전·불완전 인터뷰 | `initFlow` | 합의 필드(resultTo·allowedOrigins·risks·base)가 인터뷰와 같다, 불완전이면 거부·파일 없음 | `test/playbook/scaffold.test.mjs` |
| S-4 | unit | T-3 | 가짜 브라우저(`runCapture` 반환 모양) · 정상/사후 검사 실패/해시 불일치/대기 없음/capture:false · 민감 형식 내용을 쓰려는 호출 | `captureStep`→`approvePending` | 승인은 `shots/S0n.jpg`·`captureRecord`·`shotHash`·`recordHash` 기록, 나머지는 거부, 거부·실패 뒤 대기·원본 0개, 대기 메타에 숫자·해시뿐, 보호 저장소는 민감 내용이면 파일을 만들지 않고 거부 | `test/playbook/orca-adapter.test.mjs` |
| S-5 | unit | T-4 | 승인 완료 가상 흐름(T02 fixture 기반) · 인터뷰 불완전 · 파생물만 낡음(agent/ 수기 수정) · 승인 증거 무효(캡처 교체·`recordHash` 수정) · 형식 위반(name 불일치·description 비었음·SKILL 8KB 초과) | `generatePlaybook`·`checkPlaybook` | 정상은 폴더 구조·SKILL.md 내용(위험 행동·결과 위치·링크·버전)·`checkPlaybook` 통과, 파생물만 낡으면 재생성해 통과, 인터뷰 불완전·증거 무효·형식 위반은 거부하고 `outDir` 미생성, `driving.md` 자리 파일 머리말 버전 = `DRIVING_VERSION` | `test/playbook/playbook.test.mjs` |
| S-6 | unit | T-4 | 생성된 플레이북 | 파일 목록·`interview.json`/대기 파일 부재·스킬 형식 | 목록이 기대와 같고 작업 중간 파일이 없다, 각 흐름 `checkAgentFresh` ok | 같은 파일 |
| S-7 | e2e | T-5 | Orca 브라우저(400×300 뷰포트) · 합성 민감 값을 화면(가림 규칙 적용)·가짜 API 응답 객체·인터뷰 답에 넣은 가상 서비스 페이지 · 테스트 fixture 원본과 도구가 만든 파일을 구분(작업 폴더·대기 폴더를 비운 상태에서 시작해 단계마다 새로 생긴 파일만 스캔) | 인터뷰 기록(값→종류만, `sensitiveKinds`) → `initFlow` → `captureStep`·`approvePending` → `addApiStep` → `generatePlaybook`, 각 단계 직후 스캔 | 새 파일 전부와 보호 저장소 쓰기 경로 기록에서 합성 값 원문 0건, 캡처 이미지는 화면에 비춘 합성 값 영역 픽셀이 가림 색(독립 검사: 저장 JPEG을 data URL로 브라우저 캔버스에 올려 영역 픽셀 샘플링)이고 대조군(가림 오버레이 없이 찍은 이미지)에서는 같은 검사가 실패해 검출력을 입증, API 응답 값은 어디에도 없고 `api.response`는 경로·형태만 | `test/playbook/playbook-e2e.test.mjs`, `evidence/e2e-playbook.txt` |
| S-7b | unit | T-5 | 가짜 API 응답 객체(합성 민감 값 포함)·중첩·배열 | `inferResponseShape`·`addApiStep` | 경로·형태 이름만 반환, 값은 어디에도 없음(오류 포함), 허용 형태 어휘 밖 값은 `문자열`로 일반화 | `test/playbook/scaffold.test.mjs` |
| S-7c | e2e | T-5 | Orca 브라우저 · 입력·클릭으로 결과 영역이 나타나는 가상 페이지 · 정상 액션 · 액션 생략 · 잘못된 대상(`find` 오타) · 잘못된 추출 선택자 | `observeStep`·`captureStep` | 정상은 `ok`와 불리언 관찰만 반환(값 없음), 액션 생략·잘못된 대상·잘못된 추출은 `ok:false`이고 `captureStep`이 거부(대기 파일 0개) | 같은 파일 |
| S-5b | unit | T-4 | 서로 다른 합의의 인터뷰 둘(성공 기준·위험 행동·개인정보 처리·인증 출처·예외·빈도·입력·결과 위치가 각각 다름) | `generatePlaybook` | 각 합의 문장이 해당 생성물(SKILL.md 또는 `references/agreements.md`)에 있고 다른 인터뷰의 문장은 없다, `interview.json`은 산출물에 없다 | 같은 파일 |
| S-8 | check | T-6 | SKILL.md·adapter.md | 스킬 문서 검사 | 크기·링크·금지어 통과, 인터뷰·기록·생성 절차와 어댑터 템플릿 절 존재 | `test/playbook/skill-doc.test.mjs` |
| S-9 | check | T-7 | 전체 | `npm run check`·secret-scan | 통과 | 명령 출력 |

## 접근

- 새 파일: `tools/{interview,scaffold,orca-adapter,playbook}.mjs`, `sensitive.mjs`에 `sensitiveKinds` 추가. 기존 파일 변경은 `SKILL.md`(절차 요약, 8KB 한도), `references/adapter.md`(템플릿 절), 테스트 래퍼 목록·건수.
- 테스트는 `test/playbook/*.test.mjs`(래퍼가 실행). e2e는 T02 선례처럼 Orca가 없으면 건너뛰고(건너뜀은 2건까지 허용하도록 래퍼 갱신), 증거는 Orca에서 실행한 결과를 `evidence/e2e-playbook.txt`에 둔다.
- 사전 검토는 최대 2회(`pace agent verify --kind task`). 경계 사례는 구현 후 검토·테스트로 넘긴다.
