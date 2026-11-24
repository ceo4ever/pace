# T01 전역 등록부 기준 daemon 워크스페이스 추가 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

등록부 ID·경로를 기준으로 승인된 저장소를 추가하고, 이동한 옛 디렉터리에 조회가 들어가지 않는 것을 임시 daemon과 가짜 Telegram에서 확인했다. 동일 등록 ID를 재승인한 뒤 기존 토픽에서 새 디렉터리의 표식에 답했다. T01 계약은 달성했다. [tester의 1단계 관측](evidence/tester-stage1.json), [독립 tester 판정](evidence/tester-orca-r3.md), [독립 구현 검토](evidence/reviewer-r3-stage2.json). 실제 포럼을 바꾸는 시험과 Gateway의 토픽 생성은 T02에 남는다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1·S-5 승인 전 무변경, Git 최상위 선택, 확인 화면과 CLI 도움말 |
| T-2 | 통과 | S-1·S-2 신규와 활성 등록, 멱등, 충돌·후보·정의 거부 |
| T-3 | 통과 | S-3 미인증·Origin 차단, 포트 소유권, 병렬 저장, 실패와 설정·결속 상태 구분 |
| T-4 | 통과 | S-4 이전 후 접수·파일 읽기·대기 작업 차단, 재승인 후 기존 토픽 조회와 구형 설정 호환 |

## 단위 테스트

`PACE_SKIP_BROWSER_E2E=1 npm run check`에서 1,049건 중 1,032건 통과, 17건 건너뜀, 실패 0건이었다. Orca 안에서 브라우저 회귀 시험을 제외하는 저장소 규칙을 적용했다. 독립 tester가 직접 실행한 daemon·Telegram 집중 검사 63건은 모두 통과했다. [전체 검사 출력](evidence/check.txt), [독립 실행](evidence/tester-orca-r3.md).

## E2E

미등록 Git 저장소의 하위 폴더에서 CLI를 실행해 승인 전후의 전역 등록부·AGENT 정의·daemon 설정을 대조했다. 임시 포트와 가짜 Bot API에서 인증과 병렬 쓰기, 옛 디렉터리가 살아 있는 상태의 이동, 기동 제외, 같은 결속에서 새 표식 응답을 확인했다. [실행 결과](evidence/check.txt), [통합 시험](../../../../test/daemon-workspace.test.ts).

## 리뷰

- 사전 1·2단계 pass, blocking 0. 구현 검토의 최신 계약 대조와 원자적 교체 시험 독립 대조에서 blocking 0. [지적 처리와 원문](evidence/disposition.md).
- 독립 tester의 [첫 실행](evidence/tester-stage2.json)은 샌드박스의 loopback `EPERM`으로 포트 시험이 실패했다. [두 번째 실행기](evidence/tester-stage2-rerun.json)는 명령 승인 제약으로 미실행이었다. Orca 로컬 tester의 초기 두 차수에서 확인한 시험 공백을 보강한 뒤 [최종 실행](evidence/tester-orca-r3.md)이 통과했다.
- 교본: typescript/INDEX와 verification/INDEX. 환경 경계, 입력 검증, 실패 직후 상태, 기존 테스트 보존, 임시 저장소와 가짜 API를 대조했다.

## 남긴 것

T02에서 Gateway와 General의 토픽 생성·결속을 한 경로로 연결하고, 응답 유실·중복 호출에서 생성 의도를 유지한다. 경로 포함 `/new` 정책과 실제 포럼 시험은 승인된 결정이 필요하다. 실제 업무의 읽기 전용 기본값은 파일 변경 권한과 별도로 확인한다.
