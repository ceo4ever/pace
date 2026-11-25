**순서 (worktree 작업자, T01 `대기`)**

1. **위치·경계 확인**: 현재 위치가 project worktree(`../<저장소>.wt/P###`, 브랜치 `project/P###`)인지 확인한다. main의 파일은 건드리지 않는다. merge·배포는 하지 않는다. 그건 허브와 owner 승인 몫이다.
2. **분석**: 실제 명령은 `pace project task P### "<T01 표의 이름 그대로>"`이다. 이름이 `대기` 행과 같으면 T01 번호로 열리고 표 상태가 `진행`이 된다. 그 뒤 `TASK.md`에 목적과 재료를 쓴다. 앞 태스크가 없으므로 "남긴 것"은 읽을 것이 없다.
3. **설계**: `TASK.md`에 증명 범위·판정 주체, 기준 `T-n`, 테스트 표(기준마다 시나리오 한 줄 이상), 접근을 쓴다. 기준 문서는 standards.md에서 고른다.
4. **구현 전 검토**: 작성 PM과 다른 제공자의 새 맥락 reviewer에게 `pace agent verify`로 `TASK.md`를 검토받는다. pass(blocking 0)이거나 사용자 결정 waiver일 때만 구현한다. 검토한 내용이 실질적으로 바뀌면 다시 검토받는다. 대상·판정·지적 처리는 태스크 기록에 남긴다.
5. **구현**: 기존 코드 스타일을 따른다. 버그라면 실패하는 테스트(RED)부터 쓴다.
6. **테스트**: 저장소 검사 명령과 E2E를 돌린다. tester ∥ reviewer를 새 맥락으로 배정해 판정하고, `escalation`이 있으면 그것부터 따른다. fail이나 blocking이 있으면 고친 뒤 둘 다 다시 돈다.
7. **마감**:
   - `TASK-CLOSE.md`를 쓴다. 리뷰는 차수마다 한 줄, 교본 대조 한 줄을 적는다.
   - `pace project check P### T01`을 실행하고, 통과하면 `pace project done P### T01`을 실행한다.
   - `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`으로 진행 기록을 갱신한다.
   - `feat(P###/T01): …` 커밋에 TASK-CLOSE·상태·메모리를 함께 넣는다.
8. **이후**: 다음 `대기` 태스크가 있으면 이어서 진행한다. 모두 끝나면 PROJECT-CLOSE.md를 쓰고 `pace project finish P###`를 실행한다. 통과한 뒤에는 자체 판단 대조를 하고 `worker_done`으로 끝낸다.

**질문·승인 대기 수**: 기본 경로는 질문 0, 승인 대기 0이다. 다만 아래 경우는 해당 조치만 보류하고 독립 작업은 이어간다.
- 기준·범위 변경이 필요한 경우: `ask`로 코디네이터에게 인계한다.
- reviewer 발동이 불가능한 경우: 결정 요청을 한다.
- 같은 검사가 3회 연속 실패하는 경우: 증거를 보내 장애로 협의한다.

**자동 첨부와 읽은 범위**
- 자동 첨부는 userEmail 컨텍스트만 받았다. 사용하지 않았고 외부로 보내지도 않았다.
- `skills/pace-project-dev/SKILL.md` 1–93줄(전체)을 읽었다.
- `skills/pace-project-dev/references/task-steps.md` 1–12줄(전체)을 읽었다.
- decision-rights.md, reviewer.md 등 나머지 references는 열지 않았다. 해당 규칙은 SKILL.md와 task-steps.md의 요약에 근거했다.
- 전체 바이트는 도구로 확인하지 않았으므로 적지 않는다.