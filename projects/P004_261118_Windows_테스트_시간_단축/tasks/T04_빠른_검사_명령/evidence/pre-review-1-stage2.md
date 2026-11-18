# T04 사전 검토 — 2단계 최종 판정

**검토자**: Anthropic Claude Opus 5.5. 읽기 전용이며 도구 실행은 없습니다. 계정 식별자는 쓰지 않았습니다.

## 판정: **fail** — blocking 2 · should_fix 6

두 차단 사항 모두 TASK 문구 수준의 결정으로 해소할 수 있습니다. 설계 방향 자체를 바꿀 필요는 없습니다.

## Blocking

### B-1. `checks` 명령의 실행·신뢰 경계가 미정이고 기존 계약과 충돌함

- **계약 충돌**: `test-map.md`는 "임의 셸 명령은 JSON에 넣지 않는다", "이 JSON에 전체 명령을 복제하지 않는다"를 안전 경계로 명시합니다. TASK는 test-map에 `checks[].command`를 추가하면서 이 규칙을 뒤집는다는 결정이나 이유를 남기지 않았습니다.
- **셸 미정**: `fileResults`는 셸 없이 `spawn(executable, argv)`로 실행합니다. 정의서 `검사`는 harness의 `run`을 쓰며, Windows에서는 Git 설치 경계 안의 sh(`windowsGitShell`)를 거칩니다.
  - TASK의 "공통 실행 경계 재사용"이 둘 중 무엇인지 정해지지 않았습니다.
  - cmd.exe로 실행하면 `npm` 등 같은 명령문의 의미가 전체 검사와 달라집니다.
  - `run` 재사용에는 harness export가 필요할 수 있는데, TASK는 "하네스 소스 수정 안 함"이라고 적어 내부 모순입니다.
- **신뢰 비대칭**: 전체 선언은 base 우선(`executionCommand`)인데, `checks`는 작업본 map에서 읽습니다. HEAD 대비 미변경이면 그대로 실행됩니다. 의도된 차이인지 결정이 없습니다.
- **해소안**: 아래 중 하나를 TASK와 PROJECT 결정 메모에 명시해야 합니다.
  - (a) JSON 방식을 유지합니다. 이 경우 `test-map.md` 규칙을 이유와 함께 개정하고, 셸을 정의서 `검사`와 같은 경로로 고정합니다(필요한 최소 export만 범위에 넣음). base/작업본 중 어느 쪽을 읽을지도 정합니다.
  - (b) 정의서 라벨 방식(`declaredCommand` 계열, base 우선)으로 옮깁니다. 이 경우 `COMMAND_LABELS`·하네스 범위가 바뀌는 것을 명시합니다.
  - 두 경우 모두 S-2에 Windows 셸 동일성 검출 sentinel을 추가해야 합니다.

### B-2. 다른 저장소에서의 전체 전환 의미가 미정임(base·실행 전 오류)

- **base 고정**: `runDeclaredCheck → openRepo(cwd)`는 base를 `"main"`으로 고정합니다. `committedCommand`는 `ls-tree main`을 실행하며, 주석상 조회 실패가 throw로 이어지는 것으로 보입니다(미검증).
- **결과의 오분류**: 이 경우 기존 `executeTest`의 catch가 종료코드 **1(실패)**을 냅니다. 영향을 받는 경우는 다음과 같습니다.
  - 기본 브랜치가 `master`인 저장소
  - 커밋이 없는 저장소(`rev-parse --abbrev-ref HEAD` 실패)
  - 저장소 밖에서 실행
  - Git 실패
  TASK는 "확인 불가는 3"이라고 하지만, 이런 실행 전 오류를 어떻게 매핑할지 정하지 않았습니다. 또한 `run` 내부의 spawn 실패와 실제 명령 실패가 모두 `ok:false`로 합쳐져 구별되지 않습니다.
- **검증 허점**: S-3·S-6 샘플이 모두 `main`이면 이 경로는 검출되지 않은 채 통과합니다.
- **해소안**:
  - 다음 각 경우의 종료코드를 표로 확정합니다: 저장소 없음, HEAD 없음, base 부재, 선언 없음, Git 오류, 셸 확보 실패, 명령 실패, 명령 성공.
  - 기존 `all`·finish의 의미는 유지합니다.
  - `master`·무커밋·저장소 밖 샘플을 S-3/S-6에 추가합니다.

## Should fix

1. **변경 열거 정밀화**
   - `--untracked-files=all`을 사용합니다.
   - unmerged(충돌) 항목은 명시적으로 전체 전환합니다.
   - 서브모듈은 `--ignore-submodules=none`으로 봅니다.
   - Git은 루트 cwd에서 실행해 루트 기준 경로를 보장합니다.
   - Windows 대소문자 비구분 `matchesGlob` 동작을 시험합니다.
2. **암묵 공통 목록의 이중 정본**: 목록이 harness의 `DEFINITION_FILES`와 따로 관리됩니다. 공유 상수를 쓰거나 동등성 시험을 둡니다.
3. **중단 처리**: 기존 `interrupted` 신호를 받으면 전체 전환하지 않고 중단 판정으로 끝낸다는 점을 명시합니다.
4. **복합 판정 순서표**: 다음을 명시합니다.
   - `checks` 실패 후 시험 실행을 계속할지 여부
   - 부분 3 → 전체 0일 때의 최종 코드와 출력 표기
5. **S-7 기준선**: BR01 기준 1425.464초와 T03 이후 680.918초를 함께 공개해 과대 해석을 막습니다.
6. **설치 fixture**
   - Windows의 실제 호출 형태인 `node "<home>/app/bin/pace.ts"`와 같게 맞춥니다.
   - `src/test-runner`의 드라이버(.mjs/.py)가 복사본에서 쓰이는지 sentinel로 확인합니다.
   - POSIX `paceBin` 셔임은 미검증 한계로 기록합니다.

## 확인된 정합 사항(차단 아님)

- **file/unit/all 호환**: `config()`는 알 수 없는 필드를 무시하므로, `checks`를 추가해도 기존 모드와 구버전 설치가 깨지지 않습니다. `changed`만 이 필드를 의무화하는 설계는 타당합니다.
- **map 오류·부재 처리**: 일치 0건 패턴(삭제 포함)이나 map 부재는 `config()` 오류가 됩니다. 이를 `changed`에서 전체 전환으로 처리하는 계획과 맞습니다.
- **설치 형태**: 런타임 의존성이 없고(AGENTS) APP_PARTS에 `src`가 포함되므로, 복사 fixture로 제품 경로를 재현하는 방식이 성립합니다.
- **PACE 자체 map**: `typecheck` 스크립트가 존재하고, `src/scout/card.ts`는 `scout-card` 단위 하나에만 매핑됩니다. S-7의 전제가 성립합니다.
- **기존 동작 보존**: finish·`all`의 전체 경로를 유지하는 방향과 정합합니다.

## 미검증

- `git()` 헬퍼의 실패 시 throw 여부
- `run`의 export 여부·시그니처, `CHECK_TIMEOUT_MS` 값
- POSIX 설치 셔임 형태
- T03 수치 원문
- 드라이버 파일의 실제 존재

## 독립 정합성과 미측정 결과

- **독립 정합성**: 목적, P-4, BR04와의 방향 정합은 독립적으로 동의합니다.
- **미측정 결과**: 다음은 모두 구현 뒤에만 판정할 수 있습니다.
  - S-7의 실제 단축 폭(`cli.test.ts` 포함 단위라 크기 미지)
  - 선택 누락률
  - 외부 저장소에서의 전체 전환 정확성
