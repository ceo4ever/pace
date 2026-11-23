## 2단계 대조 결과: P008 T03 — 판정 pass

blocking은 없습니다. 다만 달성 범위는 요청하신 대로 두 가지로 한정합니다. 읽기 전용 행동 계획(response-1)과 합성 CLI 실행(cli-proof-final)까지입니다. 최신 문서 기준의 행동 증명(T-2)은 response-2가 나와야 판단할 수 있습니다.

### 1단계 지적의 처리
- **G 행 전제:** 해소됐습니다. 이제 `E′에서 사용자가…`로 시작합니다(`evals/scenarios.md:40`).
- **coordinator 일반 질문 기준:** 해소됐습니다. "판단이 서지 않는 것"이 다시 들어갔고(`coordinator.md:47`), 반복 실패 bullet은 그 위에 따로 있습니다(`:46`).
- **PM 결정 반복의 상한:** should_fix에서 note로 낮춥니다. 근거는 셋입니다.
  - BR03 범위 밖에 "지적 성격 자동 판정"이 명시돼 있습니다.
  - 정본이 모든 수정 전에 실제 영향을 분류하게 하고, 같은 영역이 또 지적되면 다시 진단하게 합니다. 재검증 뒤에는 4요소 사후 보고를 요구하므로, 반복은 사용자에게 드러납니다.
  - 횟수로 결정 주체를 고르는 것은 합의된 설계(PROJECT P-3, BR03 범위)와 어긋납니다.

### 계약과 원본 증거 대조

**합성 CLI 실행 (T-3, S-3·S-4) — 달성**
- `e2e/cli-paths.mjs`는 worktree의 `bin/pace.ts`를 직접 실행합니다. 격리된 `PACE_HOME`을 쓰고, reviewer는 PATH에 넣은 가짜 `claude`입니다.
- `summary.json`에서 4개 경로가 모두 `passed`, `fixture_executor: true`입니다.
- **종료 0에서 즉시 단계가 열림:** 세 번째 fail 응답에서 `escalation.stage`가 diagnose, 진단 뒤 fail에서 ask_user입니다(assert 확인).
- **기록 없는 다음 호출은 종료 16:** 차단될 때 가짜 reviewer의 호출 횟수가 늘지 않는 것까지 확인합니다.
- **user-after-diagnosis 원장:** 진단 뒤 검토가 `rereview_of: null`(전체 검토)입니다. 결정은 `by: user`로 기록됐고, 결정 뒤에도 전체 검토(`null`)를 거쳐 pass입니다.
- **user-normal 이벤트:**
  - question 시점 해시 = approval 시점 해시 = 첫 수정의 이전 해시이고, 수정 뒤 해시는 바뀝니다.
  - normal 단계에서 `review-note --decision`을 시도하면 종료 2로 거부됩니다. 승인 원문은 project log에 `--ref`로 연결됩니다.
  - 승인 전에 고친 경우를 꾸민 음성 시험은 대조기가 거부합니다.
- **PM 경로:** `decision.md`에 분류 이유와 조치가 있고 `--by pm`으로 기록됩니다.

**보안·waiver 경계 — 유지**
- `--by`는 `--decision`에서만 받고 값은 pm|user만 허용합니다(`verify-cli.ts:224,249-250`).
- waiver는 `by: "user"`, 날짜, 사유, 안전한 근거 파일, 현재 TASK 해시를 모두 요구합니다. 실행된 검토가 없거나 마지막이 pass면 거부합니다(`pre-review.ts:109-119`).
- PM 결정이 waiver로 쓰일 길은 없습니다.

**행동 계획 (T-2, S-2) — response-1 범위에서만 부합, 최종은 미확인**
- 실행 주체는 `agent: claude`(reported)입니다. fixture의 작성자는 `--author-agent codex`이므로 다른 제공자입니다. 다만 같은 Claude 계열인 제가 이를 검토하고 있다는 점은 독립성의 한계로 남습니다.
- 입력은 C, E, C′, E′, H, J 6건입니다. 프롬프트에 정답표는 없습니다.
- 사례별 응답:
  - **C·E:** 질문 없이 PM이 분류합니다. 근본 조치 → 진단 또는 `--by pm` 기록 → 전체 재검증 → 4요소 사후 보고 순서이고, waiver는 쓰지 않습니다.
  - **C′·E′:** 수정 전에 6요소로 질문하고 원문을 보존합니다. diagnose 단계에서는 진단 증거에, ask_user 단계에서는 `--by user`에 연결합니다.
  - **H:** fixture를 읽어 애매함을 해소하고 PM 경로로 갑니다.
  - **J:** 이전 PM 결정을 새 위험에 대한 승인으로 보지 않고 다시 분류합니다. decision을 억지로 쓰지 않고 project log에 연결합니다.
