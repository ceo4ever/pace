# BR02 읽기 전용 PACE 도구의 프로필 메모리 노출

- 상태: 대기
- 백로그: [BL261124_02_읽기_전용_실행_경계](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

읽기 전용에서 일부러 열어 둔 예외를 사용자가 결정한 범위로 확정한다([백로그 목표](BACKLOG.md#목표) ②). 지금 프로필 메모리 조회는 설계상 허용이지만 "작업 폴더 밖 무승인 읽기"에 해당한다.

## 범위

- 캡틴 결정 먼저(판정 주체: 사람): 읽기 전용 daemon 요청에서 ① 프로필 메모리 조회 허용 유지 ② 승인 뒤 허용 ③ 금지 — 부트 맥락(`buildIdentityContext`)에 이미 실리는 프로필 정보와의 관계를 함께 보여 주고 고르게 한다.
- 결정대로 `src/mcp/server.ts`·`src/agent/acp-executor.ts` 결정표·`src/daemon/runner.ts`를 맞춘다. 같은 기준으로 부트 맥락에 실리는 항목과 `--raw-dir` 원본 기록의 범위도 docs/SECURITY.md에 적는다.

## 완료 기준

- 결정 원문이 BACKLOG 결정·기록에 있고, 실제 daemon 경로에서 프로젝트 메모리 조회 성공과 프로필 메모리 조회가 결정대로(허용·승인 요청·거절) 동작함을 시험과 실측으로 보인다.
