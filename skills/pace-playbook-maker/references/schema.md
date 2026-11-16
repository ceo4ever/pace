# steps.json 필드 사전

정본은 생성기·캡처 코어·서비스 어댑터 코드다. 이 표와 코드가 다르면 코드를 따르고 이 표를 고친다.
"쓰는 곳": **생성기**(검사·출력) · **코어**(캡처 코어) · **어댑터**(서비스 캡처 어댑터) · **문서**(사람·에이전트가 읽기만, 코드가 해석하지 않음). ★ = 필수(생성기가 실제로 검사하는 것은 `steps`·`id`·`risk`뿐이고, 나머지 ★는 비면 "undefined"가 찍히므로 관례상 필수).

## 최상위

| 필드 | 쓰는 곳 | 뜻 |
|---|---|---|
| `title` ★ | 생성기 | 흐름 이름 — flow.html·개요 제목 |
| `updated` | 생성기 | 마지막 갱신일(YYYY-MM-DD) |
| `base` | 생성기 | 생성 문서가 안내하는 경로 접두(예: 스킬 기준 `references/flows/<흐름>`). 없으면 `.` |
| `purpose` | 생성기 | 흐름 목적 한 단락 |
| `risks` | 생성기 | 위험 등급 `{id: {label, color}}`. `read`(읽기)는 기본 제공. 서명·전송·개인정보 화면 등 서비스 등급은 여기서 정의 |
| `risks.*.label` | 생성기 | 등급 표시 이름 |
| `risks.*.color` | 생성기 | `#hex` 색 — 형식이 아니면 생성 실패 |
| `lanes` | 생성기 | 대상 구분 `{id: 이름}`(예: 정방향·취소). 없으면 대상 칸을 생략 |
| `mask` | 생성기·코어·어댑터 | 캡처 가림 규칙 배열. `re:정규식`(글자 노드) 또는 CSS 선택자. **없거나 비면 캡처 거부**. 생성기는 형식·컴파일만 검사 |
| `frames` | 코어·어댑터 | iframe 별칭 `{alias: "선택자"}` 또는 객체형 `{alias: {selector, optional}}`. 요소 `find`에 `alias:선택자`로 쓴다. 필수 frame을 덮지 못하면 거부. 어댑터가 이 값을 코어로 넘겨야 효과가 있다(상수로 대신하는 어댑터는 이 필드를 무시) |
| `frames.*.selector` | 코어 | iframe 선택자(객체형) |
| `frames.*.optional` | 코어 | `true`면 화면에 없을 때 통과(있는데 접근 못 하면 거부) |
| `rules` | 생성기 | 흐름 전체 실행 규칙(문장 배열) — overview·flow.html에 그대로 |
| `onChangeProcedure` | 생성기 | 화면이 다를 때 처리 순서(문장 배열) |
| `run` | 생성기 | 운영 실행 — 여러 단계를 명령 하나가 수행할 때 그 명령 배열(쓰면 비어 있지 않아야 한다 — 빈 배열은 생성 실패. `events`는 빈 배열 허용). 생성기가 개요·html "운영 실행" 절과 범위 단계 파일의 "운영:" 줄로 낸다. 범위 단계의 단독 명령은 진단·재현용이 된다 |
| `run[].label` | 생성기 | 실행 이름(흐름 안에서 중복 금지) — 대상별로 명령이 다르면 하나씩(예: 회사별) |
| `run[].command` | 생성기 | 실행 명령 — 자리표시(`<page>`)만, 실값 없음 |
| `run[].covers` | 생성기 | `[첫 단계 id, 끝 단계 id]` — 실재하는 id, 순서대로 |
| `run[].note` | 생성기 | 범위·인자 차이 같은 짧은 설명 |
| `events` | 생성기 | 비결정 이벤트 — 앱이 스스로 여는 탭·늦게 뜨는 공지·일시 덮개처럼 순서가 정해지지 않은 화면 일. 개요·html "비결정 이벤트" 절에 낸다 |
| `events[].when` | 생성기 | 일어나는 일 |
| `events[].then` | 생성기 | 도구·사람의 처리 |
| `events[].steps` | 생성기 | 일어날 수 있는 단계 id 배열 — 그 단계 파일에도 낸다(없는 id면 생성 실패) |
| `steps` ★ | 생성기·코어·어댑터 | 단계 배열(아래) |
| `changes` | 생성기 | UI 변경 이력 배열 — overview에는 최근 5건 |
| `changes[].date` | 생성기 | 날짜 |
| `changes[].step` | 생성기 | 단계 id |
| `changes[].what` | 생성기 | 바뀐 내용 |
| `agentView` | 생성기 | `true`인 흐름만 `agent/index.json`·`S0n.json`·`S0n.html`(에이전트 지도)를 만든다. 없거나 `false`면 기존 산출물 바이트가 그대로다. 아래 "에이전트 지도" 절 |
| `valueReview` | 생성기 | `agentView` 흐름 필수 — 사람이 "값 자리는 자리표시뿐이고 이름·주소·금액·인증값이 없다"고 확인한 기록 |
| `valueReview.date` | 생성기 | 확인한 날짜 |
| `valueReview.reviewer` | 생성기 | 확인한 사람(이름 대신 역할·별칭도 됨) |
| `valueReview.note` | 생성기 | 확인한 범위 설명 — 비면 거부 |
| `valueReview.contentHash` | 생성기 | 서술·합의 필드 문자열의 sha256. `build.mjs --dir <폴더> --review-hash`가 출력하는 값을 검토를 마친 뒤 적는다. 확인 뒤 서술·합의 문자열이 바뀌면 생성 거부 |
| `resultTo` | 생성기 | 합의 필드 — 인터뷰에서 정한 흐름 기본 결과 저장 위치의 식별자(값 아님). 추출에 `deliverTo`가 없을 때 쓴다 |
| `allowedOrigins` | 생성기 | 합의 필드(`agentView` 필수) — 접근해도 되는 origin 목록(`스킴://호스트`, `<…>` 자리표시 가능). `api.endpoint`가 이 안이어야 한다 |
| `allowedPaths` | 생성기 | 합의 필드(`agentView` 필수) — 접근해도 되는 경로 패턴(`/organizations/{id}/…`, `{…}`는 한 세그먼트). `api.endpoint` 경로가 패턴 하나에 전체 일치해야 한다 |

