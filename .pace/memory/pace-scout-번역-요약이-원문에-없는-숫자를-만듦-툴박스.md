---
name: pace-scout 번역 요약이 원문에 없는 숫자를 만듦(툴박스)
description: "영어 출처 주장을 한국어로 요약하며 October→10월, one percent→1%로 바꿔 검사 ①이 실패"
type: idea
created: 2026-11-16
updated: 2026-11-16
---

원인 레이어: 툴박스(extract-claims 규칙 1이 schema에 없는 note 칸을 가리키고, 규칙 2가 text 칸 번역을 말하지 않음). 주제 입력 첫 verify에서 원문에 없는 수치로 실패했다. 수정: 규칙 1의 note 언급 제거, 규칙 2에 '번역할 때 원문에 숫자로 없던 숫자를 만들지 않는다' 예시. 다음 영어 출처 실행에서 확인.
