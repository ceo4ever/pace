# BR05 workerSpec 호출 지시와 golden 시험

- 상태: 완료
- 백로그: [BL261125_01_문제_해결_전문가_에이전트](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

[BR04](BR04_호출_절차_연결.md) 호출 절차 가운데 **코드가 내는 지시와 검토 반환 형식**을 만든다. 워크트리 PM이 시작 지시에서 문제 해결 전문가를 부를 조건과 `upper_review` 인계를 받는다. reviewer·tester 반환에서 겉만 고친 수정을 표시할 수 있게 한다([백로그 목표](BACKLOG.md#목표), 고른 길 3·4). 허브 결정(2026-11-26 17:40)으로 BR04에서 나눴다. 민감 경로 코드·시험만 다루고 스킬 문서는 BR04가 맡는다. 선행은 BR02(신호 출력 이름)와 BR06(구성원 이름·호출 수단)의 병합이다.

## 범위

- **`workerSpec` 호출 지시**(`src/project/harness.ts:683` — 민감 경로, `docs/SECURITY.md:20` start): 워크트리 PM 시작 지시에 두 가지를 넣는다.
  - BR04와 같은 분기를 넣는다(착수 전 검토 1 반영(허브 결정 2026-11-26 17:43)). 예산 안 조기 신호(BR02 신호 2~4)가 나면 BR06이 정한 호출 수단으로 `pace-troubleshooter`를 부르는 조건과 방법을 넣는다. 예산 소진 출력(`budget_exhausted`·종료 16)을 받으면 부르지 않는다. 대신 소진 보고·지적·재현 근거를 허브에 인계한다 — 허브가 공동 시도에서 부른다. 예산 안 조기 호출의 반환은 프로젝트 기록(`pace project log`, BR03 호출 기록)으로만 남기고 `review-note --diagnosis`로 남기지 않는다(허브 결정 Q2 — 이유는 BR04).
  - `upper_review`를 받으면 — 발동 `verify`의 `escalation.stage: upper_review`(종료 0, 이후 같은 단위 호출은 종료 16)와 외부 경로 `review-record`의 `followup.action: upper_review`(종료 0, `src/agent/review-hand.ts:243`) 모두 같은 인계다 — 수정을 멈추고 허브에 실패 원문·구조 진단 기록·바뀐 줄을 넘긴다. 직접 호출·결정하지 않는다.
  - 지시문은 절차 상세를 반복하지 않고 BR04가 쓰는 `skills/pace-project-dev/references/reviewer.md` 절(지금 `#태스크와-백로그의-수정-확인과-상위-검토`)을 가리킨다. BR04가 그 절 이름을 바꾸면 이 golden도 같은 태스크에서 맞춘다.
- **golden 시험**: `test/project-role.test.ts`(지금 `:51` no-role golden, `test/fixtures/worker-spec-before-role.txt`)를 갱신하고 역할 지정 경로의 지시도 확인한다.
- **신호 4 반환 항목 — BL04 고정 스키마 변경 필요**: reviewer·tester 반환에 "같은 부류 재발 / 겉만 고침 의심" 항목을 두려면 BL261124_04 BR03이 만든 구조화 검토 스키마(`src/agent/structured-review.ts:50-61` `FindingInput`)를 바꿔야 한다. 이 스키마는 완료 백로그의 고정 형식이다. 설계에서 정한다.
  - 기존 필드로 표현하기: 예를 들어 `category` 값. 이 경우 스키마는 바뀌지 않는다. 다만 현재 판정 계산이 `category`를 읽으므로(`src/agent/structured-review.ts:141` `assessFinding` — 질문 밖 범주·인계 판정) 기존 범주 값의 판정이 그대로 보존되는 것이 이 선택의 조건이다.
  - 선택 필드를 추가하기: 옛 판독기와 원장 기록 호환을 확인해야 한다.
  - 어느 쪽이든 기존 판정 계산(`effective`·`reason`)과 원장 기록을 바꾸지 않음을 시험으로 확인한다.
- **변경 범위**: `src/project/harness.ts`(`workerSpec`만), `src/agent/structured-review.ts`(필요하면), `test/**`만 바꾼다. 스킬·docs 문서와 필수 역할 정본은 바꾸지 않는다(BR04).
- **보안**: `harness.ts`는 민감 경로이므로 설계에서 SECURITY 체크리스트를 적용한다. `workerSpec` 밖의 start·finish·merge 동작은 바꾸지 않는다.
- **경계**: 대기 백로그 BL261118_02가 `src/project/harness.ts`·`src/cli.ts`·`src/agent/contract.ts`를 고친다. 같은 파일 수정이므로 착수 시점이 겹치면 직렬화한다(BACKLOG 관련·순서).
- **제외**: 스킬 문서의 호출 절차·eval(BR04), 신호 생성(BR02), 호출 기록 형식(BR03), 구성원 정의·호출 수단(BR06), 등급 코드(BR01), `upper_review` 판정·차단(BL261124_04 BR09 — 완료).

## 태스크 설계 때 확정할 항목

- BL261118_02 인계(S5): 같은 파일 직렬화에 더해, 전문가의 자문 반환과 이후 독립 재검증 증거가 그 백로그의 관문(main 직접 프로젝트의 별도 세션 검증)에서 어떻게 쓰이는지 뒤에 착수하는 쪽이 정한다. 먼저 병합된 시작 지시·호출 기록 계약을 기준으로 삼는다.

출처: upper_review 1 — 허브 결정 2026-11-26 17:54(검토 표면을 줄이려고 인수 세부를 태스크 설계로 옮긴다).

## 완료 기준

- `workerSpec` 출력에서 조기 신호 호출 지시와 소진 시 인계 지시(직접 호출 없음)가 구별돼 있음을 golden 시험으로 확인한다(소진 시 PM 인계·허브 호출 — 같은 기회의 중복 호출 0, 이어지는 기회마다 1회는 정상이며 지시가 이를 막지 않는다). `workerSpec` 출력에 `upper_review` 인계 지시가 `verify`·`review-record` 두 출력을 모두 가리키며 들어 있고, 조기 호출 반환을 원장 진단으로 남기지 말라는 지시가 있음을 golden 시험으로 확인한다. 기존 golden의 나머지 문장은 바뀌지 않는다.
- 신호 4 반환 항목이 고른 방식으로 구조화 검토에 실리고, 기존 판정 계산·원장 기록이 같은 입력에서 같음을 시험으로 확인한다.
- `harness.ts`의 `workerSpec` 밖 함수와 start·finish·merge 경로가 바뀌지 않음을 diff와 기존 시험으로 확인한다. 선언된 전체 검사가 통과한다.
- 이 BR은 필수 역할 요건 행을 등록하지 않는다. BR04가 호출 절차 요건을 판정할 때 이 BR의 시험을 근거로 쓴다.
