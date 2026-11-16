# Python 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음) 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본(주변 스타일 우선).
도구 설정(uv·ruff·pyproject)은 modern-python 담당이다. `references/*.md`는 필요한 도구만 읽는다.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| python-patterns | Core Principles | 19-73 | 새 모듈·EAFP 판단 |
| python-patterns | Type Hints | 75-138 | 타입 표기 규칙이 없을 때 |
| python-patterns | Error Handling Patterns | 140-196 | 예외 처리·예외 계층 |
| python-patterns | Context Managers | 198-257 | 자원 정리 |
| python-patterns | Anti-Patterns to Avoid | 701-751 | 판정 시 |
| python-patterns | Python Tooling Integration | 619-684 | 읽지 않음 (modern-python 담당) |
| python-testing | Fixtures | 117-249 | 픽스처 구조·범위 |
| python-testing | Parametrization | 251-310 | 반복 케이스 |
| python-testing | Mocking and Patching | 361-465 | mock 방식이 다를 때 |
| python-testing | Testing Exceptions | 519-545 | 예외 단언 |
| python-testing | Best Practices | 638-660 | 판정 시 |
| python-testing | Core Testing Philosophy | 19-50 | 읽지 않음 (TDD·커버리지) |
| python-testing | Common Patterns | 662-721 | 읽지 않음 (Flask 예제) |
| python-testing | pytest Configuration | 723-764 | 읽지 않음 (`--cov` 설정) |
| fastapi-patterns | Dependency Injection | 162-225 | FastAPI 요소: 의존성 주입 |
| fastapi-patterns | Router and Endpoint Design | 227-303 | FastAPI 요소: 라우터 |
| fastapi-patterns | Anti-Patterns | 472-505 | 판정 시 |
| fastapi-patterns | App Factory and Lifespan | 38-85 | 읽지 않음 (`create_all` 예제) |
| modern-python | Anti-Patterns to Avoid | 24-42 | 설계 시 확인 (도구 설정) |
| modern-python | Full Project Setup | 108-203 | pyproject·Makefile 설정 시 |
| modern-python | Migration Guide | 205-259 | 기존 도구에서 이전 시 |

안티패턴 요약 (판정 기준)
- 가변 기본 인자, `type(x) ==`, `== None`, `import *`, 맨몸 `except`
- 테스트: 구현 검증, 공유 상태, 테스트 안 try/except(`pytest.raises`), 과한 mock
- FastAPI: 라우트에 비즈니스 로직, async 라우트에서 동기 DB 호출
- 도구: `uv pip install`, 수동 가상환경 활성화, requirements.txt, mypy·pyright 신규 도입
