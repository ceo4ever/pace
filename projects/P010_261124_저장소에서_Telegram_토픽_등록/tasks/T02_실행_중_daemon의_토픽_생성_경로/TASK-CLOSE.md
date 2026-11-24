# T02 실행 중 daemon의 토픽 생성 경로 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

격리한 daemon과 가짜 Bot API에서 Git 하위 폴더의 로컬 add로 등록·설정·토픽을 연결했고 첫 조회가 저장소 표식에 답했다. 응답 유실, 결속 파일 교체 실패와 재기동 뒤 재요청에서 중복 토픽 생성을 차단했다. General은 사용자 결정에 따라 이미 노출된 유효한 이름 하나만 받는다. 실제 포럼의 첫 시험에서 봇의 토픽 관리 권한이 부족했다. 권한을 반영한 재시험에서는 수동 결속과 실제 첫 조회가 성공했다. 마지막 시험에서는 시험 프로세스에 IPv4 우선 옵션을 적용해 한 번의 CLI 자동 생성과 같은 토픽의 첫 조회를 확인했다. P-5 통과다. [첫 시험](evidence/live-forum-attempt.md) · [권한 반영 후 재시험](evidence/live-forum-retry.md) · [최종 자동 생성 시험](evidence/live-forum-final.md).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 가짜 포럼에서 Git 하위 폴더·설정과 토픽 결과·정지·어댑터 불가·포럼 변경 검증. 재요청에서 포럼 대조가 실패해도 기존 결속을 표시하고 생성 호출과 상태 변경 없이 종료 |
| T-2 | 통과 | 동시 요청 합류, Gateway·Bot API 응답 유실, 원자적 저장 실패, 재기동과 수동 결속 검증 |
| T-3 | 통과 | 유효한 설정 이름만 결속. 경로나 여러 인자에는 사용법만 안내하고 조회·설정·등록부·토픽·의도 무변경. 인증·읽기 전용·쓰기 승인도 확인 |
| T-4 | 통과 | 모의 시험과 실제 포럼에서 자동 생성과 읽기 전용 첫 조회를 확인했다. 재요청은 기존 결속을 표시했고 실제 토픽 한 개와 ID 일치, 결과·로그·첫 응답 비노출을 확인했다. 실제 통과 조건은 IPv4 우선 시험 프로세스다 |

## 단위 테스트

T02 집중 검사와 메시지 제어·서식·설치 마법사 회귀 83건이 모두 통과했다. 첫 전체 검사에서는 새 도움말 행을 반영하지 않은 F-8 단언에서 실패해 두 명령 형태와 기존 HTML·평문 서식을 함께 대조했다. 두 번째 전체 검사의 마법사 S-19d는 포트 점유로 실패했다. 포트 경합을 줄이기 위해 동시성 4로 재실행했고, 마지막 승인 확인·오류 분기 보강을 포함한 현재 공통 코드에서도 1,055건 중 1,038건 통과, 17건 건너뜀, 실패 0건이었다. [모의 검사 기록](evidence/mock-check.txt).

이름 전용 정책을 반영한 뒤 전체 검사 1,054건 중 1,037건 통과, 17건 건너뜀, 실패 0건이었다. 제거한 경로 등록 함수 전용 시험 1건은 해당 기능과 함께 제거했다. [정책 독립 tester](evidence/tester-policy-final.md)는 격리 실행 80건을 통과했다. 이후 입력 길이·줄바꿈·문자 경계 보강과 기존 설정 파일의 무변경을 집중 검사에서 다시 확인했다.


[기존 결속 표시 회귀](evidence/binding-report-regression.md)는 수정 전 미결속 표시를 검출했다. 수정 뒤에는 기존 결속과 포럼 대조 실패를 함께 표시했고 결속과 생성 횟수는 그대로였다. 표시 보완 뒤 전체 검사 1,054건 중 1,037건 통과, 17건 건너뜀, 실패 0건이었다. 이후 독립 tester 의견을 반영해, 확인된 포럼의 일반 재요청과 등록 경로 이동 뒤 재요청도 기존 결속을 표시하도록 고쳤다. 마지막 집중 검사 15건과 타입·비밀 검사를 통과했다. 전체 재실행에서는 마법사 테스트 한 건의 임시 인스턴스 포트가 점유돼 실패했다(1,036건 통과, 17건 건너뜀). 같은 테스트는 단독 재실행에서 통과했다. 마감 하네스가 전체 회귀를 다시 실행한다.

## E2E

[daemon-topics.test.ts](../../../../test/daemon-topics.test.ts)는 실제 CLI와 loopback Gateway, 가짜 Bot API와 임시 PACE_HOME으로 실행했다. 사용자 승인 뒤 main은 실제 포럼 시험을 세 차례 수행했다. [첫 시험](evidence/live-forum-attempt.md) · [권한 반영 후 재시험](evidence/live-forum-retry.md) · [최종 자동 생성 시험](evidence/live-forum-final.md).

## 리뷰

사전 검토는 두 차수의 TASK 해시와 원문을 [사전 검토 기록](PRE-REVIEW.json)에 보존했다. [사전 계약 대조](evidence/pre-review-stage2.json)와 [사후 계약 대조](evidence/reviewer-common-stage2.json)는 blocking 0이었다. [첫 독립 tester](evidence/tester-common.md)의 첫 조회 목적지와 토픽 ID 비노출 지적을 반영했다. [독립 재검증](evidence/tester-common-r2.md)에서 69건과 T-1~T-4 공통 범위가 모두 통과했다. [마지막 계약 대조](evidence/reviewer-common-r2-stage2.json)에서는 포럼 미확인, General의 응답·승인 목적 토픽, Gateway의 Telegram 확정 거부 시험 보강 뒤 blocking 0이었다. 교본: typescript/INDEX와 verification/INDEX의 실패 상태 비노출, 대역과 실제 경계, 원자적 상태 롤백을 적용했다.

사용자 결정 뒤 [새 TASK 해시](PRE-REVIEW.json)와 [정책 사전 계약 검토](evidence/pre-review-policy-stage2.json)를 남겼다. [정책 사후 검토](evidence/reviewer-policy-stage2.json)는 blocking 0이었다. 검토자가 요청한 경계 입력과 시험 명칭을 반영했다. 기존 정상 시나리오는 설정에서 이름을 미리 노출한 뒤 실행하도록 바꾸고 토픽 생성·실패·복구·권한 단언은 유지했다.


실측에서 발견한 표시 문제는 [독립 목표 대조](evidence/reviewer-binding-stage1.md)와 [계약 검토](evidence/reviewer-binding-stage2.json)에서 blocking 0이었다. [독립 tester](evidence/tester-binding.md)는 집중 검사 15건을 통과했고, 확인된 포럼의 기존 결속도 신규 결속과 구분하자는 의견을 반영했다.

## 남긴 것

main에서 설치와 실제 저장소 등록을 인수한다. 시험 Mac의 기본 Node 연결은 시간 초과와 IPv6 도달 불가가 관측됐다. IPv4 우선 옵션을 격리 시험 프로세스에만 적용한 조건과 운영 연결 불안정을 인계한다. 이전 결과 불명의 원인은 확인할 수 없었다.
