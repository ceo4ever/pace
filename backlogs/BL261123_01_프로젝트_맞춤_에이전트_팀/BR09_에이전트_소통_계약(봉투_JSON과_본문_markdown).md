# BR09 에이전트 소통 계약(봉투 JSON과 본문 markdown)

- 상태: 대기
- 백로그: [BL261123_01_프로젝트_맞춤_에이전트_팀](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

팀 에이전트 사이의 주고받기를 **기록되고 검사되는 계약**으로 만든다(목표3·목표4). 자연어로만 주고받으면 생기는 문제를 막는다 — 근거(roblox-studio P002, 2026-11-23~24, 그쪽 코디네이터 요청·캡틴 승인 2026-11-24):
- 캡틴 원문과 해석이 섞여 전달됨("Play 4번" → 코디네이터가 확인 없이 "Play 1번+4판"으로 해석 → 판정 정정).
- 위임 기록이 없어 에이전트별 활동을 증거 파일을 뒤져 사후에 셈(리드 단독 구현, 제작 에이전트 호출 0을 마감 뒤에야 파악).
- 위임에 증명 범위·판정 주체 칸이 없어 사전 검토 반복(PACE P008이 TASK에 넣은 것과 같은 원인).

## 범위

- **형식**: 메시지 = JSON 머리 한 줄(짧은 값, 값마다 400자 상한) + 본문 markdown(경로 참조). 전부 JSON은 버린다 — 긴 한글 본문 이스케이프 실패, 캡틴용 가독성, 판단·진단은 칸에 맞지 않음. 공통 칸 `v·type·id·from·to·at`.
- **종류와 필수 칸**(roblox-studio 시범 `tools/handoff.mjs`의 7종에 종결 `close`를 더한 8종): `delegate`(task·goal·scope·proof_scope·decision_owner·due), `result`(re·status done|partial|blocked·files·tests·not_done·risks), `close`(re·verdict accepted|rejected·evidence), `decision_request`(options·recommendation·reason·blocking), `captain_input`(quote·interpretation·source·confirm — 확인 요청에 대한 답이면 그 요청 ID·`approved|corrected|rejected`, 처음 받은 지시면 `none`), `lock`/`unlock`(resource·holder·event), `status`(done·blocked·next).
- **캡틴 원문과 해석**: `quote`는 캡틴 원문을 **그대로** 둔다 — 400자를 넘으면 머리에는 원문 해시와 앞부분만, 원문 전체는 본문 파일에 보존한다. 해석이 원문을 그대로 옮기지 않고 실행·판정을 바꾸는 내용을 더하거나 바꾸면(예: "Play 4번" → "Play 1번+4판") 기록하는 에이전트는 그 해석을 `decision_request`로 캡틴에게 되묻고, 캡틴 답(`captain_input`, `confirm`이 그 요청을 참조)이 올 때까지 그 해석에 기대는 위임·실행을 보류한다. **연결 사슬**: 원문(`captain_input`) → 해석 확인 요청(`decision_request`) → 캡틴 답(`captain_input`, `confirm`이 그 요청을 가리키고 `approved`·`corrected`·`rejected` 중 하나) → 위임(`delegate`가 근거로 삼은 `captain_input` ID를 `basis` 칸에 둔다). `add`는 `delegate.basis`가 가리키는 해석이 ① 원문 그대로 옮긴 것(`confirm: none`이고 해석이 원문과 같음)이거나 ② 캡틴이 `approved`한 해석이거나 ③ `corrected` 답의 정정된 해석일 때만 받는다. 답이 없거나 `rejected`인 해석, 정정 전의 옛 해석을 근거로 한 위임은 거부한다.
- **위임 종결**: `result.re`는 존재하는 `delegate`를 가리켜야 한다(없으면 거부). `partial`·`blocked` 결과는 위임을 닫지 않는다. 위임은 그 위임의 `decision_owner`가 `proof_scope`에 해당하는 증거를 확인하고 `close`(accepted)를 남겨야 닫힌다 — `close.re`는 존재하는 `delegate`를 가리켜야 하고, `from`이 그 위임의 `decision_owner`가 아니면 거부. `from`은 기록하는 세션이 스스로 밝히는 값이라 위조를 막지 못한다 — 판정 주체 확인은 기록 규칙과 사후 검토(누가 기록했는지 세션 기록 대조)에 맡기는 한계로 문서에 적는다. **열린 위임** = `close`(accepted) 없는 위임이고, 그중 `partial`·`blocked` 결과가 있는 것은 따로 표시한다.
- **기록 경로(누가 언제 `add`하나)**: 보내는 쪽이 보낼 때 기록한다 — 위임하는 리드·코디네이터가 `delegate`를, 캡틴 말을 전달하는 코디네이터가 `captain_input`을, 결정을 요청하는 쪽이 `decision_request`를. 서브에이전트는 결과 맨 끝에 `result` 머리 한 줄을 내고, **그 결과를 받은 쪽(리드)이 받는 즉시 그 줄을 `add`**한다(머리가 없거나 검사에 실패하면 결과를 받지 않은 것으로 보고 다시 요청). Orca `ask`·`orchestration send`는 `--payload`에 같은 머리를 싣고 보내는 쪽이 같은 내용을 `add`한다. `add`가 실패하면(검사 거부·쓰기 실패) 보내는 쪽은 메시지를 보내지 않고 고쳐서 다시 기록한다 — 기록 없는 주고받기를 만들지 않는다. 이 규칙은 [BR02](BR02_팀_원본_형식과_도구별_동기화.md) 정의 원본의 "올리는 형식"·코디네이터 규칙(`references/coordinator.md`)에 들어가 생성 정의로 도구마다 전달된다.
- **기록과 검사(명령)**: 프로젝트마다 `projects/P###_*/handoffs.jsonl`. `pace team handoff add|check|stats` — 추가 때 머리 검사(필수 칸·값 길이·`from`/`to`가 팀 원본의 이름 또는 `captain`·참조 대상 존재), `check`는 파일 전체 검사, `stats`는 종류별·에이전트별 수와 열린 위임.
- **잠금 사건**: `lock`·`unlock` 머리는 손으로 쓰지 않는다 — [BR05](BR05_공유_자원_잠금.md) `pace team lock`이 실제로 획득·해제·회수했을 때 그 사건(획득 토큰 참조)을 `event` 칸에 담아 자동으로 기록한다. 메시지상의 선언과 실제 상태 변경이 섞이지 않게.
- **하네스 연결**: `pace project stats` 팀 항목([BR06](BR06_팀_측정과_회고.md))이 handoffs를 읽어 위임·결과·종결·결정 요청 수를 에이전트별로 낸다. `pace project finish`는 열린 위임(특히 `partial`·`blocked`)이 있으면 경고한다(차단 여부는 설계에서 정하고 이유를 남긴다).
- **집계 기준**: 캡틴 개입 수는 [BR01](BR01_역할_적재_실측과_도입_전_기준선.md) 정의 그대로 **캡틴에게 실제로 도달한 요청**만 센다. 도달 판별: 캡틴 답(`captain_input.confirm`이 그 요청을 가리킴)이 있으면 도달, 전송 수단이 성공을 돌려준 기록(Orca 메시지 ID·Telegram 전송 성공)이 있으면 도달, 둘 다 없으면 미확인. 전송에 실패한 요청은 도달 수에서 빼고 따로 센다. 같은 요청이 handoffs `decision_request`와 project log `question`·`escalation`에 걸쳐 있으면 요청 ID 참조로 한 건으로 묶는다. 연결할 수 없는 옛 기록은 미확인으로 센다.
- **시범과의 관계**: roblox-studio `tools/handoff.mjs`(6개 시험)는 참고 구현이다. PACE가 정본(형식·검사)을 가지면 그 저장소는 PACE 명령으로 옮긴다(BR08 이전 때). 시범 결과(위임 수·검사 거부 수·사람 개입 수)는 그쪽이 끝나면 받되, 시범 도구의 관측 범위(7종·종결 없음·도달 구분 없음)를 밝혀 BR06 비교에는 같은 정의로 다시 센 값만 쓴다.
- 제외: 에이전트 대화 내용 자체의 품질 판정, 메시지 전송 수단(Orca·서브에이전트) 변경.

## 완료 기준

- 8종 머리의 필수 칸·값 길이·이름·참조 검사가 통과·거부 사례로 시험된다(종류마다 한 건 이상). `captain_input`에서 원문 없이 해석만 있는 머리, 확인되지 않은 해석을 참조하는 `delegate`, 없는 위임을 가리키는 `result`, `decision_owner`가 아닌 에이전트의 `close`는 거부된다.
- 원문 → 확인 요청 → 캡틴 답 → 위임 사슬 시험: `approved` 해석의 위임은 받고, 답 없음·`rejected`·정정 전 옛 해석을 근거로 한 위임은 거부, `corrected` 답의 정정 해석은 받는다. 원문 그대로 옮긴 처음 지시(`confirm: none`)의 위임은 확인 없이 받는다.
- 400자를 넘는 캡틴 원문이 본문 파일에 온전히 보존되고 머리의 해시와 일치한다(시험).
- PACE 쪽 임시 프로젝트에서 정상 작업 경로로 — 리드가 위임을 기록하고, 서브에이전트 결과 머리를 받은 즉시 기록하고, 판정 주체가 종결하고, 해석이 원문과 다를 때 캡틴 확인 전 실행이 보류되는 — 흐름이 handoffs.jsonl에 쌓인다. `stats`가 에이전트별 수·열린 위임(부분·차단 표시)을 내고 열린 위임이 남은 finish가 경고한다(시험).
- 같은 캡틴 결정 요청이 handoffs와 project log에 모두 있어도 캡틴 개입은 한 번만, 전송 실패 요청은 도달 수에서 빠지고, 연결할 수 없는 옛 기록은 미확인으로 세진다(시험).
- `pace team lock`의 실제 획득·해제가 `lock`·`unlock` 기록을 자동으로 남기고 손으로 쓴 잠금 머리는 거부된다(시험).
- 실행 순서: P009에서 T09는 T06(측정)·T08(첫 적용)보다 먼저 연다 — 측정과 현장 적용이 이 기록을 쓴다. 선행: T02(팀 원본의 이름·올리는 형식), T05(잠금 사건). 실제 두 호스트에서의 추적은 BR08 실증 표에서 확인하고, BR08 대표 흐름에서 기록 누락이 나오면 그 칸은 원인과 함께 미완료로 판정한다. **P009 실행 계획 반영**: 이 브리프를 추가한 뒤 P009 작업자가 PROJECT.md 태스크 표에 T09를 등록하고 결정 메모에 "T02·T05 완료 뒤, T06·T08 착수 전"을 적는다 — main에서 worktree 문서를 고치지 않으므로 P009 쪽 반영으로 완료된다.
