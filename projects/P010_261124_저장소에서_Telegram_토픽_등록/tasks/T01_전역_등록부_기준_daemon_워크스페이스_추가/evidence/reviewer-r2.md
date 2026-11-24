## 1단계 독립 목표 대조

**읽은 범위:** 프롬프트에 붙은 `impl-diff.patch` 내용과, 다른 쓰기 경로를 확인하려고 `src/` 아래에서 한 번 grep한 결과만 봤다. 작업 문서(TASK, 테스트 표, 자체 판정)는 받지도 읽지도 않았다. 호스트가 자동 첨부한 CLAUDE.md·AGENTS.md와 gitStatus는 노출됐다. 읽기 전용이라는 조건이 완전한 격리를 뜻하지는 않는다. 테스트는 실행하지 않았고 코드는 diff와 grep으로만 봤다.

### 판단

**목표 달성: 달성** (아래 should_fix·note는 있다).

**근거**
- **사용자 승인 대상만 추가:** 활성 등록이 있는 저장소만 `planWorkspaceAdd`와 `approveWorkspacePlan`을 거친다. 대화형에서는 확인 뒤 계획을 다시 비교한다. 비활성 후보, 이름 충돌, 복제된 AGENT, 다른 ID는 모두 거부한다.
- **기존 ID 없는 설정 보존:** `registryId`는 선택 필드다. `workspaceProblem`은 ID가 없으면 null을 돌려주고, 기존 방식 토픽 결속도 그대로 읽는다. 동일 디렉터리로 확인된 경우에만 `promoteLegacyBinding`으로 승격한다.
- **포트 소유자만 설정을 씀:**
  - CLI는 `acquireInstance`를 잡으면 직접 쓴다. 못 잡으면 인증된 Gateway를 통한다.
  - daemon 안의 쓰기는 직렬 처리기(`tx`) 안에서 한다.
  - install wizard와 `reset-offset`도 소유권을 잡도록 바꿨다.
  - grep으로 본 쓰기 지점 중 소유권 검사가 없는 곳은 `telegram init`의 `writeTelegramSecret`(`cli.ts:156`)이다. 이 호출은 diff 밖이라 소유 여부를 확인하지 못했다.
- **비교 시점 네 곳:**
  - 기동: `reloadAllowed`가 `approvedWorkspaceRoot`로 ID·경로·`dev`/`ino`를 비교하고 어긋나면 제외한다.
  - 수락: `resolveTarget`과 Telegram 토픽 결속 검사.
  - 조회: 워커가 `registration`으로 읽기 전후에 두 번 검사한다.
  - 실행 직전: `checkIdentity`.
- **이동한 옛 경로 차단과 재승인:**
  - 등록부 경로와 다르면 거부한다.
  - 같은 ID로 재승인하면 `registryId` 기준 토픽 결속이 이어진다.
  - 옛 경로의 사용자 지정 워크트리는 정리한다.
- **정보 비노출:** 오류는 `workspaceErrorText`로 일반화했다. Gateway 응답과 로그에 경로·토큰이 없는지 시험으로 확인한다.
- **인증·Origin:** `workspace_add`는 기존 Gateway 인증 뒤에서만 열리고, 시험이 무토큰 거부와 Origin 403을 확인한다.

### 지적

1. **should_fix** — `--yes`가 승인 게이트를 사실상 우회한다. 비대화형에서 `--yes`만 주면 미리보기 없이 바로 등록되고, 같은 프로세스에서 계획을 만들어 곧바로 승인하므로 TOCTOU 비교는 의미가 없다. 사람이 확인했다는 보장은 관례(문서)에만 있다. install과 같은 패턴이지만, 이 명령은 원격 실행 대상을 추가한다. 에이전트가 `--yes`를 직접 붙이는 경우를 막을 방법을 T02 전에 정하거나 의도라고 기록해야 한다.
2. **should_fix** — 요청 경로에서 동기 파일 I/O를 한다. `workspaceProblem`이 `resolveTarget`, `checkIdentity`, 기본 대화 선택, `workspaceRootInfo(revalidate=true)`에서 등록부 읽기, AGENT 읽기, `realpath`를 메인 이벤트 루프에서 동기로 한다. 기존 설계는 `FsWorker`로 이런 호출을 루프 밖에 두었다(`workspaceRootInfo`의 옛 주석 "파일 시스템 호출 없음"). 어댑터 조회는 `revalidate=false`와 워커 검사로 이를 지켰다. 그러나 코어 수락과 `matchesLegacyBinding`은 지키지 않는다. 느린 디스크나 네트워크 드라이브에서 전체가 멈출 수 있다.
3. **should_fix** — 손으로 쓴 설정에 `registryId`만 있고 `registryIdentity`가 없으면(시험의 `registerWorkspace` 경로가 그렇다) 재시작 사이의 디렉터리 동일성이 고정되지 않는다. 기동 시점의 `dev`/`ino`를 그냥 신뢰한다. 이동 뒤 같은 경로에 복제한 경우는 AGENT 검증으로 일부 막지만, 동일성 고정은 `workspace add`를 거친 항목에만 보장된다. 이 한계를 문서에 적거나 `registryId`에는 `registryIdentity`를 필수로 요구해야 한다.
4. **note** — Gateway 클라이언트는 `ready`의 `bootId`를 확인하기 전에 토큰을 보낸다(`socket.onopen`). 상태 파일이 거짓이거나 포트가 가로채이면 토큰이 새는데, 위협 모델은 같은 사용자 로컬이라 낮다. 다만 `ready`를 먼저 받고 `auth`를 보내는 순서가 가능하다면 더 안전하다.
5. **note** — `workspace_add`는 토큰 소지자가 활성 등록 ID와 일치하는 요청을 보내면 사용자 확인 없이 추가한다. 토큰 소지자가 기기 관리자라는 모델에서는 일관되지만, "사용자 승인"은 CLI 쪽 규약이고 Gateway 쪽에서는 강제하지 않는다.
6. **note** — `reloadAllowed`가 `approvedWorkspaceRoot`와 `realpathSync`를 따로 호출해, 두 호출 사이에 교체되면 어긋날 수 있다. 윈도우는 작고 `checkIdentity`가 다시 막는다.
7. **note** — `/new`(Telegram)의 경로 직접 등록은 그대로 열려 있다. 허용된 사용자가 터미널 승인 없이 ID 없는 설정을 추가할 수 있다. 상위 목적의 "사용자 승인 대상만"과 다르지만 기존 동작이고 "기존 설정 보존"과 충돌하므로 T02 또는 별도 결정으로 넘기는 것이 맞다.
8. **note** — 범위는 지켰다. 토픽 생성과 운영 호출(T02)은 건드리지 않았고, 시험도 `createForumTopic`이 0건인지 확인한다. `daemon-workspace.test.ts`가 승인 경로, 이동 뒤 거부, 재승인 이어짐, 병렬 직렬화, 설정 저장 실패를 덮는다.

**올릴 단계:** 이번 판정은 그대로 둔다. 1번과 3번은 T02 착수 전에 PM 결정이나 문서화로 올리는 것이 좋다. 2번은 구현 수정 후보다. 목표·전략 변경이 필요한 사항은 없다.

pass
