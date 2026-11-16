# Kotlin 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음) 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본(주변 스타일 우선).

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| kotlin-patterns | Core Principles | 53-160 | null 안전·불변·data class 규칙이 없을 때 |
| kotlin-patterns | Sealed Classes and Interfaces | 162-211 | 결과·상태 모델링 |
| kotlin-patterns | require, check, error | 614-624 | 전제 검증 |
| kotlin-patterns | Anti-Patterns to Avoid | 670-712 | 판정 시 |
| kotlin-patterns | Gradle Kotlin DSL | 530-587 | 읽지 않음 (Ktor·Koin 블록) |
| kotlin-patterns | Result Type for Domain Operations | 591-612 | 읽지 않음 (suspend runCatching) |
| kotlin-testing | Kotest Spec Styles | 109-224 | 첫 테스트·스펙 형식 혼재 |
| kotlin-testing | MockK | 291-382 | mock 방식이 다를 때 |
| kotlin-testing | Coroutine Testing | 384-487 | sleep·delay로 기다릴 때 |
| kotlin-testing | Best Practices | 780-797 | 판정 시 |
| kotlin-testing | TDD Workflow for Kotlin | 42-107 | 읽지 않음 (PACE 절차) |
| kotlin-testing | Kover Coverage | 658-713 | 읽지 않음 (PACE 소유) |
| kotlin-testing | Ktor testApplication Testing | 715-750 | 읽지 않음 |
| hexagonal-architecture | Core Concepts | 21-37 | 새 모듈·포트 경계 |
| hexagonal-architecture | Anti-Patterns to Avoid | 230-236 | 설계 시 확인 |
| hexagonal-architecture | Best Practices Checklist | 267-277 | 설계 시 확인 |
| hexagonal-architecture | TypeScript Example | 120-203 | 읽지 않음 |
| hexagonal-architecture | Suggested Module Layout | 87-118 | 읽지 않음 (저장소 구조 우선) |
| kotlin-coroutines-flows | Structured Concurrency | 20-72 | Android·KMP: 스코프 설계 |
| kotlin-coroutines-flows | Flow Patterns | 74-168 | Android·KMP: StateFlow·이벤트 |
| kotlin-coroutines-flows | Testing | 214-271 | Android·KMP: Turbine |

rules-kotlin/*.md 5개는 보관(프레임워크 상이). 해당 요소일 때만 읽는다.

안티패턴 요약 (판정 기준)
- `!!`, GlobalScope, 가변 data class, 예외로 흐름 제어, scope 함수 중첩
- 테스트: Thread.sleep 대기(runTest·advanceTimeBy), data class mock, private 직접 테스트, 프레임워크 혼용
- 도메인이 ORM·웹 타입을 import, 어댑터끼리 직접 호출
