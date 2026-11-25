**상황 전제:** 사용자가 이미 ask_user 단계의 선택지(E′)를 골랐고, 아래 세 사례는 그 선택별 후속 행동이다. 아래는 순서만 적었고 실제 실행은 하지 않았다.

**공통 선행 (세 사례 모두, 담당 = 워크트리 PM)**
1. 사용자 선택 원문이 현재 대상과 일치하는지 대조한다. 대상은 TASK 해시 또는 diff다. 원문이 없거나 조건·대상이 다르면 입력을 보류하고 요청한다.
2. 근거 파일(답 ID·지문·출처의 영수증)을 `evidence/`에 둔다.
3. 기록 명령: `pace agent review-note --target <대상> --decision --by user --choice <선택> --summary <사유> --file <승인 근거>`
4. 수정 직전에 합의 목적·범위(A-1)와 실제 영향을 다시 분류한다. 허브는 결정 요청을 전달하고, owner 승인 입력은 워크트리 PM이 한다.

**① 고치고 다시 검토**
- 순서: user decision 기록 → 수정 → `pace agent verify`로 **전체 검토**. 이전 지적으로 purpose를 좁히지 않는다. 원장이 이어지도록 호스트 reviewer는 쓰지 않는다.
- waiver는 만들지 않는다.
- 같은 영역이 또 지적되면 원인 층(structure, planning, design, other)을 다시 진단한다.

**② 고치고 구현 진행 (사전 검토)**
- 순서: user decision 기록 → 수정 → **고친 뒤 TASK 해시가 승인 대상과 같은지 확인** → PRE-REVIEW `waiver`(by user, 날짜, 사유, 승인 근거, 고친 뒤 TASK 해시)를 붙인다.
- waiver는 사용자만 허용한다. PM이 대행하지 않는다.
- 검토가 한 번도 실행되지 않았다면 waiver 근거가 성립하지 않는다.
- 승인 뒤 TASK가 실질적으로 바뀌어 해시가 달라지면 다시 검토받거나 승인을 다시 받는다.
- 구현으로 넘어간 뒤에는 계약 목표 미달·미확인이면 마감하지 않는다.

**③ 이슈로 남기고 마감 (구현 후)**
- 순서: user decision과 원문을 TASK-CLOSE 리뷰 절에 연결 → 남긴 blocking을 이슈·"남긴 것"에 기록 → 4요소 사후 보고(무엇이 반복됐는지, 고친 층, 채우거나 덜어낸 것, 재검증 결과)를 쓴다.
- **goal-review로 계약 목표가 미달·미확인이면 done 금지**이고 `판정: 막힘`으로 둔다. 보완 관측·수정을 요청하거나 A-1로 올린다.
- 목표 달성이 확인된 경우에만 `pace project check P### T0n` → `pace project done` → `pace memory status --project` 갱신 → 커밋 `feat(P###/T0n): …` 순으로 진행한다.
- 필수 기준을 미달인 채 마감하는 것은 A-1이다. 그 조치는 보류하고 owner 요청을 허브로 보낸다.

**질문·승인 대기 수**
- 사례별로 이미 사용자 선택이 주어진 상태라 새 질문은 0건이다.
- 승인 원문이나 대상 해시가 맞지 않으면 그 항목만 1건 보류하고 재요청한다.
- ③에서 목표 미달이면 A-1 요청 1건이 생긴다.
- merge·push·배포는 이 흐름에 없고 허브와 owner 승인 사항이다.

**자동 첨부·읽은 범위**
- 자동 첨부: system-reminder로 userEmail 컨텍스트를 받았다. 내용은 사용하지 않았다.
- 읽은 파일:
  - `skills/pace-project-dev/SKILL.md` 1–93줄(전체)
  - `references/reviewer.md` 64–107줄
  - `references/decision-rights.md` 1–45줄(전체)
  - `references` 폴더 Grep: 일부 긴 줄은 생략되어 전체를 보지 못했다.
- 전체 바이트 수는 도구로 확인하지 않아 적지 않는다.