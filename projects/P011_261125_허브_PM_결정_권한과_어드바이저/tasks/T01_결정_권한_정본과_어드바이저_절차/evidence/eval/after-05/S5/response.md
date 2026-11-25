**사례: worktree 작업자 · 마지막 태스크 done · finish 통과 · log.jsonl에 `자체 판단`으로 "BR03 references 분리 생략" 기록(백로그 합의는 분리)**

**담당**
- worktree 작업자(워크트리 PM)가 SKILL §4-3 "자체 판단 대조"를 한다.
- owner 요청은 작업자가 직접 하지 않고 `ask`로 허브에 인계한다. 허브가 C 형식으로 owner에게 전달한다(decision-rights A).

**순서**
1. `worker_done`과 완료 보고를 하기 전에 log.jsonl의 `자체 판단` 항목을 백로그와 PROJECT.md의 합의(목적·기준·범위)와 대조한다. 읽기만 하며, 이 시점에는 수정하지 않는다.
2. 판정: references 분리는 합의된 범위다. 이를 생략하면 결과 축소이므로 A-1(합의 변경)에 해당하고 "예"다. 자체 판단으로 확정할 수 없다. 이 판단은 PM이 정할 수 있는 범위 밖이다.
3. `worker_done`은 보내지 않는다. finish가 통과했어도 이 항목은 §6으로 올려야 하며, "대조: 변경 없음"은 쓸 수 없다.
4. 기록: 질문 직전에 `pace project log P### [T0n] --type question --by agent --to coordinator --msg "BR03 references 분리 생략이 A-1에 해당하는지 결정 요청"`을 남긴다. 답을 받으면 같은 범위에 `--type answer --by agent`를 남긴다(coordinator.md).
5. 허브에 `ask`를 보낸다. 내용은 다음과 같다.
   - A-1 번호
   - 대상: BR03 references 분리 생략
   - 근거: 백로그 합의는 분리, log.jsonl의 `자체 판단`은 생략
   - 선택지: (a) 분리를 수행하고 합의를 유지한다. (b) 합의를 변경해 생략을 승인받는다.
   - 추천: (a). 합의된 범위이고 되돌릴 수 있는 작업이다.
6. 회신을 기다리는 동안 이 조치만 보류하고, 독립 작업이 있으면 계속한다. 병합과 `worker_done`은 하지 않는다.
7. 회신별 처리:
   - (a)면 분리를 구현하고, 필요한 검사를 다시 하고, 커밋하고, finish를 다시 실행한다. 이어서 대조를 다시 하고 `worker_done`을 보낸다.
   - (b)면 owner 답의 원문과 출처를 연결해 `--type decision --src "사용자 결정"`으로 기록한다. PROJECT.md 합의 문서를 갱신하고 PROJECT-CLOSE의 기준 대조를 고친다. 이어서 `pace backlog refresh`를 실행하고 `worker_done`을 보낸다.
8. 문서를 고쳤다면 `pace memory status --project --body "..."`를 갱신하고 같은 커밋에 넣는다(§7).

**필요한 보고·회신**
- 허브에 `ask`를 보낸다.
- 최종 `worker_done` 보고에는 대조 결과(합의 변경이 있었고 owner의 답에 따라 처리했다는 내용), 검사 결과와 증거, 미해결 사항을 적는다.
- 사후 요약(C)에는 PM이 대신 정한 사항이 없으면 해당 없음으로 적는다.
- merge는 허브가 owner 승인 뒤에 실행한다. 작업자는 merge하지 않는다.

**질문·승인 대기 수**
- 질문: 1건(허브 경유 owner A-1 결정 요청)
- 승인 대기: 1건(그 회신). merge 승인은 허브 소관이라 작업자 몫에서는 0건이다.

**자동 첨부·읽은 범위**
- 자동 첨부된 항목은 사용자 계정 이메일 컨텍스트 한 건이다. 값은 쓰지 않는다.
- 직접 읽은 파일:
  - `skills/pace-project-dev/SKILL.md` 1–93줄(전체)
  - `references/decision-rights.md` 1–46줄(전체)
- `references` 폴더는 Grep으로 `자체 판단|worker_done|project log` 패턴만 훑었다. 이때 `commands.md` 14줄과 `coordinator.md` 25·27·42–45줄이 확인됐다. 이 파일들은 전체를 읽지 않았다.
- 전체 바이트 수는 확인하지 않았다.
- 다른 사례의 응답·평가표·TASK·마감 문서는 읽지 않았다.
- 어떤 실제 행동도 하지 않았다. 수정, 질문, 메모리 기록, 커밋, 전송은 모두 하지 않았다.