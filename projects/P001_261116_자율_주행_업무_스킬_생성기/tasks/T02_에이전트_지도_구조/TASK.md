# T02 에이전트 지도 구조

- 프로젝트: [P001](../../PROJECT.md) · 백로그: [BL261116_01_자율_주행_업무_스킬_생성기](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

## 목적

에이전트가 단계 하나의 **화면 + 위치 + 액션 + 추출**을 한 번에 읽는 지도(`agent/`)를 steps.json에서 만든다(D3). 자율 주행(T04)과 자가 복구(T05)가 이 지도를 읽고 고친다. 원본은 `steps.json`·승인 캡처 하나뿐이어서 사람용(`flow.html`)과 에이전트용이 어긋나지 않는다. 상위 목적·기준: [PROJECT.md](../../PROJECT.md) P-2·P-8, [BR02](../../../../backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR02_에이전트_지도_구조.md).

## 재료

- 앞 태스크: [T01 TASK-CLOSE](../T01_시제품_스킬_이관/TASK-CLOSE.md) — 이관 기준 동일성(9흐름 106파일), `agentView` 꺼진 흐름은 그대로여야 한다. 남긴 것: 생성 머리말 명령 표기는 `<PACE 설치본 app>`.
- 코드(확인한 지금 동작): `skills/pace-playbook-maker/tools/build.mjs`(`buildFlow(dir)`·`validate`), `capture-core.mjs`(`overlay`가 번호 태그를 달 때 `getBoundingClientRect`로 요소 rect를 이미 구하고, 못 찾은 요소는 `missing`; 반환 `{masked,errors,frames,perRule,missing}`; `runCapture`가 `{path,info,post}` 반환). 테스트 DOM 스텁 `test/playbook/dom-stub.mjs`.
- 문서: `references/schema.md`(필드 사전 — 새 필드는 사전에 행으로, 스킬 문서 테스트가 fixture·사전 양방향 대조), `SKILL.md`(8KB 한도).
- 민감 형식 탐지 선례: 코어 `validateReveal`의 합성 표본(주민번호·계좌·카드 형식).

## 설계 결정 (이 태스크에서 정함)

- 새 필드는 모두 선택. `agentView`(최상위 boolean)가 `true`인 흐름만 `agent/`를 만든다. 꺼진 흐름은 파일 목록·바이트가 T01과 같다 — 민감 형식 탐지·새 검사도 `agentView`가 켜진 흐름에만 건다(꺼진 흐름의 생성 실패 회귀 방지).
- `elements[].box` = `{x,y,w,h,vw,vh,dpr}`(출력 `S0n.json`의 값) — 캡처 승인 때 코어가 `captureRecord`에 기록하고 생성기가 도출한다, 사람이 steps.json에 쓰지 않는다. 좌표는 기준 캡처 이미지(뷰포트 CSS px) 기준이고 `vw·vh·dpr`가 화면 크기·배율. 코어는 `overlay`에서 번호 태그를 달 때 구한 rect를 `boxes{n:{x,y,w,h}}`·`view{vw,vh,dpr}`로 반환한다(숫자뿐, 글자 없음). 가림 대상 요소의 box는 위치·크기 숫자만 남고 원문 값은 어떤 필드에도 없다(요소 `find`가 `text:문구`면 그 문구는 사람이 쓴 steps.json 값이지 화면 값이 아니다). 어댑터가 승인 때 `approveStep(step, record, {approvedSha})`(코어 export, 순수 함수)로 steps.json에 쓴다. 이 함수는 숫자만 받아 검증하고 요소 `n`이 없으면 거부한다.
- `extract[]` (단계 선택 필드): `{name, where:{selector|apiPath 중 하나 — `box` 직접 지정은 지원하지 않는다(위치는 `elements[].box`로 표현)}, format, sensitivity:'public'|'masked'|'restricted', deliverTo, verify}`. **기록 금지는 민감도와 무관하게 모두에 적용한다** — 어떤 `sensitivity`든 읽은 실값은 지도·명세·주행 기록·history·로그에 남기지 않고 존재·건수·검증 결과만 남긴다(공개 정보라도 추출값이면 같다). **민감도는 전달·가림 정책을 정한다**: `public`은 값을 결과 저장 위치로 전달(`deliverTo`를 생략하면 흐름 기본 결과 위치 `resultTo`(최상위 토큰, 인터뷰가 정한 저장 위치 식별자)를 쓰고, 둘 다 없으면 읽은 값을 둘 곳이 없어 주행이 멈추고 묻는다 — T04가 강제), `masked`는 `deliverTo` 필수이고 화면 캡처·중간 산출물에서 가림을 유지, `restricted`는 `deliverTo` 필수이고 스크린샷·임시 파일 등 중간 보관도 금지하며 전달만 허용. `deliverTo`는 인터뷰에서 정한 결과 저장 위치의 **이름·식별자**(값 아님, 예: `result-sheet`)다. `masked`·`restricted`인데 `deliverTo`가 없으면 읽은 값을 둘 곳이 없으므로 주행은 멈추고 묻는다(T04가 강제). 지도에는 값 예시를 넣지 못한다(필드 자체가 없다). 이 태스크는 필드 의미와 스키마 검사까지 맡고 강제는 T04.
- `api`(단계 선택 필드): `{method, endpoint, request:[{name,in:'query'|'body'|'header',form}], response:[{path,type}]}` — 값 없는 형태만. 기존 "API 단계 표기"(capture:false + 문구)를 필드로 정식화하되 기존 표기도 계속 허용.
- **선택 근거**: 정본 하나에서 사람용(`flow.html`)·에이전트용(`agent/*`)을 함께 생성한다(대안: 같은 steps.json을 읽는 별도 지도 생성기 — 정본은 하나지만 검증·투영 규칙이 두 곳에 중복되어 어긋날 위험; 좌표만 정규화 저장 — `find` 없이는 요소 정체성 근거가 약함). 기존 경로는 `agentView` 선택 적용으로 바이트를 보존한다.
- **지도에 들어가는 정보와 출처(실값 방어 설계)**: 지도(`agent/*`)의 문자열은 전부 사람이 쓴 steps.json 값뿐이다. 코어가 만드는 값은 box 숫자·뷰 크기뿐이고 화면 글자는 어디에도 넣지 않는다. 값이 들어갈 자리는 자리표시(`<이름>`처럼 꺾쇠)로만 쓰고, `extract.format`·`api.request.form`은 형태 설명(예: `YYYY-MM-DD`)만 허용한다고 사전에 규칙으로 적는다. 이름·주소·잔액처럼 형식이 없는 값은 정규식으로 못 막는다 — 이 한계를 사전·SKILL.md에 적고 방어를 겹친다: ① 출처 제한(화면 글자 비반입) ② 형식 탐지(아래) ③ 사람 승인 단계(기존) ④ 정규식 규칙 문자열(`mask`·`revealInputs.value`)도 같은 민감 형식 탐지를 받는다 — 패턴 문법(`\d{3}`·`[…]`·`\w+@…` 같은 메타 표현)은 값이 아니라서 통과하지만, 리터럴 이메일·하이픈 전화번호·6자리 이상 연속 숫자 같은 리터럴 실값 모양은 거부한다(테스트에 합성 리터럴 이메일·전화를 넣은 `mask`·`revealInputs.value`가 거부되는 사례와 `\d{3}-\d{4}` 같은 순수 패턴이 통과하는 사례를 둔다).
- **실값 금지 보장 수준과 경계 (사용자 결정 A, 2026-11-16)**: 보장 수준은 BR02 문구 범위다 — 탐지 가능한 민감 형식은 생성 거부, 출처 제한(화면 글자 비반입·허용 필드 투영), 사람 확인 기록을 `contentHash`로 원본에 결합. 이름·주소처럼 형식 없는 값의 완전 차단은 보장하지 않고 한계로 문서화한다(상위 요구를 좁히는 합의가 아니라 사용자가 정한 범위). **경계(한 문장): 이 금지는 지도·명세·기록 파일(`steps.json`·`agent/*`·`flow.html`·주행 기록·history)에 실값이 '기록'되는 것만 막고, 주행 때 `extract`로 값을 읽어 인터뷰에서 정한 결과 저장 위치로 넘기는 '수집' 자체는 막지 않는다 — `extract`는 값이 아니라 '어디서 무엇을 어떤 형식으로 읽는지'와 민감도(가림·저장 위치)만 적고, 민감 형식 탐지는 `extract`의 형식 선언(예: 형식=주민번호)을 오탐하지 않는다(선언 경로 `extract[].format`·`extract[].sensitivity`는 형식 이름 토큰만 허용하고 실값 모양은 거부).**
- **허용 필드 투영과 사람 확인 계약**: 지도 생성기는 steps.json 전체를 복사하지 않고 **허용 필드 목록만 투영**한다(목록 밖 필드는 지도에 안 나간다). 자유 문자열이 남는 필드는 제한한다 — `extract.format`·`api.request.form`은 형태 문법(`YYYY-MM-DD`·`숫자`·`문자열`·`선택값`·`<자리표시>` 등 토큰)만 허용하고 숫자 3자리 이상 연속·따옴표 리터럴을 거부한다. 나머지 자유 문자열(`name`·`find`의 `text:`·`purpose` 등)은 사람이 쓴 라벨이며 형식 탐지를 거친다. `agentView` 흐름은 최상위 `valueReview:{date,reviewer,note,contentHash}`가 필수다 — 사람이 "값 자리는 자리표시뿐이고 이름·주소·금액·인증값이 없다"고 확인한 기록이고 note는 비면 거부한다. **`contentHash`는 검토 대상 문자열 원본에 결합한다**: 필드를 **서술 필드**(아래 필드 명세의 '서술' 행)와 **위치·행동 필드**(필드 명세 표 참조 — 화면·API가 바뀌면 복구가 고치는 값)로 나누고, **서술·합의 행**의 문자열을 경로 순으로 직렬화한 sha256이며(위치·행동·토큰·해시 필드·`valueReview` 자신 제외), 사람이 검토를 마친 뒤 `build.mjs --dir <폴더> --review-hash`가 출력하는 값을 적는다. 생성기는 매번 다시 계산해 다르면 거부("검토 뒤 문자열이 바뀌었다 — 다시 확인")한다 — 확인 뒤 `purpose`·`name` 등 서술 필드에 값을 끼워 넣으면 재확인 없이는 생성되지 않는다. **위치 필드(와 토큰)는 사람 재확인을 요구하지 않는다** — 그래야 T05 자가 복구가 사람 없이 `find`·URL 등을 고칠 수 있다. 대신 위치·행동 필드는 매 생성마다 형식 탐지를 다시 거치고(복구가 민감 형식을 끼우면 생성 거부), 복구가 추가해야 할 안전장치(후보→검증→회귀→반영, 가림 규칙 유지)는 T05가 맡는다. 위치·행동 필드에 이름·주소 같은 형식 없는 값이 들어갈 위험은 남으며 아래 보장 수준에 포함한다. 승인 거부 기준은 사전에 적는다: 값처럼 보이는 문자열이 보이면 승인하지 않는다. **보장 수준(BR02와 동일 — 캡틴 확인 요청 사항)**: 탐지 가능한 민감 형식은 생성 거부, 형식 없는 값은 출처 제한·자리표시 규칙·사람 확인 기록으로 줄이되 완전 차단은 보장하지 않는다 — 이를 사전·SKILL.md에 한계로 적는다(상위 요구를 좁히는 것이 아니라 백로그가 정한 범위를 그대로 따른다).
- 해시: steps.json 바이트(CRLF→LF 정규화)의 sha256. `agent/index.json`·`S0n.json`에 `sourceHash`. **최신성 검사는 하나의 계약**이다: 검사 함수 `checkAgentFresh(dir)`와 CLI `build.mjs --dir <폴더> --check-agent`는 디스크를 고치지 않고 (a) steps.json 해시 (b) 승인 캡처 해시(`shotHash`) (c) 정본에서 메모리로 다시 만든 `agent/*` 바이트와 디스크 파일의 비교를 모두 수행하며, 하나라도 다르면 종료코드 1과 낡은 파일 목록을 낸다. 주행 전에 멈추는 것은 T04가 이 검사를 부른다.
- 실값 금지(생성기 검사, `agentView` 켠 흐름): steps.json의 모든 문자열 값에서 민감 형식(주민번호 `\d{6}-?[1-8]\d{6}`, 카드 `\d{4}(-?\d{4}){3}`, 계좌형 숫자 열(숫자 10~14자리, 하이픈 허용), 전화(`0\d{1,2}-?\d{3,4}-?\d{4}`), 이메일, 토큰류(해시 필드(정확한 경로: `steps[].shotHash`·`steps[].recordHash`·`steps[].captureRecord.shotSha256`·`valueReview.contentHash`와 출력의 `sourceHash`·`actionHash`·`shot.sha256`)는 경로로 구분해 `^[0-9a-f]{64}$` 형식만 허용하고 토큰 검사에서 뺀다 — 그 밖 경로의 같은 길이 문자열은 계속 거부. JWT 형태 `xxx.yyy.zzz`·24자 이상 영숫자/`-_` 연속 중 **숫자와 영문을 모두 2자 이상 포함하고 서로 다른 문자 12종 이상인 것**(정상 식별자 `customer_transaction_history`·`form-input-customer-name` 같은 단어형은 통과해야 하며 테스트에 정상 식별자 사례를 넣는다)·`(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+` 중 값이 자리표시(`<…>`)나 형식 이름 토큰이 아닌 것 — `Authorization: <인증값>` 같은 값 없는 명세는 통과하고 실제 자격증명 모양만 거부, 테스트에 자리표시 사례를 넣는다))을 찾으면 생성 거부(위치 키 경로만 오류에 적고 값은 쓰지 않는다 — `agentView` 흐름은 민감 형식 검사를 기존 `validate`보다 **먼저** 원본 steps.json 전체에 돌려, 민감 형식이 기존 검증 오류 메시지로 새어 나가지 않게 한다. `agentView`가 꺼진 흐름은 기존 검증 순서·메시지를 그대로 둔다). 
- 생성물: `agent/index.json`(목적·위험·시작 조건 `start`(첫 단계 `enter`)·`run`·단계 목록 `{id,title,risk,gate,html,json}`·`sourceHash`), `agent/S0n.json`(`enter`(사람이 읽는 진입 조건 문장 — 단계마다 보존)·`screen`(url·require·forbid — 기계 판정, `enter`와 별개로 둘 다 투영)·`elements[{n,name,find,box,action,expect,wait,onChange}]`·`extract[]`·`api`·`success`·`escalate`·`events`·`next`·`sourceHash`), `agent/S0n.html`(독립 파일: 기준 캡처 `../shots/S0n.jpg` 참조 + box를 `vw×vh` 대비 퍼센트로 놓은 번호 박스, 요소 표, `extract` 표, **API 단계면 값 없는 `api` 명세 표(method·endpoint·요청 형태·응답 경로)**, `enter`·`success`·`escalate`, 스크립트 없음, 모든 문자열 이스케이프). `capture:false` 단계(API 단계)는 캡처 영역 없이 api·extract 표만으로 읽히게 한다.
- 위치 대응(계약): 요소를 찾는 **1차 수단은 `find`**이고 `box`는 보조 증거다. `S0n.json`에 `locate:{primary:"find",secondary:"box",onConflict:"stop",report:["step","element","reason","sourceHash","shotSha256"]}`를 넣어 계약으로 적는다 — 중단 보고에 이 항목이 실려 T05 복구자가 실패 요소·불일치 이유·원본·캡처 버전을 받는다 — find로 찾은 요소의 현재 rect와 기록 box(환산)가 어긋나거나(IoU 미달) 요소가 사라지면 주행은 멈추고 보고한다(구현은 T04, 복구는 T05). 코어 export `boxMatches(recorded, actual, {tolerance})` — 기록 box를 `vw·vh` 비율로 현재 뷰포트에 환산해 실제 rect와 IoU(기본 ≥ 0.6)를 판정한다. IoU는 "같은 위치"만 보이고 요소 정체성을 증명하지 않는다는 한계를 사전에 적는다. 줄바꿈·사이드바 접힘 같은 비비례 변화는 이 보정 밖이며 `onConflict:stop` 대상이다.
- **승인 → 좌표 → 원본 → 지도 연결**: ① 어댑터가 캡처 때 코어 반환 `info.boxes·view`를 대기 메타에 저장 ② 캡처 직후 어댑터가 코어 `captureRecord({info, post, step, shotSha256})`로 이미지 해시·boxes·view를 **한 기록**으로 묶어(`recordHash`=그 내용의 sha256) 대기 메타에 저장한다 ③ `--approve S0n --sha <해시>` 때 어댑터가 코어 `approveStep(step, record, {approvedSha})`(순수 함수)를 불러 — 기록의 `recordHash`가 내용과 맞고 `record.shotSha256`이 승인 해시와 같을 때만 — steps.json에 `step.captureRecord`·`step.shotHash`·`step.recordHash`를 쓴다(이전 좌표+새 이미지 조합·좌표 수기 수정은 `recordHash` 불일치로 생성기가 거부). **원본 저장과 정규 직렬화**: 승인 때 `approveStep`이 기록 전체(`{boxes, view, shotSha256, masking:{masked, perRule}, post:true, elementsMasked}`)를 `step.captureRecord`로 steps.json에 저장하며(**좌표의 유일한 출처** — `elements[].box`·`step.view`는 steps.json에 따로 저장하지 않고 생성기가 `captureRecord.boxes·view`에서 `S0n.json`의 `elements[].box`로 도출한다. 외부에 중복된 좌표를 사람이 steps.json에 쓰면 생성 거부), `recordHash`는 이 객체의 키 정렬 JSON(UTF-8) sha256이다 — 생성기는 대기 메타 없이 steps.json과 `shots/`만으로 해시를 재계산해 대조한다(원본은 steps.json·승인 캡처뿐이라는 목적 유지, 숫자·불리언뿐이라 실값 없음) ④ 생성기가 지도를 만들 때 `shots/S0n.jpg`가 있으면 해시를 대조한다. 규칙: `agentView` 흐름의 캡처 단계(`capture`≠false)는 `shots/S0n.jpg`가 **있어야** 하고, 모든 요소에 `box`, 단계에 `shotHash`·`view`·`recordHash`가 있어야 하며 `shotHash`가 실제 파일과 같아야 한다 — 하나라도 없거나 다르면 생성 거부(캡처 누락·캡처 교체·좌표 수기 수정 같은 정합성 판별, 최초 생성 포함 — 승인 기록 자체의 진위는 서명 체계가 없어 증명하지 않는다). 따라서 첫 캡처 승인 전에는 `agentView`를 켜지 않는다. `capture:false` 단계는 box 없이 허용(주행은 `find`). `S0n.json`·`index.json`에 `shot:{path,sha256}`를 넣고 `checkAgentFresh`는 steps.json 해시와 캡처 해시를 함께 본다. 어댑터 쪽 연결(사례 저장소·각 서비스)은 이 태스크 범위 밖이고 `references/adapter.md` 필수 기능 7번에 호출 의무를 적는다(T03에서 어댑터 템플릿).
- 크기: 단계 json은 단계 하나 분량 — fixture(요소 6개·extract 3·api 1) 단계 json 각 8KB 이하(목표, 보조 지표).
- **지도 필드 명세 (원본 경로 → 출력 경로 → 분류 → 문법; 생성·검증·`contentHash`가 이 표 하나에서 나온다)**. 분류: **위치**(화면 위치·판정 — `find`·`screen.*`·`box`·`view`·`extract.where` — 복구가 자유롭게 고친다, 해시 제외, 매 생성 형식 탐지), **행동**(업무 행동의 의미 — `api.method|endpoint|request[].name|in|successStatus`·`tool`·`command` — 복구가 고칠 수는 있으나 의미가 바뀔 수 있어 단계별 `actionHash`로 변경을 드러낸다, `contentHash` 제외), **토큰**(형식이 정해진 식별자 — 해시 제외, 문법 검사), **서술**(사람이 쓰는 글 — `contentHash` 포함), **합의**(인터뷰에서 사람이 정한 수집·저장 조건 — `contentHash` 포함, 복구가 바꿀 수 없다). **행동 변경 계약**: 생성기는 `S0n.json`에 `actionHash`(행동 필드를 경로 순 직렬화한 sha256)를 넣는다. 복구(T05)가 어떤 단계의 `actionHash`를 바꾸면 그 단계의 `risk`가 `read`가 아니거나 HTTP 방식이 `GET`·`HEAD`가 아닐 때는 D5에 따라 사람 확인 사유가 된다 — T02는 변경을 **드러내는 값**까지 만들고(자동 변경 가능한 위치 정보 ≠ 보존해야 할 업무 의도·대상·권한), 집행은 T05. **대상·권한 불변 조건**: 접근 대상(origin)은 합의 필드 `allowedOrigins`로 사람이 정하고 복구는 이 안에서만 경로·선택자를 고친다 — 읽기(`GET`) 요청의 `api.endpoint`를 같은 origin 안에서 바꾸는 것은 `actionHash` 변경(읽기 단계 자동 허용)이고, 다른 origin이나 다른 계정·조직 대상으로 바꾸는 것은 `allowedOrigins`(합의) 위반으로 생성 거부된다. 같은 origin 안에서 대상 계정·조직이 바뀌는 경로 변경은 `allowedPaths` 패턴 밖이면 거부된다. 패턴 안의 `{…}` 자리(대상 계정·조직 식별자)에 어떤 값을 넣는지는 실행 시 입력이라 지도에 없고 T04의 입력·승인 정책 소관이다(남는 한계: 패턴이 너무 넓으면 대상 변경을 막지 못하므로 인터뷰에서 좁게 정한다). 이 표에 없는 steps.json 필드는 지도에 투영하지 않는다.

| 원본 경로 | 출력 | 분류 | 문법·비고 |
|---|---|---|---|
| `title` · `purpose` · `risks.*.label` · `lanes.*` · `rules[]` | index | 서술 | 자리표시만 |
| `resultTo` | index | 합의 | 결과 저장 위치 식별자(값 아님) |
| `allowedPaths[]` | index | 합의 | 접근해도 되는 경로 패턴 목록(`/organizations/{id}/…`처럼 `{…}` 자리표시 허용, 자리표시에 들어갈 값은 실행 입력) — `api.endpoint`·`screen.url` 경로가 패턴 하나에 맞아야 생성되고 복구는 패턴 밖으로 옮길 수 없다(바꾸면 `valueReview` 재확인) |
| `allowedOrigins[]` | index | 합의 | 이 플레이북이 접근해도 되는 origin 목록(`스킴://호스트`, 자리표시 가능) — `screen.url`·`api.endpoint`의 origin이 이 목록 안이어야 생성되고, 복구는 목록 밖 origin으로 옮길 수 없다(바꾸면 `valueReview` 재확인) |
| `steps[].id` · `lane` | index·S0n | 토큰 | `^S\d+$`·lane id |
| `steps[].risk` · `risks.*.level`(없으면 `risk` id 자체) | index·S0n | 합의 | 단계 위험 등급 — 복구의 자동 변경 권한을 가르는 값이라 사람이 정하고 `contentHash`에 포함(바꾸면 재확인) |
| `elements[].n` | S0n | 토큰 | 양의 정수, 단계 안에서 유일(중복·누락 생성 거부) — 캡처 번호 태그·`box`·액션을 잇는 열쇠 |
| `steps[].title` · `enter` · `gate` · `success` · `escalate` · `identify.*` | S0n | 서술 | `enter`는 단계마다 보존 |
| `run[].label` · `run[].note` | index | 서술 | |
| `frames`(별칭→`selector`·`optional`) | index | 위치 | 허용 키만 |
| `onChangeProcedure[]` | index | 서술 | `rules[]`와 같은 취급 |
| `steps[].tool` · `command`(S0n에 투영) | S0n | 행동 | 위 행동 행과 같음 |
| `run[].command` · `run[].covers` · `steps[].tool` · `steps[].command` | index·S0n | 행동 | 자리표시(`<page>`)만 — `actionHash`는 단계 자신의 `tool`·`command`와 그 단계를 `covers`로 덮는 모든 `run`의 `command`·`covers`를 함께 직렬화한다(명령 또는 적용 단계가 바뀌면 덮인 단계의 `actionHash`가 바뀐다) |
| `steps[].screen.url|require|forbid` | S0n | 위치 | 기계 판정 |
| `elements[].label`(출력 `name`) · `action` · `wait` · `expect` · `onChange` | S0n | 서술 | |
| `elements[].find` | S0n | 위치 | |
| `steps[].captureRecord`(`boxes`·`view`·`shotSha256`·`masking`·`post`·`elementsMasked`) | S0n(`elements[].box`·`view`·`shot`로 도출) | 위치 | 숫자·불리언·해시뿐 |
| `steps[].shotHash` · `recordHash` · 출력 `sourceHash` · `actionHash` | S0n·index | 토큰 | 해시는 `^[0-9a-f]{64}$` |
| `extract[].name` · `verify` | S0n | 서술 | |
| `extract[].where` | S0n | 위치 | 선택자(번호 요소의 `find`와 같아야 함)·응답 경로 |
| `extract[].format` | S0n | 합의 | 형태 문법만(`YYYY-MM-DD`·`숫자`·`주민번호` 등 형식 이름), 실값 모양 거부 — 수집 형식의 의미라 바꾸면 `valueReview` 재확인 필요(자동 복구는 `where`만 고친다) |
| `extract[].sensitivity` · `deliverTo` | S0n | 합의 | `public|masked|restricted`·저장 위치 식별자 — 바꾸면 `valueReview` 재확인 필요 |
| `api.method` · `endpoint` · `request[].name|in`(`role`이 `param`인 것) | S0n | 행동 | 값 없는 형태 |
| `api.request[].role` · `request[].name|in`(`role`이 `target`인 것) | S0n | 합의 | `role:"target"`은 계정·조직·조회 범위를 정하는 query/header/body 필드(이름·위치만, 값 아님)로 사람이 정하고 `contentHash`에 포함 — 복구가 이 필드를 추가·삭제·이름 변경하려면 `valueReview` 재확인이 필요하다(`role` 기본값은 `param`, 대상 지정 가능성이 있는 요청 필드는 인터뷰에서 `target`으로 표시) |
| `api.response[].path|type` | S0n | 위치 | 값 없는 형태 |
| `api.successStatus` | S0n | 행동 | 상태 코드 토큰 |
| `api.request[].form` | S0n | 합의 | 형태 문법만 — 요청에 실어 보내는 값의 형식이라 바꾸면 재확인 필요 |
| `events[].when|then` | S0n | 서술 | `events[].steps`는 토큰(`id`)으로 해당 단계만 투영 |
| `changes[]` · `valueReview` · 그 밖 | — | 투영 안 함 | |

**생성기 도출 필드(원본에 없고 생성기가 규칙으로 만든다 — S-7이 이 표와 위 투영 표의 합집합을 출력 경로 집합과 대조)**:

| 출력 | 도출 규칙 | 검증 |
|---|---|---|
| `index.generated` · `agent/S0n.html` 머리 주석 | 고정 문구("생성 파일 — 직접 고치지 않는다") | 존재·최신성 바이트 비교 |
| `index.start` | `steps[0].enter` | 첫 단계 `enter`와 같음 |
| `index.steps[].html|json` | 단계 id로 만든 상대 경로 | 링크 대상 존재 |
| `S0n.shot{path,sha256}` | `shots/S0n.jpg` 경로와 파일 sha256 | `shotHash`와 같음 |
| `S0n.locate{primary,secondary,onConflict,report}` | 고정 계약 | 값 고정 대조 |
| `S0n.next` | `steps` 배열 순서의 다음 단계 id(없으면 null) — 전이의 정본은 배열 순서이고 steps.json에 `next` 필드는 없다(있으면 투영하지 않고 무시, 배열 순서와 다르면 생성 거부) | steps 순서와 같음 |
| `sourceHash`·`actionHash` | 위 정의 | 재계산 비교 |
| `agentSchema` | 지도 스키마 버전 정수 | 생성기 상수와 같음 |

`contentHash` = 서술·합의 행의 값만 경로 순 직렬화한 sha256(화면 변경에 대응하는 복구는 위치·행동·토큰만 바꾸고, 수집·저장 조건은 사람 재확인 없이 바꿀 수 없다 — 복구가 이 조건을 바꾸려 하면 T05 계약상 사람 확인 사유). 위치·행동·토큰은 사람 재확인을 요구하지 않아 T05 복구가 사람 없이 고칠 수 있다(대신 매 생성 형식 탐지·문법 검사). 테스트 S-7이 `agent/*` 문자열 필드 경로 집합이 이 표와 같은지, 서술 행만 해시에 들어가는지 대조한다.
- **위치 대응 검증 (스텁 + 실제 브라우저)**: BR02 완료 기준(가상 fixture 화면을 다시 띄워 기록된 box와 실제 위치 비교, 배율·창 크기 보정 포함)을 두 층으로 검증한다. ① S-5 — DOM 스텁으로 좌표 환산·CSS px 기준·불일치 판정(빠르고 결정적). ② **S-5r(e2e) — Orca 브라우저로 가상 로컬 페이지(`test/fixtures/playbook/`)를 열어 코어 오버레이를 실행해 `boxes`를 얻고, 창 크기·배율을 바꿔 다시 열어 같은 요소의 실제 rect와 `boxMatches`로 비교, 비비례 이동 사례, 생성된 `S0n.html` 번호 박스의 위치(렌더 rect 대비 퍼센트)도 실측 비교**한다. Orca가 없으면 이 e2e는 건너뛰되 건너뜀을 출력하고 마감 증거로는 Orca에서 실행한 결과(`evidence/e2e-position.txt`)가 필요하다. 이 환경에는 Orca 브라우저가 설치되어 있다.
- **실패 입력의 연결**: `captureRecord({info, post, step, shotSha256})`는 입력으로 `runCapture`가 돌려주는 `info`·`post`와 단계 `step`(추출 대상 번호를 `extract[].where`↔`elements[].n`에서 읽는다)·`shotSha256`을 명시적으로 받고, `info.errors`가 비어 있지 않거나 `post.ok`가 true가 아니거나 `info.missing`에 추출 대상 요소 번호가 있으면 기록을 만들지 않고 즉시 거부한다(실패 상태를 숫자로 버리지 않는다). 시험은 실제 `runCapture` 반환 구조(스텁 브라우저로 만든 정상·사후 검사 실패·추출 대상 누락)를 그대로 `captureRecord`→`approveStep`에 연결하는 시험(S-3b·S-3e)을 포함한다.
- **접근 허용 범위 판정 규칙(`allowedOrigins`·`allowedPaths`)**: URL은 `new URL`로 해석해 스킴·호스트(소문자)·포트가 `allowedOrigins` 항목과 **정확히 같을 때만** 통과(접두사·부분 일치·유사 호스트 거부, 자리표시 `<…>`가 든 항목은 같은 위치의 호스트 라벨 하나에만 일치). 경로는 퍼센트 디코딩을 한 번만 하고 `.`·`..`을 정규화한 뒤 `\`·인코딩된 `/`·널 문자가 있으면 거부하고, `allowedPaths` 패턴은 `/`로 나눈 세그먼트 단위로 전체 일치해야 하며 `{이름}`은 정확히 한 세그먼트(`[^/]+`)에만 일치한다(접두사 비교 금지). 실행 시 자리표시 치환 뒤 재검증은 T04 인계 계약으로 남긴다.
- **URL 문법(`screen.url`·`api.endpoint`)**: userinfo(`user:pass@`)와 fragment는 허용하지 않고(거부), query는 키만 쓰고 값은 자리표시(`<…>`·`{…}`)만 허용한다 — 값이 자리표시가 아니면 거부하고 민감 형식 탐지는 **퍼센트 디코딩 뒤**에도 한 번 더 적용한다(`?email=a%40b.test` 같은 인코딩된 실값 거부). query 키는 같은 단계 `api.request[]`(`in:"query"`)에 선언된 이름이어야 하고, 대상 지정 키는 `role:"target"`이다(선언 없는 키 거부). 테스트(S-2f·S-6)에 인코딩된 이메일, 정상 자리표시 URL, 같은 origin·경로에서 대상 query만 바뀐 사례를 둔다.
- **캡처 당시 요소 대응과 선택자 복구**: `captureRecord`에는 `finds`(`{n: find}` — 캡처 당시 번호와 선택자의 대응)도 들어가 `recordHash`에 묶인다. 생성기는 현재 `elements[]`의 `find`가 `captureRecord.finds[n]`과 다른 요소(선택자 복구 또는 번호·`find` 교환)의 `box`·`elementsMasked` 증거를 재사용하지 않는다 — 그 요소는 `S0n.json`에서 `box:null`·`stale:true`로 표시하고(생성은 허용, 주행은 `find` 1차로 계속하되 box 보조 없음) 재캡처·재승인(`approveStep`)으로 갱신한다. 캡처 증거를 재사용할 수 있는 조건은 `find` 불변뿐이고 `find`가 바뀌면 재캡처 조건이 된다.
- **최신성 검사의 파일 집합**: `checkAgentFresh`는 재계산한 파일 바이트 비교에 더해 **예상 파일 집합(`agent/index.json`·단계마다 `S0n.json`·`S0n.html`)과 `agent/` 아래 실제 파일 집합의 일치**를 본다 — 삭제된 단계의 옛 `S0n.*`·불필요한 추가 파일은 낡음으로 보고한다. 재생성(`buildFlow`)은 `agent/`의 예상 집합 밖 **관리 파일**(이름이 `S\d+\.(json|html)`·`index.json` 형태인 옛 파일)만 정리하고, 그 밖의 파일(`agent/extra.txt` 등)은 지우지 않고 생성을 거부한다("관리 밖 파일 — 직접 제거하라") — 그래서 재생성이 통과한 뒤 `agent/`는 항상 예상 집합과 같다.
- **캡처 가림 전제**: 승인 가능한 캡처는 코어 `runCapture`가 만든 것뿐이다(가림 fail-closed 통과). `captureRecord`는 `info.masked`·`info.perRule` 건수와 사후 검사 결과를 숫자만으로 기록에 넣고, `approveStep`은 사후 검사 실패·`errors` 존재·`maskRequire` 규칙 0건인 기록을 거부한다. 코어는 요소마다 `masked`를 계산해 `captureRecord`에 불리언으로 넣는다 — **요소 rect 전체가 가림 rect들의 합집합에 들어갈 때만 true**(일부만 겹치면 false, 부분 가림은 거부). 캡처가 있는 단계의 `masked` 추출은 `extract[].where.selector`가 `elements[]`의 번호 요소 하나와 같은 `find`여야 하고(없거나 여러 요소를 포함하는 box면 생성 거부), **지도 HTML이 표시하는 캡처에서는 추출 대상 값이 `public`이어도 보이면 안 된다** — 캡처 단계의 모든 `extract[]`는 연결된 번호 요소 n의 `elementsMasked[n]`이 true여야 승인되고(`public`·`masked` 공통; 가림은 흐름 `mask` 규칙으로, 다른 요소에만 규칙이 적중한 경우는 거부), `restricted`이면 그 값이 보이는 단계는 `capture:false`여야 한다(캡처 단계에 `restricted` 추출이 있으면 생성 거부 — 중간 보관 금지의 허용·거부 조건). 같은 가림 규칙이 여러 요소에 적중해도 추출 대상 요소 하나하나가 `masked:true`인지 개별로 본다.
- **새 캡처·좌표의 승인과 복구의 관계(T02 계약)**: `box`·`shotHash`·`recordHash` 갱신은 `approveStep`을 통해서만 일어나고, 승인 주체(사람·자동)는 호출자 정책이다. 최초 캡처는 사람 승인(기존 어댑터 절차). 복구(T05)가 새 캡처·좌표를 낼 때 사람 승인 없이 자동으로 `approveStep`을 부를 수 있는 조건은 T05가 D5 안전장치(후보→검증→회귀→반영, 가림 규칙 유지, 되돌릴 수 없는 행동 관문) 안에서 정한다 — T02는 승인 주체를 고정하지 않고, 갱신 전에는 위치 충돌 시 `locate.onConflict:"stop"`을 유지한다.
- **복구의 정본과 생성물**: 고치는 곳은 항상 정본(`steps.json`·승인 캡처)이고 순서는 정본 수정 → 지도 재생성 → `--check-agent` 검증 → 재개다. `agent/*`는 생성 파일이라 직접 고치지 않으며, `checkAgentFresh`는 위 계약대로 해시와 재계산 바이트 비교를 함께 해 손으로 고친 흔적도 낡음으로 보고한다. 각 생성 파일 머리(`index.json`의 `generated`·`S0n.html` 주석)에 직접 고치지 않는다는 표기를 둔다.
- **API 성공·실패 구별 계약(보존만 T02, 판정 실행은 T04)**: `agentView:true` 흐름의 API 단계는 `success`(서술: 성공으로 보는 응답 조건)와 `escalate`(서술: 멈출 실패 응답 조건)가 비어 있지 않아야 하고, 기계 판정 근거 `api.successStatus` 또는 `api.response[]`가 있어야 한다 — 응답 구조만 같고 결과가 다른(성공·거절) 경우를 `success`·`escalate` 문장으로 구별해야 하며, 구별 조건이 없는 API 단계는 불완전한 명세로 생성 거부한다.
- **API 단계 최소 정보**: `agentView:true` 흐름의 API 단계(`capture:false` + `api` 사용 또는 "API 단계" 표기)는 `api.method`·`api.endpoint`와 성공 판정(`api.successStatus`(토큰, 예: `200`) 또는 `api.response[]` 1개 이상 — 응답 본문 없이 상태 코드로 성공하는 업무를 허용)이 있어야 하고, 읽을 값이 있으면 `api.response[]`와 `extract[].where.apiPath`도 있어야 하며 하나라도 없으면 생성 거부한다(옛 `capture:false + 문구` 표기만 있는 API 단계는 `agentView` 끈 흐름에서만 허용).
- **진입 조건 규칙**: `index.json.start`는 첫 단계 `enter`, 이후 단계의 `enter`는 각 `S0n.json`에 그대로 있다. `enter`(앞 단계 결과·사람 결정을 말로 적은 조건)와 `screen.require/forbid`(화면의 기계 판정)는 서로 다른 것이라 하나가 다른 하나를 대신하지 않는다 — 둘 다 해당 단계 json에 있고 주행(T04)은 둘 다 만족해야 진입한다. 테스트 S-2b가 모든 단계의 `enter`가 보존되는지 확인한다.
- **한 번에 읽는 지도의 확인**: `S0n.html`은 캡처·번호 박스와 함께 요소 표(번호·이름·`find`·action·expect)와 `extract`·`success`를 같은 파일에 싣는다(독립 파일). 테스트 S-2b가 대표 웹 단계 하나와 API 단계 하나에 대해 `index.json`+해당 `S0n.json`만으로 대상 식별(`find`·`screen`)·행동·추출·성공 판단·다음 단계가 모두 나오는지 확인한다(지도 읽기 시뮬레이션). 실제 주행 사용성의 정본 판정은 T06이다.
- 하지 않는 것: 주행 규칙(T04), 학습(T05), 기존 `flow.html`·`flow/*.md` 변경, 사례 저장소 어댑터 수정.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `agentView` 꺼진 흐름(사례 저장소 9흐름 포함)을 다시 생성해도 파일 목록·바이트가 T01 기준(<기준 커밋>)과 같다 — P-2 |
| T-2 | `agentView` 켠 fixture에서 `agent/index.json`·`S0n.json`·`S0n.html`이 생기고 json이 스키마 검사를 통과하며 `box`·`extract`·API 단계가 들어간다 — P-2 |
| T-3 | 코어가 오버레이 때 요소 box를 반환하고 `approveStep`이 box·`shotHash`를 step에 기록하며, 가림 대상 요소를 포함한 결과 어디에도 화면 원문 값이 없다 |
| T-4 | steps.json을 고치거나 승인 캡처를 바꾸고 재생성하지 않으면 해시 검사가 실패하고, 캡처 단계에 box·`shotHash`가 없거나 캡처와 다르면 생성이 거부된다(`--check-agent`·`checkAgentFresh`) |
| T-5 | 위치 대응: fixture 화면을 다른 창 크기·배율로 다시 띄워도 기록된 box가 같은 요소를 가리키고, 어긋나면 불일치로 판정되며 지도에 `locate` 계약(find 1차·box 보조·충돌 시 stop)이 들어가고 중단 보고에 실을 항목(단계·요소 n·불일치 이유 `moved|missing`·지도 `sourceHash`·`shot.sha256`)이 지도에 명시된다 |
| T-6 | 민감 형식 `extract` 선언(예: 형식=주민번호)은 통과하고 같은 실값이 서술 필드에 있으면 거부되며(수집은 막지 않고 기록만 막는다), `agentView` 켠 흐름은 `valueReview`가 없으면 거부되고 지도는 허용 필드만 투영하며, steps.json에 민감 형식(주민·카드·계좌형·전화·이메일·토큰류)이 있으면 생성이 거부되고 오류에 값이 없다. 꺼진 흐름은 영향 없다 |
| T-7 | `agent/*`를 손으로 고치면 낡음으로 보고되고, 서술 필드 변경은 `valueReview` 재확인을 요구하지만 위치 필드(`find` 등) 변경은 요구하지 않고 행동 필드 변경은 `actionHash`로 드러내며 지도만으로 대상·행동·추출·성공·다음 단계가 추적된다 |
| T-7b | 단계 json 크기가 fixture 기준 8KB 이하(보조) · 사전(schema.md)에 새 필드가 모두 행으로 있고 fixture가 모두 쓴다 |
| T-8 | `npm run check`·`node scripts/secret-scan.ts` 통과 — P-8 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | e2e | T-1 | 사례 저장소 기준 커밋(T01의 기준 커밋 — 실제 값·경로는 로컬 비공개 파일 `~/.pace-private/P001-case.md`, T01 `evidence/compare-identity.mjs`의 인자)의 흐름 9개 steps.json·shots, 비교 대상은 흐름별 `flow.html`·`flow/*` 106파일(스크립트 출력 `evidence/identity-result.txt` 형식) | | 변경된 생성기로 재생성·`git show`와 비교 | 9흐름 106파일 불일치 0, `agent/` 폴더 생성 0 | `evidence/compare-identity.mjs` 재실행 |
| S-2 | unit | T-2 | fixture에 `agentView:true` | `buildFlow` | `agent/` 3종 생성, index 단계 목록·S0n.json 필드·html 박스 수 일치 | `test/playbook/build.test.mjs` |
| S-3 | unit | T-3 | DOM 스텁(가림 대상 요소 포함) | `overlayScript` 실행→`captureRecord`→`approveStep` | box 숫자만, 가림 요소 포함 JSON에 원문 문자열 0건, 없는 n·비숫자·승인 해시 불일치·`recordHash` 위조(좌표 수정) 거부, `shotHash`·`recordHash` 기록 | `capture-core.test.mjs` |
| S-4 | unit | T-4 | 생성 후 steps.json 한 글자 변경 · 캡처 파일 교체·삭제 · box 없는 캡처 단계 · shotHash/recordHash 불일치(좌표 수기 수정) | `checkAgentFresh`·CLI·`buildFlow` | 낡음 보고·종료코드 1, 재생성 후 통과, box/shotHash 문제는 생성 거부, 캡처 파일이 없는 캡처 단계도 거부, `capture:false` 단계는 box 없이 통과, `agentView` 없는 폴더는 해당 없음 | `build.test.mjs` |
| S-5 | unit | T-5 | 스텁 문서를 800×600에서 기록 후 1600×1200·dpr 2로 재배치, 비비례 이동 · 생성된 S0n.json | `boxMatches` · 지도 검사 | 비례 환산은 모두 일치, 캡처 픽셀(dpr 곱) 좌표를 CSS 좌표로 오인한 기록은 불일치, 다른 요소 박스·비비례 이동은 불일치, `locate` 계약 필드와 `report` 항목 존재 | `capture-core.test.mjs` |
| S-6 | unit | T-6 | 각 민감 형식(토큰류 포함) 하나씩 넣은 steps.json · `mask`·`revealInputs.value`의 리터럴 이메일·전화(거부)와 순수 패턴(통과) · `valueReview` 없음/빈 note · extract.format에 리터럴 값 · 목록 밖 필드 · 검토 뒤 문자열 변경 · 해시 필드 · 민감 형식 이름을 선언한 `extract.format`(주민번호·계좌·카드·전화·이메일) · 같은 실값 모양을 `purpose` 등 서술 필드에 넣은 경우 | `buildFlow` | 형식마다 거부·오류에 값 없음, `agentView` 끈 흐름은 같은 값도 생성 통과, mask 패턴은 형식 탐지 제외·리터럴 6자리 숫자는 거부, `valueReview` 없으면 거부, format 리터럴 거부, 목록 밖 필드는 지도에 없음, 검토 뒤 문자열을 바꾸면(`contentHash` 불일치) 거부·`--review-hash` 재계산 후 통과, 64자 16진 해시 필드는 허용되나 다른 경로의 같은 길이 문자열은 거부, 형식 이름 선언은 오탐 없이 통과·같은 실값 모양은 서술 필드에서 거부·`extract.format`에 실값 모양이 있으면 거부, 정상 식별자(`customer_transaction_history` 등)는 통과, 민감 형식은 기존 검증 오류에도 값이 새지 않음 | `build.test.mjs` |
| S-2b | unit | T-2·T-7 | fixture의 웹 단계·API 단계(캡처 없음) | `index.json`+`S0n.json`만 읽는 시뮬레이션, 모든 단계 `enter` 보존·API 단계 html에 api 표·`extract.deliverTo` 투영·`masked`·`restricted`에 `deliverTo` 없으면 스키마 경고, `agent/*` 손 수정, 서술/위치·행동 필드 각각 변경 | 대상·행동·추출·성공·다음 단계 추출 가능, 손 수정 낡음 보고, 서술·합의 변경만 `contentHash` 거부 | `build.test.mjs` |
| S-2c | unit | T-6·T-7 | API 단계 둘(같은 `successStatus`·응답 구조, `success`/`escalate`만 다름) · 합의 필드 변경 · `find` 변경 · `api.endpoint` 변경 | 생성·`contentHash`·`actionHash` 비교 | 성공·거절이 문장으로 구별되고 `success`/`escalate` 비면 거부, `find` 변경은 해시 불변·재생성 통과, 합의 필드 변경은 `valueReview` 거부, `api.endpoint` 변경은 `actionHash`만 바뀌고 비읽기 단계 표시 | `build.test.mjs` |
| S-2g | unit | T-6·T-7 | 같은 origin·경로에서 대상 지정 query/header 필드(`role:"target"`)만 추가·삭제·이름 변경 vs 위치 복구(`find` 변경) | `contentHash`·생성 | 대상 지정 변경은 `valueReview` 재확인 요구(음성), 위치 복구는 해시 불변·생성 통과(양성) | `build.test.mjs` |
| S-2d | unit | T-6·T-7 | GET API 단계의 `api.endpoint`를 ① `allowedPaths` 안 경로로 ② 다른 origin으로 ③ `allowedOrigins`만 수정 ④ 같은 origin의 `allowedPaths` 밖 경로로 ⑤ `allowedPaths`만 수정 | 생성·해시 비교 | ①은 `actionHash`만 변경·생성 통과, ②는 `allowedOrigins` 위반 거부, ③·⑤는 `valueReview` 재확인 요구, ④는 `allowedPaths` 위반 거부 | `build.test.mjs` |
| S-3f | unit | T-3·T-4 | 승인 뒤 두 요소의 `find`를 서로 바꿈 · 한 요소의 `find`만 복구 변경 · 번호 재배정 | `buildFlow` | 바뀐 요소는 `box:null`·`stale:true`(증거 재사용 안 함), 바뀌지 않은 요소는 그대로, 재캡처 `approveStep` 뒤 해소 | `build.test.mjs` |
| S-3d | unit | T-3·T-4 | 승인 뒤 steps.json에 외부 `elements[].box`·`step.view`를 사람이 추가 · `captureRecord` 내부 값 수정(해시는 그대로) | `buildFlow` | 둘 다 생성 거부(좌표의 유일한 출처는 `captureRecord`, 내부 수정은 `recordHash` 불일치) | `build.test.mjs` |
| S-3e | unit | T-3 | 실패한 `info`(errors·post 실패·추출 대상 `missing`) · `public` 추출 대상이 가려지지 않은 캡처 | `captureRecord`→`approveStep` | 기록 생성 단계에서 즉시 거부, `public` 추출도 `elementsMasked[n]`이 false면 승인 거부 | `capture-core.test.mjs` |
| S-2f | unit | T-6 | `allowedOrigins`·`allowedPaths` 경계: 유사 호스트·포트 다름·경로 접두사·`..` 상위 이동·`%2e%2e`·인코딩된 `/`·`\`·세그먼트 하나 초과 | 판정 함수 | 독립적으로 손으로 적은 기대값(통과·거부)과 일치 | `build.test.mjs` |
| S-4b | unit | T-4 | 단계 삭제·이름 변경(옛 `S0n.*` 잔여) · `agent/extra.txt` 같은 관리 밖 파일 추가 | `checkAgentFresh`·`buildFlow` | 둘 다 낡음 보고, 재생성은 옛 관리 파일만 정리하고 관리 밖 파일은 생성 거부, 통과 뒤 집합 = 예상 집합 | `build.test.mjs` |
| S-3c | unit | T-3·T-4 | 가상 흐름 한 개 | `captureRecord`→`approveStep`→steps.json 저장→`buildFlow`→`checkAgentFresh` 연결, 같은 64자 해시를 `purpose` 등 일반 문자열 경로에 넣기 | 연결 전체 통과(정상 승인 흐름이 토큰 검사에 걸리지 않음), 일반 경로의 같은 해시는 거부 | `build.test.mjs`·`capture-core.test.mjs` |
| S-3b | unit | T-3 | 사후 검사 실패·`errors` 있는 기록 · 가림 규칙 0건 기록 · **부분 가림 요소(일부만 겹침 → 거부)** · **여러 가림 rect의 합집합이 요소를 완전히 덮는 경우(허용)** · 같은 규칙이 다른 요소에만 적중한 `masked` 추출 · 캡처 단계의 `restricted` 추출 | `approveStep` | 정상(여러 가림 rect 합집합이 요소를 완전히 덮음)은 승인, 사후 검사 실패·`errors`·가림 0건·부분 가림·다른 요소만 가림·캡처 단계의 `restricted` 추출은 각각 거부 — 모든 승인을 거부하는 구현은 정상 사례에서 잡히고, 느슨한 구현은 거부 사례에서 잡힌다. 요소별 `masked` 불리언·`info.perRule` 건수만 기록에 들어가고 값 없음 | `capture-core.test.mjs` |
| S-2e | unit | T-2·T-7 | 서로 다른 위치의 요소 3개를 가진 캡처 단계 · 위험 문자열(`<`·`>`·따옴표·`onerror=` 모양)을 넣은 서술 필드 | 생성 후 손으로 적은 기대값과 대조 · `S0n.html` 파싱 | 요소 n마다 `find`·`box`·번호 박스 위치가 고정 기대값과 같고(첫 요소 값을 모두에 배정하는 결함 검출), S-2b의 대표 단계는 기대 행동·추출 경로·성공 조건 문장이 고정 기대값과 같다, 위험 문자열은 텍스트로만 나오고 실행 가능한 노드·속성이 없다 | `build.test.mjs` |
| S-5r | e2e | T-5 | Orca 브라우저 · 가상 로컬 페이지 | 창 크기·배율 변경 전후 box 측정, 비비례 이동, 번호 박스 실측 | 비례 변경은 같은 요소로 일치, 비비례 이동은 불일치, 번호 박스가 렌더 위치와 일치 | `evidence/e2e-position.txt` |
| S-7c | unit | T-7 | 합의 필드별(`risk`·`resultTo`·`allowedOrigins`·`allowedPaths`·`deliverTo`·`sensitivity`·`extract.format`·`api.request.form`) 변경 | `contentHash` 비교 | 표와 별도로 손으로 적은 기대값: 각 필드 변경은 `contentHash` 변경, 위치·행동 필드 변경은 불변 | `build.test.mjs` |
| S-7b | unit | T-7 | 고정 기대 목록(표와 별도로 손으로 적은 필수 출력 키: index는 `agentSchema·generated·sourceHash·start·steps`, S0n은 `enter·screen·elements·locate·next·sourceHash·actionHash`) | 생성물 키 대조 | 표·도출 규칙이 같이 틀려도 필수 키 누락을 잡는다 | `build.test.mjs` |
| S-7 | unit | T-7b | fixture 단계 json·`agent/*` | 크기 측정·사전 대조·필드 명세 표 대조(생성기가 명세 표에서 투영·분류·해시 대상을 도출) | ≤8KB, 사전 행 전부 fixture가 사용, `agent/*` 문자열 필드 경로 집합 = 명세 표, 서술·합의 행만 `contentHash` 포함(행동 행은 `actionHash`) | `build.test.mjs`·`skill-doc.test.mjs` |
| S-8 | check | T-8 | 전체 | `npm run check`·secret-scan | 통과, `.mjs` 실행 건수 하한 갱신 | 명령 출력 |

## 접근

- `capture-core.mjs`: `overlay`의 태그 루프에서 `boxes[e.n]`·`view`를 모아 반환, 신규 export `approveStep`·`boxMatches`. 기존 반환 키·export 유지(D6). 기존 `perRule`·`missing` 의미 불변.
- `build.mjs`: `agentView`일 때만 `validateAgent`(extract·api·box·민감 형식)와 `buildAgent`. 기존 출력 경로·바이트는 건드리지 않는다. `--check-agent` 옵션과 `checkAgentFresh` export.
- `references/schema.md`에 새 필드 행(생성기·코어·어댑터 구분), `SKILL.md` 절차에 "에이전트 지도" 한 줄(8KB 한도 확인).
- fixture `sample-flow/steps.json`에 `agentView:true`·`captureRecord`(+`shotHash`·`recordHash`, 테스트가 `approveStep`으로 만든 값)·`extract`·`api`·`valueReview`·`allowedOrigins`·`allowedPaths`·`resultTo`를 추가(좌표는 `captureRecord`에만 둔다). 기존 T01 테스트(S-6 등)가 4단계 가정을 하므로 영향 확인.
- 보안 영향: 지도에 실값이 들어가는 경로를 닫는다(스키마 검사·민감도 표기·box는 숫자뿐). 이 태스크는 값을 읽는 코드를 만들지 않는다.
