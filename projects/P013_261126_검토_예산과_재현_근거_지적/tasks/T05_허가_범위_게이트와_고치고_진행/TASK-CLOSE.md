# T05 허가 범위 게이트와 고치고 진행 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

사전 검토 통과의 대상·원문과 Git 허가 범위를 연결한다. check·done은 작업본과 index, 커밋 훅은 Git이 넘긴 실제 후보 index를 확인한다. 보호 위치를 건드리지 않고 원래 지적 줄 안에서 한 교체는 원래·현재 지문과 diff를 남기며 다음 구현 후 검토로 이어진다. [구현 변경](evidence/impl-diff.patch)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | Git 기준·작업 파일 모드, 최신 PRE·원장·별도 형식 표지·원문의 허가와 지문을 대조한다. |
| T-2 | 통과 | 작업본·index 양방향, 실제 일반 커밋·경로 지정 커밋·`-a`, 중간 커밋과 비조상 기준, 사용자 훅 보존을 확인했다. |
| T-3 | 통과 | 줄 번호가 밀리는 다중 교체와 원래·현재 지문, done의 diff와 구현 후 검토의 지문·diff 입력을 확인했다. |
| T-4 | 통과 | 해시·위치·보호 줄, 파일 모드·링크·UTF-8 오류를 멈춘다. 옛 PRE와 사용자의 A-3 예외를 유지하며 앞선 허가 범위를 계속 확인한다. |
| T-5 | 통과 | 부모 구현에서 신설 시험 3건 실패, 최신 집중·호환과 선언 검사 통과. 독립 tester, 보안 우선 reviewer, BR04의 기록 연결을 확인했다. |

## 단위 테스트

- 집중 7건과 원장·사전 검토·스킬·역할 호환 134건을 통과했다. [집중](evidence/S-2-focused.log) [호환](evidence/compatibility.log)
- `PACE_SKIP_BROWSER_E2E=1 npm run check`에서 1,466건 중 1,449건 통과, 실패 0건, 건너뜀 17건을 확인했다.
- 초기 전체 실행의 태스크 계획 행 시험은 단독 재현과 최종 전체에서 통과했다. [초기 실패](evidence/full-check-task-plan-initial.log) [단독 재검증](evidence/full-check-task-plan-retry.log)
- 비밀 검사와 브레인 lint가 통과했다.

## E2E

- 부모 139b0b5에서는 범위 밖 변경·변조 입력·잘못된 허가가 실패하지 않았고, 새 게이트가 이를 거부한다. 실제 커밋 훅은 경로 지정 커밋의 임시 index를 읽는다. [이전 구현](evidence/S-2-baseline.log) [최신](evidence/S-2-focused.log)
- 허가 파일의 모드와 링크 및 조상이 아닌 Git 기준을 독립 임시 저장소에서 추가 대조했다. [재현](evidence/S-2-supplement.txt) [실행](evidence/S-2-supplement.log)

## 리뷰

- 사전 계약의 두 단계가 통과했다. [사전 기록](PRE-REVIEW.json) [계약 대조](evidence/pre-review-stage2.json)
- 보안 reviewer와 독립 tester의 최신 구현 지문은 `9d71ee97a614df8ca9ec487214a2e240c521475b32da68d3c1e620d8bd882b5c`이다. 보안 검토가 찾은 사용자 예외 회귀를 수정했다. tester는 예외를 막거나 이전 탐침 허가를 지우는 변이를 각각 검출했다. [보안 검토](evidence/security-stage2.json) [tester](evidence/tester-final.md) [변이 시험](evidence/tester-mutation.md) [대응](evidence/review-disposition.md)

## 남긴 것

- 순수 삽입·삭제나 원래 위치를 대조할 수 없는 변경은 기존 예산의 범위 재검토로 보낸다. Git 관문은 허가 기록과 후보의 불일치를 찾으며 승인 원문 진위와 검토 독립성은 별도로 확인한다.
- 독립 검증 세션 브리프의 기존 사전 허가 필드를 연결했다. PRE 자동 생성은 T06, 절차 설명 정리는 T08에서 다룬다. [연결 브리프](../../../../backlogs/BL261118_02_허브_PM_main_직접_프로젝트_하네스_정비/BR04_독립_검증_세션_기록_관문.md)
