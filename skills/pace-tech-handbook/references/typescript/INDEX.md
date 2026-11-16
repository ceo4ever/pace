# TypeScript 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음) 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본(주변 스타일 우선).
react-best-practices·composition-patterns는 규칙 이름 목록이며 필요한 규칙만 `rules/<이름>.md`로 읽는다.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| react-best-practices | Quick Reference | 36-118 | 성능 규칙 이름 찾기 |
| composition-patterns | Quick Reference | 41-69 | 컴포넌트 구조 |
| react-testing | Query Priority | 49-72 | 쿼리 선택이 다를 때 |
| react-testing | Async Patterns | 95-108 | waitFor·findBy 대기 |
| react-testing | Network Mocking with MSW | 110-150 | 네트워크 mock |
| react-testing | Anti-Patterns | 310-318 | 판정 시 |
| react-testing | When NOT to Use Snapshot Tests | 249-262 | 스냅샷을 쓰려 할 때 |
| react-testing | When to Reach for Playwright / Cypress | 264-280 | 읽지 않음 |
| react-testing | Coverage Targets | 282-308 | 읽지 않음 |
| react-testing | TDD Workflow | 320-336 | 읽지 않음 |
| vite-patterns | Environment Variables | 146-177 | Vite 요소: env 노출 |
| vite-patterns | Common Pitfalls | 356-392 | Vite 요소: 개발·빌드 불일치 |
| vite-patterns | Anti-Patterns | 394-427 | 판정 시 |
| vite-patterns | Library Mode | 305-324 | 읽지 않음 |
| vite-patterns | SSR Externals | 326-337 | 읽지 않음 |
| backend-patterns | API Design Patterns | 22-128 | 보관(Node·Express) |
| react-patterns · frontend-patterns · nextjs-turbopack | - | - | 보관(vercel-labs와 중복), 전체 읽지 않음 |

안티패턴 요약 (판정 기준)
- 테스트: `container.querySelector`, 렌더 횟수 단언, React mock, 기본 자식 mock, `act()` 경고 무시, 테스트 간 공유 상태
- 스냅샷으로 DOM 구조 단언
- Vite: `envPrefix: ''`(비밀 노출), 앱 코드에서 `require()`, 패키지별 청크 분리
