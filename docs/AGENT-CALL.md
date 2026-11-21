# 에이전트 호출과 PACE 도구 서버

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

## 에이전트 호출

- 경로: `src/agent/`
- 스택·형식: TypeScript

`pace agent setup [--agents claude,codex] [--yes] [--login] [--install-adapters]`(`setup.ts` — 감지(읽기만) → 계획·확인 → 적용, 공식 CLI 로그인만 쓰고 토큰·자격증명 파일은 읽거나 복사하지 않는다, 프로필 `agent-chains.json`의 `default` 체인은 기존 파일을 보존·병합하고 바꾸기 전 확인과 `.bak`) · `pace agent` — 호출 계약(`contract.ts`: 입력·정규화 결과·오류 코드·능력 검사)과 실행기 등록(`registry.ts`). 실행기: `-p`(`p-executor.ts`)·ACP(`acp-executor.ts`), 프로세스 수명·env 허용 목록(`process.ts`), 체인·폴백(`chain.ts`·`limits.ts`·`snapshot.ts`, `pace agent run --chain <이름>` — 프로필 `agent-chains.json`의 단계 순서대로, 한도·인증·실행기 없음이면 다음 단계로 폴백하고 쓰기 요청이 시작된 뒤에는 기본적으로 `handoff_required`로 사람에게 넘긴다. 읽기 전용 요청은 읽기 전용 강제가 실측으로 확인된 단계만 실행), ACP 보강(`hooks.ts`·`acp-executor.ts` — 실행 훅: 이벤트 스트림 `onEvent`(상한 큐, 원본 `--raw-dir` 저장은 별도 64MB 상한)·권한 위임 `onPermission`(식별 실패·읽기 전용의 허용 밖은 강제 거절, 읽기 전용에서 콜백은 허용을 낮추기만)·`paceMcp`·정체성 맥락 `context`·이전 대화 요약 `handoffSummary`, 대화 이어가기 `session/resume`은 호출자 보관 `savedSession` 대조 필수, 읽기→쓰기 전환은 `continueSession`이 새 세션+요약으로), 교차 검증(`verify.ts`, `pace agent verify` — 다른 제공자 에이전트가 읽기 전용으로 독립 검토, 불가하면 미실행·질문). Codex 호스트에서 쓸 때는 호스트 샌드박스의 네트워크 허용이 필요하고(기본 차단 → 타임아웃), Codex를 다시 부르려면 호스트 샌드박스 해제가 필요하다. Claude ACP는 모델을 보고하지 않아 교차 검증 근거로 쓸 수 없다(`-p` 사용). 회수 보증: POSIX는 프로세스 그룹, Windows는 최선 노력(`process_cleanup: best-effort-unverified`, 실기 검증은 병합 후). 용어: **에이전트**(도구를 쓰며 일하는 프로그램: Claude Code·Codex) · **모델** · **제공자**(모델 회사) · **호출 방식**(`p` 헤드리스 단발 / `acp` 세션) · **Client**(ACP에서 부르는 쪽 = pace agent). 프롬프트는 stdin·파일만(argv 금지), 기본 읽기 전용, 미지원 옵션은 오류

## PACE 도구 서버

- 경로: `src/mcp/`
- 스택·형식: TypeScript

`pace mcp --workspace <경로> --access read-only|write` — ACP 세션에 `mcpServers`로 주입되는 stdio MCP 서버. 워크스페이스·접근 권한은 기동 때 고정하고 도구마다 서버가 강제한다: 읽기 전용이면 변경 도구(`memory_add`) 직접 호출도 거부, 다른 워크스페이스·링크·하드링크·상한 초과 거부(`safefs.ts`의 `scan` 앞뒤 비교). 도구: 메모리 조회·추가, 프로젝트·백로그 조회, 브레인 검색. 쓰기 세션과 다른 세션의 동시 실행 금지는 호출자(daemon)의 전제
