# Windows 검사 측정

평가 기준은 계측 없는 npm run check의 벽시계 시간이다. 보조 프로파일은 중앙값에 포함하지 않는다.

| 회차 | 시작(UTC) | 경과(초) | 종료 | 시험 | 통과 | 실패 | 건너뜀 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 2026-11-18T15:24:39.352Z | 680.918 | 0 | 970 | 961 | 0 | 9 |
| 2 | 2026-11-18T15:36:00.678Z | 683.052 | 0 | 970 | 961 | 0 | 9 |
| 3 | 2026-11-18T15:47:24.136Z | 680.448 | 0 | 970 | 961 | 0 | 9 |
| 4 | 2026-11-18T15:58:45.006Z | 680.721 | 0 | 970 | 961 | 0 | 9 |
| 5 | 2026-11-18T16:10:06.146Z | 685.689 | 0 | 970 | 961 | 0 | 9 |

기준 유효: true (원시 요약·저장 인벤토리 재대조: baseline-revalidation.json).
중앙값 680.918초, 최소 680.448초, 최대 685.689초.

환경: environment.json, 회차별 부하: run-N-host.json, 원시 출력: run-N.log, 원시 결과/인벤토리: results.json.

동시 작업·원래 도구 버전·개인 경로의 공개와 한계는 T01 evidence/measurement-limitations.md를 따른다. 실제 기준 실행 당시 도구 해시나 동시 부하의 영향량을 사후에 확정하지 않는다.

기준 3회의 환경·회차별 부하·원시 로그는 [원래 기준 실행 폴더](../t03-c4-default-2026-11-18T15-24-37-446Z/)의 environment.json·run-N-host.json·run-N.log를 가리킨다. 현재 폴더의 environment.json은 보조 실행 환경이며 results.json은 원래 기준 결과의 참조를 보존한 복사본이다.

## 비계측 정상 시험 시간

원시 기본 로그를 다시 파싱한 정상 판정·개별 시간만 사용한다. 저장 목록의 시간 누락/불일치도 기준 무효로 거부한다. 동일 이름은 등장 순번으로 구분하며 파일 식별자는 기본 출력에 없다. 실패한 보조 표본은 아래 순위에 넣지 않는다. 전체 목록: baseline-test-times.json.