## 단계 (`steps[]`)

| 필드 | 쓰는 곳 | 뜻 |
|---|---|---|
| `id` ★ | 생성기·어댑터 | `S` + 두 자리 숫자(`S01`), 중복 금지 — 생성기는 `S`+숫자를 받지만 기준 어댑터는 두 자리만 캡처·승인한다. 파일 `flow/S0n.md`·`shots/S0n.jpg` 이름 |
| `title` ★ | 생성기 | 단계 제목 |
| `risk` ★ | 생성기 | `risks`에 있는 등급 id(없으면 생성 실패) |
| `lane` | 생성기 | `lanes`의 id 또는 `both`(공통) |
| `gate` | 생성기 | 승인 관문 문구(사람의 명시 승인 한마디). 있으면 개요·단계 파일에 굵게 |
| `tool` ★ | 생성기 | 실행 도구 — 스크립트 경로·CLI 이름만. 괄호·`—`·` + ` 설명이 있으면 생성 실패 |
| `toolNote` | 생성기 | 도구 설명(쓰는 함수·인자 차이·함께 쓰는 모듈) — "도구: `경로` — 설명"으로 낸다 |
| `command` | 생성기 | 실제 명령 예시. 계정·실값 대신 `<page>` 같은 자리표시 |
| `purpose` | 생성기 | 단계 목적 |
| `enter` | 생성기 | 진입 조건(앞 단계 결과·사람 결정) |
| `identify` | 생성기 | 사람이 읽는 화면 식별 — 하나라도 다르면 UI 변경 |
| `identify.title` | 생성기 | 화면 제목 |
| `identify.anchors` | 생성기 | 식별 문장 배열 |
| `screen` | 어댑터 | 기계 화면 판정. 캡처 단계는 아래 셋 다 필수(없으면 거부) |
| `screen.url` | 어댑터 | 경로+hash(origin·query 제외)에 대한 정규식 — `^…$`로 좁게 |
| `screen.require` | 어댑터 | 1개 이상 있어야 할 선택자 배열 |
| `screen.forbid` | 어댑터 | 보이면 안 되는 선택자 배열(공지·모달) |
| `screen.dismiss` | 어댑터·복구 | 덮개를 닫는 방법 배열 `{when(덮개 선택자), click(닫기 선택자)}` — 주행이 `forbid`가 보일 때 한 번 눌러 닫는다. 새 행동(클릭)이라 복구는 읽기 단계의 닫기 어휘 요소만 자동으로 더한다 |
| `elements` | 생성기·코어 | 실행 요소 배열(아래). 코어는 `n`·`find`로 번호 태그를 단다 |
| `success` | 생성기 | 성공 판정·주의 |
| `escalate` | 생성기 | 멈추고 사람에게 넘길 조건 |
| `capture` | 생성기·코어·어댑터 | `false`면 캡처·승인 금지(개인정보 원본·조작 없는 단계·미검증 API 단계) |
| `captureNote` | 생성기·코어 | 캡처 금지 이유 또는 대체 참조 |
| `mask` | 어댑터 | 단계 추가 가림 규칙 — 흐름 `mask`에 **더하기만**(지울 수 없음) |
| `maskRequire` | 어댑터 | 캡처 단계 필수 배열(빈 배열 허용, 없으면 거부). 이 화면에서 반드시 1건 이상 가려져야 할 규칙 — 병합 mask의 항목 문자열 그대로, 또는 값 있는 입력 기본 규칙 키 `(기본:값 있는 입력)`. mask에 없는 규칙을 가리키면 거부, 캡처 뒤 0건이면 거부 |
| `maskRequireNote` | 어댑터 | `maskRequire`를 비운 이유 — 사람이 정한 노출 허용 범위와 날짜. 비우면서 이것도 없으면 거부 |
| `revealInputs` | 코어 | 공개할 입력 배열 — 값 있는 입력은 기본 가림. input에만 적용 |
| `revealInputs[].selector` | 코어 | 대상 input 선택자 |
| `revealInputs[].value` | 코어 | 값 패턴 `^…$`. 민감 표본·빈 값과 일치하면 거부 |
| `capturePage` | 문서 | 캡처할 탭이 흐름 기본 탭과 다를 때(팝업 등) 찾는 법·활성화 방법 |
| `status` | 생성기·어댑터 | 기준 캡처 상태 — 자유 문구(예: `todo`), 승인 때 어댑터가 `captured`로 씀 |
| `verified` | 생성기·어댑터 | 기준 캡처 승인일(어댑터가 씀) |
| `captureRecord` | 생성기·코어·어댑터 | 승인 때 코어 `approveStep`이 쓰는 캡처 기록 — **좌표·가림 증거의 유일한 출처**(숫자·불리언·해시뿐, 화면 글자 없음). 사람이 쓰지 않는다. 생성기가 `S0n.json`의 `elements[].box`·`view`·`shot`로 도출한다 |
| `captureRecord.boxes` | 코어 | 요소 번호별 `{x,y,w,h}`(뷰포트 CSS px) |
| `captureRecord.view` | 코어 | `{vw,vh,dpr}` — 뷰포트 크기·배율 |
| `captureRecord.shotSha256` | 코어 | 승인된 캡처 파일의 sha256 |
| `captureRecord.masking` | 코어 | `{masked, perRule}` — 가린 건수·규칙별 건수(숫자뿐) |
| `captureRecord.post` | 코어 | 사후 검사 통과(`true`만 기록) |
| `captureRecord.elementsMasked` | 코어 | 요소 번호별 불리언 — 요소 rect 전체가 가림 rect 합집합에 들어갔는가(부분 가림은 false) |
| `captureRecord.contextSha` | 코어 | 캡처 당시 화면 판정(`screen`)·프레임 별칭의 해시 — 이후 `screen`·`frames`가 바뀌면 이전 캡처 증거를 재사용하지 않고 모든 요소를 `stale`로 표시 |
| `captureRecord.finds` | 코어 | 요소 번호별 캡처 당시 `find` — 이후 `find`가 바뀐 요소는 증거를 재사용하지 않고 `stale`로 표시 |
| `shotHash` | 어댑터 | 승인된 캡처의 sha256 — `shots/S0n.jpg`와 같아야 한다(`agentView` 캡처 단계 필수) |
| `recordHash` | 어댑터 | `captureRecord`의 키 정렬 JSON sha256 — 수기 수정·조합 위조 검출 |
| `extract` | 생성기 | 그 단계에서 읽어 올 값의 선언 배열 — 값이 아니라 어디서 무엇을 어떤 형식으로 읽는지와 민감도만 적는다 |
| `extract[].name` | 생성기 | 읽을 값의 이름 |
| `extract[].where` | 생성기 | 읽는 위치 — `selector`(번호 요소의 `find`와 같아야 함) 또는 `apiPath`(`api.response`의 경로) 중 하나. `box` 직접 지정은 지원하지 않는다 |
| `extract[].where.selector` | 생성기 | 번호 요소의 `find`와 같은 선택자 |
| `extract[].where.apiPath` | 생성기 | API 응답 경로 |
| `extract[].format` | 생성기 | 형태 문법만(`문자열`·`숫자`·`YYYY-MM-DD`·`주민번호`·`<자리표시>` 등 형식 이름). 실값 모양은 거부. 수집 형식의 의미라 바꾸면 `valueReview` 재확인 |
| `extract[].sensitivity` | 생성기 | `public`·`masked`·`restricted` — 값은 어떤 경우에도 지도·기록에 남기지 않고, 이 값은 전달·가림 정책을 정한다(`masked`·`restricted`는 `deliverTo` 필수, `restricted`는 캡처 단계에 둘 수 없음) |
| `extract[].deliverTo` | 생성기 | 읽은 값을 넘길 결과 저장 위치의 식별자(값 아님). 없으면 `resultTo` |
| `extract[].verify` | 생성기 | 읽은 값의 검증 기준 문장(합계·건수 대조 등) |
| `api` | 생성기 | API 단계의 값 없는 명세 — 쓰면 `capture:false`여야 하고 `success`·`escalate`가 필요하다 |
| `api.method` | 생성기 | `GET`·`POST`·`PUT`·`PATCH`·`DELETE`·`HEAD` |
| `api.endpoint` | 생성기 | 엔드포인트 URL — `allowedOrigins`·`allowedPaths` 안, query는 키만(값은 자리표시), userinfo·fragment 금지 |
| `api.request` | 생성기 | 요청 필드 선언 배열(값 없음) |
| `api.request[].name` | 생성기 | 필드 이름 |
| `api.request[].in` | 생성기 | `query`·`body`·`header` |
| `api.request[].role` | 생성기 | `param`(기본) 또는 `target`(계정·조직·조회 범위를 정하는 필드 — 합의 필드, 바꾸려면 재확인) |
| `api.request[].form` | 생성기 | 값의 형태 문법만 — 바꾸면 재확인 |
| `api.response` | 생성기 | 응답 필드 선언 배열 |
| `api.response[].path` | 생성기 | 응답 경로 |
| `api.response[].type` | 생성기 | 형태 문법 — 응답 값을 해석하는 계약이라 바꾸면 `valueReview` 재확인 |
| `api.successStatus` | 생성기 | 성공으로 보는 HTTP 상태 코드(응답 본문이 없는 업무) — `api.response`와 둘 중 하나 이상 필요 |

