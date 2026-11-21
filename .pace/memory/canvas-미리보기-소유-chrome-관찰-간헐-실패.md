---
name: Canvas 미리보기 소유 Chrome 관찰 간헐 실패
description: intent-preview 실제 렌더 시험이 Windows에서 간헐 'owned Chrome not observed' — 감시자 관찰 방식을 보강한다
type: issue
created: 2026-11-21
updated: 2026-11-21
---

test/intent-preview.test.ts:463, main 단독 재현 4회 중 2회 실패(2026-11-20). 실패 때도 렌더 성공(childClose=0, png 생성, 프로필 정리) — 회수 결함 아닌 관찰 누락. Chrome 157(11-11 갱신)은 P004 연속 통과(11-19) 이전부터라 원인 아님. [추정] 감시 루프가 프로세스마다 Get-CimInstance를 재귀 호출해 한 바퀴가 길어 GO 뒤 약 2초 사는 Chrome을 놓침. 안: Win32_Process 한 번 조회로 트리 구성, 또는 Chrome 기동 뒤 대기 지점. P006 T01 전체 검사에서 기존 실패로 분리(캡틴 결정). 관련 canvas-추출-도구-chrome-프로필-잔여
