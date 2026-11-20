# P005 T02 독립 tester 2단계 대조

**판정: fail (보류).** 전체 검사 결과를 아직 받지 못했고, 파일·CLI 토큰 검사와 복원 판정을 만든 소스가 감사 대상에 없습니다. 이 두 가지만 채워지면 pass로 바꿀 수 있는 상태입니다.

## 접근 범위
- **이번에 받은 자료:** TASK, PROJECT, BR02, tester 역할 기준, PRE-REVIEW, live-observations.md, 실행 소스 감사 사본 4개(common·apply·runtime·supervisor), 소스 해시, local-observer-preflight, 저장소 상태, 전체 검사 대기 표시입니다. 1단계 JSON 9개도 그대로 대조에 썼습니다.
- **하지 않은 것:** 파일 열람, 소스 실행, 명령·API 호출, 운영 재실측, advisor 호출을 포함한 다른 세션 호출은 하지 않았습니다. 제품이나 운영 상태도 바꾸지 않았습니다.
- **직접 보지 못한 소스:** 설치본 `adapter.ts`·`api.ts`·`index.ts`의 본문은 받지 않았습니다. 그래서 status 응답 문구, 불허 시 무응답, redactor 동작, 처리 순서(허용 chat → 사용자 허용 → 토픽)는 TASK 서술과 코디네이터의 해시 대조를 근거로 삼았습니다.
- **코디네이터 대조 결과를 그대로 인정한 항목:** 감사 소스 4개 해시 일치, 현재 TASK 해시와 PRE-REVIEW 최종 pass(blocking 0) 일치, `src/daemon` 작업 변경 없음, 단계별 ready와 캡틴 전송의 확인 왕복입니다.

## 1단계 지적의 해소 여부

| 1단계 한계 | 2단계 결과 |
|---|---|
| ① 거절이 실제 다른 계정이 아님 | **해소.** 승인된 대안이고, 소스로 보면 실제로 거절을 분리합니다(아래 T-2 참조). |
| ② 무응답 방식 거절 | **해소.** 제품 설계가 원래 무응답입니다. 통계 증가·작업 부재·송신 부재를 함께 요구합니다. |
| ③ 토픽 경로 미관측 | **부분 해소.** 요청은 General로만 한정했지만, 응답 쪽은 chat만 검사합니다(should_fix 1). |
| ④ 표본 1건 | 남음. 다만 승인 범위상 단계별 1건이 계획된 설계입니다. |
| ⑤ 토큰 검사 방식 불명 | **API 경로는 해소, 파일 경로는 미해소**(blocking B2). |
| ⑥ ACL 상속 | **해소.** `.env`는 보호 DACL인 setup 폴더에서, 시크릿 파일은 보호 DACL인 secrets 폴더에서 상속합니다. 셋 모두 `aclSafe`로 예상 밖 허용 0건을 확인했습니다. |
| ⑦ 상위 목적의 빈칸 | 범위 밖. handoff로 넘깁니다. |

## 기준별 판정

### T-1 포럼 연결 구성: pass
- **실행:** apply가 단계별로 실패하면 중단하는 구조이고, 산출물이 생성되어 있습니다(`passed` 경로).
- **선택:** S-1·S-2에 맞습니다. 봇 이름 고정 검사, `is_forum`, webhook 부재, 봇 멤버십을 봅니다. 시크릿은 설치 CLI `telegram init`의 stdin으로만 넣고, 자식 출력에 토큰이 있는지도 검사합니다.
- **충족:** 기존 시크릿이나 허용 목록과 다르면 중단합니다. `allowedUsers.telegram`을 뺀 원래 설정과 device가 같아야 통과하고, `loadConfig` 검증도 거칩니다. 시크릿 파일 ACL도 확인합니다.
- **검출력:** 설정이 보존되지 않으면 실제로 throw하는 단언입니다.
- **약화:** 없습니다. 관리자 조건을 멤버십으로 낮춘 것은 main 결정 메모에 근거가 있습니다.

### T-2 허용 응답 / 불허 거절: 기술적으로 pass (should_fix 3건 동반)

