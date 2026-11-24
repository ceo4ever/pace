---
name: 역할-지문-crlf-호스트-대조
description: Windows CRLF checkout에서 역할 지문 정규화와 정상 원본 보류 여부를 실제 호스트로 확인한다
type: issue
created: 2026-11-24
updated: 2026-11-24
---

P009 T03은 LF 정규화 SHA 독립 기대값 시험과 시작 지시의 정규화 문구를 검증했지만 실제 Windows 호스트는 관측하지 않았다. 작업자가 원시 shasum을 쓰면 정상 원본도 보류할 수 있다. T04/T08은 관측 가능한 환경의 범위를 명시하고 기존 호스트 실사용 검증에서 Windows Claude·Codex 적재·지문 확인 결과를 추가한다. 필요하면 portable 검증 명령 예시를 지시문에 넣는 개선을 검토한다.
