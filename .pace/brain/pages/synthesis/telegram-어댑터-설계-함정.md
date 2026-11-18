---
type: synthesis
title: Telegram 어댑터 설계 함정
summary: "update_id는 일주일 무수신 뒤 무작위, getUpdates offset은 요청 시점에 확인, 토큰 비노출은 자르기 전 제거, 토픽 메뉴는 chat 단위, 파일 조회는 워커로"
tags: [telegram, daemon, security, adapter]
sources: [url:https://core.telegram.org/bots/api (2026-11-12 확인), code:src/daemon/telegram/adapter.ts, code:src/daemon/telegram/api.ts, code:src/daemon/core.ts, code:src/daemon/store.ts, test:test/telegram-flow.test.ts]
related: [pace-agent-acp-실측]
created: 2026-11-12
updated: 2026-11-19
status: active
---

1. Telegram은 일주일 넘게 새 update가 없으면 다음 update_id를 순차가 아닌 무작위로 정한다. getUpdates의 offset은 "이전 update를 잊는" 요청이라 큰 offset을 보내면 작아진 새 update가 어댑터에 닿기 전에 사라진다 — 어댑터는 마지막 수신이 5일보다 오래되면 offset을 생략한다. 중복 제거 키는 update_id가 아니라 메시지 `m<message_id>`·콜백 `c<id>`다.
2. 미확인 update는 서버가 24시간까지만 보관한다. 코어 수신 기록(seen)은 24시간 안 항목을 개수 상한으로 지우지 않고, 하드 상한(100,000)에서는 기록을 지우는 대신 새 수신을 거절한다(통제 명령·승인 콜백은 seen을 쓰지 않아 포화 중에도 처리).
3. 토큰 비노출은 길이 자르기 전에 제거해야 한다(잘린 조각은 정규식에 걸리지 않는다). 상태 저장은 직렬화 문자열 값·키에 한 번 더 제거(redactDeep), 설정의 경로에 토큰 형태가 있으면 기동 거부. 이벤트 스트림 조각의 비밀 제거는 사용자 결정으로 범위 밖(잔여 위험).
4. Bot API에는 토픽 단위 명령 메뉴가 없다(chat·chat member 범위까지) — 공통 메뉴를 쓰고 허용되지 않는 명령은 안내로 막는다. `--chat-id -100…`은 parseArgs가 옵션으로 오해하므로 `=` 형태로 바꿔 파싱한다.
5. 차단될 수 있는 파일 작업(열기·stat·읽기)은 메인 이벤트 루프에서 하지 않는다 — 워커 스레드 한 개·마감 5초·막히면 새 조회 거절, 정지 때는 기다리지 않는다.
6. 실제 봇·포럼 그룹·하루 상시 실행은 모의 서버로 증명되지 않는다(사람 확인 항목).

## 수신 확인과 재연결 알림

메시지가 없어도 getUpdates 롱폴링은 새 입력을 감지하기 위해 계속 필요하다. 빈 결과는 정상이며, 통신 실패 뒤 성공을 사용자에게 매번 알리는 것은 별도 정책이다. 2026-11-14 사용자 결정으로 반복 재연결 안내를 제거했다. 자동 재시도·오류 로그·복구 뒤 tick을 통한 보류 송신 재시도는 유지한다. 회귀 검증은 test/telegram-flow.test.ts의 S-4k·S-5에서 복구 후 입력 처리와 재연결 안내 부재를 함께 확인한다.

## 저장 실패 시험에서 호출 순번과 완료 경계를 구별한다

mock의 요청 기록을 보았다는 사실은 처리 완료나 후속 offset 저장 완료를 의미하지 않는다. `/bind` 실패 안내가 모의 서버 calls에 들어간 뒤 응답을 기다리는 동안 시험이 save 주입을 교체할 수 있다. 그 뒤 offset 저장이 한 번 끼면 `/new`의 두 번째 save가 토픽 표 저장이라는 가정이 깨진다.

P004 T05의 소유 사본에서 `/bind` 안내 응답만200ms 지연하자 offset=count0, 생성 의도=count1 실패가 되어 createForumTopic이 실행되지 않았고 표 저장 실패 안내 대기는 timeout이었다. 실제 제품은 의도 저장 실패에 맞게 안전하게 중단했다. 같은 지연에서 topics에 새 이름이 등록된 순간에 한 번 실패시키는 주입은 실제 표 저장을 겨냥했다. 직전 디스크의 의도true, 예외 직전 메모리의 표 존재/의도삭제, 롤백 뒤 표없음/의도true를 나눠 단언한다.

대상 시험의 기존 네 단언은 유지하고 주입1회/실제토픽생성1회를 추가했다. `/bind`와 `/new` 롤백을 각각 제거한 사본은 기존 단언에서 실패했다. 대기 시간이나 skip을 늘리지 않았다. 실제 Telegram·사용자 설정은 사용하지 않았다.

원래 전체 실패의 로그에는 save 단계 trace가 없어 그때 같은 순서였다는 확정은 불가능하다. 통제 재현과 수정 검출력을 전체 실패를 지우거나 재발 방지를 보증하는 근거로 사용하지 않는다. 무효 전체 세트·비재현 첫 진단·통제 RED/GREEN·변이 원문을 모두 보존한다. 근거는 P004 T05의 telegram-diagnostic-analysis와 telegram-validation 원문, test/telegram-flow.test.ts다.