| 시험(등장 순번) | 표본 수 | 중앙값(초) | 최소 | 최대 |
|---|---:|---:|---:|---:|
| playbook-maker .mjs 테스트가 실제로 실행되고 모두 통과한다 (#1) | 5 | 191.457 | 188.778 | 192.900 |
| P025 v2: 병합 기록 EIO는 소유 임시 파일을 정리하고 복구 명령으로 완료한다 (#1) | 5 | 69.755 | 69.491 | 69.915 |
| Windows ACP 부모 종료와 시간 초과는 자손을 회수하고 무관 프로세스를 보존한다 (#1) | 5 | 42.937 | 42.862 | 42.944 |
| 프로젝트 전 과정: new → start → task → check → finish → merge (#1) | 5 | 38.323 | 38.134 | 38.433 |
| P025 실패 복구: 병합 최종 커밋 거부는 FF 뒤 진행 상태를 복원한다 (#1) | 5 | 35.093 | 34.972 | 36.040 |
| BL 생명주기: finish와 실제 merge에서만 완료하며 미리보기는 변경하지 않는다 (#1) | 5 | 28.273 | 28.234 | 28.398 |
| done: check 통과 때만 상태·백로그·커밋 칸을 한 번에 맞추고, 실패하면 아무것도 바꾸지 않는다 (#1) | 5 | 27.080 | 26.947 | 27.237 |
| 동시 프로젝트: 한쪽 병합 후 다른 쪽 finish는 생성 자료만 재생성하고 미추적 초안을 커밋하지 않는다 (#1) | 5 | 26.785 | 26.736 | 26.955 |
| 작업자 도구: --agent > PROJECT.md `- 작업자:` > 정의서 `작업자 도구:` > 지금 세션, 오타는 worktree 전에 거부 (#1) | 5 | 16.993 | 16.965 | 17.256 |
| 신규 태스크 사전 검토 게이트는 check와 done을 막고 기록 뒤 통과한다 (#1) | 5 | 15.899 | 15.792 | 15.981 |
| commit gate: 사용자 훅·링크·외부 hooksPath 보존, PACE 훅만 갱신 (#1) | 5 | 15.863 | 15.775 | 16.070 |
| Windows 부모 강제 종료 뒤 감시자가 자손을 회수하고 무관 프로세스를 보존한다 (#1) | 5 | 13.440 | 13.432 | 13.498 |
| Windows 부모가 정상 종료해도 독립 감시자가 자손을 회수한다 (#1) | 5 | 13.423 | 13.363 | 13.445 |
| Windows 감시자 자체가 죽어도 잡 자손만 종료한다 (#1) | 5 | 13.381 | 13.367 | 13.446 |
| 작업자 설정 CLI와 실행별 우선순위 및 사전 오류 (#1) | 5 | 12.136 | 12.072 | 12.339 |
| 리뷰 B1: 추적 중이거나 제외가 실제로 안 되는 local.js는 쓰지 않는다 (#1) | 5 | 11.995 | 9.424 | 15.686 |
| Antigravity 공유 훅의 알 수 없는 형식은 설치·제거를 막지 않고 원문을 보존한다 (#1) | 5 | 11.899 | 10.445 | 13.395 |
| 하네스 소유 worktree는 활성 원본과 역할 ID가 일치할 때만 현재 정의를 전달한다 (#1) | 5 | 11.023 | 10.967 | 11.140 |
| 사용자가 확장한 공유 훅에 PACE 참조가 남으면 제거 시 실행 파일도 보존한다 (#1) | 5 | 10.982 | 10.824 | 12.114 |
| PowerShell 5.1 격리 설치·재설치·제거는 한 줄로 보고하고 사용자 래퍼를 보존한다 (#1) | 5 | 10.388 | 9.592 | 10.535 |
| runner npm: actual overlap is RED at one, GREEN at two, with filter and failure forwarding (#1) | 5 | 9.558 | 9.526 | 9.618 |
| finish: 완료 태스크의 태그 커밋 누락 차단, 태그 커밋 후 통과 (#1) | 5 | 9.173 | 9.083 | 9.278 |
| finish: 의존성 감사는 잠금 파일이 base 대비 바뀐 브랜치에서만 실행한다 (#1) | 5 | 9.107 | 8.993 | 9.257 |
| Orca 안이면 start가 작업자 세션을 띄우고, 다시 start·--no-launch·Orca 밖에서는 띄우지 않는다 (#1) | 5 | 9.051 | 8.869 | 9.483 |
| P025 v2: 직접 finish 중간 커밋 뒤 최종 실패는 삭제 staged 없이 재시도한다 (#1) | 5 | 8.821 | 8.810 | 9.000 |
| S-8a 식별 실패·목록 밖은 결정표대로 — 강제 거절은 콜백을 부르지 않는다 (#1) | 5 | 8.773 | 8.730 | 8.866 |
| BL 출처: 같은 번호 태스크 생성·done BR/BACKLOG 동기화와 실패 무변경 (#1) | 5 | 8.084 | 8.071 | 8.163 |
| commit gate: start 설치·갱신, check 실패/성공, 무관 커밋과 복수 태그 (#1) | 5 | 8.018 | 7.967 | 8.173 |
| finish: base에 선언이 없으면 worktree 명령을 실행하고 실패를 보존한다 (#1) | 5 | 7.968 | 7.902 | 8.229 |
| S-8 결정표: 읽기 전용은 읽기 MCP 도구만 허용, 변경·편집·실행은 강제 거절 (#1) | 5 | 7.573 | 7.460 | 7.650 |

보조 실행 판정: 종료 0, 통과 961, 실패 0, 건너뜀 9, 보조 실행 유효 true. 기준 3회의 유효성과 구별한다.

파일 합계와 벽시계의 간극은 T01의 실제 파일 동시성 1을 전제로 한다. T03에서 병렬 실행한 파일 시간을 합해 같은 간극으로 해석하지 않는다.

## 보조 관측

명령·파일 집합: profile-arguments.json(기본 실행기의 testArguments 직접 사용). 원시 이벤트: profile.log. 파일·시험 식별자/결과 및 회차별 이름·결과 다중집합 대조: profile-analysis.json. 기본 출력은 파일을 표시하지 않으므로 파일 식별자는 보조 관측에서 얻었다.

타입 검사 0.838초, 보조 시험 벽시계 671.871초, 파일 내부 시간 합계 1516.080초. 설명되지 않는 시험 간극 -844.209초(프로세스 기동·수집·파일 로딩 등 포함; 원인별 비중은 추정). 이 분해는 실패 파일도 포함한 해당 보조 실행의 기술적 분해이며 정상 실행 성능 추정치가 아니다. 중첩 시험 시간을 다시 더하지 않는다.

인벤토리 대조: 회차 1: 총계 일치, 이름·판정 차이 0건; 회차 2: 총계 일치, 이름·판정 차이 0건; 회차 3: 총계 일치, 이름·판정 차이 0건; 회차 4: 총계 일치, 이름·판정 차이 0건; 회차 5: 총계 일치, 이름·판정 차이 0건. 차이는 profile-analysis.json에 전부 보존한다.

### 정상 판정 파일의 보조 시간

단일 보조 관측이다. 실패 파일은 제외하므로 전체 파일의 정상 순위를 확정하는 표가 아니다. 실패 파일의 정상 시간은 비계측 wrapper 시험 시간을 참고하며 파일 시간과 같다고 보지 않는다.

| 파일 | 초 |
|---|---:|
| test\project-harness.test.ts | 521.887 |
| test\playbook-maker.test.ts | 190.956 |
| test\adopt-opal.test.ts | 90.506 |
| test\windows-watchdog.test.ts | 84.352 |
| test\install.test.ts | 73.566 |
| test\dashboard-init.test.ts | 70.457 |
| test\agent-chain.test.ts | 57.876 |
| test\agent-acp-hooks.test.ts | 45.077 |
| test\boot.test.ts | 29.604 |
| test\install-windows-wrapper.test.ts | 28.143 |
| test\agent-acp.test.ts | 24.243 |
| test\daemon-process.test.ts | 21.503 |
| test\backlog-dashboard.test.ts | 21.073 |
| test\agent-p.test.ts | 19.239 |
| test\test-runner.test.ts | 17.101 |
| test\adopt-opal-recover.test.ts | 16.088 |
| test\telegram-flow.test.ts | 14.822 |
| test\intent-preview.test.ts | 12.682 |
| test\pace-install-ownership.test.ts | 12.332 |
| test\cli.test.ts | 11.797 |

### 실패 또는 미확인 파일의 별도 관측

| 파일 | 초 | 실패 수 |
|---|---:|---:|


### 정상 판정 시험의 보조 시간(suite 제외)

| 파일:줄 | 시험 | 초 | 결과 |
|---|---|---:|---|
| test\playbook-maker.test.ts:15 | playbook-maker .mjs 테스트가 실제로 실행되고 모두 통과한다 | 190.950 | pass |
| test\project-harness.test.ts:1834 | P025 v2: 병합 기록 EIO는 소유 임시 파일을 정리하고 복구 명령으로 완료한다 | 68.938 | pass |
| test\windows-watchdog.test.ts:105 | Windows ACP 부모 종료와 시간 초과는 자손을 회수하고 무관 프로세스를 보존한다 | 42.858 | pass |
| test\project-harness.test.ts:189 | 프로젝트 전 과정: new → start → task → check → finish → merge | 39.157 | pass |
| test\project-harness.test.ts:1666 | P025 실패 복구: 병합 최종 커밋 거부는 FF 뒤 진행 상태를 복원한다 | 34.704 | pass |
| test\project-harness.test.ts:1919 | BL 생명주기: finish와 실제 merge에서만 완료하며 미리보기는 변경하지 않는다 | 27.741 | pass |
| test\project-harness.test.ts:557 | done: check 통과 때만 상태·백로그·커밋 칸을 한 번에 맞추고, 실패하면 아무것도 바꾸지 않는다 | 26.838 | pass |
| test\project-harness.test.ts:2072 | 동시 프로젝트: 한쪽 병합 후 다른 쪽 finish는 생성 자료만 재생성하고 미추적 초안을 커밋하지 않는다 | 26.456 | pass |
| test\project-harness.test.ts:981 | 작업자 도구: --agent > PROJECT.md `- 작업자:` > 정의서 `작업자 도구:` > 지금 세션, 오타는 worktree 전에 거부 | 16.731 | pass |
| test\project-harness.test.ts:2142 | 신규 태스크 사전 검토 게이트는 check와 done을 막고 기록 뒤 통과한다 | 15.731 | pass |
| test\project-harness.test.ts:1304 | commit gate: 사용자 훅·링크·외부 hooksPath 보존, PACE 훅만 갱신 | 15.693 | pass |
| test\dashboard-init.test.ts:554 | 리뷰 B1: 추적 중이거나 제외가 실제로 안 되는 local.js는 쓰지 않는다 | 14.416 | pass |
| test\windows-watchdog.test.ts:22 | Windows 부모 강제 종료 뒤 감시자가 자손을 회수하고 무관 프로세스를 보존한다 | 13.436 | pass |
| test\windows-watchdog.test.ts:63 | Windows 감시자 자체가 죽어도 잡 자손만 종료한다 | 13.378 | pass |
| test\windows-watchdog.test.ts:88 | Windows 부모가 정상 종료해도 독립 감시자가 자손을 회수한다 | 13.369 | pass |
| test\install.test.ts:379 | Antigravity 공유 훅의 알 수 없는 형식은 설치·제거를 막지 않고 원문을 보존한다 | 12.197 | pass |
| test\project-harness.test.ts:862 | 작업자 설정 CLI와 실행별 우선순위 및 사전 오류 | 12.066 | pass |
| test\install.test.ts:419 | 사용자가 확장한 공유 훅에 PACE 참조가 남으면 제거 시 실행 파일도 보존한다 | 12.065 | pass |
| test\boot.test.ts:72 | 하네스 소유 worktree는 활성 원본과 역할 ID가 일치할 때만 현재 정의를 전달한다 | 10.924 | pass |
| test\install-windows-wrapper.test.ts:151 | PowerShell 5.1 격리 설치·재설치·제거는 한 줄로 보고하고 사용자 래퍼를 보존한다 | 10.373 | pass |
| test\test-command.test.ts:29 | runner npm: actual overlap is RED at one, GREEN at two, with filter and failure forwarding | 9.534 | pass |
| test\project-harness.test.ts:1188 | finish: 의존성 감사는 잠금 파일이 base 대비 바뀐 브랜치에서만 실행한다 | 9.317 | pass |
| test\project-harness.test.ts:1373 | finish: 완료 태스크의 태그 커밋 누락 차단, 태그 커밋 후 통과 | 9.010 | pass |
| test\agent-acp-hooks.test.ts:65 | S-8a 식별 실패·목록 밖은 결정표대로 — 강제 거절은 콜백을 부르지 않는다 | 8.792 | pass |
| test\project-harness.test.ts:1798 | P025 v2: 직접 finish 중간 커밋 뒤 최종 실패는 삭제 staged 없이 재시도한다 | 8.748 | pass |
| test\project-harness.test.ts:800 | Orca 안이면 start가 작업자 세션을 띄우고, 다시 start·--no-launch·Orca 밖에서는 띄우지 않는다 | 8.739 | pass |
| test\project-harness.test.ts:1969 | BL 출처: 같은 번호 태스크 생성·done BR/BACKLOG 동기화와 실패 무변경 | 8.007 | pass |
| test\project-harness.test.ts:1272 | commit gate: start 설치·갱신, check 실패/성공, 무관 커밋과 복수 태그 | 7.912 | pass |
| test\project-harness.test.ts:1217 | finish: base에 선언이 없으면 worktree 명령을 실행하고 실패를 보존한다 | 7.876 | pass |
| test\agent-acp-hooks.test.ts:90 | S-9 콜백: 기본 허용은 낮출 수만, 읽기 전용은 허용을 만들 수 없고, 쓰기의 기본 거절은 올릴 수 있다 | 7.587 | pass |

### 실패한 시험 표본(정상 순위에서 제외)

| 파일:줄 | 시험 | 관측 초 |
|---|---|---:|

