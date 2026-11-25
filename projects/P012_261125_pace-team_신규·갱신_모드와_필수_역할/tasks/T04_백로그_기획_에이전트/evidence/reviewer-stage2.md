## T04 구현 재검토 (3단계)

**blocking은 없습니다.** 새 허브 역할의 수신자·실행 경계 검사는 기존 worktree 역할 검사를 약화시키지 않습니다. 행동 평가 원응답과 전체 pass는 독립 tester가 판정하며, 이 기록은 그 판정을 대신하지 않습니다.

### 노출 범위
- 읽은 파일은 요청한 목록과 `purpose.txt`·`final.txt`를 뺀 나머지 전부입니다. `stage1.md`, `stage2-before.md`, `impl-diff.patch`, `requirements-trace.md`, `team-refresh-assessment.md`, `team-classification.json`, `team-verify-report.json`, `eval-plan.md`, `boundary-retest.txt`, `TASK.md`, `BR04.md`, `owner-scope.md`를 읽었습니다.
- 2단계가 본 `impl-diff-final.patch`는 읽지 않았습니다. 그래서 이번 `impl-diff.patch`와 2단계의 diff가 같은지는 확인하지 못했습니다.
- 원본 저장소와 현재 main은 없습니다. 인용된 행 번호, `backlog-format.md`·`backlog.md` 존재, `pace-implementer.md` 5행의 tier는 대조하지 못했습니다.
- 사용자 이메일은 판단에 쓰지 않았습니다.

### 수신자·공통 실행 경계 (`test/project-role.test.ts`)
- 변경은 한 줄입니다. `member.role === "lead"`에 `|| hubRoles.has(member.name)`을 더했습니다.
- `hubRoles`는 `.pace/team/required-roles.json`에서 `scope: "hub"`인 역할만 모은 집합입니다.
- worktree 역할(implementer·reviewer·tester)은 허브 집합에 없습니다. 이들은 여전히 `else` 분기로 가서 `pace-project-lead|호출자` 정규식을 통과해야 합니다. 이 분기는 바뀌지 않았고, 완화한 곳이 없습니다.
- 허브 역할은 `assert.equal(receiver, "허브 PM")`으로 정확히 일치해야 합니다. 수신자가 없으면(`undefined`) 실패합니다. 이 분기는 오히려 엄격합니다. 반대로 허브 역할이 `호출자`를 쓰는 것도 막힙니다.
- 직전 줄의 공통 단락·지시문 대조(`instruction.includes(source, hash)`, `workerInstructions.join === spec`)는 모든 구성원에 그대로 적용됩니다. 허브 역할이라고 면제되지 않습니다.
- 생성물의 실행 경계 단락은 공통 문구입니다. 계획자 본문에서 "해결안을 반환하는 역할은 호출자가 수신자다"와 `HANDOFF: 허브 PM`이 같이 나오는데, 반환 대상인 호출자가 허브라서 모순은 없습니다.
- 잔여 위험은 둘입니다.
  - 허브가 아닌 역할을 `scope: hub`로 잘못 등록하면 그 역할만 `허브 PM`을 요구받습니다. 이것은 실패를 부르는 쪽이라 안전한 방향입니다.
  - 이 테스트는 `member.name`과 JSON의 `role`이 같은 문자열이라는 전제에 기댑니다. 이 후보에서는 `pace-backlog-planner`로 일치합니다.

### 이전 지적 해소 여부

| 이전 지적 | 상태 |
|---|---|
| 1단계 1~3 (저장소 맞춤, 완료 백로그와 목차 직접 편집 금지, tools·명령 정본) | 해소 유지. 원본·생성물에 명시되어 있습니다. |
| 2단계 1a: 교차 제공자 | 해소. `eval-plan.md`에 작성자는 Codex, 평가는 Claude Opus로 분리되어 있습니다. |
| 2단계 1b: 근거 열 제외 | 해소. "역할 원본과 근거 열을 제거한 정본 발췌"로 명시되어 있습니다. |
| 2단계 1c: 음성 입력이 작성자 합성물 | 부분 해소. 채점은 독립 tester로 정해졌지만, 입력은 여전히 작성자가 만든 합성 BR 3개라서 통과가 쉽습니다. 이월합니다. |
| 2단계 2: ID 충돌(시험용 사본의 BP-01·02) | 미해소. 이 기록에서 새로 확인할 근거가 없습니다. 채점 때 구별 표시를 유지해야 합니다. |
| 2단계 3: medium 근거 | 부분 해소. `pace-implementer.md` 5행과 `docs/TEAM.md`를 인용합니다. 원본 확인은 못 했습니다. |
| 2단계 6: 문구 어긋남 | 미해소. 정본 BP-08은 "종료 백로그", 원본은 "완료 백로그"입니다. 정본 BP-06의 "편집 뒤"는 원본에서 "범위 안의 최신화 뒤"로 좁아져 있습니다. 의미는 같다고 보지만 문구는 정본과 정확히 일치하지 않습니다. |
| 2단계 7: T-2 허브 분류 출력 | 미해소. `team-classification.json`에는 `pace-backlog-planner`가 `required`에 `status: unconfirmed, refs: []`로만 있고 `scope: hub`는 보이지 않습니다. 허브 분류는 `required-roles.json`의 정적 내용으로만 확인됩니다. |

### 일관성 대조
- 원본 지문 `a43bf47f…`가 패치의 Claude·Codex 생성물 헤더, `requirements-trace.md`, `team-verify-report.json` 두 행에서 모두 같습니다.
- 정본 BP-01~12 ID와 버전은 diff의 표 행과 trace의 대조표가 맞습니다.
- 문제 해결자는 미등록으로 남아 있고, owner 결정 A와 일치합니다.

### 관측 한계
- `boundary-retest.txt`는 테스트 1건 pass(`pass 1`, `fail 0`)만 보여줍니다.
  - 실행 명령, 후보 해시, 시각이 없습니다.
  - 전체 스위트 결과가 아니므로 T-5를 충족했다고 볼 수 없습니다.
- 적재 검증은 이름·키워드 일치만 봅니다("의미·진실성 검증 아님").
  - 두 호스트 모두 effort는 `unconfirmed`입니다.
  - Claude 응답의 `vfy-` 표지 두 개는 문장 없이 표지 문자열만 있습니다.
- 호출 전후 지문 대조는 호출자 책임이라서 이 증거에는 기록이 없습니다.
- 금지 규칙(커밋·푸시·완료 백로그 편집)은 글로만 강제되고 도구 차단이 없습니다. 기존 팀과 같은 구조라서 결함으로 보지 않습니다.
- T-4(행동 평가)와 T-5(전체 검사)의 원응답과 채점은 아직 증거에 없습니다. 미확인으로 두며, 독립 tester가 채워야 합니다.

### 결론
제품 diff에는 blocking이 없습니다. 열린 항목은 모두 note 수준입니다. 문구 정렬(BP-06·08), ID 충돌 표시 유지, 음성 입력의 독립성, 전체 스위트 실행 기록을 tester 판정 전에 챙기면 됩니다.

pass
