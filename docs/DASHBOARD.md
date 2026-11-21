# 백로그 대시보드

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

공통 화면·스타일·레이아웃 정본은 `src/dashboard/backlog/`다. 설치 시 PACE app에 포함되며 각 프로젝트 화면은 실행한 PACE 패키지의 공용 자산을 file URL로 불러온다. 설치 CLI로 생성하면 설치본을 참조한다. 화면을 고쳐 PACE를 업데이트하면 공용 참조를 쓰는 프로젝트 화면도 새로고침 시 같은 코드를 사용한다. 프로젝트에 JS/CSS를 복제하지 않는다.

PC 경로는 커밋되는 파일에 두지 않는다. 진입 HTML `backlogs/README.html`(표지 `pace:backlog-shared:2`)은 모든 PC에서 같은 바이트이고 `dashboard/data.js`와 `dashboard/local.js`만 읽는다. `backlogs/dashboard/local.js`는 이 PC의 공용 자산 file URL을 담아 CSS를 붙이고 core → app 순서로 실행하는 PC별 파일이며, init이 함께 만드는 `backlogs/dashboard/.gitignore`(커밋)로 Git에서 빠진다. local.js가 없으면(새 clone·worktree) 화면은 `pace backlog init` 안내를 보이고, 다음 refresh·하네스 자료 갱신이나 init이 만든다. refresh는 수정하지 않은 v2 진입점이고 제외가 이미 될 때만 local.js를 맞추며 Git 변경을 새로 만들지 않는다. 안전 경계: 제외는 `backlogs/dashboard/.gitignore`가 실제로 빼는지(`git check-ignore -v` 출처, 부정 규칙 아님)로 판단해 이 PC에만 있는 규칙에 기대지 않고, 기존 .gitignore는 고치지 않으며(맞지 않으면 init 실패), Git이 추적 중인 local.js나 사용자가 고친 local.js(URL 줄만 다른 생성본이 아님)는 쓰지 않고, 부분 실패는 이번에 쓴 파일만 되돌린다. 설치본 file URL을 직접 담은 v1 진입점(`pace:backlog-shared:1`)은 수정하지 않은 생성본일 때 init이 v2로 바꾸며, 이 한 번의 HTML·.gitignore 변경은 사용자가 커밋한다. init은 자동 add/commit을 하지 않으며 하네스의 초안·미커밋 변경 보호를 우회하지 않는다.

프로젝트별 생성 자료는 `backlogs/dashboard/data.js`에 둔다. 이 경로는 기존 Git 인덱스·자동 커밋 정책을 유지한다. 원본 문서를 직접 편집한 뒤 `pace backlog refresh`로 자료를 갱신하며 화면 새로고침은 이미 생성된 자료만 다시 연다. 자료 수집의 Git ignore/info-exclude·민감/숨김·symlink·크기 제한과 실패 시 snapshot 보존 규칙은 유지한다.

opi 신규·기존·최신화 마무리는 `pace backlog init`을 실행한다. 새 프로젝트에는 진입 HTML·자기 자료·`.gitignore`와 이 PC의 local.js만 생성한다. PC/PACE 설치 경로가 바뀌면 init이 local.js만 다시 쓴다 — 커밋되는 파일은 바뀌지 않는다. 공용 참조가 아닌 기존 화면은 바이트를 보존하고 전환하지 않았음을 알린다. 추가 사용자 파일은 제거하지 않는다.

Git 작업 트리 안에서는 상위 저장소 루트를 사용하며 없으면 현재 폴더에서 git init한다. Git 실행/조회 오류는 부재로 오인하지 않는다. HOME/파일시스템 루트 자체는 새로 초기화하지 않는다. 자동 add/commit/remote/push는 하지 않는다. 생성 실패 후 새 .git은 보존하고 재시도 방법을 알린다. unborn 상태에서도 대시보드 생성·갱신·조회는 가능하지만 new/brief와 프로젝트 하네스는 첫 commit/main 조건이 필요하다.

refresh는 기존 완성 대시보드만 갱신한다. 완전 부재는 init 안내 후 건너뛰고 부분 상태는 기존 파일을 보존해 복구 안내 오류를 낸다. 저장소 개발용 대안은 node scripts/backlog-dashboard.ts이며 설치본에는 scripts가 포함되지 않는다. 조회 PC에는 PACE 설치본이 필요하고 별도 웹서버는 사용하지 않는다.

각 BACKLOG.md의 `- 프로젝트 기준 경로: projects/`는 저장소 루트 기준이며 생략하면 같은 기본값을 쓴다. 보관 시 projects/backup/으로 한 줄을 바꾸며 backlogs/backup/BL…/으로 백로그를 이동해도 목록·ID·태스크·자료 연결은 유지한다. 이동 전 상대 링크는 조회 시 대응하며 원문은 일괄 재작성하지 않는다.
