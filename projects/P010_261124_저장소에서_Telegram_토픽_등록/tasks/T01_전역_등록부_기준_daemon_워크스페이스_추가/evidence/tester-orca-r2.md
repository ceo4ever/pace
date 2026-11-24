# P010 T01 독립 tester 재검증

**판정 fail · 목표 대조 맞음 · 전체 목표 달성 미확인**

T-1, T-2, T-4는 통과했다. T-3에서 설정 읽기 장애의 거부와 복구는 확인했다. 실제 설정 쓰기 단계의 장애 처리는 미확인이다.

## 독립 실행

Orca 로컬 셸의 `project/P010` worktree(HEAD `382bc03` 위 현재 변경)에서 Node v24.22.3으로 실행했다.

```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 XDG_CONFIG_HOME=/dev/null NODE_USE_ENV_PROXY=0 node --test test/daemon-workspace.test.ts test/daemon-wizard-follow.test.ts test/telegram-flow.test.ts
```

종료 코드 **0**. **63건 중 63건 통과**(workspace 9건, wizard 14건, Telegram flow 40건). 실패·취소·건너뜀·todo 각각 0건, 15,581.072ms. 임시 PACE_HOME, loopback Gateway와 가짜 Bot API, 포럼 이름 확인용 주입 fetch를 사용했다. 실제 사용자 홈·외부 서비스에 접근하지 않았다.

## 이전 판정과 대조

[T01 계약](../TASK.md), [1단계 관측](tester-stage1.json), [최초 실행 판정](tester-orca.md)을 대조했다. 명시 승인한 등록 ID·경로를 고정하고, 옛 경로를 거부하며, 같은 ID의 재승인으로 기존 토픽을 이어 쓰는 동작은 이번 실행에서도 관측했다. 보강된 단언으로 이전 판정의 승인·이름·문서·이동 경계 공백을 해소했다. 설정 장애가 쓰기 단계까지 도달하는지 소스에서 확인해 T-3 판정을 유지했다.

| 기준 | 실행·선택 | 충족·검출력과 이전 판정에서 바뀐 점 | 판정 |
| --- | --- | --- | --- |
| T-1 | S-1 CLI 서브프로세스·대화형 프롬프트 주입 실행 | git 하위 폴더에서 최상위 실경로를 찾고 새 등록·AGENT 생성·read-only·토픽 이름을 표시한다. 비대화형 미승인에서 등록·정의·설정이 생기지 않는다. 대화형 거절에서 기존 활성 등록 목록 전체와 AGENT 원문을 전후 비교하고 설정 부재를 확인한다. 가짜 포럼 제목은 표시되고 토큰은 제거된다. [근거: `test/daemon-workspace.test.ts:21–51,115–140`] | **pass** |
| T-2 | S-1·S-2의 실제 등록부·설정과 list 실행 | 기존 활성 등록을 `--name` 없이 최초 추가해 `registry-name`과 등록 ID가 모두 맞고 등록 레코드가 그대로임을 확인했다. 기존 승인 이름으로 재시도, 이름 오류·충돌·비활성·정의 불일치·복제 경로 거부, 설정 바이트 보존과 list의 경로 미노출도 유지했다. [근거: `test/daemon-workspace.test.ts:37–51,78–113`] | **pass** |
| T-3 | S-3의 포트 경합, 실제 loopback 인증·병렬 요청·장애·재시도 실행 | 미인증 요청 차단, 병렬 추가 보존, 즉시 `/use`, 등록이 이동한 뒤 제출한 stale 요청의 경로 오류와 미등록을 확인했다. 장애 중 Gateway `ok:false`, CLI 종료 2 및 반영·결속 성공 문구 부재, 코어에서 신규 대상 선택 실패, 디스크 토픽 상태의 바이트 불변을 확인했다. 복구 뒤 같은 승인 요청이 성공하고 같은 ID가 설정에 반영됐다. 장애 주입이 설정 파일의 읽기 단계에서 멈추므로 원자적 저장 실패를 검출할 수 없다. [근거: `test/daemon-workspace.test.ts:142–154,197–264`, `test/daemon-wizard-follow.test.ts:64–73`] | **fail** |
| T-4 | S-4의 실제 daemon·모의 Bot API와 등록 이전 실행 | 다른 활성 ID로 같은 이름을 추가하면 거부된다. 예전 ID가 결속된 토픽에서 설정을 다른 활성 ID로 교체한 뒤 `/bind`를 보내면 불일치 안내가 나오고 기존 결속이 유지된다. 같은 ID 재승인 후 설정의 사용자 지정 워크트리가 제거되고 같은 토픽의 새 작업과 별도 `/backlog` 요청이 새 경로 표식에 답한다. 이동 직후 옛 경로의 접수·대기 실행·파일 조회 거부와 재기동 제외 안내, ID 없는 구형 토픽의 동작도 유지했다. [근거: `test/daemon-workspace.test.ts:266–356`] | **pass** |
| S-5 | 테스트 안에서 실제 CLI `help` 실행, 운영 문서 대조 | 도움말의 add·list 구문을 단언했다. 문서의 Git 최상위·대화형 확인과 비대화형 승인·읽기 전용·정지/실행 구분·같은 ID로 재승인·워크트리 재지정·토픽 결속 안내를 CLI 동작 및 구현과 직접 대조했다. 문자열 검사는 문구 누락을 잡고, 의미 일치는 문서 읽기로 확인했다. [근거: `test/daemon-workspace.test.ts:54–63`, `docs/DAEMON.md:10–18`] | **pass** |

