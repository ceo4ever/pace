# 실제 관측 자료의 범위

source CLI를 격리된 Git 임시 저장소·두 worktree 및 별도 저장소에서 실행했다. actual-worktrees.json에 각 argv/cwd/상태·자동 갱신·거부된 두 번째 요청·순차 실행 timeline과 source SHA를 보존했다. 모델 호출은0이며 실제 Studio MCP·비참여 직접 호출·Windows 실증으로 확대하지 않는다. check-actual-proof.mjs는 현재 원본 자료·상태와 원시 영수증을 직접 대조한다. 잠금 unit 시험은 래퍼 SIGKILL+자식 생존, 자식 정상 종료+손자 생존에서도 의도적으로 free인 확인기를 써 소유자 조건을 독립 검증한다.

첫 actual-worktrees.json의 machine 음성은 살아 있는 래퍼에 owner unknown/hold였다. 당시 세부 조회 사유를 기록하지 않아 ps 실패/시간초과 등의 정확한 원인은 미확정이며 busy 관측으로 세지 않는다. 최종 actual-worktrees-final.json은 새 코드 source CLI로 두 scope 모두 busy/owner alive/ownerCheck same-start를 직접 관측했다. 새 코드는 외부 조회 불명 사유를 구분하고 자기 자동 갱신은 생성 때 확보한 시작 식별을 비교한다. 첫 자료는 덮어쓰지 않는다.

최종2 관측은 guard 경합 유한 재시도·alive status의 확인기 생략과 SIGHUP 보완 뒤 새 source CLI로 실행했다. repo/machine 각각 기존 순차 요청 외에 두 CLI를 동시에 시작해 gate 해제 전 하나만 진입함을 직접 관측했다. 앞의 final과 첫 관측을 모두 보존한다. 최신 정상 근거는 actual-worktrees-final2.json이다.
