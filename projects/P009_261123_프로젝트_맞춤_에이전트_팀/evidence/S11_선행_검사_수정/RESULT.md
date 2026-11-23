# S-11 메뉴 승인 재개 검사 선행 수정

사용자 승인: 2026-11-23, P009 T01 변경을 보존하고 기존 S-11 결함을 별도 수정·커밋한다. 승인 검증 우회·약화는 하지 않는다. Telegram S-9g는 별도 허브 PM 소유로 분리했고 이 수정에 포함하지 않는다.

## 문제와 원인

전체 검사와 단독 S-11 검사에서 메뉴 변경의 사용자 승인 뒤에도 screen-mismatch / needs-approval로 멈췄다. 시작 커밋 e4129f5의 사본에서도 같은 시험 1건이 실제 실행되어 실패했다(base-browser-repro.txt).

진단용 사본은 승인 전후 후보의 구조·캡처 기록을 비교했다(browser-approval-diagnostic.json). patch·identity·boxHash·뷰 크기·요소 box·가림 증거·contextSha는 같고 screenshot JPEG 해시와 그 파생 recordHash/candidateHash만 달랐다. 320×240 JPEG 두 장을 직접 확인하니 재캡처 이미지의 콘텐츠가 절반 배율로 그려져 있었다. 캡처 엔진의 DOM 뷰 정보는 두 번 모두 320×240·dpr 1이었다. 정확한 Orca 내부 원인은 미확인이나 테스트가 고정한 CSS 뷰와 래스터 배율이 재호출 사이 어긋난 현상은 확인했다.

## 수정

test/playbook/healer-e2e.test.mjs의 captureStepOn에서 각 캡처 직전에 기존 테스트 조건인 320×240·scale 1을 해당 page에 다시 지정하고 렌더 반영을 기다린다. 같은 화면을 같은 픽셀 조건으로 캡처하려는 테스트 준비 단계 보강이다. healer.mjs·capture-core.mjs와 승인 대상 해시·계정·업무·가림·사용자 승인 검사는 변경하지 않았다.

viewport 재고정 진단 실행에서는 승인 전후 shotSha·recordHash·candidateHash가 모두 일치했고 메뉴 변경의 1차 완료 및 치유 호출 0인 2차 주행이 통과했다(browser-viewport-reset-diagnostic.txt). 기존 변경된 화면/잘못된 승인/계정·업무 불일치 거부 단위 시험은 그대로 유지한다.

## 검증

- RED: 작업본 전체 검사·S-11 단독 실행과 e4129f5 사본에서 같은 menu 재개 실패.
- GREEN 진단: 별도 사본의 동일 menu 시나리오 pass 1/1, 승인 해시 유지.
- 실제 S-11 전체 네 변형: s11-browser-green.txt로 원문 보존한다.
- 독립 변경 검토: REVIEW.json과 review-records에 보존한다.
- 이후 P009 T01 전체 검사를 다시 수행한다. 이전 전체 실패를 이 단독 통과로 덮지 않는다.

## 독립 검토 처리와 범위

작은 diff의 1단계 검토는 REVIEW-final.json에서 pass(blocking 0)였다. 코드만 본 단계의 실제 Orca 결과 미확인은 2단계에 원본 RED/진단/GREEN과 이미지를 전달해 대조한다. 기존 승인 해시를 바꾸는 방식은 채택하지 않았다.

추가한 단위 회귀는 캡처 바이트만 바뀐 상황에서 기존 승인이 needs-approval로 거부되고 검증 콜백 0·파일 불변임을 확인한 뒤, 새 해시의 사용자 승인만 applied가 되는지 검사한다. healer.test.mjs 25건이 모두 통과했다(unit-green.txt). 실제 S-11 네 변형도 pass 1/1, 180초이며 각 2차 주행의 치유 호출은 0이었다(s11-browser-green.txt).

이 커밋은 320×240을 명시적으로 쓰는 시험의 캡처 조건만 안정화한다. 실사용에서 임의 viewport의 래스터가 흔들리는지·원인이 무엇인지는 확인하지 못했다. 사용자 화면 크기를 일률적으로 바꾸는 운영 어댑터 수정은 하지 않고 이슈로 분리한다. 안전한 승인 거부 동작은 그대로다.

2단계 독립 검토 REVIEW-stage2.json: pass(blocking 0), 목표 달성. should_fix의 실행 출처는 PROVENANCE.json에 명령·diff/소스 해시로, 운영 이슈 등록 근거는 FOLLOW-UP.md에 보완했다.