**런타임 제외가 거절을 실제로 분리하는지: 분리합니다.**
- deny 단계는 메모리 사본에서만 `allowedUsers.telegram=[]`로 둡니다.
- connect 래퍼가 실제 어댑터의 `host.isAllowed(같은 사용자)`가 false인지 연결 전에 단언합니다. 따라서 제외가 실제 판정 지점에 적용됐음이 보장됩니다.
- 후보 요청은 같은 chat·같은 사용자·General(스레드 없음 또는 1)·`/status`·ready 이후 시각인 메시지 하나로 한정합니다. 그 외 메시지는 interference로 세는데, 0건이었습니다.
- chat 검사가 사용자 검사보다 앞서므로, 다른 chat에서 온 메시지가 rejectedUsers를 올릴 수는 없습니다.

**검출력**
- 판정이 잘못 허용하면 송신이 생기고 rejects가 0이 되어 실패합니다.
- 판정이 잘못 거절하면 허용 단계에서 rejects가 1이고 sentStatus가 0이 되어 실패합니다.
- 세 단계 모두 운영 config 해시가 같아야 하므로, 디스크 권한을 바꾸지 않았다는 조건도 단언됩니다.

**reply 대상 범위**
- `sentStatus`는 후보 이후의 `sendMessage` 중 다음을 모두 만족할 때만 셉니다. chat_id가 같은 그룹이고, 본문에 `pace-pc`와 `실행`이 들어 있고, API 호출이 성공으로 끝났을 때입니다.
- `message_thread_id`(General 여부)와 원 메시지에 대한 reply 연결은 검사하지 않습니다.
- 후보가 1건이고 interference가 0이라 인과 관계는 강하게 추정되지만, **토픽 단위의 응답 경로는 관측되지 않았습니다.**

**약화 없음:** 기존 테스트나 소스 변경이 없습니다.

### T-3 토큰·식별자 비노출: API 경로 pass, 파일·CLI 경로 미확정

**소스로 확인되는 검사 대상**
- 세 단계의 모든 `TelegramApi.call` 파라미터와 성공 응답을 `JSON.stringify` 후 토큰과 정확히 일치하는지 검사합니다. 여기에는 `setMyCommands`, General 연결 알림, `/status` 응답, `getUpdates`가 포함됩니다.
- 토큰 문자 집합은 JSON 이스케이프가 일어나지 않으므로 정확 일치 검사로 충분합니다.
- `telegram init` 자식 프로세스의 stdout·stderr도 검사합니다.
- `save()`는 증거 JSON을 쓸 때마다 토큰·chat·사용자 ID가 들어 있으면 쓰기를 차단합니다.

**검사하지 않은 범위**
- HTTPS 요청 URL 경로의 토큰. 작업자도 인증상 존재한다고 명시했습니다.
- 실패한 API 호출의 예외 객체. 다만 세 단계 모두 apiFailures가 0이어서 실제로 해당하는 경우는 없었습니다.
- 프로세스 메모리, 덤프, 이벤트 로그.
- 의도된 저장소인 `.env`와 `secrets/telegram.json`.
- `save()`를 거치지 않는 저장소 산출물: md, log.jsonl, PROJECT.md, 감사 사본.

**미확정인 이유**
- status.json·daemon.log·state.json·telegram.json(offset)·셸 기록·CLI status/logs를 검사한 `secret-observations.json`은 감사 소스 4개 중 어느 것도 만들지 않습니다.
- `allow-initial-stop.json`, `deny-stop.json`, `final-runtime-restoration.json`도 마찬가지입니다.
- BR02 완료 기준에 문자 그대로 들어 있는 "`pace daemon logs`에 토큰 원문 없음"의 검사 방법을 소스로 확인할 수 없습니다.

### 복원 기동 exit 2 구분
- 순서 오류는 설치본 단일 인스턴스 잠금이 막았습니다. 기록된 대로 두 번째 poller나 알림은 생기지 않았습니다.
- `ownedStop`은 잠금 PID가 자기 프로세스일 때만 정지 요청을 쓰므로, 조기 시도가 deny 데몬을 멈출 수는 없었습니다. 소스상 맞습니다.
- **주의:** 그 시점에 `runDaemon`이 2를 반환했다면, `finish('runtime-ended')`가 `passed:false` 내용으로 `live-allow-restored.json`을 썼다가 나중의 정상 실행이 덮어썼을 수 있습니다. 성공 증거와 구분한 것 자체는 맞지만, 실패 기록은 로그에만 남아 있습니다(should_fix 4).

