# 사전 2차 보완 처리

동일 anthropic Claude Opus 5.5 reviewer의 2차 pass(B0/SF3)를 `pre-review-2.md`와 PRE-REVIEW에 연결했다. 최초 fail/B2/SF6 이력과 최초 TASK를 유지한다. 현재 TASK의 기준·범위는 재검토 해시 그대로다.

- SF-1: 독립 PACE 사본의 기준 main에 현재 checks map을 실제 커밋한 뒤 작업본 card 소스만 변경했다. `fast-2026-11-18T17-43-49-763Z/environment.json`의 adoptedCommit·전체 복사 byte manifest 및 도구의 Git 상태 단언으로 연결한다. README·AGENTS·OPI test-map·개발 testing 문서에 원래 P004 worktree는 main의 map 차이 때문에 병합 전 전체 전환함을 명시했다. feature 브랜치에만 새 checks를 커밋해도 main 기준을 바꾸지 않는 실제 CLI 시험이 있다.
- SF-2: `shell-result.ts`는 pid/status/error/signal에서 started와 실행 상태를 만든다. 실제 timeout/16MiB 초과 출력, 실제 ENOENT, 구조값 SIGTERM 및 실제 부모 OS 종료를 시험했다. 선언 조회 기준과 실행 전/후를 출력 문구로 추정하지 않는다. 사전 검사/시험의 실제 실패는 즉시 종료하고, 새 changed 경로만 시작 못한 driver를 확인 불가로 처리해 전체로 전환한다. 기존 unit의 실패 판정은 유지함을 실제 Python 부재 표본으로 확인했다.
- SF-3: HEAD 대체 기준은 현재 커밋을 읽을 뿐 검토된 브랜치가 아니라는 점을 README·두 스킬 지침에 명시했다. 공유 helper의 optional revision은40/64자리 commit SHA로 제한하고, openRepo의 branch 검증으로 넘기지 않고 executionCommand/committedCommand 조회에만 별도로 전달한다. 인자 없는 all/finish의 main 기준과 ok/output 의미는 유지한다.

부모 프로세스 자체의 OS 신호 종료는1과 다른 비성공 코드일 수 있고 후속 실행이 없다는 범위를 문서화했다. timeout/중단 fixture는 유한 수명 자식만 만들고, PID가 기록된 자식의 실제 소멸을 확인한 뒤 테스트 소유 임시 루트 정리를 허용한다. Windows 임의 자손 회수의 기존 한계를 개선했다고 주장하지 않는다.
