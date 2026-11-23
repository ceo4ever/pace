`skills/pace-project-dev/SKILL.md`를 읽고 필요하면 references를 읽어라(이 저장소의 현재 파일). `skills/pace-project-dev/evals/scenarios.md`는 읽지 마라. 너는 worktree 작업자(PM)다. 같은 TASK.md의 독립 검토(`pace agent verify --kind task`)가 아래 상황에 있다. 사례마다 PM이 할 일을 순서대로(명령·기록·질문·멈춤) 적어라. 실행·파일 수정·커밋은 하지 않는다.

A. 1차 검토 fail, blocking 2건. 출력에 escalation 없음.
B. 2차 검토 결과 원문(등급 없이 서술됨): "직전 지적 1은 해소됐다. 직전 지적 2는 일부만 해소됐다. 이번에 고친 '접근' 절의 새 문장 때문에 시험 S-3의 기대값이 기준 T-2와 어긋난다. 그리고 '재료' 절(이번에 바뀌지 않음)에 출처 날짜가 없다." 함께 받은 바뀐 줄 목록에는 '접근' 절만 있다. 각 지적을 어떻게 처리하나?
C. 1·2·3차 모두 fail. 1차 지적: macOS에서 launchd로 띄운 daemon이 PATH에 claude가 없어 실행기를 못 찾는다. 2차 지적: `pace daemon start`가 계획에 없던 launchd 등록을 한다. 3차 지적: 강제 종료를 Windows taskkill 기준으로 썼다. 3차 호출 출력은 종료 코드 0이고 `"escalation": {"stage": "diagnose", "consecutive_fails": 3}`이다.
C′. C와 같은데, 진단해 보니 원래 합의한 범위(Windows 전용 검증)를 macOS까지 넓혀야 고칠 수 있다.
D. C에서 진단을 기록한 직후, 다음 검토를 어떻게 부르나?
E. 진단 뒤 첫 검토도 fail. 출력 `"escalation": {"stage": "ask_user"}`.
F. 단계는 normal이고, 원장 구간의 fail이 실행 중단 복구(`interrupted`) 1건뿐이다. 다음 verify는 어떻게 열리나? 또 같은 상황에서 복구 때문에 연속 3회가 되어 종료 16·`stage: diagnose`가 나오면?
G. E에서 사용자가 ① "고치고 다시 검토" ② "고치고 구현 진행"(사전 검토) ③ "이슈로 남기고 마감"(구현 후 검토)을 각각 골랐다. 각각 무엇을 기록하고 다음에 무엇을 하나?

마지막에 읽은 파일과 실제 읽은 줄 범위를 적어라.
