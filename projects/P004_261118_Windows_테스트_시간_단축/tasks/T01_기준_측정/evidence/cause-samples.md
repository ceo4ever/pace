# 느린 시험 원인 표본

다음 시간은 최초 비계측 전체 검사 `baseline-2026-11-18T08-56-17-364Z/run-1.log`의 Node 기본 출력 실측이다. 코드에서 읽은 원인 가설과 시간 자체의 실측을 구분한다. 파일별 합계·후속 회차 대조는 최종 보고서와 보조 이벤트를 따른다.

| 표본 | 1회차 시험 시간 | 원인 분류·근거 | 확인 범위 |
|---|---:|---|---|
| playbook-maker 묶음 | 181.359초 | `test/playbook-maker.test.ts:17`은 .mjs 19개를 별도 Node 러너로 실행하고 결과를 한 시험으로 보고한다. `test/playbook/healer-e2e.test.mjs:38` 등의 Orca 호출은 60초 제한·최대 4회 재시도를 한다. | 전체 묶음 시간은 실측. Orca 대기·다른 내부 작업의 정확한 분담은 미실측이므로 추정. 기준 인벤토리는 최상위 .test.ts 러너 관점이며 내부 .mjs의 개별 시간은 포함하지 않는다. |
| P025 v2 병합 기록 EIO 복구 | 70.183초 | `test/project-harness.test.ts:1808`의 mode 2개 × branchOnly 2개는 각각 새 저장소·프로젝트 생성·start·finish·실패 merge·복구 finish·merge를 수행한다. `repoFixture`는 45~59행에서 init·config 3회·add·commit을 매번 실행한다. | 전체 시험 시간과 네 시나리오 구조 확인. git 준비·다수 CLI 프로세스 기동이 기여한다는 원인 분류는 코드 독해에 따른 추정이며 각 비용은 아직 분리 계측하지 않았다. |
| 프로젝트 전체 생명주기 | 31.299초 | `test/project-harness.test.ts:163`은 실제 git/worktree와 CLI 경계의 전체 흐름을 확인한다. `test/helpers.ts:103`은 runPace마다 새 Node 프로세스를 띄운다. | 시험 시간은 실측. 각 CLI와 git 실행 비중은 추정. 대표 CLI·실제 git 판정은 최적화 후에도 보존 대상이다. |
| Windows ACP 부모 종료·시간 초과 | 42.838초 | `test/windows-watchdog.test.ts:105`는 kill·exit·timeout 3모드를 확인한다. 각 모드 finally의 `await pause(12500)`가 명시적 대기 37.5초를 요구한다. | 전체 시간은 실측, 37.5초는 코드상의 명시적 대기 요구량이며 별도 이벤트로 대기 자체를 계측한 수치는 아니다. 회수·무관 프로세스 생존 판정을 약화시키며 줄여서는 안 된다. |

`project-harness.test.ts`의 `repoFixture(` 등장 67개 중 하나는 정의이고 호출은 66곳이다. 이는 코드 정적 위치 수이며 루프 안 실제 호출 횟수·시간과 같다고 주장하지 않는다. T02의 재사용 표본 선정과 T05의 대표 CLI 보존 판단에 넘긴다.

## 건너뜀 조건

1회차의 963건은 통과 954·실패 0·건너뜀 9다. sh를 직접 실행하지 못하는 adopt 시험 3건, POSIX 지연 git 대역 2건, macOS/Linux 설치 전용 2건, Windows Antigravity 실기 경로 1건, 열린 핸들/권한으로 루트 교체 훅이 실행되지 않는 경계 시험 1건이다. 이 조건을 숨기거나 과거 P003의 건수와 혼동하지 않고 최종 회차의 이름·판정 및 건너뜀 사유와 대조한다.
