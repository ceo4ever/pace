## 사례: 소유 임시 fixture JSON의 반복 검토

**담당**
- 워크트리 PM이 맡습니다. 같은 대상의 검토 주기를 이어 가므로 reviewer와 작성자는 새 맥락으로 분리합니다.
- 허브는 장애나 구조 문제가 있을 때만 끼어듭니다.

**분류**
- 이름은 "보안 설정"이지만 실제 대상은 소유 임시 fixture JSON입니다.
- 실제 사용자, 비밀, 외부 영향이 없다는 사실이 확인됐습니다. 그래서 `security.md`의 민감 경로 모드는 적용하지 않습니다.
- `security.md`의 기본 체크리스트(비밀 원문 부재, 되돌리기)만 가볍게 대조합니다.
- `decision-rights.md` A-1부터 A-5까지 모두 "아니오"입니다.
    - 조치는 Git으로 되돌릴 수 있습니다.
    - 검토를 생략하거나 약화하지 않습니다.
    - 새 권한과 비용이 없고, 사람이 직접 해야 할 확인도 없습니다.
- 따라서 PM이 직접 결정하고, owner 요청은 하지 않습니다.
- 이름만 보고 owner에게 묻는 일도 하지 않습니다. "판단이 서지 않음"만으로는 요청을 만들지 않기 때문입니다.

**실제 명령과 기록**
1. 지적을 반영한 뒤 `pace agent verify --kind task <TASK.md 경로>`를 다시 호출합니다.
    - 도구 밖 reviewer로 바꾸지 않습니다. 원장(`REVIEW-LOG.jsonl`)이 이어져야 반복 실패 단계가 작동하기 때문입니다.
    - 호출하면 직전 fail을 기준점으로 한 자동 재검토가 됩니다.
    - 재검토에서는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함만 봅니다.
2. 차수마다 원문을 `review-records/R<n>.json`과 `evidence/`에 보존합니다. 비밀 검사도 같이 합니다.
3. 결과와 처리를 `pace project log`에 기록합니다. 기록 항목은 대상, 제공자, 방법, 결과, blocking·should_fix 처리, 재검토입니다.
4. 단계 신호별 대응은 다음과 같습니다.
    - **세 번째 fail(`escalation.stage: diagnose`)**: 원인 층을 가립니다(structure, planning, design, other). 그리고 `pace agent review-note --target <대상> --diagnosis --layer <층> --summary … --file <진단 증거>`를 기록합니다. 그 뒤 첫 verify는 전체 검토입니다.
    - **진단 뒤 첫 fail(`ask_user`)**: A 밖이므로 `evidence/`에 분류 이유와 근본 조치를 씁니다. 이어서 `review-note --decision --by pm --choice … --summary … --file <근거>`를 기록하고, 전체 재검증으로 넘어갑니다.
5. 같은 reviewer가 절차나 열람 지적을 두 번 되풀이하면 structure 문제로 봅니다.
    - 재검토를 더 돌리지 않고 증거 원문과 함께 허브에 이관합니다(B).
    - 도구를 고친 뒤, 무효가 된 검토는 `review-note --void --record … --file <근거>`로 처리합니다.
6. 하지 않는 일:
    - waiver나 `--by user`를 쓰지 않습니다. waiver는 사용자만 쓸 수 있습니다.
    - blocking이 남은 채 구현으로 넘어가지 않습니다.
    - 검토를 생략하지 않습니다.
7. 모든 수정 직전에 합의된 목적·범위·기준(`P-n`)에 영향이 있는지 대조합니다. 영향이 있으면 A-1로 올립니다.

**필요한 회신·보고**
- 허브나 owner의 회신은 필요 없습니다.
- 사후 보고는 TASK-CLOSE의 리뷰 절과 C의 사후 요약에 4요소로 남깁니다.
    - 무엇이 반복됐는지
    - 고친 층
    - 채우거나 덜어낸 것
    - 재검증 결과
- 완료 보고에는 PM이 대신 정한 사항을 한 줄로 붙입니다. 이 사례는 "fixture는 소유 임시 파일이고 외부 영향이 없다는 확인을 근거로 A 해당 없음, PM 결정"입니다.
- 검토 pass는 목표 달성 확인을 대신하지 않습니다. 목표 판정은 `goal-review.md`에 따라 따로 합니다.

**질문과 승인 대기: 0건**

**자동 첨부와 읽은 범위**
- 자동 첨부: 있었습니다. 사용자 계정 이메일이 system-reminder로 첨부됐습니다. 값은 적지 않습니다.
- 읽은 파일과 줄 범위:
    - `skills/pace-project-dev/SKILL.md` 1–93줄(전체)
    - `references/security.md` 1–43줄(전체)
    - `references/decision-rights.md` 1–45줄(전체)
    - `references/reviewer.md` 1–125줄(전체)
- 읽지 않은 파일: 다른 references, 다른 사례의 응답·평가표·TASK·마감 문서
- 전체 바이트 수는 도구로 확인하지 않았으므로 적지 않습니다.
- 이 답변에서는 수정, 질문, 메모리 기록, 커밋, 전송을 하지 않았습니다.