### API 단계(화면 없는 응답 관찰) 표기

첫 사례: 앱이 부른 응답을 수동 관찰로 받아 목록·합계를 읽는 흐름. 새 필드 없이 기존 필드로 쓴다 — 생성기·코어·어댑터 변경 없음.

- `capture: false` + `captureNote`에 "API 단계"와 캡처하지 않는 이유(응답·화면에 개인정보 등)
- `identify.anchors` 첫 줄을 `API 단계 — `로 시작해 관찰하는 엔드포인트(메서드·경로, query 허용 키)와 보관하는 요청 형태(값 없이)를 적는다. 그 뒤 줄에 그 응답을 일으키는 화면 조작(연도·달력·조회)을 적는다
- `tool`에 응답을 받는 모듈(수동 관찰 장치), `success`에 응답 검증 기준(합계·건수 대조), `escalate`에 실패 코드
- 도구는 서명이 필요한 API를 직접 부르지 않는다 — 앱이 스스로 부른 응답만 허용 목록으로 받는다. 직접 호출이 필요한 서비스가 나오면 그때 표기를 다시 정한다

### 에이전트 지도(agentView) — 필드 분류와 경계

- **경계(한 문장)**: 실값 금지는 지도·명세·기록 파일(`steps.json`·`agent/*`·`flow.html`·주행 기록·history)에 실값이 '기록'되는 것만 막고, 주행 때 `extract`로 읽어 인터뷰에서 정한 결과 저장 위치로 넘기는 '수집' 자체는 막지 않는다.
- **보장 수준(사용자 결정)**: 탐지 가능한 민감 형식(주민번호·카드·계좌형·전화·이메일·토큰류·자격증명 대입)은 생성 거부 + 출처 제한(화면 글자 비반입, 허용 필드만 투영) + 사람 확인 기록(`valueReview.contentHash`). **이름·주소처럼 형식 없는 값의 완전 차단은 보장하지 않는다** — 값 자리는 자리표시로만 쓴다.
- **분류**: 서술(사람이 쓰는 글)·합의(수집·저장·접근 조건, `risk`)는 `contentHash`에 포함되어 바꾸면 재확인이 필요하다. 위치(`find`·`screen.*`·`extract.where`·`api.response`)·행동(`tool`·`command`·`api.method|endpoint|request`·`run`)·토큰(id·해시 등)은 재확인 없이 복구가 고칠 수 있다 — 행동 필드 변경은 단계별 `actionHash`로 드러난다. 위치 필드를 바꿔도 캡처 증거는 `find`가 같을 때만 재사용된다.
- **지도에 실리는 실행 정보**: `index.json`에 `frames`(별칭→선택자)·`lanes`·`rules`·`onChangeProcedure`, 단계 `S0n.json`에 `tool`·`toolNote`·`command`·`capturePage`(서술), `S0n.html`에 대기·다르면 열이 함께 실린다(복구가 지도만 읽고 이어 가도록). 중첩 객체(`extract`·`where`·`api`·`request`·`response`·`screen`·`frames`)는 허용 키만 받고 그 밖은 거부한다.
- **복구의 정본**: 고치는 곳은 항상 `steps.json`·승인 캡처이고 `agent/*`는 생성 파일이다. 순서는 정본 수정 → 재생성 → `--check-agent` → 재개.
- **주행 계약**: 요소는 `find`로 1차 식별하고 `box`는 보조 증거다. 어긋나면(IoU 미달·요소 없음) 멈추고 단계·요소·이유·`sourceHash`·`shotSha256`를 보고한다.

## 요소 (`elements[]`)

| 필드 | 쓰는 곳 | 뜻 |
|---|---|---|
| `n` | 생성기·코어 | 번호 = 캡처의 번호 태그 |
| `label` | 생성기 | 요소 이름 |
| `find` | 생성기·코어 | CSS 선택자, `text:문구`(보이는 글자 완전 일치 — 버튼·링크·라벨·칸·굵은 글자·자식 요소 없는 div), `<frame별칭>:선택자`. 뷰포트 밖이면 태그 누락(`missingTags`)으로 보고 |
| `action` | 생성기 | 동작(클릭·입력·읽기·누르지 않음 등) |
| `wait` | 생성기 | 동작 뒤 기다릴 조건 |
| `expect` | 생성기 | 기대 결과 |
| `onChange` | 생성기 | 다르면 처리(대체 요소·멈춤) |