변경된 기존 테스트의 약화는 관측하지 않았다. wizard의 기존 단언은 유지됐다. Telegram S-9g는 실패 주입 위치를 코어로 옮겼고 안내·offset 소비·재입력 복구 단언이 모두 실행됐다. 워크스페이스 재검증에서는 기존 승인·경합·이동 사례의 단언과 새 단언이 함께 실행됐다. [근거: `test/daemon-wizard-follow.test.ts:64–75`, `test/telegram-flow.test.ts:398–414`]

## 남은 한계

- T-3의 장애 fixture는 유효한 `config.json`을 옮기고 그 위치에 디렉터리를 만든다. Gateway 요청의 `persistRegisteredWorkspace`는 첫 `readRawConfigFile`에서 중단되고, CLI 재시도는 계획의 `loadConfig`에서도 같은 장애를 만난다. 둘 다 `updateConfigFile`의 원자적 쓰기 호출 전에 멈춘다. 읽기 가능한 설정으로 시작해 쓰기 또는 rename만 실패시키는 사례에서 성공 응답 부재, 코어·토픽 상태, 동일 요청 복구 증거가 필요하다. [근거: `test/daemon-workspace.test.ts:235–257`, `src/daemon/workspace.ts:106,132–148`, `src/daemon/config.ts:145–160`]
- 구형 결속 승격은 설정 기록보다 먼저 실행된다. 현재 장애 사례는 신규 항목을 추가하고, 별도의 구형 결속 사례는 정상 저장에 성공하므로 승격과 설정 기록 사이에 장애가 나면 호환 경로로 읽히고 재시도로 복구되는지 미확인이다. 사용자 지정 워크트리는 설정에서 정리되고 새 경로가 실제 사용됨을 관측했다. 코어 내부 캐시 개별 항목은 직접 검사하지 않았다. [근거: `src/daemon/workspace.ts:137–150`, `src/daemon/telegram/index.ts:68–72`, `test/daemon-workspace.test.ts:156–171,327–338`]
- 지정한 세 파일을 한 차례 실행했다. 전체 회귀, 실제 Telegram 포럼(P-5), T02의 공통 토픽 생성은 이번 증거 범위 밖이다.
