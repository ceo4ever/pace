# T04 사전 1차 지적 처리

제공자는 anthropic, 새 독립 Claude Opus 5.5 맥락이다. 1단계는 목적/TASK, 2단계는 PROJECT/BR04/현행 근거를 대조했다. 원문은 `pre-review-1-stage1.md`, `pre-review-1-stage2.md`이며 최초 TASK는 `task-before-pre-review-amendment.md`다. 최초 결과 fail·blocking2·should_fix6을 PRE-REVIEW에 보존했으며 아직 제품 구현은 하지 않았다.

| 지적 | 반영·근거 |
|---|---|
| B-1 checks 신뢰/기존 규칙 충돌 | JSON 방식을 유지하되 사용자가 신뢰하는 명시적 실행 선언으로 정의했다. 선택된 기준 commit의 map/checks를 사용하고 작업본 map이 JSON 데이터로 같을 때만 빠른 경로를 허용한다. 전체 선언과 기준을 맞추고 미커밋/기준 map 부재는 전체 전환한다. `skills/pace-project-init/references/test-map.md`의 셸 금지 규칙을 checks에만 예외로 개정하며 전체 명령은 여전히 정의서에 둔다. |
| B-1 셸/cwd/제한/중단 | 이미 export된 runDeclaredShell을 사용해 Windows Git sh/POSIX sh로 고정한다. 기본30분/16MiB, 인자 값 보간 없음, cwd 실경로 검증, 실패/중단 즉시 종료를 명시했다. S-2는 POSIX 셸 구문이 Windows의 실제 셸 경계에서 성립하고 cmd 대조에서 깨지는 sentinel을 포함한다. |
| B-2 main 없는 저장소 | changed 전용 문맥에서 로컬 main→master→검증 HEAD commit을 읽기 전용으로 선택한다. 실제 ref 오류와 부재를 구별하고 commit을 고정한다. root/HEAD 미확인은3, 실행이 시작된 실패는1, 정상은0이며 표로 확정했다. master/trunk/unborn/저장소밖/손상ref/Git 오류를 설치형 CLI로 검증한다. |
| B-2 공유 helper 제한 확장 | runDeclaredCheck의 기준 revision 인자(생략시 종전 main), DEFINITION_FILES export, 셸/검사 실행 상태 메타데이터만 범위에 넣었다. 기존 ok/output 및 인자 없는 all/finish 정책은 유지한다. pid/status/error/signal 등 구조값으로 실행 전/후를 구별하며 출력 문구를 파싱하지 않는다. PROJECT의 정본/보안 영향도 해당 범위로 구체화했다. |
| SF-1 변경 열거 | untracked 파일까지 펼침·NUL 구분·실제 root cwd·submodule 무시 안 함·충돌/type/mode/gitlink 보수 전환을 명시했다. Windows 선택의 case-fold 및 실제 Windows 표본/가상 비Windows 구별을 추가했다. 커밋된 브랜치 차이 제외와 깨끗한 작업본 미실행 한계를 출력/문서에 둔다. |
| SF-2 정의서 정본 | 기존 harness의 DEFINITION_FILES를 공유하고 별도 경로 목록을 만들지 않는다. |
| SF-3 중단 | 기존 driver interrupted 및 셸 중단은 즉시1로 종료하며 전체 전환하지 않는다. 직접 자식 관리라는 기존 경계의 한계를 숨기지 않는다. |
| SF-4 복합 결과 | checks 실패 뒤 시험 실행 없음, 실제 실패1 뒤 성공으로 덮지 않음, 부분 확인불가3→실제 전체0은 전체실행 판정0임을 표로 정의했다. |
| SF-5 기준선 | S-7에 원래1425.464초와 최근 전체680.918초 양쪽 비교를 명시했다. 사본 준비시간과 명령시간, 부분 범위/제외 범위를 분리한다. |
| SF-6 설치 경로 | APP_PARTS와 런타임 node_modules 없음, Windows 실제 node 진입/소유 .cmd 검증, 복사된 실제 Node/Python driver의 관측 prefix sentinel과 SHA를 추가했다. pristine 실행과 관측용 사본 변경을 구별하며 POSIX 셔임 실행은 현 Windows 검증 밖으로 남긴다. |

추가 근거 확인: `src/setup/install.ts`의 binaryText는 Windows에서 node와 app/bin/pace.ts만 호출하고 추가 로더가 없다. `src/project/harness.ts`의 runDeclaredShell은 이미 export이며 Git 설치 경계의 sh를 찾는다. 기본 CHECK_TIMEOUT_MS는2시간으로 전체 전환에 유지한다. checks는 helper의 종전30분을 사용한다. 기존 config는 알 수 없는 필드를 무시하므로 v1의 checks 추가가 file/unit 또는 구형 설치를 깨뜨리지 않음을 회귀로 대조한다. PACE의 typecheck 스크립트와 scout-card의 단일 소속/두 시험 파일도 확인했다.

위 반영은 목표 변경이 아니라 P-4의 실제 타 저장소 사용과 보수적 전체 전환을 구현하기 위한 경계 구체화다. 현재 수정 TASK의 같은 reviewer 재검토를 요청하며, 통과 전 구현하지 않는다.
