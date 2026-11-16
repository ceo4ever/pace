# 서비스 캡처 어댑터 — 계약과 함정

안전 규칙(가림·사후 검사·원본 삭제)은 캡처 코어가 맡고, 어댑터는 **서비스 고유 부분**만 둔다. 어댑터가 코어의 거부를 우회하는 경로(직접 스크린샷, 실패 무시)를 만들지 않는다.

## 코어 계약

`runCapture({doc, step, frames, mutationIgnore, browser, delayMs})`(`delayMs` 기본 300 — 오버레이 뒤 스크린샷 전 대기) — 반환 `{path, info, post, cleanupFailed}`, 거부·실패면 throw(`CaptureRefused.code`).

| browser 함수 | 계약 |
|---|---|
| `evalJs(expr)` | 지정 탭에서 식을 실행하고 결과 값을 돌려준다. 실패하면 **throw** |
| `screenshot()` | 지정 탭을 찍고 파일 경로를 돌려준다. 실패하면 throw — 오류 메시지 원문 대신 영문 코드만 붙인다(원문에 화면 값이 섞일 수 있다) |
| `discard(path)` | 원본 파일 삭제. 실패하면 throw(코어가 "수동 삭제 필요"로 보고) |
| `sleep(ms)` | 동기 대기 |

코어가 하는 일: 단계·mask 검사 → 가림 상자·번호 태그 오버레이 → 결과 형태 검사 → 스크린샷 → 사후 검사(DOM 변경·스크롤·레이아웃) → 오버레이 정리 → 거부면 원본 삭제.
`info.perRule`(규칙별 가린 건수)·`info.missing`(못 찾은 요소 번호)을 어댑터가 판정에 쓴다.

## 새 어댑터 필수 기능 (이 순서로)

아래 0~7을 모두 갖춘 어댑터만 기준 캡처에 쓴다. 대기·승인·화면 판정 없이 `shots/`에 바로 쓰는 초기형 어댑터가 남아 있으면 알려진 격차로 기록하고 다음 캡처 전에 맞춘다.

0. **브라우저를 부르기 전 정적 검사** — `capture:false`·흐름 mask 검사(코어 `assertCapturable`) → mask 병합(흐름 + 단계, 더하기만) → `maskRequire` 배열 없음 또는 빈 배열인데 `maskRequireNote` 없음이면 거부 → `screen.url`·`require`·`forbid` 중 하나라도 없으면 거부 → 이전 대기 파일이 있으면 거부 → `maskRequire`가 병합 mask에 없는 규칙(기본 입력 키 제외)을 가리키면 거부.
1. **범위 고정** — 명시한 탭(저장소·페이지 id)만 다룬다. "지금 활성 탭"에 명령을 보내지 않는다. 탭을 못 찾으면 멈춘다.
2. **캡처 전 검사** — 탭 소유·origin·**활성 탭 여부** → 단계 `screen` 판정(브라우저 안에서 판정하고 bool·개수만 받는다. URL·값을 가져오지 않는다). 불일치면 스크린샷 없이 거부.
3. **코어 인자 전달** — 병합 mask를 넣은 doc, 흐름 `frames`(steps.json 값을 그대로 — 상수로 대신하지 않는다), 필요하면 `mutationIgnore`(steps.json 필드가 아니라 코어 인자. 글자만 바뀌는 변경만 허용되고 textContent·innerHTML 교체는 늘 거부된다).
4. **코어 캡처** 호출.
5. **캡처 후 검사** — 탭·화면 판정 재실행, `maskRequire` 규칙 0건이면 거부, 정리 실패면 거부.
6. **대기 저장** — 버전 관리 밖 대기 폴더에 jpg + 메타(sha256·규칙별 건수). 저장이 실패하면 대기 파일과 원본을 모두 지운다. 출력은 상태·건수·짧은 해시뿐.
7. **승인·반려** — `--approve S0n --sha <해시>`: 메타 해시 = 파일 해시 = 받은 해시 접두일 때만 `shots/S0n.jpg`로 옮기고 단계 `status`·`verified`를 쓴다. `agentView` 흐름이면 캡처 직후(4~6) 코어 `captureRecord({info,post,step,shotSha256,frames})`(`frames`는 steps.json의 frames 그대로)로 기록을 만들어 대기 메타에 함께 저장하고, 승인 때 코어 `approveStep(step, record, {approvedSha})`로 `captureRecord`·`shotHash`·`recordHash`를 steps.json에 쓴다(좌표를 따로 쓰지 않는다. 기록 생성·승인이 거부하는 캡처는 승인하지 않는다). `capture:false` 단계는 승인 거부. `--reject`는 대기 파일 삭제.

## 관측된 함정 (새 서비스·새 브라우저 도구면 다시 관측)

| 증상(거부 코드) | 원인 | 처리 |
|---|---|---|
| 스크린샷 실패 | 비활성 탭 — 지정 페이지가 활성 탭이 아니면 실패하는 브라우저 도구가 있다 | 캡처 전 활성 탭 검사 + 탭 전환 단계 |
| `dom_changed` | 스크린샷 도구가 찍는 동안 input의 `type`을 같은 값으로 다시 쓰거나 `name`을 지웠다 복원 | 코어가 이 관측 동작만 면제 — 중간에 다른 type이 끼거나 최종 값이 다르면 거부. 다른 브라우저 도구로 옮기면 면제 근거를 다시 관측 |
| `dom_changed`·`layout_changed` | 롤링 배너·알림·시계 | 닫기 단계를 두거나(신뢰 클릭) `forbid`에 넣는다. 글자만 바뀌는 영역은 `mutationIgnore` |
| `overlay_errors` | 선언 안 된 보이는 iframe, 접근 못 하는 iframe, 열린 dialog·popover, html/body의 transform·filter | iframe은 `frames`에 선언(없을 수 있으면 `optional`), 모달은 닫기 단계 또는 `forbid` |
| `screen_mismatch` | 공지·모달이 떠 있음, 세션이 남아 로그인 화면이 아님 | 공지 닫기 단계, 로그아웃 뒤 재실행 |
| 소유 검사 실패 | Windows 경로 표기(`C:\` vs `C:/`, 대소문자) | 경로 비교는 정규화 함수 하나로 |
| 태그 누락(`missingTags`) | 요소가 뷰포트 밖, `text:` 대상 태그 종류 밖 | 별도 단계로 스크롤 위치 캡처, 선택자로 바꿈 |
| `mask_require_zero` | 가려야 할 값이 이번 화면에 없음 | 값이 있는 대표 문서로 다시 열거나, 사람 결정으로 `maskRequireNote` |
| 첫 실행만 실패 | 화면 전환 직후 입력칸이 아직 없음 | 도구에 대기 조건을 넣는다(재시도로 덮지 않는다) |

코어가 감지하지 못하는 것: fullscreen 등 dialog·popover 밖의 top layer, 닫힌 shadow root, 이미지·canvas 속 글자, `::before/::after` 글자, 조각난 텍스트 노드에 걸친 정규식, CSS 애니메이션. 이런 화면은 `capture:false`로 두거나 사람 확인에서 걸러야 한다.

## 테스트 (어댑터마다)

- 범위 없음·소유 불일치·비활성 탭·화면 불일치·forbid 표시 → 스크린샷 호출 0회
- 캡처 뒤 검사 실패·`maskRequire` 0건·저장 실패 → 원본·대기 파일 0개
- 병합 mask가 코어에 실제로 전달됨, 단계 mask가 흐름 규칙을 지우지 못함
- 승인: 해시 불일치·대기 없음·`capture:false` 거부, 오류 출력에 메시지 원문 없음
