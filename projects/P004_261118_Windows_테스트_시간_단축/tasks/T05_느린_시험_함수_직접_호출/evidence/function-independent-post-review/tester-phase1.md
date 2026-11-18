# T05 독립 테스터 1단계

검토 대상은 P004 worktree의 46fdf68 대비 세 하네스 테스트, 직접 호출 도우미 두 파일, Telegram 테스트 변경 및 원래 실행 증거다. 검토 중 테스트를 실행하거나 worktree를 수정하지 않았다. 이 단계에서는 TASK, PROJECT, BR05, PRE-REVIEW 및 작성자 판단을 열지 않았다.

## 판정

세 하네스 테스트에서 기존 CLI 반복 호출을 실제 `src/cli.ts`의 `main(["project", ...args])` 호출로 바꿨다. 성공 경로의 소스상 호출은 합계 59회이며, 같은 HOME에서 자식을 재사용해 fixture별 Node 자식 기동 8회로 처리한다. EIO 주입은 4회 모두 기존 `runPace` 실제 CLI를 사용한다. 기존 단언과 실제 Git 호출은 diff에서 보존됐다. 감사 증거는 3개 변환 블록, 70개 유지 블록, 1개 추가 사례와 기존 95개 시험 진입 파일 중 93개 동일을 기록한다. 전체 프로젝트 생명주기와 명령별 대표 CLI는 그대로 있다.

- 같은 이름 필터의 원문은 전환 전과 후 모두 3통과, 실패·취소·skip 0이다. 벽시계는 121.918초에서 107.391초로 14.527초 줄었다(11.92%). 새 도우미 검증을 제외한 좁은 단일 전후 관측이다.
- 복원·CLI 동등성 사례는 같은 fixture의 main/worktree에서 같은 PID·세대, HOME 전환에서 새 세대, A→B→A 전환 및 예외 후 호출을 확인한다. 실제 CLI와 상태 2/1/1 및 stdout/stderr 원문을 비교한다. 원문은 1통과다.
- 하네스 파일 전체 원문은 74통과, 실패·취소·skip 0이다. 변이 8회는 전후 4쌍으로 같은 원래 단언에서 의도대로 실패했다. M3는 실제 EIO CLI 유지 사례다.
- Telegram은 `/new n3`의 토픽 표 저장 시점에만 한 번 실패하도록 했다. 기존 단언과 실제 토픽 생성 호출을 유지했고 디스크에 의도가 먼저 저장됐다는 단언을 덧붙였다. 파일 전체는 39통과, 시험 환경의 루트 교체 skip 1건이다. 변경 테스트는 마지막 전체 검사 세 번에서 모두 통과했다.

## 전체 검사와 근거 한계

마지막 세 원문은 각 996건이며 통과/실패/취소/skip이 987/0/0/9, 987/0/0/9, 986/1/0/9다. 종료 상태는 0, 0, 1이다. 벽시계 704.920초, 704.630초, 700.394초의 중앙값 704.630초는 T01의 검증된 중앙값 1425.464초의 절반 712.732초 이하다. 세 번째 회차가 실패하여 세 회 전체 결과는 무효다. 유일한 실패는 `test/install-windows-wrapper.test.ts:121`에서 Git Bash가 같은 임시 fixture의 실행 경로를 `/tmp/...`으로 보고하고 시험이 `/c/Users/...` 문자열을 기대한 것이다. 원문만으로 실패의 원인과 전환 사이 인과는 확정할 수 없다. 전환 3건과 신규 도우미 검증은 세 번 모두 통과했다.

현재 하네스 및 Telegram SHA-256은 전체 회차 환경 기록과 일치한다. 현재 두 도우미 SHA-256은 시작 스냅샷 `function-final-launch.json`과 일치한다. 전체 원문 3개의 SHA-256은 `function-final-stopped-binding.json`의 값과 일치한다. 이 보고서는 읽기와 SHA 대조에 근거한다. 전체 세트 검증을 새로 수행하지 않았다.

근거는 `test/project-harness.test.ts`, `test/project-call.ts`, `test/project-call-process.ts`, `test/telegram-flow.test.ts`, T05 `evidence/candidate-*.log`, `harness-full.log`, `telegram-file-full.log`, `project-call-selftest.log`, `function-mutations/`, `function-source-smoke.json`, `t05-function-final-2026-11-18T21-45-07-589Z/run-{1,2,3}.{json,log}` 및 T01 `evidence/baseline-profile-2026-11-18T10-08-53-748Z/summary.json`이다.
