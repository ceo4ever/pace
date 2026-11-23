# T01 TASK 증명 범위와 판정 주체

- 프로젝트: [P008](../../PROJECT.md) · 백로그: [BR01](../../../../backlogs/BL261123_02_검토_반복_실패_결정_주체_구분/BR01_TASK_증명_범위와_판정_주체.md)
- 상태: 완료
- 사전 검토: v1

## 목적

사전 검토가 목적에 필요한 증명과 정당한 판정 주체에 집중하게 한다. 합의한 범위를 넘는 반례를 계속 추가하는 반복을 예방하면서 목적·필수 안전 기준 누락은 막는다(P-1).

## 재료

PROJECT.md P-1, 출처 BR01 전체, templates/project/TASK.md, src/project/pre-review.ts, src/agent/verify.ts, test/pre-review.test.ts, test/agent-verify.test.ts.

## 증명 범위

- 판정 주체: 형식·호환은 자동 테스트, 의미 판정은 다른 제공자 reviewer가 사례별로 독립 판정한다. 사람의 결정이 정답인 사례에서는 승인받은 사람의 원문을 기준으로 정확히 옮겼는지를 판정한다.
- 포함: 새 형식 표지와 증명 범위의 필수 구조, 표지 없는 옛 TASK 호환, 독립 reviewer 다섯 사례의 관측 결과.
- 범위 밖: 설치본·bubble-catch 통과 회차 개선 효과는 병합·설치 뒤 운영 측정으로 넘긴다. 실제 사람의 정답 결정·보안 기준을 자동 검사로 대체하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 새 템플릿의 명시적 형식 표지를 게이트·verify·스킬이 공유한다. 표지 있는 TASK의 절 누락·빈 절·판정 주체 누락을 거부하고 옛 TASK는 유지한다(P-1). |
| T-2 | 새 TASK 의미 판정에 목적 대비 범위 충분성·판정 권한·필수 안전을 포함하고 누락은 blocking 한 건, 충분한 범위를 넓히는 제안은 should_fix로 한정한다. 옛 TASK에는 새 규칙을 강제하지 않는다. |
| T-3 | 다른 제공자가 새 형식의 별도 예제 TASK의 다섯 유형(⑤는 권한·안전을 5a/5b로 분리)을 판정한 원문을 보존한다: 누락 1 blocking, 충분한 범위+확장 제안 should_fix, 부족한 범위 blocking, 사람 원문 충실 전달 pass, 권한 대체/안전 제외 blocking. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 새 표지(검토 기록 유무 무관)와 옛 TASK | 절 누락/주석만 빈 절/주체 빈 값/충족/CRLF/미지원·중복 표지를 검사 | 불완전·미지원 거부, 충족·CRLF·옛 TASK 허용 | pre-review.test.ts |
| S-2 | unit | T-1,T-2 | 옛 TASK·새 TASK | goal/task/재검토 프롬프트 생성 | 새 task만 증명 규칙, 옛 방식 유지 | agent-verify.test.ts |
| S-3 | e2e | T-3 | 동일 TASK의 다섯 변형 | 변형별 별도 폴더에서 소스 CLI verify --kind task로 다른 제공자 최초 검토 호출 | 각 변형의 기대 등급·판정 원문 확인 | evidence/cases/ |
| S-4 | check | T-1,T-2 | 변경한 정본 | tester·reviewer가 정본 독립 대조·전체 검사 | 템플릿·게이트·프롬프트·스킬 경계 일치 | npm run check |

## 접근

형식 줄은 `- TASK 형식: v2`로 둔다. 형식 판독·구조 검사를 pre-review.ts에 공유 함수로 두어 verify.ts와 같은 경계를 쓴다. 기존 사전 검토 v1 이력 검사는 유지한다. HTML 주석만 있는 빈 템플릿은 유효 내용으로 인정하지 않는다. 의미적 충분성·정당한 권한·안전은 독립 reviewer가 판정한다. reviewer.md를 의미 규칙 정본으로 하고 task-steps는 링크한다. 기준 문서는 docs/ARCHITECTURE.md·AGENT-CALL.md·WORK-PROCESS.md·SECURITY.md·TESTING.md. 교본 typescript/INDEX 및 verification/INDEX 대조: 공유 상태 없이 임시 루트, 거부 경로 단언, 테스트 대역과 실제 CLI 경계를 따로 검증한다.

추가 경계: 표지가 존재하면 사전 검토 기록 유무와 무관하게 구조 검사부터 한다. 주체는 `- 판정 주체:`의 비어 있지 않은 값이다. 미지원·중복 표지는 거부한다. 실제 task 생성 결과의 표지·절 순서도 검사해 템플릿 누락을 검출한다. 기존 하네스의 생성 TASK fixture는 증명 범위 값을 채운다. 표지 제거·허위 기록의 우회 한계는 docs/WORK-PROCESS.md와 reviewer.md에 적는다. 선언 보안 검사는 finish가 수행한다.
