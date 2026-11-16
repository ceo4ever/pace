# BR02 Telegram 연결

- 상태: 대기
- 백로그: [BL261116_02_PACE_daemon_사용_준비](BACKLOG.md)


## 목적

메신저로 daemon에 요청하고 결과를 받는 통로를 연결한다.

## 범위

- 봇 토큰은 BotFather에서 받아 설치 마법사의 숨김 입력 또는 `pace daemon telegram init --chat-id <id>`(토큰은 표준 입력 첫 줄)로만 넣는다 — 대화·문서·커밋·로그에 토큰 원문을 남기지 않는다.
- chat id·허용 사용자(`allowedUsers`)를 정하고, 허용 밖 사용자 요청이 거절되는지 본다.
- 제외: 다른 채널.

## 완료 기준

- 허용 사용자가 보낸 메시지에 daemon이 응답하고, 허용 밖 사용자는 거절된다.
- 상태·로그(`pace daemon logs`)에 토큰 원문이 없다(비밀 제거 확인).
