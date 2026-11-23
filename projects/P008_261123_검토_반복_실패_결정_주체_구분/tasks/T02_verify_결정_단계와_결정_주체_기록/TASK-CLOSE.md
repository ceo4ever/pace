# T02 verify 결정 단계와 결정 주체 기록 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

코드·도구 계약의 T02 목표는 달성했다. [tester 1단계](evidence/tester-stage1.md)는 운영 정본 연결을 미확인으로 남겼고, [같은 tester 2단계](evidence/tester-final.md)와 [같은 Claude reviewer 2단계](evidence/reviewer-stage2.md)가 PROJECT P-2/P-3·BR02/BR03 분리를 대조해 T02 계약은 달성, 운영 절차·통합 효과는 T03으로 판단했다. 프로젝트 전체 완료로 취급하지 않는다. 최종 규칙에 따른 선언 전체 검사도 통과했다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 기존 단계 전이 시험·새 안내 대조, tester-final 및 reviewer-stage2 |
| T-2 | 통과 | pm/user 저장·필수 by·근거 거부 시험, 관련 단위·결함 주입 |
| T-3 | 통과 | legacy unknown과 동일 단계·전체 재검토·집계 시험, waiver pm 거부·user 통과 |

## 단위 테스트

독립 tester 직접 타입 검사와 관련 41건 통과·skip0. [tester 원문](evidence/tester-final.md). PM 관련 원장·게이트 30건 통과는 [단위 원문](evidence/unit.txt). [RED](evidence/red.txt)로 새 계약을 먼저 확인했다.

첫 `npm run check`는 기존 Telegram S-4b 1건 실패로 [보존](evidence/check-attempt1.txt)했다. [Telegram 파일 전체 진단](evidence/telegram-file-diagnostic.txt)은 40건 pass·skip0. [기존 이슈](../../../../.pace/memory/telegram-flow-s-4b-단독-실행-실패.md)와 연결하고 변경 밖 코드·시험은 수정하지 않았다. main 반영 후 새 규칙의 PACE_SKIP_BROWSER_E2E=1 npm run check는 1036건 중1019 pass·기존 skip17·fail0·종료0(157.3초)으로 통과했다. [최종 원문](evidence/check-window2.txt).

## E2E

소유 임시 사본에만 네 결함을 주입했다. 정상본 1건 pass 이후 네 변이는 각각 의도된 assertion 또는 원장 손상 거부로 검출됐다. [요약](evidence/mutation-summary.txt), [정상본](evidence/mutation-baseline.txt), [옛 결정 오귀속](evidence/mutation-legacy-as-user.txt), [옛 결정 거부](evidence/mutation-legacy-rejected.txt), [by 생략 허용](evidence/mutation-missing-by-default.txt), [주체 미저장](evidence/mutation-actor-not-stored.txt). 별도 tester가 소스·시험·스크립트를 그대로 복사해 독립 재실행했다. 진짜 제공자 행동·승인 원문 진위와 통합 CLI 경로는 T03에서 검증한다.

## 리뷰

사전 R1 pass blocking0. 구현 R1 pass blocking0, 같은 세션 2단계 pass blocking0·should_fix0. tester 두 단계 pass. 사전 지적은 잘못된 원장 by의 명시적 손상 거부·추가 결함 주입·decision 외 by 거부·PM 근거 안내로 반영했다. [지적 처리](evidence/disposition.md).

운영 정본 불일치는 T03의 명시적 후속 범위다. 횟수 기반 사용자 강제 상한 제안은 합의 밖이므로 채택하지 않았고 reviewer도 계약 대조 후 note로 낮췄다. 정상/diagnose 상태에서 decision을 강제하거나 PM waiver로 사전 게이트를 넘기지 않는다. 교본: typescript/INDEX·verification/INDEX — 거부 후 상태·구형 호환·대역과 소스 경계·격리 결함 주입을 대조했다. 원문에 자동 부트·git 노출과 직접 실행/자료 대조를 구분했다.

## 남긴 것

T03은 reviewer 정본과 연동 지침을 새 CLI에 맞추고 실제 다른 제공자의 S7 행동, PM 사후보고와 사용자 사전승인(진단 전후), 종료0 즉시 대응·다음16 차단을 소스 CLI로 통합 검증해야 한다. by는 감사 기록이며 사람 원문 진위나 분류를 자동 보증하지 않는다. 기본 전체 검사 불안정 이슈는 유지한다.

선언 전체 검사 2차도 기존 S-11 menu needs-approval/screen-mismatch 1건으로 실패했다([2차 원문](evidence/check-attempt2.txt)). 같은 호스트에서 main 저장소의 별도 전체 검사가 실행 중임을 작업 디렉터리로 확인했다. 동시 실행이 원인이라는 것은 미확인이다. 검사 순서를 조정한 뒤 선언 검사를 재실행하도록 코디네이터에게 문의한다.

선언 전체 검사 3차는 1036건 중 1017 pass·17 skip·2 fail: changed check timeout/parent OS termination 및 surviving ordinary child temporary files 시험이다. [3차 원문](evidence/check-attempt3.txt), [동시 실행 관측](evidence/check-overlap-observation.md). 관련 검사·실행기·helper는 main과 diff가 없고 동시 실행의 인과는 미확인이다. 현재 두 전체 러너는 종료됐으나 다음 검사의 실행 창 조정이 필요해 코디네이터에 문의한다.

main 반영 후 새 규칙의 PACE_SKIP_BROWSER_E2E=1 npm run check는 1036건 중 1018 pass·17 skip·1 fail로 종료했다. 실패는 변경 밖 daemon-store.test.ts:94 offline release 인스턴스 소유 시험의 포트64039 점유다. [반영 뒤 원문](evidence/check-after-main-failed.txt), [시작 관측](evidence/run-window-before.json), [종료 관측](evidence/run-window-after.json), [보존과 반영](evidence/main-integration.md). 시작 러너0·종료 P009 러너1이 관측됐으며 인과는 미확인이다. 환경 플래그가 제외하는 것은 기존 Orca playbook 브라우저 E2E4개이고 나머지 선언 검사를 유지했다. 포트의 다른 프로세스를 강제 종료하지 않았다. 종료 결과와 다음 실행 창을 코디네이터에게 문의한다.

최종 실행 창의 [시작](evidence/run-window2-before.json)·[중간](evidence/run-window2-during.json)·[종료](evidence/run-window2-after.json) 러너 관측은 각각0·P008만1·0이었다. [포트 전](evidence/port64039-before.json)·[포트 후](evidence/port64039-after.json)의64039 LISTEN 관측은없었다. snapshots는 연속감시가 아니며 이전 실패 인과를 확정하지 않는다. 브라우저 동작 미변경이므로 새 규칙이 Orca E2E4개를 제외했고 나머지 타입·전체 회귀는 유지했다. 이전 막힘 기록은 역사적 실패이며 이번 결과로 최종 검사 조건을 충족했다.
