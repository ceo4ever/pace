형식 완성 작업은 적용하지 못했습니다. 작업을 한 번 실행하는 Python 명령이 승인을 받지 못해 아무것도 바뀌지 않았고, 검증도 돌리지 못했습니다.

**지금 상태**
- `fixture/` 안은 원래 그대로입니다. 단, `fixture/.apply.py`가 하나 새로 생겼습니다.
- `.apply.py`는 이번 형식 작업을 한 번에 수행하는 스크립트입니다. 마지막 단계에서 자기 자신을 지웁니다.
- 처음에는 heredoc으로 실행하려 했지만 명령 검사기가 막았습니다. 그래서 스크립트를 파일로 두고 `python3 -I` 한 줄로 실행하려 했는데, 이 실행도 승인이 필요하다는 응답만 돌아왔습니다.
- Edit나 Write로 같은 작업을 우회해서 하지는 않았습니다. "하나의 Python 명령"이라는 지시와 승인 절차를 지키려는 선택입니다.

**스크립트가 하는 일**
- **role 행**: P602 `log.jsonl`의 start.role 두 행에 `reference/role-record.ts`의 키를 모두 채웁니다.
  - `by`는 `cli`, `source`는 `option`, `definition`은 `.pace/team/agents/<name>.md`로 씁니다.
  - hash는 64자리 합성 지문입니다.
  - 나머지 값은 `method=prompt`, `model=synthetic-model`, `effort=medium`, `settingsStatus=planned`, `toolsPermissionApplied=false`, `runtimeObserved=false`입니다.
- **프로젝트 폴더**: `projects/P601_261023_의존성_기록`, `projects/P602_261120_릴리스_문서`로 옮깁니다. `projects/P601/`·`projects/P602/`를 가리키던 참조도 같이 고칩니다.
- **백로그 자료**: `decisions/`와 `review-records/`를 `backlogs/BL261112_02_허브_진행_메모/` 아래로 옮기고, BACKLOG.md의 링크를 맞춥니다. 이 폴더에 `REVIEW-LOG.jsonl`도 만듭니다.
- **백로그 REVIEW-LOG**: 기존 R1~R5 기록을 그대로 따라 7행으로 만듭니다.
  - 순서는 R1 fail, R2 fail, R3 fail, diagnosis(planning), R4 fail, decision(`by:pm`), R5 pass입니다.
  - `result_hash`는 기록 원문의 sha256입니다.
- **P602 REVIEW-LOG**: 기존 `result_hash`가 기록 원문과 맞지 않아, 원문 sha256으로 다시 계산해 바꿉니다.
- **docs/README.md**: 저장소 규칙과 최근 변경 근거 4건을 링크와 함께 새로 씁니다.

**실제 형식 참고 경로** (`/private/tmp/pace-P012-work/T03-fixture-author/` 기준)
- `reference/role-record.ts`: `validStartRole`
- `reference/event-log.ts`: `validateEvent`
- `reference/review-log.ts`: `validEntry`
- `reference/src/team/model.ts`: `teamSourcePath`
- `reference/src/project/backlog.ts`: 백로그 폴더 형식은 `BL<yymmdd>_<nn>_<이름>/BACKLOG.md`입니다.

**선택이 필요한 두 가지**
- **BACKLOG.md 위치**: 이 스크립트는 BACKLOG.md를 루트에 둡니다. 실제 도구는 BL 폴더 안에 BACKLOG.md가 있어야 하므로 거기로 옮길 수도 있습니다. 옮길지 알려 주세요.
- **definition 경로**: `definition`은 `.pace/team/agents/<name>.md`로 쓰지만, fixture의 실제 정의서는 `teams/<name>.md`입니다. 이 불일치는 지시대로 두었습니다.

승인해 주시면 다음 한 줄을 실행하고, 그 뒤 `reference/src/project/event-log.ts`의 `validateEvent`와 `readLedger` 규칙으로 모든 log·ledger 행을 검사해 결과를 보고하겠습니다.

`python3 -I /private/tmp/pace-P012-work/T03-fixture-author/fixture/.apply.py`
