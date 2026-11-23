# T02 verify 결정 단계와 결정 주체 기록

- 프로젝트: [P008](../../PROJECT.md) · 백로그: [BR02](../../../../backlogs/BL261123_02_검토_반복_실패_결정_주체_구분/BR02_verify_결정_단계와_결정_주체_기록.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

진단 뒤에도 남은 실패에서 PM과 사용자 결정의 주체를 구분해 감사·사후 보고할 수 있게 한다. 기존 단계 차단·원장 연속성과 사용자만 가능한 waiver는 보존한다(P-2).

## 재료

PROJECT P-2·BR02 전체, T01 TASK-CLOSE, src/agent/review-log.ts·verify-cli.ts, docs/AGENT-CALL.md·WORK-PROCESS.md·SECURITY.md, test/agent-review-log.test.ts·pre-review.test.ts. 기존 원장의 ask_user는 진단 뒤 결정 필요 상태이며 주체 필드는 없다.

## 증명 범위

- 판정 주체: CLI 계약·원장 계산·안전한 파일 검증은 자동 테스트와 독립 tester, 안내의 분류 일치는 독립 reviewer. 실제 사람 승인 원문의 진위는 PM이 확인하며 도구가 대신 결정하지 않는다.
- 포함: 새 decision에 pm/user 필수·보존, 옛 주체 없는 결정은 unknown 보고·기존 단계 계산 유지, 두 주체의 빈파일·대상자체 거부, 결정 뒤 전체 검토·연속 실패 집계·종료0 신호/종료16 차단, waiver.by user 고정.
- 범위 밖: 지적 성격 자동 분류·실제 사용자 승인 부여·설치본 변경은 하지 않는다. 분류 기준 정본 절차와 통합 행동 실측은 T03으로 넘긴다. 필수 안전 기준을 PM에게 넘기거나 waiver를 확장하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 단계 이름 ask_user와 종료 계약은 호환 유지하고, diagnose와 ask_user 안내가 매 수정 전 영향 분류·PM 재검증/사후보고와 사용자 사전 결정을 가리킨다. |
| T-2 | review-note --decision --by pm 또는 user만 새 기록으로 허용하고 근거 파일·대상 자체 거부를 두 주체에 똑같이 적용한다. by 생략·잘못된 값은 거부한다. |
| T-3 | 옛 주체 없는 decision은 unknown으로 보고하되 기존처럼 연속을 초기화하며, 새 두 주체 결정 뒤 전체 검토(rereview_of null)·fail 집계가 보존된다. PRE-REVIEW waiver는 여전히 user만 허용한다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | fail3·진단뒤fail | verify 호출·기록없이 재호출 | 종료0 즉시 단계·분류안내, 다음16·실행기0회 | agent-review-log.test.ts |
| S-2 | unit | T-2 | 결정 단계와 pm/user/생략/잘못된주체·빈/공백/자기파일 | review-note 호출 | 적법 두 주체만 원장저장, 거부때 원장불변 | agent-review-log.test.ts |
| S-3 | unit | T-3 | 같은 실패열·옛결정/pm/user | 읽기·단계계산·재개 | 옛unknown·새실주체 보고, normal·전체검토·집계일치 | agent-review-log.test.ts |
| S-4 | unit | T-3 | PRE-REVIEW fail+waiver | by pm/user 검사 | pm 거부·user 기존통과 | pre-review.test.ts |
| S-5 | check | T-1~T-3 | 실제 변경 | 전체검사·독립대조·격리 결함주입 | npm run check 통과, actor 필수검사 제거시 새 시험 실패 | evidence/ |

## 접근

ask_user 이름은 공개 출력 호환을 위해 유지하되 결정 주체를 뜻하지 않는 역사적 단계 이름임을 설명한다. DecisionEntry.by는 옛 원장 호환을 위해 읽기 타입에서 optional, 새 CLI에서는 pm/user 필수다. StageInfo.last_decision_by는 이전 결정이 없으면 null, 옛 결정이면 unknown, 새 결정이면 pm/user로 읽고 verify 출력에서도 보고한다. 원장 옛 파일을 다시 쓰거나 user로 추정하지 않는다. 보안·실행기 경계는 그대로 두고 지적 내용 자동 분류는 만들지 않는다. 변경 정본은 review-log.ts·verify-cli.ts·CLI 도움말·AGENT-CALL·WORK-PROCESS와 관련 시험. 교본 typescript·verification 색인과 대조하여 상태 누출·거부 뒤 원장변경·대역과 실제경로 차이를 검증한다. 결함 주입은 작업본을 손대지 않는 임시 복사본에서 actor 필수검사와 기록을 무력화해 시험 검출력을 확인한다.
