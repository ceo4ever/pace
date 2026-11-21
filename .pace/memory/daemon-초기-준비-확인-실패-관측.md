---
name: daemon 초기 준비 확인 실패 관측
description: Windows daemon 초기 소유자 확인 실패가 재발하면 원문과 시점을 확보해 원인을 구분한다
type: issue
created: 2026-11-21
updated: 2026-11-21
---

P005 T03에서 install 기동 후 검증 스크립트의 즉시 owner 확인이 실패했지만 실제 daemon은 정상 기동했다. 정확 predicate·초기 원문 미보존으로 제품 결함은 확정하지 않는다. 소스상 포트 선행 준비와의 경합은 추정이다. T03 initial-owner-verification-gap 및 execution-notes를 참고해 재발·병합 후 인수 시 CLI 종료/lock/status/포트 준비 시점을 원문으로 대조한다.
