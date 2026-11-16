# test-agent 판정용 교본 색인
사용법: 구현 GATE 판정·통합 실행 때만 쓴다. 평소엔 이 색인만 읽고, 판정이 막힐 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| ai-regression-testing | The Core Problem | 20-46 | 판정 전체의 배경 |
| ai-regression-testing | Pattern 1: Sandbox/Production Path Mismatch | 248-279 | 판정 항목: 샌드박스·운영 경로 불일치 |
| ai-regression-testing | Pattern 2: SELECT Clause Omission | 281-300 | 판정 항목: SELECT 누락 |
| ai-regression-testing | Pattern 3: Error State Leakage | 302-318 | 판정 항목: 오류 상태 누출 |
| ai-regression-testing | Pattern 4: Optimistic Update Without Proper Rollback | 320-342 | 판정 항목: 낙관적 갱신 롤백 누락 |
| ai-regression-testing | Sandbox-Mode API Testing | 48-194 | 읽지 않음 (Next.js 설정) |
| ai-regression-testing | Integrating Tests into Bug-Check Workflow | 196-244 | 읽지 않음 (커맨드 정의) |
| e2e-testing | Flaky Test Patterns | 140-192 | 통합 실행이 불안정할 때 |
| e2e-testing | Financial / Critical Flow Testing | 303-327 | 금융·핵심 흐름 통합 |
| e2e-testing | Page Object Model (POM) | 33-66 | 읽지 않음 (POM 의무 아님) |
| e2e-testing | Playwright Configuration | 101-138 | 읽지 않음 |
| e2e-testing | CI/CD Integration | 226-252 | 읽지 않음 |

판정 체크 (AI 회귀 패턴 4종)
- 샌드박스(테스트 대역) 경로와 운영 경로가 같은 필드를 내는가
- 응답에 추가한 필드가 SELECT 절에도 들어갔는가
- 오류가 났을 때 이전 데이터가 남아 보이지 않는가(오류 상태 누출)
- 낙관적 갱신이 실패하면 되돌려지는가
