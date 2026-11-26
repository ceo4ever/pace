# T05 workerSpec 호출 지시와 golden 시험 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

시작 지시가 작업자 조기 호출과 예산 소진·상위 검토 인계를 분리한다. 같은 회차의 중복 호출을 막는 기준과 다음 공동 시도의 새 호출 기회를 함께 설명한다. 구조화 출력의 재발 표지를 선택 증거로 보존하며, 기존 판정과 원장 계산을 호환 시험으로 비교했다. T04는 역할별 반환 안내 및 실제 호출·인계의 실증을 인수한다. [최종 패치](evidence/implementation-final.patch) [독립 reviewer](evidence/review-records/R2.json) [독립 tester](evidence/tester-stage2.json)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1. 세 조기 신호, 같은 회차 한 기회·호출 1회, PACE 직접 p, 목적·실패·변경 전달과 프로젝트·호출 원장 기록을 golden에서 확인했다. 종료 16 소진에는 증거 인계·직접 호출 0회·허브 공동 시도마다 한 번이 표시된다. [검증](evidence/tester-stage2.json) |
| T-2 | 통과 | S-1. `verify`와 `review-record`의 두 상위 출력이 동일한 중단과 증거 인계로 이어진다. 상위·소진 우선, 일반 `review_failures` 정본 분기와 조기 원장 진단 금지를 대조했다. [보강](evidence/stage1-disposition.md) |
| T-3 | 통과 | S-2. 두 선택값을 보존하고 미지 값과 생략은 기존 판정을 유지한다. 명시적 v2의 유형·기준·등급·이유·인계·예산·원장과 v1을 대조했다. [최종 검증](evidence/tester-stage2.json) |
| T-4 | 통과 | S-1·S-3. 네 줄 외 기존 golden 바이트 및 `workerSpec` 밖 하네스 바이트를 대조했다. 역할 지정 접두와 동일 본문을 확인하고 전체 검사·보안 스캔을 통과했다. [범위](evidence/scope-proof.json) [전체 검사](evidence/full-check.txt) |

## 단위 테스트

- 선언 검사 두 번 각각 **1524개 중 1507개 통과, 실패 0개, 건너뜀 17개, 종료 0**. 마지막 제품 소스와 문구는 둘째 전체 검사에서 실행했다. 이후 표현을 명확히 한 테스트 입력은 타입 검사와 최종 집중 검사에서 대조했다. [전체 및 집중 검사](evidence/full-check.txt)
- 기존 원장·상위 확인을 포함한 최종 집중 검사 128/128, 독립 명령 5/5. 구현 전 새 세 시험은 실패했다. `node scripts/secret-scan.ts`와 `git diff --check` 통과다. [검출 비교](evidence/red-green.txt) [tester](evidence/tester-stage2.json)

## E2E

- 실제 CLI를 호출하는 기존 role 시험에서 역할 지정·미지정·구판·미등록/안전하지 않은 시작 입력을 검사했다. 정본 변경은 동일 지시의 네 줄과 선택 표지에 한정된다. 독립 `verify` 함수 진입점의 합성 v2 입력은 두 사례의 실제 원장 형식·회차를 대조했다. 실제 문제 해결자 실행은 T04 실측에서 확인한다. [기계 범위](evidence/scope-proof.json) [선언 검사](evidence/full-check.txt)

## 리뷰

- 사전 교차 Claude pass, blocking 0과 정확한 다섯 파일 허가. 직접 호출 금지·인계 자료·다음 기회·기존 기록 금지의 독립 단언을 보강했다. [사전 리뷰](review-records/R1.json) [대응](evidence/pre-review-1-disposition.md)
- 1단계 Claude reviewer와 별도 Codex tester가 정합성과 증거를 확인했다. 상위·소진 우선순위와 동일 회차의 기회 정의를 명시했다. [대응](evidence/stage1-disposition.md)
- 최초 2단계 reviewer는 선언 검사 증거 전 T-4를 unknown으로 두고 v2 검출 보강을 지적했다. 기존 helper의 암묵적 변환을 명시적 v2 기준·영향 입력으로 바꾸고 결과를 제출했다. 최종 SHA-256 `5458700a1f834a33cc03ef901b101a8c6d5acff2c5cd354fa82a47185828db4c`에서 교차 reviewer pass, blocking 0 및 독립 tester 집중 검증 pass다. 전체 검사와 스캔은 PM이 직접 실행했다. [보완](evidence/stage2-disposition.md) [최종 교차 판정](evidence/review-records/R2.json) [최종 tester](evidence/tester-stage2.json)

## 남긴 것

- T04가 reviewer·tester에게 `recurrence` 선택값을 요청하는 안내와 실제 조기·상위 근본 호출 검증을 맡는다. 운영에서 `verify`를 쓰면 선택값과 근거의 안내를 purpose에 제공하는 경로가 필요하다.
- BL261118_02는 대기 상태이고 `src/project/harness.ts` 공통 편집을 직렬화한다. 후속 착수 담당이 이 지시와 T04의 호출·재검증 증거를 인수한다.
