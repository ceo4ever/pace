# P010 T01 독립 tester 3차

**판정 pass · 목표 대조 맞음 · T01 계약 범위에서 목표 달성**

[T01 계약](../TASK.md)의 T-3과 S-3을 [2차 판정](tester-orca-r2.md)과 대조했다. 설정 쓰기 실패를 성공으로 보고하지 않아야 한다는 기준은 그대로다. 장애 주입이 설정 읽기 단계에서 원자적 파일 교체 단계로 옮겨졌고, 시도한 설정의 등록 ID와 원본 설정 보존 단언이 추가됐다.

## 독립 실행

Orca 로컬 P010 worktree(HEAD `382bc03` 위 현재 변경)에서 Node v24.22.3으로 한 차례 직접 실행했다.

```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 XDG_CONFIG_HOME=/dev/null NODE_USE_ENV_PROXY=0 node --test test/daemon-workspace.test.ts test/daemon-wizard-follow.test.ts test/telegram-flow.test.ts
```

종료 코드 **0**, **63건 중 63건 통과**(workspace 9건, wizard 14건, Telegram flow 40건), 실패·취소·건너뜀·todo 각각 0건, 15,301.466ms. 테스트의 임시 PACE_HOME, loopback Gateway와 가짜 Bot API를 사용했다. 실제 사용자 홈·외부 서비스는 접근하지 않았다.

## T-3 실행과 검출력

- 유효한 `config.json`을 둔 채 해당 파일이 목적지인 `renameSync`에만 `EIO`를 주입한다. `syncBuiltinESMExports()`가 실제 원자적 쓰기 코드의 named import에도 장애를 적용한다. 콜백은 이미 쓰이고 닫힌 임시 파일을 읽어 JSON을 해석하고 `three`의 등록 ID를 기록한다. 원본 설정 읽기·변경·검증·임시 파일 쓰기를 지나 교체에 도달했음을 이 단언으로 확인했다. [근거: `test/daemon-workspace.test.ts:236–249`, `src/daemon/config.ts:155–160`, `src/core/fsutil.ts:5–24`]
- 인증된 Gateway 직접 요청의 응답을 받은 뒤 CLI add를 호출했다. Gateway는 `ok:false`, CLI는 종료 2를 반환했고 반영·결속 성공 문구는 없었다. 두 교체 시도의 임시 설정에 동일한 `pending.registryId`가 기록됐다. Gateway와 CLI를 순차 실행하고 이 `EIO`는 파일 쓰기 코드가 재시도하지 않으므로, 두 시도를 각 진입점에 대응시킬 수 있다. [근거: `test/daemon-workspace.test.ts:250–258`, `src/core/fsutil.ts:12–18`, `src/daemon/workspace-cli.ts:137–151`]
- 장애 중 원본 설정과 토픽 파일의 전체 내용이 같고, Gateway에서 `/use three`를 시도해도 대화의 워크스페이스가 `two`에 유지됐다. 따라서 조기 성공 보고, 기존 설정 덮어쓰기, 신규 대상의 코어 조기 반영과 디스크 토픽 변경을 검출한다. 소스도 설정 저장 성공 뒤 메모리 워크스페이스와 허용 루트를 변경한다. [근거: `test/daemon-workspace.test.ts:250–263`, `src/daemon/core.ts:979–1003`]
- `finally`에서 장애 주입을 해제했다. 같은 승인 요청 본문을 Gateway에 다시 보내 `{ ok: true, bound: false }`를 받았고 기존 등록 ID가 설정에 기록됐다. 이어지는 CLI 재추가도 성공했고 토픽 파일은 그대로였다. 정지 중 소유권 경합, 미인증 요청 거부, 병렬 추가 보존, stale 요청의 재검증 거부와 실행 중 즉시 선택도 함께 통과했다. [근거: `test/daemon-workspace.test.ts:143–155,198–234,264–277`]

## 기준과 한계

| 기준 | 재검증 판정 |
| --- | --- |
| T-1 | **pass**. 루트 발견, 사전 표시와 대화형·비대화형 무승인 무변경 단언이 다시 통과했다. |
| T-2 | **pass**. 활성 등록의 기본 이름·ID 재사용, 오류 시 설정 보존, 반복 추가와 list 단언이 다시 통과했다. |
| T-3 | **pass**. 실제 교체 지점의 두 실패와 장애 제거 후 복구를 검출해 2차 판정의 공백을 해소했다. |
| T-4 | **pass**. 이전 시 옛 경로 거부, 다른 활성 ID의 옛 토픽 재결속 거부, 동일 ID 재추가 뒤 파일 조회와 사용자 지정 워크트리 정리 단언이 다시 통과했다. |

기존 판정 근거의 약화는 관측하지 않았다. 장애 시험은 신규 등록에서 이전 설정·코어 선택·디스크 토픽이 유지되는 범위를 검증했다. 구형 토픽 승격 뒤 설정 쓰기가 실패하는 두 파일 간 복구는 별도 실행 증거가 없다. 전체 회귀, 실제 포럼(P-5), T02 공통 토픽 생성은 이번 독립 실행 범위 밖이다.
