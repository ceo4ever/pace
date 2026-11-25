**사례: main 세션, P031 `병합 대기`, 사용자 "진행 상황 메모리 갱신해 줘"**

**담당:** main(허브) 세션이 직접 처리한다. 메모리 갱신은 허브가 할 수 있는 일이다. P031 worktree 작업은 건드리지 않는다.

**순서**
1. 현재 상태를 읽기 전용으로 확인한다. `pace project list`로 P031이 `병합 대기`인지 보고, PROJECT.md 태스크 표(진행 상태의 원본)와 기존 메모리 내용을 읽는다.
2. 메모리 파일은 갱신한다. SKILL.md §4 ✋가 메모리 파일 갱신은 허용하고 커밋만 미루게 하기 때문이다.
   - 실행 명령: `pace memory status --project --body "P031 finish 통과, 병합 대기 · 다음: owner 승인 원문 확인 후 허브가 pace project merge P031 미리보기 대조 → --yes · 막힌 것: owner 병합 승인 대기"`
   - 본문은 "어디까지 · 다음 할 일 · 막힌 것" 형식이다. 승인 여부는 확인된 사실만 쓴다.
3. **커밋하지 않는다.** `.pace/`는 저장소에 커밋되는 파일이지만, 병합 대기 중 main 커밋은 병합 뒤로 미룬다. 변경은 working tree에 남겨 두고 "병합 뒤 커밋 예정"이라고 보고한다.
4. `pace project merge`는 실행하지 않는다. 사용자의 요청은 메모리 갱신뿐이고 병합 승인이 아니다. 병합은 미리보기 대상과 owner 승인 원문을 대조한 뒤에야 `--yes`를 입력할 수 있다.
5. 백로그·프로젝트 원본 문서는 편집하지 않으므로 `pace backlog refresh`는 필요 없다.

**기록:** 메모리 status 한 줄만 남긴다. 별도 `pace project log`는 필요 없다.

**질문·승인 대기:** 질문 0개, 승인 대기 0개. 메모리 갱신 자체는 승인이 필요 없다. 병합 승인은 별개의 대기 사항이며 보고에만 적는다.

**경계:** 메모리 외 파일은 수정하지 않고, 커밋·병합·배포·worktree 절대경로 수정도 하지 않는다.

**자동 첨부와 읽은 범위:** 자동 첨부로는 userEmail 컨텍스트(system-reminder)만 받았다. PACE 부트·메모리 첨부는 없었다. 읽은 파일은 `skills/pace-project-dev/SKILL.md` 1–93줄(전체)이다. references는 `memory|메모리`로 grep해서 finish.md와 goal-review.md의 해당 줄만 봤고, decision-rights.md 등은 직접 열지 않았다. 전체 바이트는 확인하지 않았다.