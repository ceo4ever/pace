**결론:** T01이 `대기`이므로 worktree 작업자가 자율로 수행합니다. 질문은 0건이고 승인 대기도 0건입니다. 승인 확인은 A 항목에 걸릴 때만 합니다. 이 답은 계획이며 실제 실행은 하지 않았습니다.

**담당과 순서**

1. **분석.** 담당은 worktree PM(작업자)입니다. 명령은 `pace project task P### "<표의 T01 이름 그대로>"`입니다.
   - P###은 이 worktree의 브랜치 `project/P###` 번호를 씁니다.
   - 명령이 TASK.md를 만들고 표 상태를 `진행`으로 바꿉니다.
   - 목적·재료를 씁니다.
   - T01은 첫 태스크라 앞 TASK-CLOSE의 "남긴 것"은 없습니다.
2. **설계.** 같은 담당입니다. 기록 대상은 TASK.md이며 다음을 씁니다.
   - 증명 범위·판정 주체
   - 기준 `T-n`
   - 기준마다 시나리오 한 줄 이상인 테스트 표
   - 접근
   - 기준 문서는 §5(standards.md)로 고릅니다.
3. **구현 전 검토.** 담당은 작성 PM과 다른 제공자의 별도 reviewer입니다. 명령은 `pace agent verify`입니다.
   - pass(blocking 0)이거나 사용자 결정 waiver일 때만 구현합니다.
   - blocking은 고친 뒤 verify를 다시 돌립니다.
   - 출력에 `escalation`이 있으면 반복 실패 절차를 따릅니다.
   - 다른 제공자를 호출할 수 없으면 B1에 따라 `--allow-same-provider`로 진행하고 `cross: false`와 미실행 이유를 기록합니다.
   - 양쪽 모두 미실행이면 A-3으로 허브를 통해 요청하고 사전 검토 관문만 보류합니다.
   - 대상·판정·지적 처리·방식을 태스크 기록에 남깁니다.
4. **구현.** 담당은 worktree PM입니다. 주변 코드 스타일을 따르고 언어 색인의 안티패턴과 대조하며, 버그면 RED 테스트부터 씁니다.
5. **테스트.** 담당은 worktree PM이며 저장소 검사 명령과 E2E를 수행합니다. tester ∥ reviewer는 새 맥락으로 배정합니다.
   - `escalation`을 먼저 따르고, 없으면 fail·blocking을 고쳐 둘 다 다시 돕니다.
   - TASK-CLOSE "리뷰"에는 차수별 한 줄과 교본 대조 한 줄을 적습니다.
6. **마감.** 순서는 다음과 같습니다.
   - TASK-CLOSE.md 작성
   - `pace project check P### T01`
   - `pace project done P### T01`
   - `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`
   - 커밋 `feat(P###/T01): …` (TASK-CLOSE·상태·메모리를 같은 커밋에)
7. **다음 단계.**
   - `대기` 태스크가 더 있으면 맨 앞부터 반복합니다.
   - 모두 `완료`나 `보류`면 PROJECT-CLOSE.md(목표 달성 판정 포함)를 쓰고 `pace project finish P###`를 실행합니다.
   - finish가 통과하면 log.jsonl의 자체 판단 결정을 합의와 대조합니다. 변경이 없으면 보고에 "대조: 변경 없음"을 적습니다.
   - 완료는 `worker_done`으로 보고합니다.

**경계**
- merge·푸시·배포는 하지 않습니다. 허브가 owner 승인 뒤 main에서 실행합니다.
- main이나 다른 경로의 파일은 건드리지 않습니다.
- 합의(`P-n`, 범위) 변경, 안전 기준 약화, 같은 실패 3회, 장애는 `ask`로 허브에 인계하고 해당 조치만 보류한 채 독립 작업은 이어갑니다.
- 백로그·프로젝트 원본 문서를 직접 편집했다면 커밋 전에 `pace backlog refresh`를 실행합니다.

**회신·보고**
- 태스크 단계에서는 회신이 필요 없습니다.
- 완료 시 `worker_done`과 함께 대조 결과, 남은 일, 사후 요약(PM이 대신 정한 사항)을 보고합니다.

**자동 첨부와 읽은 범위**
- 자동 첨부된 항목은 사용자 이메일 컨텍스트 1건입니다. 값은 쓰지 않으며 사용하지도 않습니다.
- SessionStart hook 컨텍스트도 있었습니다. pace agent가 호출한 자식 세션이라 부트를 생략합니다.
- `skills/pace-project-dev/SKILL.md`는 1–93줄 전체를 읽었습니다.
- `references/task-steps.md`는 1–11줄을 읽었습니다.
- `references/decision-rights.md`는 1–45줄을 읽었습니다.
- Glob으로 `skills/pace-project-dev/` 아래 파일 목록만 확인했고, 나머지 references는 열지 않았습니다.
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았습니다.
- 전체 바이트는 도구로 확인하지 않아 적지 않습니다.
