# AGENTS (합성 저장소)

이 저장소는 PACE 점검용 합성 자료다. 실제 제품·저장소와 무관하다.

## 팀 역할
정의서는 `.pace/team/agents/<이름>.md`가 원본이다. 역할 이름은 아래 다섯 개다.

| 역할 | 구분 | 정의서 |
|---|---|---|
| doc-auditor | 상시 | [.pace/team/agents/doc-auditor.md](.pace/team/agents/doc-auditor.md) |
| test-auditor | 상시 | [.pace/team/agents/test-auditor.md](.pace/team/agents/test-auditor.md) |
| conditional-helper | 조건부 | [.pace/team/agents/conditional-helper.md](.pace/team/agents/conditional-helper.md) |
| hub-notes | 허브 쪽 | [.pace/team/agents/hub-notes.md](.pace/team/agents/hub-notes.md) |
| unused-reporter | 허브 쪽 | [.pace/team/agents/unused-reporter.md](.pace/team/agents/unused-reporter.md) |

## 규칙
- 프로젝트 자료는 `projects/P###_YYMMDD_이름/`에 둔다(PROJECT.md, log.jsonl, 마감 시 METRICS.md).
- 팀 채택 프로젝트는 PROJECT.md 머리에 `- 팀 측정: v1`을 둔다. 없으면 미채택이다.
- 허브 자료는 backlogs/BL*/ 아래의 BACKLOG.md와 REVIEW-LOG.jsonl이다.
- 결정 주체는 pm 또는 user다. 범위·우선순위 변경은 user, 표기·정리는 pm이 정한다.
- 정의서의 변경 이력에 있는 항목은 처리가 끝난 것으로 읽는다.