## 목표 판정
- **독립 목표 대조: 맞음.** 1단계에서 본 목표 네 가지와 TASK의 T-1~T-3, PROJECT의 P-2, BR02 완료 기준이 일치합니다.
- **목표 달성: T02 범위에서 조건부 달성, 최종은 미확인.** 연결, 허용 응답, 승인 대안으로 한 실제 거절, API 경로의 토큰 비노출은 소스와 관측으로 확인됩니다. 남은 것은 전체 검사(S-6)와 파일·CLI 토큰 검사의 근거(B2)입니다. 상위 목적인 작업 위임과 상시 가동은 T03·T04의 몫입니다.

## blocking
- **B1. 전체 검사 미수신(S-6).** 결함이 아니라 보류입니다. `npm run check` 결과와 비밀 검사 결과를 받아야 합니다.
- **B2. 감사 대상 밖의 생성 소스.** `secret-observations.json`과 stop·final restoration JSON을 만든 소스의 감사 사본과 해시를 추가해야 합니다. 그 소스가 실제 로그·CLI 출력을 정확 일치로 검사했는지 확인되면 해소됩니다. 실측을 다시 할 필요는 없습니다.

## should_fix
1. 허용 응답이 General로 갔는지 boolean으로 남겨야 합니다. 송신 파라미터의 `message_thread_id`와 reply 대상이 후보 메시지인지를 RAM에서 판정하면 됩니다. 이후 단계에서 다시 관측할 때 넣어도 됩니다.
2. deny 단계의 무송신 판정은 송신 메서드 4종만 셉니다. 후보 이후의 `getUpdates`가 아닌 모든 호출 수를 함께 기록해야 합니다. `sendChatAction`, `setMessageReaction` 같은 호출이 빠질 수 있습니다.
3. `sentStatus`는 `pace-pc`와 `실행` 문자열로만 판별합니다. 설치본 status 응답 형식과 맞는지 adapter 근거를 하나 남겨야 합니다.
4. exit 2 조기 시도가 `live-allow-restored.json`을 썼다가 덮어썼는지 기록에 명시해야 합니다.
5. 커밋 전에 T02 폴더 전체(md, log.jsonl, 감사 사본)를 토큰·chat·사용자 ID로 검사해야 합니다. `save()`는 JSON 증거만 지킵니다. 감사 사본에 들어 있는 봇 사용자명 리터럴을 남겨도 되는지도 확인이 필요합니다.

## handoff
- T03: 상시 기동과 자동 시작.
- T04: 워크스페이스 등록, 실제 체인 요청과 쓰기 승인. 필요하면 실제 두 번째 계정 거절도 여기서 봅니다.
- BR02와 BACKLOG의 done 동기화.
- 승인 범위에서 이미 보낸 메뉴와 알림은 Telegram에 그대로 남아 있습니다.

## 반환 요약
```
판정: fail (보류) — B1 전체 검사 미수신, B2 파일·CLI 토큰 검사 생성 소스 미감사. 둘이 해소되면 pass로 바꿀 수 있음
독립 목표 대조: 맞음 — 1단계 목표 4개 = T-1~T-3·P-2·BR02. 1단계 한계 ①②⑥ 해소, ③ 부분 해소
목표 달성: 미확인 — T02 실측은 조건부 달성. S-6과 T-3 파일 경로가 남음
기준: T-1 pass — 봇·포럼·webhook·멤버십, stdin 주입, 설정 보존 단언
      T-2 pass(기술) — 런타임 제외가 실제 판정 지점에 걸린 것을 단언으로 확인, rejects 1·송신 0·작업 0 / 허용 2회 응답 1. should_fix 1~3
      T-3 미확정 — API 파라미터·응답은 소스로 확인. 상태·로그·CLI·셸 기록 검사는 생성 소스 미감사
signals: exit 2 조기 시도가 증거 파일을 덮어썼을 가능성. 설치본 adapter·api 본문은 받지 않아 해시로만 확인
```
