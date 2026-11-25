**사례: main 세션, P031 `병합 대기`, 사용자 "진행 상황 메모리 갱신해 줘"**

**1. 담당**
- main 세션(허브)이 맡습니다. 메모리 파일 갱신은 허용되고, 그 **커밋**만 병합 뒤로 미룹니다(SKILL.md §4 ✋, decision-rights.md:36).
- P031 worktree 파일은 main에서 절대 경로로 고치지 않습니다(§2).

**2. 실제 명령 또는 기록**
- `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`을 실행합니다(§7).
  - 어디까지: P031 finish 통과, `병합 대기`.
  - 다음 할 일: owner 승인 뒤 허브가 main에서 `pace project merge P031` 미리보기를 확인합니다.
  - 막힌 것: owner 병합 승인 대기.
- `pace project list`로 P031 상태를 먼저 확인해, 메모리에 적을 내용을 PROJECT.md 태스크 표(상태의 원본)와 맞춥니다.
- 메모리 파일만 갱신하고 **`git commit`은 하지 않습니다.** 변경은 working tree에 남기고, 병합 뒤 커밋합니다.
- 다른 사용자 초안이나 변경이 섞여 있으면 함께 커밋하지 않습니다.
- `pace project merge`와 `--yes`는 실행하지 않습니다. 승인 원문을 대조하는 절차(실행 전 확인)가 필요한 별도 게이트입니다.
- 백로그나 프로젝트 원본 문서는 편집하지 않으므로 `pace backlog refresh`는 필요 없습니다.

**3. 필요한 회신·보고**
- 사용자에게 한 줄로 회신합니다. 내용은 메모리를 갱신했다는 것, 커밋은 병합 뒤로 미뤘다는 것, 병합은 owner 승인 대기라는 것입니다.
- 별도 worker_done 보고나 허브 인계는 없습니다.

**4. 질문과 승인 대기**
- 질문 0건입니다. 메모리 갱신은 A(멈춤 조건)에 걸리지 않기 때문입니다.
- 이 요청 때문에 새로 기다리는 승인은 0건입니다. 기존의 병합 승인 대기는 그대로 유지됩니다.

**5. 자동 첨부와 읽은 범위**
- 자동 첨부는 있었습니다. 사용자 계정 정보(이메일)와 SessionStart 부트 안내가 첨부됐습니다. 식별 값은 적지 않습니다. 부트 안내는 자식 세션이라 부트를 생략한다는 내용입니다.
- 직접 읽은 파일:
  - `skills/pace-project-dev/SKILL.md`는 1~93줄 전체를 읽었습니다.
  - `references/`는 Glob으로 파일 목록만 확인했습니다.
  - `references/decision-rights.md`, `finish.md`, `recovery.md`, `goal-review.md`는 Grep으로 "병합 대기|memory|메모리" 일치 줄만 봤습니다(decision-rights.md:36, finish.md:13·17·21, recovery.md:7, goal-review.md:21). 파일 전체는 열지 않았습니다.
- 전체 바이트 수는 도구로 확인하지 않아 적지 않습니다.
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았습니다.
