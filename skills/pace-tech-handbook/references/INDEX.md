# 교본 색인 (연결표)
요소의 언어+프레임워크로 색인을 고르고, 평소엔 그 색인만 읽는다. 문제 판정 때만 색인의 줄 범위를 offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본(주변 스타일 우선). 보안·성능 문제, 따를 주변 코드 없음, 주변이 안티패턴이면 교본을 따른다(`../SKILL.md` 우선순위). 공통은 `common/INDEX.md`.

| 언어 + 프레임워크 | 색인 | 교본 묶음 |
|---|---|---|
| Kotlin + Spring(WebFlux·jOOQ) | kotlin | kotlin-patterns, kotlin-testing, hexagonal-architecture |
| Kotlin + Android·KMP | kotlin | kotlin-patterns, kotlin-coroutines-flows, kotlin-testing |
| Java + Spring MVC·JPA | java | springboot-patterns, springboot-tdd, springboot-verification |
| TypeScript + Next·React | typescript | react-best-practices, composition-patterns, react-testing |
| TypeScript + Vite·React | typescript | react-best-practices, composition-patterns, vite-patterns, react-testing |
| TypeScript + Node·Express | typescript, common | backend-patterns, api-design |
| Python + FastAPI | python | python-patterns, python-testing, fastapi-patterns, modern-python |
| Python (도구·CLI) | python | python-patterns, python-testing, modern-python |
| PostgreSQL | sql | database-migrations, postgres-patterns |

연결표에 없는 조합은 언어 색인만 쓰고 결과에 "연결표 없음"을 보고한다.
