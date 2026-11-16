# 공통 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음)일 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본. 주변 스타일 우선. 저장소의 API 규칙이 있으면 그것이 먼저다.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| api-design | Resource Design | 21-57 | URL·자원 명명 |
| api-design | HTTP Methods and Status Codes | 59-113 | 상태 코드 선택 |
| api-design | Response Format | 115-197 | 오류·목록 응답 형식 |
| api-design | Pagination | 199-247 | 페이지네이션 |
| api-design | API Design Checklist | 509-524 | 설계 시 확인 |
| api-design | Implementation Patterns | 400-507 | 읽지 않음 (Next·DRF·Go 예제) |
| tdd-workflow | Common Testing Mistakes to Avoid | 488-534 | 판정 시 (약화·안티패턴 근거) |
| tdd-workflow | TDD Workflow Steps | 86-261 | 읽지 않음 (PACE 절차) |
| tdd-workflow | Core Principles | 41-84 | 읽지 않음 (커버리지 80%) |
| tdd-workflow | Mocking External Services | 428-463 | 읽지 않음 (Supabase·Redis·OpenAI) |
| coding-standards | Code Smell Detection | 493-551 | 보관: PACE 규칙과 중복, 필요 시만 |

안티패턴 요약 (판정 기준)
- 모든 응답이 200, 검증 오류에 500, 생성에 201·Location 없음
- 테스트가 구현 세부(내부 상태)를 단언, 취약한 CSS 선택자
- 테스트끼리 데이터·순서에 의존
