# 기존 fixture 의미 보존 대조

대조 기준은 T01 커밋 1f01f62의 두 시험 파일과 현재 diff다. 공통 원본은 형태마다 별도 모듈 수준 인스턴스이며 prepare와 복사는 동기다. 캐시 키를 외부 인자로 조합하거나 Node 파일 프로세스 간 디렉터리를 공유하지 않는다.

## project-harness

- 원래 repoFixture의 init, repo-local user.name·user.email·core.autocrlf, 동일 AGENTS/docs 파일과 첫 init commit만 원본 준비 callback으로 옮겼다. 실제 프로젝트 new/start/check/done/finish/merge, hook 오류 주입 및 이후 Git 변경/커밋은 기존 각 시험에 남았다.
- 기존 SHA/로그 단언은 같은 저장소의 실행 전후 HEAD·커밋 수 보존, 프로젝트/태스크 실제 커밋의 rebase 후 해시 반영, 태그 조상성, staged 상태와 HEAD 파일 내용 비교다. 예: 원래 239~318행의 태스크 커밋/rebase, 579~601행의 커밋 수/완료 태그, 875~884행의 거부 무변경, 1573~1590행의 실패 복구 HEAD, 1653~1659행의 FF, 1764~1768행의 main/worktree 분기. 이 커밋은 초기 복사 뒤 실제 Git으로 만든다.
- 1479행의 초기 로그 제목은 init 그대로다. 각 fixture의 최초 SHA/커밋 시각이 서로 달라야 한다는 단언, 최초 커밋 시각의 순서 단언, .git/index mtime/dev/ino 불변 단언은 확인되지 않았다. lstat은 symlink·hook/바이너리 모드 판정이며 Date.parse 비교는 이후 실제 finish/merge 사건 시각이다. 초기 SHA·시각이 같아지는 변경을 이런 후속 Git 작업의 대체로 쓰지 않는다.
- 대상은 계속 tempDir(pace-harness-)/app, HOME/bin은 복사본마다 새로 만든다. 원본은 별도 private HOME/bin을 만들고 정확한 source 키로 등록하며 조회에 cwd===key를 포함한다. dirname(source)나 tempRoot를 키로 쓰지 않는다. 추가 시험에서 원본과 두 복사본 HOME의 .gitconfig 소유 태그를 실제 Git global 조회로 각각 확인했다.

## agent-chain

- 기존 git helper의 -c core.autocrlf/user.name/user.email, env 생략에 따른 기존 프로세스 환경과 init.defaultBranch 동작은 그대로다. 원본 준비도 이 helper를 사용한다. 대상은 기존대로 빈 tempDir 자체다.
- S-9/S-10은 같은 복사본 안의 실행 전후 worktree 변경, S-11은 실제 staging/새 commit/삭제/.pace 변경을 확인한다. S-11의 commits.length=1은 초기 복사 뒤 추가한 실제 commit의 차이다. cooldown의 Date·clock은 Git 커밋 시각이 아니다. 서로 다른 fixture가 초기 SHA/커밋 시각이 달라야 한다는 비교나 index stat 시각 비교는 확인되지 않았다.
- 원본 HEAD 확인은 초기 형태를 바꾸지 않는 읽기 전용 확인이다. helper가 원본의 자체 Git ref를 확인할 때 private source HOME을 사용해도 initializer의 기존 브랜치·설정·환경을 바꾸거나 재초기화하지 않는다.

## 검증/제한

새 4개 helper 시험은 실제 파일·config·commit/ref·object 변경과 원본 트리 digest를 확인한다. 별도 harness 문맥 시험은 원본과 두 HOME 조회 및 app 경로를 확인했다. 기존 S-11 선택 실행도 통과했다. 기존 단언과 이름은 삭제하지 않았다. dashboard-init의 unborn/초기화/경로 거부 fixture는 전환하지 않았다.

초기 SHA·커밋 시각은 각 파일 안에서 같아지며 이것은 의도한 준비 재사용이다. 전체 검사 인벤토리와 기존 의미 검증은 아직 전체 실행/독립 검토로 확인해야 한다. 정적 호출 위치 수를 실제 루프 실행 횟수나 성능 절감의 인과 수치로 바꾸지 않는다.
