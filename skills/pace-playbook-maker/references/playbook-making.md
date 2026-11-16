# 플레이북 만들기 — 인터뷰 → 수행하며 기록 → 생성

목표 하나를 받아 플레이북(업무 스킬 한 벌)을 만든다. 도구는 이 스킬의 도구 폴더(SKILL.md "도구 위치"). 작업 폴더(`<작업>`)는 저장소 밖 임시 폴더나 업무 저장소의 작업용 폴더다 — 인터뷰 기록·대기 파일은 산출물에 들어가지 않는다.

## 1. 인터뷰 — 한 번에 한 질문

[pace-intent](../../pace-intent/SKILL.md)의 방식을 쓴다: 한 번에 한 질문만 묻고, 답을 받은 뒤 다음 질문으로 간다. 묻는 항목과 기록 필드(`<작업>/interview.json`):

| 항목 | 필드 | 비고 |
|---|---|---|
| 목표·범위 | `goal`·`scope` | 어디까지 하고 무엇은 하지 않는지 |
| 입력 | `inputs[]{name,form,source}` | 값이 아니라 형태·출처 |
| 결과물·저장 위치 | `outputs[]{name,format,sensitivity,deliverTo}`·`resultTo` | 읽어 올 항목과 넘길 곳의 **이름** |
| 서비스·계정·인증 | `services[]{alias,kind,origin,auth{method,source}}` | 인증은 방식과 환경 변수·시크릿 저장소 **이름**만 |
| 성공 기준 | `success[]` | **필수** — 없으면 생성하지 않고 묻는다 |
| 위험 행동 | `riskyActions[]{name,irreversible,gate}` | **필수** — 없으면 `noRiskyActions:true`를 명시 |
| 예외·빈도 | `exceptions[]`·`frequency` | |
| 개인정보 | `privacy{kinds[],handling}` | 종류와 처리 방식 |
| 사람과 함께하는 지점 | `humanPoints[]{step,reason}` | 인증·애매한 화면·밖으로 나가는 행동·도구에 없는 동작 |

**실값을 기록하지 않는다.** 사용자가 주민번호·계좌·비밀번호 같은 값을 말해도 기록에는 종류만 적는다(`sensitiveKinds(text)`가 종류 이름만 돌려준다). 값 자리는 `<기간>`·`<계정>` 같은 자리표시다. **기록 순서**: 답을 메모리의 기록 객체에 모은다 → `saveInterview({workDir,interview})`로 저장한다(쓰기 **전에** 민감 형식 검사 — 걸리면 던지고 파일이 없다. 도중 저장은 필수 항목이 비어도 된다) → `node <도구 폴더>/interview.mjs --check <작업>/interview.json`로 완전성을 본다. 빠진 항목 이름이 나오면 그것을 묻고 다시 저장·검사한다. 완전해질 때까지 다음 단계로 가지 않는다.

## 2. 수행하며 기록

1. `initFlow({workDir,flow,interview,allowedPaths})` — 인터뷰의 합의(`resultTo`·`allowedOrigins`·위험 등급·규칙)로 `flows/<흐름>/steps.json` 뼈대를 만든다. `mask`·단계는 이어서 쓴다([schema.md](schema.md)).
2. 단계마다 실제로 수행한다. `observeStep`이 액션(`click`·`fill`)을 수행하고 기대(`visible`·`filled`)를 불리언으로 확인한다 — 선택자가 없거나 액션이 실패하거나 기대 요소가 보이지 않으면 `ok:false`이고 기록하지 않는다. 보장 범위는 거기까지다: 잘못된 추출 선택자는 `captureRecord`가 `extract_unlinked`로 거부하고, 추출값의 정확성은 판정하지 않는다. 기대(`expects`)를 항상 넘긴다(생략하면 관찰이 비어 통과한다).
3. `captureStep`(가림 오버레이 뒤 캡처 → 저장소 밖 대기 폴더)과 사람 확인 뒤 `approvePending`(해시 대조 승인 → `shots/S0n.jpg`·`captureRecord`). 어댑터 라이브러리 사용법은 [adapter.md](adapter.md) "어댑터 템플릿".
4. API 단계는 `addApiStep` — 앱이 부른 응답을 관찰한 객체에서 **경로·형태 이름만** `api.response`로 쓰고 값은 버린다. 값이 있는 응답을 설명·추출 예시·로그에 옮기지 않는다.
5. 서술·합의 문자열을 사람이 확인한 뒤 `build.mjs --dir <흐름> --review-hash` 값을 `valueReview.contentHash`에 적는다.

도구가 만드는 모든 파일은 쓰기 직전 민감 형식 검사를 거친다(보호 저장소). 탐지 가능한 형식만 막고 이름·주소 같은 형식 없는 값의 완전 차단은 보장하지 않는다 — 값 자리는 자리표시로만 쓴다.

## 3. 플레이북 생성

`generatePlaybook({workDir,outDir,name})`:

1. 인터뷰 완전성 검사(불완전하면 거부). 흐름마다 **원본 `steps.json`을 먼저 민감 형식 검사**하고 `checkAgreement`로 인터뷰 합의와 대조한다(결과 위치·추출 이름·민감도·전달 위치·접근 origin·위험 이름·관문이 다르면 거부). steps.json과 승인 증거(`shotHash`)가 같은 캡처만 복사한 뒤 `buildFlow`로 파생물을 다시 만들고 `checkAgentFresh`로 일치를 확인한다. 승인 증거가 무효(캡처 교체·기록 수정·확인 해시 불일치)면 거부한다.
2. `<outDir>/SKILL.md`(범위·성공 기준·안전 규칙·시작 조건·입력·결과 위치·개인정보 처리·예외·사람과 함께하는 지점·흐름 색인·주행 규약 링크), `references/flows/<흐름>/`(steps.json·shots·agent·flow.html·flow), `references/history.md`. SKILL.md가 길면 세부 합의는 `references/agreements.md`로 옮긴다.
3. `checkPlaybook`(이름·description·크기·링크·지도 최신성·민감 형식·허용 목록 밖 파일 부재)를 통과해야 `outDir`로 옮긴다. 실패하면 `outDir`를 만들지 않는다.

주행 규약은 플레이북에 복사하지 않는다 — SKILL.md는 `pace-playbook-maker` 스킬의 `references/driving.md`와 규약 버전 번호만 적는다.