- 금지 행동은 관찰되지 않았습니다.
- 노출 고지: OPAL 부트 주입(알투 페르소나)은 억제되지 않았고, 응답이 이를 스스로 밝혔습니다.

### 지적

1. **[should_fix] T-2 증거는 response-2를 받은 뒤에 마감합니다.**
   - response-1은 이번 문서 수정(G, coordinator) 전의 정본으로 실행됐습니다.
   - 마감 전에 확인할 것:
     - response-2가 같은 6사례 전부의 최초 응답인지
     - response-1도 보존됐는지
     - 필수 행동과 금지 행동이 다시 성립하는지
   - 그 전까지 TASK-CLOSE에서 T-2를 "달성"으로 적지 않아야 합니다.

2. **[note] H 응답에 작은 순서 흔들림이 있습니다.**
   - PM으로 분류해 놓고, 한계 항목에 "수정이 합의 범위 안인지 아직 확인하지 않음"이라고 적었습니다.
   - 정본은 합의 확인을 분류보다 먼저 하라고 합니다. response-2에서 이 순서가 맞는지 봐 주십시오.

3. **[note] fixture 원장이 진짜 판정처럼 보입니다.**
   - fixture의 `REVIEW-LOG.jsonl`에 `verifier: claude`, `provider: anthropic`이 기록돼 있어, 원장만 보면 실제 교차 판정으로 읽힙니다.
   - 합성이라는 표지는 `command-*.json`의 `fixture_executor`, `summary.json`, purpose 문구에만 있습니다.
   - 마감 보고에서 이 증거를 "합성 CLI 계약 증명"으로만 인용해야 합니다. 브레인에는 이미 그렇게 적혀 있습니다.

4. **[note] 증거 안의 승인·보고가 무엇을 증명하는지 한정해야 합니다.**
   - approval의 해시 순서는 스크립트가 스스로 만들고 스스로 검사합니다. 파일 해시는 실측이므로 "승인 전 대상 불변"이라는 계약 증명으로는 충분합니다.
   - 하지만 사람이 승인하는 실제 흐름이나 에이전트가 이 순서를 지키는지는 증명하지 않습니다.
   - 4요소 report도 이벤트 형태로만 있습니다. 실제 TASK-CLOSE의 보고 형식은 마감 문서에서 확인할 일입니다.

5. **[note] PM 결정 반복의 상한은 채택하지 않았고, 동의합니다.**
   - 다만 같은 대상에 PM 결정이 반복되면 사후 보고에 그 횟수가 드러나도록 쓰는 것을 권합니다. 이는 운영 관측 사항입니다.

6. **[note] 이번 단계에서 확인하지 않은 것:**
   - T-4의 프로필 규칙 정리(`evidence/profile-rule.md`)
   - 전체 검사와 보안 검사 결과
   - 독립 tester 판정

**노출 범위 (2단계)**
- 추가로 읽은 것:
  - T03 TASK.md, PROJECT.md, BR03
  - `e2e/cli-paths.mjs`
  - cli-proof-final의 `summary.json`, user-normal `events.json`, user-after-diagnosis `REVIEW-LOG.jsonl`, pm `decision.md`
  - behavior의 `prompt.txt`, `response-1.md`, `response-1.json`(메타 일부)
  - `verify-cli.ts`·`pre-review.ts`의 by·waiver 관련 줄
  - scenarios와 coordinator 수정 줄
- 이번 턴의 부트 주입: P009가 T02 진행 중이라는 정보가 추가로 들어왔습니다. 판정에는 쓰지 않았습니다.
- 검토 주체: 1단계와 같은 세션·제공자(Claude)입니다. 바뀌지 않았습니다.
- 파일은 고치지 않았습니다.

pass