# T05 workerSpec 호출 지시와 golden 시험

- 프로젝트: [P014](../../PROJECT.md) · 브리프: [BR05](../../../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BR05_workerSpec_호출_지시와_golden_시험.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

워크트리 PM이 시작 지시에서 조기 호출과 허브 인계의 경계 및 원장 처리를 한 번에 확인하게 한다. reviewer·tester가 반복된 부류와 겉만 고친 흔적을 반환에 표시할 수 있도록 기존 구조화 판정 형식을 호환 방식으로 보강한다.

## 재료

- BR05와 P014 P-8·P-9·P-10·P-13. T02의 `test_failures`, `recurring_area`, `superficial_fix`, 일반 산출물의 `review_failures`. T06 원본과 `docs/TEAM.md#문제-해결자-호출과-실제-적용`.
- `src/project/harness.ts`의 `workerSpec`, `src/agent/structured-review.ts`의 FindingInput·판정, 테스트의 role/no-role 스냅숏. `docs/SECURITY.md`의 시작 경로 체크리스트.
- BL261118_02는 대기 상태다. `src/project/harness.ts` 공통 작업은 직렬화하며 다음 착수 담당이 이 태스크에서 보존한 시작 지시와 T04 호출/재검증 기록을 재사용한다. [P014 경계](../../PROJECT.md#설계)

## 증명 범위

- 판정 주체: golden과 구조화 판정·원장 검사, 민감 경로 diff 검토, 독립 tester와 교차 reviewer.
- 포함: 역할 유무의 `workerSpec` 시작 지시, 조기·예산 소진·두 상위 검토 출력, 구조화 반환의 선택 표시, 기존 판정과 기록 호환.
- 범위 밖: 신호 산출과 문턱, 실제 전문가 호출 실행, 타 역할의 매핑, start/finish/merge의 다른 로직, 절차 설명과 eval(T04), 새 요건 행.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 역할 유무의 시작 지시가 예산 안 조기 신호에 반응할 PM·호출 수단·호출 1회·프로젝트 반환 기록을 명시한다. 예산 소진(`budget_exhausted`, 종료 16)은 증거와 허브 공동 시도 인계이며 같은 기회에 워크트리 호출은 0이다. 별개 다음 기회는 허브 호출을 막지 않는다. (P-8·P-9) |
| T-2 | `verify`의 `escalation.stage: upper_review`와 `review-record`의 `followup.action: upper_review`가 같은 중단·허브 인계로 쓰인다. 조기 반환을 원장의 `review-note --diagnosis`로 기록하지 않으며 기존 절차 절을 가리킨다. (P-9·P-10) |
| T-3 | reviewer·tester의 구조화 `pace-review` 지적에 `recurrence`를 선택 표지로 쓸 수 있다. `same_class`는 같은 부류, `superficial_fix`는 기존 수정 뒤 남은 같은 부류의 겉만 고침 의심이다. 두 값은 증거 보조이며 판정·등급·사유·인계·예산·원장 회차를 바꾸지 않는다. 생략 또는 해석할 수 없는 값에는 기존 판독·판정을 유지한다. (P-8·P-13) |
| T-4 | 기존 golden 문장을 그대로 두고 승인한 `workerSpec` 외에 start·finish·merge 및 민감 경로 실행 설정을 바꾸지 않는다. 이전 반환과 같은 시험의 회귀 및 선언 검사·보안 검사가 통과한다. (P-13) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1·T-2·T-4 | 역할 없음 및 실제 역할 인자 | 시작 명령의 golden과 역할 접두 뒤 동일 본문 비교 | 세 분기·두 출력·진단 금지·양쪽 호출 주체와 근거, 기존 본문 항목 유지 | `project-role`과 golden |
| S-2 | unit·e2e | T-3 | 기존 형식 v1·v2, 빈/유효/미지 값과 blocking, should_fix·note 등급 | 기존·신규 반환을 같은 판독과 `verify` 경로에 제공 | 지원된 표시만 판정 증거에 남고 적용 등급·사유·판정·회차 동일 | 구조화 검토 시험과 저장 원장 대조 |
| S-3 | check | T-4 | 승인 경로와 P013 선행 시험 및 source diff | 정본 경계, 기존 golden 나머지 원문, 선언 검사, 보안 스캔 | 인정 범위 안 파일만 수정·코드 경로 불변, 검사 실패 0 | `git diff`·`npm run check`·`node scripts/secret-scan.ts` |

## 접근

- `workerSpec`에서 상위 검토 인계, 일반 소진 인계, 예산 안 조기 분기를 간결한 문자열로 넣는다. `docs/TEAM.md`의 기존 호출 수단과 `skills/pace-project-dev/references/reviewer.md`의 수정 확인·상위 검토 절을 가리킨다. 시작 실행 또는 모델 선택 코드는 변경하지 않는다.
- `category`는 기존 판정 계산에 참여하므로 재사용하지 않는다. 기존 판독기가 추가 키를 무시하는 성질을 이용해 선택 `recurrence`를 둔다. 알려진 값만 판정 증거 객체에 보존하며 입력 문법의 버전, 판정·원장 계산 및 조기 신호 산출은 유지한다.
- `test/project-role.test.ts`와 `test/fixtures/worker-spec-before-role.txt`의 양쪽 시작 골든, `test/agent-structured-review.test.ts`의 판정·기록 테스트를 보강한다. 변경 본문은 `src/project/harness.ts`의 `workerSpec`와 `src/agent/structured-review.ts`의 선택 표지에 한정한다.
