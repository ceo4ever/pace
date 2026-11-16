# 백로그·BR 규칙과 작업자 설정

SKILL.md에서 옮긴 문서다. BR 번호·BACKLOG 상태 규칙, start의 작업자 도구 선택, 작업자 모델·effort, 대시보드 갱신.

## 백로그·BR 규칙

BL 출처 프로젝트에 추가 태스크가 필요하면 진행 중인 BL에서 같은 번호의 BR을 먼저 기획한다. main에서 `pace backlog brief <BL> "<이름>"`을 쓰기 전에 다음 BR 번호가 필요한 T 번호와 맞는지 확인하고, 원본을 worktree에 반영한다. 번호가 다르거나 반영 충돌이 나면 덮어쓰지 않고 멈춰 판단한다. 이미 시작한 태스크는 대응 BR과 현황을 준비한 뒤 `done`을 다시 실행한다. 완료 BL에는 추가하지 않는다.

백로그 형식 정본은 [backlog-format.md](../../pace-project-init/references/backlog-format.md). **백로그(폴더) → 프로젝트, 브리프(영어 brief, BR 파일) → 같은 번호 태스크**다. `pace backlog new "<이름>"`·`brief <BL> "<이름>"`로 기획하고 `pace project new "<이름>" --from <BL 폴더 또는 BL{YYMMDD}_{NN} 앞부분>`으로 착수한다. 출처는 BACKLOG.md, BR01은 T01이다. 모호한 앞부분과 브리프 파일 출처는 거부한다. 끝난 백로그에는 브리프를 덧붙이지 않는다(새 묶음은 새 백로그, 작은 개선은 `idea`나 대화에서 프로젝트).

`done P### T01`은 BL 출처 프로젝트의 BR01과 BACKLOG.md 현황 행을 함께 `완료`로 바꾼다. BACKLOG.md 전체 상태는 start 성공 시 진행, worktree finish 동안 진행을 유지하고 실제 merge 성공 시 완료, main 직접 finish 성공 시 완료로 바꾼다. 전체 백로그 보류는 자동 전환하지 않고 개별 보류 BR을 유지한다. 보류 해제는 사용자가 결정해 백로그 원본을 갱신하고 대시보드를 새로 생성한 뒤 명령을 다시 실행한다. 마감 때 BR·태스크·현황의 번호와 완료/보류 상태가 일치하지 않으면 멈춘다. 새 태스크 표는 태스크·이름·상태·커밋 4칸이다. 이미 끝난 프로젝트의 5칸 문서는 그대로 읽는다.

## start의 작업자 도구 선택

작업자 도구는 `--agent` > PROJECT.md `- 작업자:` > 정의서 `작업자 도구:` > 지금 세션 도구 순서로 고르고, 받을 수 없는 이름이면 worktree를 만들기 전에 거부한다.

## 작업자 모델·effort

작업자 모델·effort는 `pace worker show`로 확인하고 `pace worker set <도구> <model|effort> <값>` 또는 `pace worker reset <도구> <model|effort>`로 전역 관리한다. 실행별 요청은 `pace project start P### --model <값> --effort <값>`에 전달한다. `--effort default`는 공통 설정을 무시하고 도구 기본값을 쓴다.

## 백로그 대시보드 갱신

백로그·프로젝트 원본 문서를 직접 편집했다면 커밋 전에 해당 저장소에서 `pace backlog refresh`를 실행한다. 프로젝트 태스크 커밋에는 변경된 `backlogs/dashboard/data.js`도 포함한다. 대시보드가 없는 저장소는 건너뛴다.
