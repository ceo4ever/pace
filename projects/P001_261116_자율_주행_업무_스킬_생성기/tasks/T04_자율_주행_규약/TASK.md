# T04 자율 주행 규약

- 프로젝트: [P001](../../PROJECT.md) · 백로그: [BL261116_01_자율_주행_업무_스킬_생성기](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

## 목적

모든 플레이북이 같은 방식으로 지도를 읽고 주행하게 하는 공통 규약을 `pace-playbook-maker`의 참조 문서 한 곳(`references/driving.md`)에 쓰고, 규약의 기계적으로 검증할 수 있는 부분 — 최신 확인·관문·부분 실패 안전·주행 기록 — 을 주행 라이브러리(`tools/driver.mjs`)로 구현해 시험한다(D1·D4·D5의 주행 쪽). 업무마다 주행 방식이 다르면 학습(T05)과 검증이 업무마다 따로 놀게 된다. 상위 목적·기준: [PROJECT.md](../../PROJECT.md) P-4·P-8, [BR04](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR04_자율_주행_규약.md).

## 재료

- 앞 태스크: [T03 TASK-CLOSE](../T03_플레이북_작성과_업무_스킬_생성/TASK-CLOSE.md) — 플레이북 생성기 `generatePlaybook`·`checkPlaybook`, `DRIVING_VERSION`, 머리말만 있는 `references/driving.md` 자리 파일(본문은 이 태스크), 어댑터 라이브러리(`createStore`·`createOrcaBrowser`·`observeStep`), 합의 대조. [T02 TASK-CLOSE](../T02_에이전트_지도_구조/TASK-CLOSE.md) — 지도 `agent/index.json`·`S0n.json`(단계마다 `locate{primary,secondary,onConflict,report}`·`actionHash`·`sourceHash`·`shot`·`next`·`extract`·`api`·`events`), `checkAgentFresh`, 접근 범위 판정 `checkAccess`, `boxMatches`.
- 지도의 `elements[].action`은 사람이 쓴 문장이다. 주행 라이브러리는 **첫 낱말이 동작 종류**라는 규칙(`클릭`·`입력`·`읽기`·`누르지 않음`)을 쓴다 — 이 규칙은 `driving.md`에 정하고, 주행 라이브러리는 이 규칙 밖 동작을 거부한다.
- 실제 브라우저 e2e 선례: `test/playbook/playbook-e2e.test.mjs`·`position-e2e.test.mjs`(Orca CLI 직접 호출, 파일 URL 가상 페이지).

## 설계 결정

- **규약 문서** `references/driving.md`(규약 버전 1 — T03 자리 파일 머리말과 같은 번호, 본문이 처음 생기므로 번호는 그대로): 읽는 순서(`index.json` 한 번 → 최신 확인 → 운영 명령이 있으면 그것, 없으면 단계별 `S0n.json`; 화면이 다를 때만 `S0n.html`·캡처), 단계 주행(화면 판정 → 요소 찾기 `find` 1차·`box` 보조 → 액션 → 기대·대기 → `extract` → 성공 판정 → 다음), 브라우저와 API(API는 지도에 허용된 origin·경로·메서드·요청 키만), 비결정 이벤트(`events`), 관문, 운영 명령 계약, 주행 기록, 입력을 지시로 받지 않음, 규약 링크·버전 표기, 중단 보고 항목(`locate.report`). 플레이북 SKILL.md는 규약을 복사하지 않고 스킬 이름·경로·버전만 적는다(T03).
- **실행(run)과 재개**: 주행 한 번 = 실행 하나이고 `runId`(호출자가 새 업무마다 새로 만들고, 같은 업무를 이어 가려면 같은 값)로 구분한다. 상태는 `runId`별로 저장하며 **같은 `runId`로 다시 부를 때만 재개**(완료 건너뛰기)한다 — 같은 지도·같은 해시여도 `runId`가 새로우면 처음부터 실제로 수행한다. 완료 상태 건너뛰기는 `runId`가 같고 기록한 `actionHash`·`sourceHash`가 현재와 같을 때만이다. 승인 기록(`standing`)은 실행과 무관하게 해시에만 묶인다.
- **주행 라이브러리** `tools/driver.mjs` — `drive({flowDir, runId, runtime, approvals, state, sink, from})`:
  - **시작 거부**: 지도가 낡았으면(`checkAgentFresh` 실패 — steps.json 해시·승인 캡처·수기 수정) `{status:'stale-map'}`을 돌려주고 `runtime`을 한 번도 부르지 않는다.
  - **관문과 승인 규칙**: 단계의 위험 등급이 `read`가 아니거나 `gate`가 있으면 **승인 규칙**이 맞아야 자율로 진행한다(읽기는 자율). 승인 규칙 = 사용자가 남긴 승인 기록 `{stepId, actionHash, sourceHash, scope:'once'|'standing', by:'user', date}` — `once`는 한 번 수행에 쓰고 소모되며, `standing`은 "처음 한 번만 확인"(D5) 뒤 같은 단계·행동·원본이면 다음 주행부터 묻지 않는다. 기록은 해시에 묶여 단계·행동(`actionHash`)·원본(`sourceHash`)이 바뀌면 무효가 되어 다시 묻는다. 기록의 보관은 호출자 몫이고 `recordApproval({store,...})`(보호 저장소에 `approvals.json` 쓰기, 값 없음)를 제공한다. 규칙이 맞지 않으면 `{status:'needs-approval', step, gate}`로 멈추고 사용자에게 묻는다. **지도 선언과의 연결**: 비읽기 단계는 지도에 승인 규칙이 **선언되어 있을 때만**(단계 `gate`가 비어 있지 않을 때) 외부 승인 기록으로 자율 진행할 수 있다 — 지도의 `gate`는 "이 단계는 승인 규칙 아래 있다"는 선언이자 사용자에게 보여 줄 질문이고, 외부 기록(`once`/`standing`)은 그 규칙을 충족했다는 사용자 증거다. 둘이 모두 있어야 자율이고, 지도에 `gate`가 없는 비읽기 단계는 외부 기록이 있어도 **항상 멈추고 묻는다**(`needs-approval`, 이유 `no-map-rule`). 읽기 단계는 규칙 없이 자율이다. `driveOperation`도 같은 검사를 쓰고 `runId`·결과 불명 처리(`settle`·`lookup`)·상태 전이를 `drive`와 공유한다.
  - **runtime 계약**(호출자가 주입 — 브라우저·API·가짜): `judgeScreen(step)`→불리언, `perform(step)`→`{ok, status?, values?:{<추출 이름>:값}, reason?}`(값은 반환만, 기록하지 않음), `lookup(step)`→`'done'|'not-done'|'unknown'`(되돌릴 수 없는 행동의 실행 여부를 값 없이 조회·대조). `perform`이 던지거나 시간 초과면 결과 불명으로 본다.
  - **결과 불명 처리**: 되돌릴 수 없는 행동(`gate` 있음 또는 비읽기)에서 결과가 불명이면 다시 누르지 않고 `lookup`으로 판정한다 — `done`이면 완료로 보고 다음 단계, `unknown`이면 `{status:'unknown-outcome'}`으로 멈춘다. **`not-done`은 원래 요청이 끝났음이 확인될 때만 재수행 근거**다: runtime `settle(step)`이 `'settled'`(원래 시도가 종료·취소됨이 확인)를 돌려주고 `lookup`이 `not-done`일 때만 그 단계를 다시 수행하고, `settle`이 `'in-flight'`이거나 없으면(`lookup`이 아직 미완료여도 원래 요청이 나중에 성공할 수 있음) `{status:'in-flight'}`로 멈춘다. `perform`에는 중복 방지 키(`attemptKey` = runId·단계·시도 번호)를 넘겨 이를 지원하는 서비스가 쓰게 한다. 맹목 재시도 없음.
  - **운영 명령**: `driveOperation({flowDir, runLabel, operation, runtime, approvals, state})` — `index.run[]`의 운영 명령(여러 단계를 한 번에 수행)을 **주입한 `operation({from,to})`**로 부른다(실제 명령 호출은 호출자). 시작 전에 범위(`covers`) 안 비읽기 단계마다 관문을 확인해 하나라도 승인 규칙이 안 맞으면 명령을 부르지 않고 멈춘다(명령 안 위험 행동도 관문). `operation`은 단계 하나가 끝날 때마다 **체크포인트 콜백**(`checkpoint(stepId, 'in-progress'|'done')`)을 불러 드라이버가 즉시 상태에 영속 기록하게 하고(종료 반환 `{done, failedAt?}`는 보조), 반환 없이 던지거나 프로세스가 끊겨도 그 체크포인트로 새 프로세스에서 이어 간다. 실패·시간 초과면 처음부터 다시 돌리지 않고 진행 보고와 `lookup`으로 마지막 완료 단계를 판정해 `operation({from: 첫 미완료 단계})`로 재개한다. 판정할 수 없으면 멈춘다. 이 계약을 못 지키는 명령은 읽기 전용 단계에만 쓴다.
  - **재개**: 진행 상태(`state`)에서 완료 단계를 건너뛰고 첫 미완료 단계부터 이어 간다. 처음부터 다시 돌리지 않는다. 이어 가는 첫 단계가 직전에 결과 불명이었으면 `lookup`부터 한다.
  - **추출 전달**: `perform`이 돌려준 값은 선언된 `extract`와 이름이 맞는 것만 `sink(deliverTo ?? resultTo, name, value)`로 넘기고 반환 객체·진행 상태·로그에는 남기지 않는다(건수만). 선언된 값이 없거나 전달 위치가 없으면 멈춘다. 선언 밖 값은 버린다.
  - **주행 기록(state)** = 저장소 밖 보호 저장소의 `drive-state.json`: 단계별 `status`(`in-progress`·`done`·`stopped`·`unknown`)·`actionHash`·`sourceHash`·소요 ms·추출 건수·되돌릴 수 없는 행동의 실행 여부와 조회 근거 종류(값 없이)·멈춘 이유 코드. 쓰기 전 민감 형식 검사. **상태 신뢰와 저장 순서**: 완료 상태는 기록한 `actionHash`·`sourceHash`가 현재와 같을 때만 건너뛰기에 쓴다(다르면 다시 수행). 되돌릴 수 없는 행동은 **수행 전에** `in-progress`를 기록하고 수행 뒤 `done`을 기록한다 — 둘 사이에서 끊기면 다음 주행이 `in-progress`를 보고 `lookup`부터 한다(상태가 없어 재실행하는 일이 없다).
  - **중단 보고**: 화면 판정 실패·`find`/`box` 충돌·기대 불일치는 `locate.report` 항목(단계·요소·이유·`sourceHash`·`shotSha256`)으로 멈춘다 — 복구(T05)는 이 보고를 받는다.
- **기대·대기·이벤트**: 웹 실행기는 액션 전에 `읽기` 대상(및 `extract` 대상)의 **이전 상태 지문**(요소 존재 여부와 내용 해시 — 메모리에만 두고 저장하지 않는다)을 잡고, 액션 뒤 대상이 보이고 비어 있지 않으며 **이전 지문과 달라질 때까지**(이전 결과가 그대로 남아 있는 것은 통과가 아니다) `waitMs` 안에서 폴링한다(주입한 시계). 업무가 결과 값이 같아도 새로 읽은 것으로 인정해야 하면 호출자가 지문 비교를 끈다(`freshness:false`) — 지연된 정상 결과는 성공, 끝내 충족하지 않으면 단계를 `stopped`(`expect-failed`)로 멈추고 다음 단계의 `perform`·`judgeScreen`을 부르지 않는다. 화면 판정에서 `forbid` 요소가 보이고 호출자가 그 요소의 닫기 방법(`dismiss` 선택자)을 `events` 처리로 주입했으면 한 번 닫고 다시 판정하며, 닫기 방법이 없으면 멈춘다(이벤트 문구 `events[].when|then`은 사람이 읽는 규약이고 자동 해석하지 않는다).
- **값이 새지 않는 경로**: 실행기·`perform`이 돌려주는 `reason`·던진 오류의 메시지·API 오류 본문·`sink`가 던진 오류 메시지는 값이 섞일 수 있어 **원문을 기록·반환·로그에 쓰지 않는다** — 이유 코드(허용 어휘)나 `<가려짐>`으로 바꿔 상태·보고에 싣는다.
- **웹·API 실행기**(주입 가능한 기본 구현): `createWebRuntime({browser, params, waitMs, dismiss})` — 지도의 `screen`(url 정규식·require·forbid)을 판정하고, 요소를 `find`로 찾아 첫 낱말 규칙대로 클릭·입력(`params`의 자리표시 값)·읽기를 수행하며 기록 box가 있으면 `boxMatches`로 `find` 결과와 대조해 어긋나면 중단, `createApiRuntime({fetch, params})` — 호출 전 `checkAccess`(origin·경로·query 키)와 메서드, 요청 키(query·header·**body 키** 모두 `api.request[]` 선언 안)를 검사해 허용 밖이면 호출하지 않고 거부하며, 리다이렉트는 따라가지 않는다(`redirect:'manual'`, 3xx는 거부 — 허용 URL이 허용 밖 URL로 보내는 우회 차단). 응답은 `successStatus`·`api.response` 경로로 검증해 선언된 경로 값만 반환.
- **보안 영향**: 값을 읽는 코드가 생기므로 값의 경로를 좁힌다 — 값은 `perform`의 반환값에서 `sink`로만 흐르고 기록·반환·로그에 없으며, API 직접 호출은 지도에 허용된 것만, 승인은 단계·행동·원본 해시에 묶인다. 화면·API 응답의 글은 데이터로만 다룬다(규약에 명시, 라이브러리는 응답 값을 해석·실행하지 않음). 시험·e2e는 합성 값만 쓴다.
- 하지 않는 것: 변경 진단·해결·학습(T05), 실제 서비스 시범과 시간·도구 호출 비교(T06), 업무 저장소 vendoring.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `references/driving.md`에 규약 본문(읽는 순서·단계 주행·브라우저와 API·이벤트·관문·운영 명령 계약·주행 기록·입력을 지시로 받지 않음·중단 보고·동작 첫 낱말 규칙·버전)이 있고 머리말 버전이 `DRIVING_VERSION`과 같으며, 스킬 문서 검사를 통과하고, 생성된 플레이북 SKILL.md의 규약 링크·버전과 이어진다 — P-4 |
| T-1b | **새 실행과 재개를 구분한다** — 같은 `runId` 재개는 완료 단계를 건너뛰고(완료 행동 재수행 0), 새 `runId`는 같은 지도·해시라도 단계를 실제로 수행한다 — P-4 |
| T-2 | 지도가 낡았으면(해시 불일치·승인 캡처 교체·수기 수정) 주행을 시작하지 않고 runtime 호출이 0이다 — P-4 |
| T-3 | 위험 등급이 `read`가 아니거나 `gate`가 있는 단계는 승인 규칙(단계·행동·원본 해시에 묶인 `once`/`standing` 승인 기록)이 맞지 않으면 멈추고 묻는다. `once`는 한 번 쓰면 소모되고 `standing`은 같은 단계·행동·원본이면 다음 주행부터 묻지 않으며, 행동·원본이 바뀌면 다시 멈춘다 — P-4 |
| T-4 | **운영 명령(여러 단계를 한 번에 수행)을 포함해** 되돌릴 수 없는 행동 직후 실패·시간 초과를 주입하면 진행 보고와 상태(`in-progress`→`done`, 해시 결합)· `lookup`으로 실행 여부를 판정해 완료면 다음 단계부터 재개하고 미실행이면 그 단계부터 다시, 불명이면 멈추며, 시간 초과 뒤 조회가 미완료여도 원래 요청이 아직 진행 중일 수 있으면 재수행하지 않아(`settle` 확인 전에는 멈춤) 되돌릴 수 없는 행동의 중복 실행이 0이고 처음부터 다시 돌지 않으며, 명령 안 위험 행동도 관문을 지난다 — P-4 |
| T-5 | 주행 기록·반환 객체·로그·중단 보고에 추출 값 원문이 없다(건수·상태만) — `values`뿐 아니라 `reason`·예외 메시지·API 오류 본문·`sink` 오류 메시지에 섞인 값도 새지 않는다. 값은 `sink`로만 전달되고 전달 위치가 없거나 선언 밖 값이면 처리가 거부·버려진다 — P-4 |
| T-6 | 가상 서비스 플레이북(T03 생성기로 만든 것)을 규약대로 Orca 브라우저 흐름 하나와 API 흐름 하나 끝까지 주행한다(기대·지연 대기·닫기 이벤트 포함, 기대 불충족이면 다음 단계 호출 0). API 흐름은 지도에 허용된 origin·경로·메서드·요청 키만 호출하고 허용 밖은 호출 0이며, 브라우저 흐름은 `find`로 찾고 `box`와 어긋나면 `locate.report` 항목으로 멈춘다 — P-4 |
| T-7 | `npm run check`·`node scripts/secret-scan.ts` 통과 — P-8 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | check | T-1 | `driving.md`·SKILL.md·playbook-making.md·생성된 플레이북 | 스킬 문서 검사 | 필수 절·키워드, 머리말 버전 = `DRIVING_VERSION`, 플레이북 SKILL.md 링크 문구·버전과 일치 | `test/playbook/skill-doc.test.mjs` |
| S-2b | unit | T-1b | 같은 지도·해시로 `runId` 같음/다름 · 상태 파일 | `drive` 두 번 | 같은 `runId`는 완료 행동 재수행 0, 새 `runId`는 모든 단계를 실제 수행(실행 카운터), 아무것도 실행하지 않고 완료로 보고하는 결함은 새 `runId` 시험에서 잡힘 | `test/playbook/driver.test.mjs` |
| S-2 | unit | T-2 | 정상 지도 · steps.json 수정 · 캡처 교체 · `agent/*` 수기 수정 | `drive` | 정상만 시작, 나머지는 `stale-map`·runtime 호출 0 | `test/playbook/driver.test.mjs` |
| S-3 | unit | T-3 | 읽기 단계·비읽기 단계(gate 있음/없음 — **gate 없는 비읽기 단계는 유효한 외부 기록이 있어도 `no-map-rule`로 멈춤**) · 승인 없음/`once` 맞음/`standing` 맞음/단계 다름/`actionHash` 다름/`sourceHash` 다름 · 두 번째 주행 | `drive` | 읽기는 자율, 비읽기는 규칙이 안 맞으면 `needs-approval`(gate 문구 포함)·runtime 호출 0, `once`는 한 번 쓰고 소모(두 번째는 멈춤), `standing`은 두 번째 주행도 자율, 승인 뒤 변경은 다시 멈춤, `recordApproval`은 값 없이 저장 | 같은 파일 |
| S-4 | unit | T-4 | 되돌릴 수 없는 단계에서 `perform`이 실행 뒤 던짐/시간 초과/불명 · `lookup`이 done/not-done/unknown · 상태 파일로 재개 · 수행 전 `in-progress` 기록 뒤 끊김 · 오래된 `done`(해시 다름) | `drive` 두 번 | done→다음 단계부터, not-done+`settled`→그 단계 재수행(`settle` 없음·in-flight이면 멈춤), unknown→멈춤; 실행 카운터로 중복 0; 첫 단계부터 다시 돌지 않음; 같은 호출 안에서 맹목 재시도 0; `in-progress`는 `lookup`부터; 해시가 다른 `done`은 건너뛰지 않음 |
| S-4c | unit | T-4 | 시간 초과 → `lookup` not-done인데 원래 요청이 나중에 성공하는 가짜 서비스(`settle`이 in-flight/settled) | `drive` | in-flight면 재수행 0·`{status:'in-flight'}` 멈춤, `settled` + not-done일 때만 재수행, 실제 부작용 횟수 1 | 같은 파일 |
| S-4b | unit | T-4 | 여러 단계를 수행하는 가상 운영 명령(`operation`) · 반환 보고 없이 던지거나 프로세스가 끊김(새 호출에서 상태 파일로 재개) · 범위 안 비읽기 단계에 승인 없음 · 2번째 단계의 되돌릴 수 없는 행동 직후 실패 · `lookup` done/불명 · 시간 초과+`not-done`+`settle` in-flight/settled · 새 `runId` | `driveOperation` | 승인이 안 맞으면 명령 호출 0·멈춤, 실패 뒤 처음부터 다시 돌리지 않고 진행 보고·`lookup`으로 마지막 완료 단계 판정 후 `operation({from})`로 재개, 되돌릴 수 없는 행동 중복 0, 판정 불가면 멈춤 | 같은 파일 | 같은 파일 |
| S-5 | unit | T-5 | `perform`이 합성 민감 값을 반환 · 선언 밖 값 · 전달 위치 없음 · 값이 섞인 `reason`·던진 오류 메시지·`sink` 오류 메시지 | `drive` | 반환 객체·상태 파일·로그 문자열·중단 보고에 값 0건, `sink`만 값을 받음(선언된 이름만), 위치 없으면 멈춤, 상태 파일은 쓰기 전 검사, 오류·이유는 코드나 `<가려짐>`으로만 남음 | 같은 파일 |
| S-6 | unit | T-3·T-6 | `createApiRuntime`·가짜 `fetch` · 허용 origin/경로/메서드/query 키 안·밖 · 선언 밖 body 키·헤더 · 허용 URL이 허용 밖 URL로 3xx 리다이렉트 | 호출 | 허용 밖(선언 밖 body 키·헤더 포함)은 fetch 호출 0·거부, 3xx 리다이렉트는 따라가지 않고 거부(두 번째 요청 0), 안은 호출 1·`successStatus`와 응답 경로 검증·선언된 경로 값만 반환 | `test/playbook/driver-runtime.test.mjs` |
| S-7 | unit | T-6 | `createWebRuntime`·가짜 browser·가짜 시계 · `screen` 판정 · 첫 낱말 규칙 밖 동작 · box와 find 충돌 · 클릭만 성공하고 결과 없음 · 지연된 정상 결과 · `forbid` 요소(닫기 방법 있음/없음) | 호출 | 판정 실패·규칙 밖 동작은 거부, 이전 결과는 있으나 새 결과가 끝내 오지 않으면 `expect-failed`, 충돌은 `locate.report` 항목(단계·요소·이유·`sourceHash`·`shotSha256`)으로 중단, 결과가 끝내 없으면 `expect-failed`로 멈추고 다음 단계 호출 0, 지연된 결과는 성공, 닫기 방법이 있으면 한 번 닫고 통과·없으면 멈춤 | 같은 파일 |
| S-8 | e2e | T-6 | Orca 브라우저 · 로컬 가짜 API 서버 · T03 생성기로 만든 가상 플레이북(브라우저 흐름·API 흐름 각 하나) | `drive`·`driveOperation`(실행기 기본 구현) | 브라우저 흐름 끝까지(입력·클릭·지연 결과 대기·추출 전달·늦은 덮개 닫기), API 흐름: 승인 없으면 POST 0회 멈춤 → 승인 뒤 정확히 1회 → 완료(재주행에서 `standing`이면 묻지 않음), 허용 밖 경로 호출 0, 값은 `sink`에만 | `test/playbook/driver-e2e.test.mjs`, `evidence/e2e-driving.txt` |
| S-9 | check | T-7 | 전체 | `npm run check`·secret-scan | 통과 | 명령 출력 |

## 접근

- 새 파일: `tools/driver.mjs`(`drive`·`driveOperation`·`recordApproval`·`createWebRuntime`·`createApiRuntime`), `references/driving.md` 본문. 기존 변경: SKILL.md 문서 표·도구 위치 행(8KB 한도 — 군더더기를 줄여 맞춘다), `playbook.mjs`는 `DRIVING_VERSION` 연동 확인뿐(변경 없을 수 있음), 테스트 래퍼 파일 목록·건수.
- 사전 검토는 최대 2회(`pace agent verify --kind task`) — 2회차에도 blocking이 남으면 3회차를 돌리지 않고 남은 지적과 증거를 올린다. 경계 사례는 구현 후 검토·테스트로 넘긴다.
