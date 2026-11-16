# 분석과 대조 방법

도구 이름이 아니라 행위(파일 찾기, 패턴 검색, 명령 실행)로 적는다. 어떤 LLM 도구에서도 같은 절차다.

## 1. 레이아웃

프로젝트 루트를 깊이 2~3으로 훑어 디렉터리를 나눈다. 위 기준이 먼저다.

| 순서 | 기준 | 분류 |
|---|---|---|
| 1 | config 파일이 있음 | 코드 |
| 2 | 문서 파일(.md, .docx, .pdf 등)이 주로 있음 | 문서 |
| 3 | `tasks/`, `backlogs/`, `projects/` 같은 작업 기록 | 작업 — 옮기거나 고치지 않는다. `projects/P###_…`만 `pace project` 하네스 형식이고, 다른 형식의 `tasks/`·`projects/`는 그대로 두고 재료로 참조 |
| 4 | 그 밖 | 미분류 — 인터뷰에서 용도를 확인 |

| config | 스택 |
|---|---|
| `package.json` | Node.js (의존성으로 Next.js·React·Vue·Express 등 판별) |
| `pyproject.toml`, `requirements.txt` | Python (FastAPI·Django·Flask 등) |
| `go.mod` | Go |
| `pom.xml`, `build.gradle(.kts)` | Java·Kotlin |
| `Cargo.toml` | Rust |
| `.env.example`, `docker-compose.yml` | 포트·DB·외부 서비스 |

폴더 이름(`frontend/`, `api/`)은 보조 힌트일 뿐이다.

## 2. 레포 구조

| 구조 | 판별 | 문서 나누기 |
|---|---|---|
| 단일 | 코드 디렉터리 한 벌, 멀티모듈 빌드 파일 없음 | 문서 한 벌 |
| 멀티레포 | 하위에 독립 `.git`이 여러 개 | 레포별 `docs/` |
| 멀티서비스 | 빌드 파일 하나에 서비스 모듈 여러 개 (`settings.gradle.kts`, `pnpm-workspace.yaml`, `nx.json` 등) | 공통 ARCHITECTURE + `docs/services/{서비스}/` |

## 3. 환경 명령

1. 후보 찾기: `package.json` scripts, `Makefile` 타깃, `pyproject.toml` (`[tool.*]`, scripts), `build.gradle` 태스크, README의 실행 방법, CI 설정(`.github/workflows/`).
2. 확인: 설치·린트·테스트처럼 짧고 부수효과 없는 것은 실행한다. 서버 실행은 시작되는지만 보고 끈다. 빌드가 오래 걸리거나 외부에 영향을 주는 명령은 실행 전에 묻는다.
3. 기록: 확인한 명령은 ✅ 날짜, 못 한 것은 ⬜ 미확인과 이유.

## 4. 코드 심층 분석 (개발, 구조 문서를 쓸 때)

| 대상 | 찾는 법 | 문서 자리 |
|---|---|---|
| 진입점 | `main.*`, `index.*`, `app.*` | ARCHITECTURE 데이터 흐름 |
| 레이어·의존 방향 | 패키지 구조와 각 레이어의 import | ARCHITECTURE 레이어 규칙 |
| 라우터·컨트롤러 | `routes/`, `controllers/`, 라우트 데코레이터 | ARCHITECTURE 시스템 구성 |
| 설정 로더 | `config.*`, `settings.*` | ARCHITECTURE 기술 스택 |
| 공통 처리 | `middleware/`, `utils/`, `shared/` | ARCHITECTURE 데이터 흐름 |
| 트랜잭션·상태 | 트랜잭션 표기, 상태 enum | ARCHITECTURE 상태 전이 |
| 새 기능 추가 경로 | 최근 기능 추가 커밋이 건드린 파일 | ARCHITECTURE 새 기능 추가 절차 |

## 5. 1:1 대조 (작성 뒤, 최신화 때)

구조·방법 서술을 실제 코드와 비교해 넷으로 나눈다.

| 분류 | 뜻 | 조치 |
|---|---|---|
| 일치 | 문서 = 실제 | 통과 |
| 불일치 | 문서와 실제가 다름 (근거 없이 추측으로 쓴 서술 포함) | 고친다 |
| 문서에 없음 | 실제에는 있음 | 추가하거나 새 문서 후보 |
| 실제에 없음 | 문서에만 있음 (삭제·이동됨) | 지운다 |

## 6. 일반 프로젝트 문서 정합성

| 항목 | 방법 |
|---|---|
| 상호 참조 | 문서 안 링크·참조가 실제 파일을 가리키는지 |
| 용어 | 같은 개념을 문서마다 다르게 부르지 않는지 |
| 정보 충돌 | 같은 사실을 문서마다 다르게 적지 않았는지 |
| 날짜·단계 | 단계·버전·날짜가 문서끼리 맞는지 |
| 등록 | `docs/` 아래 파일이 정의서(`docs/README.md`) 문서 표에 있는지, 표의 파일이 실제로 있는지, 용도·적용 범위가 채워졌고 범위 패턴이 실제 경로에 맞는지 |

## 7. 자체 문서 흡수

이미 `docs/`, `ARCHITECTURE.md`, ADR 등이 잘 갖춰진 저장소는 새로 쓰지 않는다. 기존 문서를 정의서 문서 표에 용도·적용 범위와 함께 등록하고, 1:1 대조로 낡은 곳만 고치자고 제안한다.
