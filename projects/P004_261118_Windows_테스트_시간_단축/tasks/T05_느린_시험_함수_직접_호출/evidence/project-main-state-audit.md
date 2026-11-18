# project main 경로의 상태·출력 정적 대조

대상은 src/cli.ts main의 project 분기→projectCommand(new/start/task/done/finish/merge/list)→harness 공개 함수다. 보수적인 import/re-export/type/dynamic-import 텍스트 그래프와 실제 소스 SHA는 project-main-module-graph.json이다. 텍스트 그래프 자체를 모든 runtime 경로·전역 부재의 증명으로 쓰지 않는다.

| 상태/경계 | 실제 코드 대조 | 설계 판정 |
|---|---|---|
| cwd | cli.ts projectCommand는 호출 때 values.cwd 또는 process.cwd를 읽어 openRepo에 전달한다. harness는 매 호출 Repo를 만들고 Git에 -C/cwd를 지정한다. 상수 Repo/cwd 메모는 없다. | 같은 fixture 안 main↔worktree 요청마다 실제 chdir 뒤 호출한다. 요청 응답의 실제cwd/native 경로·repo branch/root를 확인하고 기존 파일/Git 단언을 유지한다. |
| HOME/PACE_HOME | core/paths.ts paceHome는 env를 호출 때 읽고, worker-settings.ts file/readWorkerSettings는 paceHome(env)를 호출해 매번 파일을 읽는다. tokens.ts collectTokens는 호출 때 homedir/env를 읽는다. | 자식은 첫 요청 fixture의 필터된 env/cwd로 시작해 import 시점도 그 fixture다. HOME이 바뀌는 새 fixture에는 같은 자식을 쓰지 않는다. |
| 설치/템플릿 경로 | core/paths.ts packageRoot/templatesDir는 import.meta.url 기반이다. | 정상/변이 사본의 cli.ts/module URL·packageRoot를 기록해 실제 소유 사본을 import했는지 확인한다. |
| 하네스 전역 | harness.ts의 gitLimits는 기본 timeout/env를 가진 mutable 상태다. 대입은 withGitLimits 진입/복원뿐이며 선택 projectCommand 경로는 이를 설정하지 않는다. project parser의 repo/out은 호출 지역이다. | 블록 간 공유 금지, fixture 간 새 자식. 기존 Git 제한은 유지하며 요청 실패 후 같은 fixture의 정상 경로/상태도 검증한다. |
| metrics/brain/dashboard | metrics/tokens/brain의 Map/Set은 주로 함수 지역이며 날짜/파일/환경을 호출 때 읽는다. dashboard.ts의 indexedFiles/ignoredPaths는 generateDashboard 안 지역이다. | 같은 fixture에서 실제 done/finish/merge의 상태/대시보드/commit 단언을 그대로 실행한다. new/list만으로 이 경로가 검증됐다고 하지 않는다. |
| 기타 CLI import 상태 | console-decode.ts의 cachedCodePage, agent/process.ts의 reaperStats 같은 상태가 있다. 전역 setInterval 검색 결과 중 REAPER_SCRIPT는 자식용 문자열이며 import 시 timer 실행이 아니다. 전체 CLI의 모든 상태가 없는 것은 아니다. | 같은 child를 다른 블록·HOME에 공유하지 않는다. project 이외 명령으로 일반화하지 않는다. 대상 경로 밖 캐시를 무시한 범용 재사용 안전성을 주장하지 않는다. |
| 리스너/타이머 | 대조한 project handler/harness/metrics/brain/event-log/worker-settings 경로에 process listener/timer 등록은 없다. 런타임 임의 private handle 계수는 쓰지 않는다. | 자식 수명은 블록/fixture로 제한한다. 예외/도구 실패 후 불확실하면 실패로 멈추며 장기 전역 재사용은 하지 않는다. |
| stdout/stderr | projectCommand out 및 formatReport 결과는 process.stdout.write다. HarnessError/BacklogError/ProjectLogError는 process.stderr.write 후1을 반환한다. runDeclaredShell/gitSpawn/대시보드/metrics Git는 spawnSync의 pipe 반환을 처리한다. | 현재 대상에서 검사하는 보고/오류 문자열은 JS write 경로다. fs.writeSync(1/2)·stdio inherit 출력은 대상 경로에서 발견하지 않았다. JS write를 요청 안에서 캡처한다. 부모 pipe의 예상 밖 raw 출력은 도구 실패로 처리해 다른 요청에 섞지 않는다. |
| 실제 종료 | projectCommand에는 process.exit 호출이 없다. bin/pace.ts는 main 반환을 exitCode에, 예외를 UsageError2/나머지1과 pace stderr에 매핑한다. | 자식이 동일한 bin 예외 매핑을 수행한다. process.exit/예기치 않은 자식 종료·IPC·timeout·overflow는 정상 제품1로 바꾸지 않고 별도 도구 실패로 처리한다. |

동적 구현 검증은 별도다. fixture별 최초 main import 경로/시간의 home·cwd, 각 요청의 실제 context/복원 상태를 확인한다. 실제 done/finish/merge는 대상3개 원래 파일/Git 단언으로 검증한다. adapter 검증1건에서는 같은fixture main/worktree·오류 뒤 정상호출과 새HOME의 새 자식 세대를 확인하고 실제CLI/직접호출의 UsageError2·parseArgs 기타예외1·HarnessError1의 status/stdout/stderr를 같은 입력으로 대조한다. OS의PID 재사용 가능성과 프로세스 세대는 구별한다.

이 검토는 현재 코드에 대한 계획 근거다. 실행 결과·미래 코드·다른 CLI 명령의 모듈 안전성을 증명하지 않는다. 발견되지 않은 요청 후 상태 차이/예상 밖 출력/자식 종료가 있으면 성공으로 무시하지 않고 중단한다.
