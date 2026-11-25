**사례: main 세션, P031 `병합 대기`, 사용자 "진행 상황 메모리 갱신해 줘"**

**담당**
- main 세션(허브)이 직접 처리한다. 메모리 파일 갱신은 허용된다. 미루는 것은 커밋이다(SKILL.md §4 ✋, §7).

**실제 명령·기록(순서)**
1. 읽기 전용 확인: `pace project list`로 P031의 상태(`병합 대기`)와 태스크 상태를 본다. 원본은 PROJECT.md 태스크 표다.
2. `pace memory status --project --body "<어디까지: P031 finish 통과·병합 대기 · 다음: owner 승인 후 허브가 merge 미리보기→승인 원문 대조→--yes · 막힌 것: owner 병합 승인 대기>"`로 `.pace/` 메모리 파일만 갱신한다.
3. **커밋하지 않는다.** 병합 대기 중 main 커밋은 병합 뒤로 미룬다. 메모리 변경은 working tree에 남기고, 병합 뒤 커밋 시점에 포함한다.
4. 백로그나 프로젝트 원본 문서는 편집하지 않으므로 `pace backlog refresh`는 필요 없다.
5. `pace project merge`와 `--yes`는 실행하지 않는다. 이는 owner 승인 뒤의 별도 게이트다.

**회신·보고**
- 사용자에게 "메모리 파일은 갱신했고 커밋은 P031 병합 뒤로 미뤘다"고 짧게 보고한다. 병합은 owner 승인 대기 상태라고도 알린다.

**질문·승인 대기**
- 질문은 0건이다. 승인 대기는 기존 병합 승인 1건(owner)이며, 이번 갱신이 새로 만든 것은 아니다.

**이번 답변의 읽기 범위(자동 첨부·파일·줄 범위)**
- 자동 첨부: 사용자 계정 정보(식별 값은 기재하지 않음)가 시스템 컨텍스트로 자동 첨부되었고, 사용하지 않았다.
- 읽은 파일: `skills/pace-project-dev/SKILL.md` 1–93줄 전체.
- 검색만 한 파일: `references/decision-rights.md`, `finish.md`, `recovery.md`는 Grep으로 "병합 대기|memory" 일치 줄(decision-rights 36, finish 13, recovery 7)만 확인했다. 전체를 읽지는 않았다.
- 전체 바이트 수는 측정하지 않아 적지 않는다.