---
name: pace-scout 본문 추출 잡음과 카드 범위
description: "fetch 본문에 사이트 메뉴·관련 기사가 섞여 인용 대조가 본문 밖 글자도 통과시키고, 카드가 근거 출처의 모든 주장을 펼친다"
type: idea
created: 2026-11-16
updated: 2026-11-16
---

원인 레이어: 툴박스(명령 fetch 추출)·카드 렌더. 지금 고치지 않음 — 본문 영역 판별은 정규식 추출 한계, 카드 주장 필터는 주장에 신호 연결 칸이 없어 schema 변경이 필요. 반복되면 schema에 claims↔signals 연결을 더한다.
