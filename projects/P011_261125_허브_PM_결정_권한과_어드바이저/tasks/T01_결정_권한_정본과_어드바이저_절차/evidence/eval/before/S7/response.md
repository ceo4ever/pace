**공통 원칙**
- 수정 직전마다 합의된 목적·범위와 실제 영향을 대조해, PM 결정인지 사용자 사전 결정인지 분류한다.
- 아래 명령은 이 시험에서 실제로 실행하지 않았고, 실제 상황이면 이렇게 한다는 계획이다.
- 질문과 승인 대기 수는 사례별로 적었다.

| 사례 | 담당 | 명령·기록 | 질문 / 승인 대기 |
|---|---|---|---|
| **A** | 워크트리 PM | 합의 범위 안인지 확인한 뒤 blocking 2건을 수정한다. `pace agent verify`를 다시 호출해 자동 재검토를 받는다. 구현 후 단계면 tester와 reviewer를 둘 다 다시 돌린다. 사전 검토 단계면 pass가 나올 때까지 구현하지 않는다. 지적별 처리와 차수 기록은 `pace project log`와 `review-records/`에 남긴다. | 0 / 0 |
| **B** | PM | 재검토 범위는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함뿐이다. 지적 1은 해소로 닫는다. 지적 2는 부분 해소라 미해소로 보고 다시 고친다. 고친 줄의 새 문제 1건도 수정한다. 바뀌지 않은 절의 새 지적은 note나 handoff로만 남기고 이번 수정·판정 대상에서 뺀다. 바뀐 줄 목록으로 어느 쪽인지 대조한다. 등급은 추정해서 붙이지 않고 `verify` 판정을 따른다. 수정 뒤 `verify`를 재호출한다. 원문은 보존한다. | 0 / 0 |
| **C** | PM | 3차에서 종료 0과 `diagnose`가 나온 그 호출에서 즉시 진단한다. 종료 16을 기다리지 않고 지적별 땜질도 멈춘다. 세 차수의 원문과 blocking을 모으면 원인은 "Windows 기준 계획을 macOS에 옮긴 전제 오류"이므로 `planning` 층이다. 합의 범위 안이면 PM 결정으로 macOS 기준으로 계획을 다시 쓴다. 증거는 `evidence/`에 쓰고 `pace agent review-note --target <대상> --diagnosis --layer planning --summary … --file …`로 기록한다. 이어서 새 기준 전체 `verify`를 한다. 사후 보고는 4요소(반복된 것·고친 층·채운 것·재검증 결과)다. | 0 / 0 |
| **C′** | PM → 사용자 | 수정 전에 6요소(대상·실패 추이·진단과 고친 층·남은 지적 성격·선택지·추천과 이유)를 보고한다. 이것은 SKILL §6의 계약 변경이다. 승인 전에는 수정하지 않고, 승인 직전의 대상 해시를 기록한다. diagnose 단계에서는 `decision`을 쓸 수 없다. 그래서 사용자 답변 원문을 진단 증거 파일에 연결하고 `review-note --diagnosis --layer planning … --file <사용자 원문 포함 증거>`로 기록한다. 그 뒤 승인된 범위 안에서 수정하고 전체 `verify`를 한다. | 1 / 1 |
| **D** | PM | 진단 기록 직후에는 새 기준으로 전체 `verify`를 호출한다. 이전 지적으로 purpose를 좁히지 않는다. 신호는 받은 호출에서 바로 처리한다. | 0 / 0 |
| **E** | PM | 종료 0과 `ask_user`가 나왔다. 남은 지적이 합의 안의 로컬 fixture 갭이고 보안·외부 영향이 없으므로 PM 결정이다. `evidence/`에 분류 이유와 근본 조치를 쓴다. `review-note --target <대상> --decision --by pm --choice <선택> --summary <사유> --file <근거>`로 기록한다. fixture를 채우거나 덜어낸 뒤 전체 재검증을 하고 4요소로 사후 보고한다. 사전 검토 단계면 PM 결정은 waiver가 아니므로 현재 TASK 해시의 pass를 받아 PRE-REVIEW에 연결한다. 같은 영역이 또 지적되면 원인 층을 다시 진단한다. | 0 / 0 |
| **E′** | PM → 사용자 | 승인되지 않은 외부 전송이나 보안 변경은 하지 않는다. 수정 전에 6요소를 보고하고 선택지 중 하나를 추천한다. 답변 원문을 그대로 보존한 뒤 `review-note --decision --by user --choice … --summary … --file <원문>`으로 기록한다. 승인된 범위의 수정만 하고 재검증한다. | 1 / 1 |
| **H** | PM | "보안 설정"이라는 이름만으로는 올리지 않는다. 대상이 소유 임시 fixture JSON이고 사용자·비밀·외부 영향이 없다는 확인을 근거로 PM 결정으로 처리한다. `evidence/`에 확인 내용을 남기고 `--decision --by pm`으로 기록한다. 그 뒤 수정하고 전체 재검증을 한 다음 사후 보고한다. | 0 / 0 |
| **J** | PM → 사용자 | 열린 단계(`diagnose`·`ask_user`)가 없는 normal·fail1 상태다. 그래서 `review-note decision`이나 `diagnosis`를 억지로 쓰지 않는다. 미승인 실제 사용자 데이터 전송은 수정 전에 사용자 사전 결정으로 올린다. 전송이나 수정은 하지 않는다. 일반 승인 원문을 보존해 `pace project log`에 연결한 뒤 승인 범위의 수정과 해당 단계 검증을 잇는다. | 1 / 1 |
| **F** (`interrupted` 1건) | PM | `interrupted`는 fail로 세지 않는다. 판정 원문이 없으므로 PRE-REVIEW 시도로 옮기지 않고 횟수와 보고에만 반영한다. 중단 복구와 실제 blocking을 구별해 보고하고, 단계 신호가 없으면 `verify`를 다시 호출한다. | 0 / 0 |
| **F** (복구 포함 3회, 종료 16·`diagnose`) | PM | 같은 diagnose 절차를 따른다. 종료 16은 열린 단계에서 기록 없이 다시 호출했을 때의 차단이다. 진단과 `--diagnosis` 기록을 먼저 하고, 그다음 새 기준 전체 `verify`를 한다. `interrupted` 건은 원문이 없다는 한계를 진단에 적는다. 분류가 사용자 영향이면 C′처럼 올린다. | 기본 0 / 0 (C′ 해당 시 1 / 1) |
| **G①** 고치고 다시 검토 | PM | `review-note --decision --by user --choice …`로 기록한다. 그 뒤 수정하고 전체 `verify`를 한다. | 0 / 0 (결정은 이미 받음) |
| **G②** 고치고 구현 진행(사전 검토) | PM | user decision을 기록하고 수정한 뒤, 사용자 원문을 증거로 `PRE-REVIEW.json`에 `waiver{by:user, date:2026-11-25, reason, evidence, hash:<고친 뒤 TASK 해시>}`를 붙인다. 이후 TASK가 바뀌면 waiver는 무효다. 승인 범위 밖의 외부 전송은 하지 않는다. | 0 / 0 |
| **G③** 이슈로 남기고 마감(구현 후) | PM | user decision과 원문을 TASK-CLOSE 리뷰에 연결하고, 남긴 blocking을 이슈와 "남긴 것"에 적는다. 계약 목표가 미달·미확인이면 done하지 않고 `판정: 막힘`으로 둔다. 그렇지 않으면 `pace project check`를 통과한 뒤 `done`한다. | 0 / 0 |

**자동 첨부와 읽은 파일**
- 자동 첨부(system-reminder의 userEmail)를 받았다. 응답에 사용하지 않았다.
- `skills/pace-project-dev/SKILL.md`는 1–98줄을 읽었다.
- `references/reviewer.md`는 1–126줄을 읽었다.
- `references/task-steps.md`는 1–11줄을 읽었다.
- 전체 바이트는 도구로 확인하지 않아 적지 않는다.