# Java 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음)일 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본. 주변 스타일 우선.
연결표: Java + Spring MVC·JPA 요소용(보관). Kotlin + WebFlux·jOOQ에는 쓰지 않는다.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| springboot-patterns | REST API Structure | 21-48 | 컨트롤러 구조가 없을 때 |
| springboot-patterns | Service Layer with Transactions | 59-77 | 트랜잭션 경계 |
| springboot-patterns | DTOs and Validation | 79-93 | 입력 검증 |
| springboot-patterns | Exception Handling | 95-120 | 오류 응답 처리 |
| springboot-patterns | Repository Pattern (Spring Data JPA) | 50-57 | 읽지 않음 (JPA 요소 아니면) |
| springboot-patterns | Rate Limiting (Filter + Bucket4j) | 235-295 | 읽지 않음 |
| springboot-patterns | Production Defaults | 307-315 | 설계 시 확인 |
| springboot-tdd | Unit Tests (JUnit 5 + Mockito) | 25-49 | 첫 단위 테스트 |
| springboot-tdd | Web Layer Tests (MockMvc) | 51-68 | 컨트롤러 테스트 |
| springboot-tdd | Persistence Tests (DataJpaTest) | 91-110 | JPA 테스트 |
| springboot-tdd | Assertions | 138-142 | 단언 방식 |
| springboot-tdd | Coverage (JaCoCo) | 117-136 | 읽지 않음 (PACE 소유) |
| springboot-tdd | Workflow | 18-23 | 읽지 않음 (PACE 절차) |
| springboot-verification | Phase 2: Static Analysis | 30-40 | Maven 정적 분석 설정 |
| springboot-verification | Phase 4: Security Scan | 160-187 | 설계 시 확인 |
| springboot-verification | Phase 6: Diff Review | 196-207 | 설계 시 확인 |
| springboot-verification | Output Template | 209-225 | 읽지 않음 |

안티패턴 요약 (판정 기준)
- 컨트롤러에 비즈니스 로직·트랜잭션(서비스 계층에서 처리), 엔티티를 응답에 직접 노출(DTO 사용)
- `@Valid` 없는 요청 본문, 예외 메시지·스택 트레이스를 응답에 노출
- 테스트(버그 위험): 고정 sleep, 테스트 간 공유 상태
