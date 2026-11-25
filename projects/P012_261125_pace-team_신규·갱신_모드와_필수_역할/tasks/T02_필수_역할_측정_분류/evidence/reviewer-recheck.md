## 2단계 · 차단 해소 대조

**읽은 범위와 노출**
- 지정한 상대 경로만 읽었다. TASK.md, 호환·표적 시험 출력, previous-reviewer.md, old-snapshot/src/team/store.ts, test/team-metrics.test.ts(Grep), decision-rights.md, docs/TEAM.md, docs/TEAM-METRICS.md가 대상이다.
- TEAM-METRICS.md는 1~166행까지만 읽었고 나머지 37행은 읽지 않았다. 필수 역할 절(52~64행)은 읽은 범위 안에 있다.
- 작성자 마감·판정은 받지 않았다. 파일은 수정하지 않았다.
- 테스트를 직접 실행하지 않았다. 아래 결과는 제출된 출력과 소스를 읽은 것이다.
- 1단계 때처럼 이메일과 메모리 맥락이 자동 첨부됐지만 쓰지 않았다.

**이전 판단 유지·변경**
- 변경: 이전 blocking(구판 판독기 시험 없음)을 해소로 본다.
- 유지: should_fix 중 소통 원장과 Git 스냅숏 고정은 해소로 본다. 표지 자기 선언 우회는 문구로 수용 가능하고 note로 낮춘다.
- 유지: 1단계 결론(목표 달성, pass)은 바뀌지 않는다.

**근거**
1. 구판 판독기(T-1 / S-1)
   - evidence 출력에 `d5129f8`의 `loadTeam`을 격리 archive로 호출한 기록이 있다. 표지 JSON을 추가하기 전후의 반환이 deepEqual이고, 목록은 `pace-implementer, pace-project-lead, pace-reviewer, pace-tester`다.
   - old-snapshot 소스가 이를 뒷받침한다. `teamMemberNames`는 `.pace/team/agents`와 레거시 디렉터리에서 `teamFiles(..., ".md")`만 받고, `accepts`는 `name.endsWith(extension)`으로 거른다. `required-roles.json`은 `.md`가 아니라 구판이 건너뛴다.
   - 구판의 `loadTeam`은 JSON을 읽지 않고, 읽기 전용 호출이라 구판이 표지를 손상으로 보지 않는다. TEAM.md 137행의 "구판은 별도 JSON을 건너뛴다"와도 맞다.
   - 한계: 이 호환 시험은 `test/team-metrics.test.ts`에 없고 evidence 출력으로만 있다. `archive|d5129f8` 검색에서 test/ 쪽 일치는 무관한 `archive/old-answer` 등뿐이다. TASK는 "Node 테스트·격리 git archive"를 요구했으므로, 재현 가능한 회귀 시험은 아니고 일회성 실행 기록이다. 소스 구조상 호환 위험은 낮다. old-snapshot이 실제 `d5129f8`인지는 이 입력만으로 확인하지 못했다.
   - 구판 finish·merge 진입점의 공통 세 시험도 통과(3/3)로 제출됐다.

2. 소통 원장 대체 입력(T-4 / S-4)
   - test 414~422행에서 `HandoffStore.record`로 실제 `decision_request`를 만든다. 미채택 프로젝트에서 `team.requests.ownerIntendedRequests === 1`이고, `requiredRoleNonParticipation`과 `requestCoverageInputHash`는 undefined다.
   - 이는 기존 소통 원장 집계가 유지되고 호출 자료가 팀 채택으로 오인되지 않는다는 뜻이다. 호출-only 경로도 같은 테스트에서 팀 절·마감 요구가 없음을 확인한다.

3. Git 스냅숏 고정
   - test 425~437행은 `.gitignore`로 표지를 제외하면 finish가 `Git 인덱스에 없다: .pace/team/required-roles.json`으로 보류됨을 확인한다. 표지가 고정 입력으로 취급된다는 증거다.
   - 미커밋·미추적 표지는 별도 시험이 아니라 TEAM-METRICS.md 11행의 일반 규칙(staged·unstaged·미추적 변경이 있으면 마감 보류)에 기댄다. 별도 시험이 없다는 한계는 남는다.

4. 배정 확인 문구
   - TEAM.md 135행이 "표지를 바꿀 때 필수 역할의 배정 근거와 선택 값이 일치하는지 팀 검토에서 확인한다. 역할을 정리할 때 해당 표지도 대조한다"를 명시한다.
   - 일반 역할을 `conditional: true`로 적어 후보에서 빼는 우회는 코드로 막지 않고 검토 절차로 막는다. 영수증이 없으면 METRICS에 `기록 부족(미확인)`으로 남아 숨겨지지는 않는다. 다만 회고 강제 대상에서는 빠진다.

5. 보안
   - 표지 읽기는 `safeTeamPath`로 조상 symlink와 nlink≠1을 거부한다. 구판과 같은 함수다.
   - 32KiB 상한, UTF-8, 중복 키, 미지 필드, 비밀 후보 검사는 1단계에서 확인한 그대로다. 안전하지 않은 입력은 종료 2로 보류된다.
   - 최종 표적 8건이 모두 통과(8/8)로 제출됐다.

**지적**
- blocking: 없음.
- should_fix: 구판 호환 확인이 저장소 시험이 아니라 evidence 출력에만 있다. 재현 가능한 회귀 시험으로 옮기거나, 일회성 확인으로 수용하는 근거를 TASK에 남기는 편이 좋다.
- should_fix: 미커밋·미추적 표지가 finish에서 보류되는 직접 시험이 없다. 일반 미추적 변경 규칙으로 보호되지만 표지 전용 시험은 없다.
- note: 표지 자기 선언 우회는 팀 검토 절차에 의존한다.
- note: TEAM.md 137행이 링크로 끝난다(문서 가독성).
- note: 미래 호출 수집기는 BR02에서 넘어가는 범위라 평가하지 않았다. 경계 규칙은 TEAM-METRICS.md 64행에 명시돼 있다.
- A-1(합의 변경): 합의된 기준을 낮추지 않는다. 표지·구판 호환·미채택 분리는 기준을 유지한 검증 강화이므로 '아니오'로 본다. 구판 호환 시험은 기준 T-1이 요구한 내용을 evidence로 채운 것이다.

pass
