# 에이전트 호출과 PACE 도구 서버

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

## 에이전트 호출

`pace team verify`는 프로젝트 작업자와 같은 원본 읽기 역할 지시를 read-only `p` 실행기에 전달하고 정의 내용을 넣지 않은 고정 질문을 대조한다. 단발 점검의 한계·종료 코드·결과 기록은 [TEAM](TEAM.md#실제-적재-빠른-점검)을 따른다. 요청 effort를 런타임 관측으로 표시하지 않는다.

- 경로: `src/agent/`
- 스택·형식: TypeScript

`pace agent setup [--agents claude,codex] [--yes] [--login] [--install-adapters]`(`setup.ts` — 감지(읽기만) → 계획·확인 → 적용, 공식 CLI 로그인만 쓰고 토큰·자격증명 파일은 읽거나 복사하지 않는다, 프로필 `agent-chains.json`의 `default` 체인은 기존 파일을 보존·병합하고 바꾸기 전 확인과 `.bak`) · `pace agent` — 호출 계약(`contract.ts`: 입력·정규화 결과·오류 코드·능력 검사)과 실행기 등록(`registry.ts`). 실행기: `-p`(`p-executor.ts`)·ACP(`acp-executor.ts`), 프로세스 수명·env 허용 목록(`process.ts`), 체인·폴백(`chain.ts`·`limits.ts`·`snapshot.ts`, `pace agent run --chain <이름>` — 프로필 `agent-chains.json`의 단계 순서대로, 한도·인증·실행기 없음이면 다음 단계로 폴백하고 쓰기 요청이 시작된 뒤에는 기본적으로 `handoff_required`로 사람에게 넘긴다. 읽기 전용 요청은 읽기 전용 강제가 실측으로 확인된 단계만 실행), ACP 보강(`hooks.ts`·`acp-executor.ts` — 실행 훅: 이벤트 스트림 `onEvent`(상한 큐, 원본 `--raw-dir` 저장은 별도 64MB 상한)·권한 위임 `onPermission`(식별 실패·읽기 전용의 허용 밖은 강제 거절, 읽기 전용에서 콜백은 허용을 낮추기만. Claude ACP 읽기 전용은 `default` 모드 — `plan`은 Read·읽기 셸을 작업 폴더 밖까지 권한 요청 없이 실행해 쓰지 않는다. `default`에서는 시험한 밖 읽기·쓰기가 권한 요청으로 와 강제 거절됐다(macOS·어댑터 0.81.1 실측). 한계: 차단은 어댑터의 권한 요청에 기대며 OS 수준 파일 경계가 아니고, 읽기 전용에서도 PACE 읽기 MCP 도구(프로필 메모리 조회 포함)·부트 맥락은 허용된다)·`paceMcp`·정체성 맥락 `context`·이전 대화 요약 `handoffSummary`, 대화 이어가기 `session/resume`은 호출자 보관 `savedSession` 대조 필수, 읽기→쓰기 전환은 `continueSession`이 새 세션+요약으로). 회수 보증: POSIX는 프로세스 그룹, Windows는 최선 노력(`process_cleanup: best-effort-unverified`, 실기 검증은 병합 후). 용어: **에이전트**(도구를 쓰며 일하는 프로그램: Claude Code·Codex) · **모델** · **제공자**(모델 회사) · **호출 방식**(`p` 헤드리스 단발 / `acp` 세션) · **Client**(ACP에서 부르는 쪽 = pace agent). 프롬프트는 stdin·파일만(argv 금지), 기본 읽기 전용, 미지원 옵션은 오류

### 독립 검토

`pace agent verify`는 다른 제공자의 새 읽기 전용 맥락으로 검토한다. `REVIEW-LOG.jsonl`과 `review-records/`에는 판정·원문·대상 스냅숏이 남는다. 기록은 대상과 같은 범위에 공유되므로 비밀을 넣지 않는다. 종료 10은 교차 실행 미실행이며 [B1](../skills/pace-project-dev/references/decision-rights.md#a-결정-주체)로 복구한다. Claude 교차 검토는 제공자를 확인할 수 있는 `-p`를 쓴다.

| 확인할 동작 | 구현 |
|---|---|
| 단계별 질문, 관측 근거, 적용 등급과 판정 | `verify.ts`, `review-criteria.ts`, `structured-review.ts` |
| 직전 기록 선택, 새 호출과 중단 복구, 호출과 유효 판정 한도 | `review-log.ts`, `review-budget.ts`, `review-admission.ts`, `review-recovery.ts` |
| 소진·공동 검토·한정 확인·상위 검토·사용자 결정의 상태 및 근거 | `verify-cli.ts`, `review-followup.ts` |
| 사전 검토의 허가와 실제 Git 후보 | `src/project/pre-review.ts`, `review-permission.ts`, `harness.ts` |

다음 조치는 명령 출력의 `followup`·`escalation`과 [독립 리뷰어](../skills/pace-project-dev/references/reviewer.md#반복-실패-진단과-사용자-결정)를 따른다. 재검증은 기존 기준으로 진행하며, 실제 합의 변경(A-1)과 필수 검증 생략·완화(A-3)의 승인 원문과 범위는 [결정 권한](../skills/pace-project-dev/references/decision-rights.md#a-결정-주체)으로 대조한다.

실행된 실패 기록이 검토 도구 오류로 무효라면 `review-note --void`를 사용한다. 명령 출력에서 적용할 상태와 대상, 근거를 확인한다.

태스크·백로그에서 A-3을 실제로 요청할 때는 `review-note --request-waiver skip|weaken`으로 열고 `followup`을 확인한다. 해당 요청의 owner 승인 원문은 현재 대상·해시·선택지와 대조한 뒤 `review-note --decision --by user`로 연결한다. 재검토를 재개하는 결정에는 `--resume`(1회) 또는 승인 회차의 `--rounds <회차>`를 함께 기록한다. 합격 판정은 그 뒤 실제 검토 결과로 확인한다.

### 외부 검토의 고정 및 사전 검토 기록

- `pace agent review-hand --target <파일> --author-provider <제공자> --purpose-file <파일>`은 일반 검토 호출을 예약하고 원문·해시·검토 프롬프트를 해당 단위의 `review-records/H-<ID>.json`에 고정한다. 응답의 `hand`, `snapshot`, `hash`를 사용한다. 소진·별도 승인·상위 조치 시 종료 16과 후속 경로를 반환한다. 승인된 복구는 기존 `verify`에서 실행한다.
- `pace agent review-record --target <파일> --hand <ID> --provider <제공자> --reviewer <도구> --result-file <파일>`은 고정 이후 받은 구조화 원문을 같은 판정기로 계산해 원장에 기록한다. 외부 제공자·검토자 정보는 제출자가 확인한다. 같은 제공자 대체는 `--unavailable-file`의 `ran: false`, 교차 검토의 `provider` 및 `reason`이 필요하다. 기록은 예약한 호출을 사용한다. 대상·필수 기준·직전 검토가 바뀌면 원래 응답을 보존하고 허가를 보류한다.
- `pace agent review-pre --target <TASK.md> --author-provider <제공자>`는 원문과 원장을 대조해 `PRE-REVIEW.json`을 생성한다. 외부 검토에는 제출 출처를 표시한다. `pre_review_ok`는 사전 검토 기록의 판정이며, 실제 Git 후보의 허가 범위는 프로젝트 게이트에서 확인한다. 조건에 맞지 않는 기존 사용자 예외는 `inactive_waiver`에 보존한다.

### 호출 기록의 귀속

`pace agent run`은 PACE 프로젝트 worktree나 프로젝트·백로그 하위 실행 위치에서 시도를 기록한다. main에서 부르는 프로젝트 실행에는 `--call-scope P### [--call-task T##]`, 백로그 실행에는 `--call-scope BL번호`로 범위를 지정한다. `--call-agent pace-…`는 실제 호출한 팀 구성원 이름을 집계 키로 붙인다. 생략하면 실행기 이름을 쓴다. 일반 저장소 밖 실행에는 기록 범위를 추정하지 않으며, 팀 이름과 함께 쓸 때는 범위가 확인되지 않으면 실행 전에 거부한다.

`pace agent verify`는 대상 파일이 속한 프로젝트 또는 백로그에 기록한다. 검토 결과 JSON의 `agent_call_id`로 판정에 연결된 시도를 찾을 수 있다. 검토 원장과 시도 행에 같은 값을 남긴다. Codex p의 `tokens used`는 기존 검토 원장의 출력 호환 슬롯과 호출 행의 총 토큰에 각각 같은 값을 둔다. 실패·중단은 판정 없이도 기록할 수 있다. 순수 예약·검증과 실행 전 거부는 호출로 세지 않는다. Codex p는 실행 머리글의 `reasoning effort`를 실제값으로 읽는다. 그 밖에 요청 effort만 확인한 경우 실제 effort는 미확인이다. ACP의 요청 모델은 설정 명령 수락만으로는 실제 모델 관측으로 쓰지 않는다. 시간 제한·회수한 취소는 중단으로 기록한다. 기록 I/O 실패는 경고로 알리고 기존 검토 판정·예산·실행 결과를 유지한다. 실행이 끝난 뒤 요청한 원본 출력의 로컬 보관이 실패해도 그 실행의 메타데이터는 남긴다. 체인은 단계별 변경 관측이 끝나면 다음 시도 전에 기록한다. PM 수동 입력과 저장 형식은 [작업 프로세스](WORK-PROCESS.md#에이전트-호출-원장)를 따른다.

### 호스트의 팀 구성원 호출

Claude 설치는 `SubagentStart`·`SubagentStop`·`PostToolUse(Agent)`를 등록한다. 프로젝트·백로그 위치에서 저장소에 정의된 구성원을 호출하면 프로젝트 또는 백로그 호출 원장에 동일 ID의 행을 보강한다. 설정 요청값은 동기화된 생성물에서 확인한다. 자식 effort는 종료 훅, 모델·시간·토큰은 Agent가 반환한 자식 보고에서 확인한다. Agent 결과의 `usage`와 `totalTokens`는 자식의 마지막 모델 요청에 대한 호스트 보고다. 여러 요청에 걸친 호출의 전체 토큰 사용량은 미확인이다. 백그라운드와 중단 등에서 결과를 받지 못하면 확인한 값만 기록한다.

훅 입력에서 호스트별 세션과 자식 식별자를 알고 있다면 PM은 JSON에 `session_id`, `agent_id`를 넣고, Claude가 부모 턴의 `prompt_id`를 보고하면 그 필드도 함께 넣어 `pace agent call-id --host claude|codex`의 표준입력에 넣는다. 이 명령은 호출 ID 해시만 반환한다. 같은 자식의 연속 턴을 구분할 때는 보고된 턴 식별자를 함께 사용한다. 선택된 범위는 Git 로컬 영수증에 고정되고 뒤늦게 다른 작업 경로에서 온 이벤트도 같은 범위를 사용한다. 뒤이은 수동 입력은 그 ID, 기존 행의 `at`와 `task`, `route: "native"`를 사용한다. 자동 기록보다 먼저 쓰는 경우에도 같은 해시를 사용한다. 자동 관측이 시작 이후에 처음 도착하면 최초 관측 시각을 사용한다. 원장의 최초 시각과 귀속은 후속 관측으로 바뀌지 않는다. 자식의 상태·측정이 없으면 미확인으로 두며 PM이 호스트의 직접 관측으로 보강할 수 있다.

Codex 설정의 프로젝트·훅 신뢰가 승인되기 전에는 PM이 같은 [호출 원장 입력](WORK-PROCESS.md#에이전트-호출-원장)으로 기록한다. 실제 네이티브 호출의 이름 또는 실행기를 쓰고, 개별 자식 수치를 호스트가 제공한 경우에만 채운다. 호출 범위가 분명하지 않은 작업은 해당 PACE 프로젝트·백로그 경로에서 호출하거나 PM 수동 입력으로 귀속한다.

외부 검토는 `review-hand`의 예약 ID를 `review-record --hand`에 사용하고, 실제 시도의 호출 원장 ID를 `review-record --call-id`에 별도로 준다. 먼저 실행을 호출 원장에 기록한다. 등록 전에 호출 원장의 해당 행과 검토 예약을 일대일로 예약한다. 판정 등록이 완료되면 같은 행에 검토 기록 참조가 붙는다. 검토 원장의 외부 측정 표시와 판정은 기존 방식을 유지한다. `agent_call_linked: false`이면 링크만 미완료다. 동일한 예약·호출 ID·응답으로 다시 실행하면 원장 판정의 추가 없이 참조를 복구한다. 이전에 연결된 다른 호출이나 결과는 거부한다. 호출 ID를 지정하지 않은 기존 경로는 이전 계약을 유지한다.

## PACE 도구 서버

- 경로: `src/mcp/`
- 스택·형식: TypeScript

`pace mcp --workspace <경로> --access read-only|write` — ACP 세션에 `mcpServers`로 주입되는 stdio MCP 서버. 워크스페이스·접근 권한은 기동 때 고정하고 도구마다 서버가 강제한다: 읽기 전용이면 변경 도구(`memory_add`) 직접 호출도 거부, 다른 워크스페이스·링크·하드링크·상한 초과 거부(`safefs.ts`의 `scan` 앞뒤 비교). 도구: 메모리 조회·추가, 프로젝트·백로그 조회, 브레인 검색. 쓰기 세션과 다른 세션의 동시 실행 금지는 호출자(daemon)의 전제

## 프로젝트의 팀 구성원 선택

`pace project start P123 --agent codex --role builder`에서 agent는 도구, role은 저장소 팀 구성원 이름이다. `team new --role maker`의 role은 역할 종류다. 프로젝트 작업자는 원본을 읽는 prompt와 명시적인 model/effort 인자를 받으며, 이 경로는 native subagent 선택·권한 집행과 다르다. 기존 worktree 재실행은 `--launch`를 쓰고, 선택·재현·시작 기록의 전달/실제 관측 구별은 [TEAM](TEAM.md#프로젝트-작업자-역할)을 따른다.
