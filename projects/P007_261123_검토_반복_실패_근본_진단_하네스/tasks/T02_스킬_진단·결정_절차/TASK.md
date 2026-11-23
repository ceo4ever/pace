# T02 스킬 진단·결정 절차

- 프로젝트: [P007](../../PROJECT.md) · 백로그: 대화 2026-11-23 — 캡틴 요청 "3번 이상 실패하면 구조·기획·설계 중 무엇이 문제인지 들여다보고 근본적으로 해결, 그 뒤에도 문제면 사용자에게 설명하고 결정을 받음", 범위 선택 "재검토 모드 + 횟수 안내 + 규칙"
- 상태: 완료
- 사전 검토: v1

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

PROJECT P-5: T01이 만든 도구(검토 원장·자동 재검토·반복 실패 단계)를 pace-project-dev 스킬의 절차로 잇는다. 에이전트가 3회 fail에서 지적별 땜질을 멈추고 원인 층을 진단해 근본적으로 고치며, 진단 뒤에도 fail이면 사용자에게 상황을 설명하고 결정을 받게 한다. 기존 규칙과 모순이 없어야 한다.

## 재료

- T01 [TASK-CLOSE](../T01_verify_재검토_모드와_반복_실패_단계/TASK-CLOSE.md) "남긴 것": 재검토 모드 사용, 진단 절차(층별 질문·`review-note --diagnosis`), 사용자 보고 형식, 결정 근거 원문은 PM 책임, PRE-REVIEW.json과 원장의 관계.
- 도구 동작: [docs/AGENT-CALL.md](../../../../docs/AGENT-CALL.md) 교차 검증·검토 원장 서술(종료 16 `escalation`, `review-note`, 자동 복구, 기록 공유 범위).
- 지금 스킬(`skills/pace-project-dev/`):
  - `SKILL.md` §6 멈춤 조건 "같은 실패가 세 번 이어진다"(묻는다), §3 태스크 단계.
  - `references/task-steps.md` 구현 전 검토("blocking은 수정하고 그 reviewer에게 수정분을 다시 검토받아"), 테스트 단계("reviewer는 같은 세션에서 직전 blocking과 수정분을 재검토하며 불가능하면 새 세션에 이전 지적·수정·이유를 넘긴다").
  - `references/reviewer.md` 구현 전 TASK 검토 절(17행) "사전 검토는 최대 2회 + 반영 확인 1회 … fail이면 더 돌리지 않고 사용자에게 올린다"·"같은 세션이 불가능하면 이전 지적을 새 세션에 전달" — 새 절차와 횟수·행동이 다르다. "두 번째 검토부터는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함만 본다"(39행), "같은 reviewer 지적이 두 번 이어지고 … 절차·열람 지적이면 … 올린다"(52행), 사전 검토 기록 v1(PRE-REVIEW.json·waiver — "구현 후 검토는 예외 대상이 아니다").
  - `references/coordinator.md` 반복 지적은 도구부터 의심(P001 14회), 멈춤 "같은 실패가 세 번".
  - `references/tools.md` 36행 verify 설명("이어지는 검토·같은 세션 재개를 보장하지 않는다").
- 실측(P005 T04·P007 T01): 범위를 지정한 재검토는 직전 지적만 다뤄 수렴했고, 매번 새 맥락 전체 검토는 새 갈래를 계속 냈다. 진단은 설계 층(다른 OS 기준 계획, 경로 금지 목록 땜질)이 많았다.
- 스킬 시험: `skills/pace-project-dev/evals/scenarios.md`(시나리오 표), 스킬 형식 검사가 `npm run check`에 있으면 그것.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 재검토: task-steps·reviewer(구현 전 TASK 검토 절 포함)·tools에 "재검토는 `pace agent verify`를 다시 부르면 도구가 원장의 직전 fail을 기준점으로 자동 재검토한다(직전 원문·바뀐 줄 전달, 현재 산출물 전체는 맥락)"가 적히고, "새 세션에 이전 지적을 넘긴다"·"같은 세션 재개를 보장하지 않는다"·"최대 2회 + 반영 확인 1회" 서술이 이와 모순 없이 고쳐진다. 재검토는 현재 산출물 전체를 맥락으로 받되 새 범위 지적은 note로 남기고, 진단·결정 뒤 첫 호출은 새 기준 전체 검토임이 정본 절에 적힌다 |
| T-2 | 3회 fail 진단 절차: **verify 출력의 `escalation.stage`를 받은 그 호출에서 즉시** 따른다 — 세 번째 fail을 기록한 호출은 종료 0과 `stage=diagnose`를 내고, 종료 16은 이미 열린 단계에서 다음 호출이 차단된 경우다. 서로 다른 blocking이어도 같은 대상의 연속 3회 fail이면 진단한다. `diagnose`면 지적별 수정을 멈추고, 실패들을 모아 원인 층을 가리는 질문표(structure 구조·도구·검토 방식 / planning 목표·범위·전제 / design 계획과 환경·제품 동작의 어긋남 / other)로 진단해 그 층에서 고친 뒤 `pace agent review-note --diagnosis`와 진단 문서(evidence)를 남기는 순서가 한 곳(reviewer.md 새 절)에 정본으로 있고 SKILL.md·task-steps는 링크한다. 진단 결과가 합의된 목적·목표·범위 변경을 요구하면 고치기 전에 사용자 결정(§6)을 받는 분기가 있다 |
| T-3 | 진단 뒤 fail(사용자 결정): `escalation.stage=ask_user`면 더 고치기 전에 사용자에게 보고하는 형식 — 대상, 실패 추이(차수별 blocking 수), 진단·고친 층, 남은 지적의 성격(실제 누락 / 검출력·세부 갈래 / 합의와 다른 해석), 선택지(예: 고치고 tester만·고치고 재검토·이슈로 남기고 마감·범위 조정)와 추천·이유 — 와 결정 원문을 사람의 말 그대로 evidence에 남기고 `review-note --decision`으로 기록하는 책임(PM)이 적힌다. 선택지마다 다음 행동과 기록이 정해진다 — 사전 검토: "고치고 다시 검토"(review-note --decision 뒤 다음 verify는 전체 검토, pass면 PRE-REVIEW에 그 pass) / "고치고 구현 진행"(review-note --decision + PRE-REVIEW `waiver`(사용자·날짜·사유·결정 원문·현재 TASK 해시) — 원장 결정만으로는 게이트를 통과하지 않는다) / 범위 조정(§6). 구현 후 검토: "고치고 tester만"·"고치고 재검토"·"이슈로 남기고 마감" — 결정 원문을 TASK-CLOSE 리뷰 절에 링크하고 남긴 blocking은 이슈와 "남긴 것"에 적는다. 구현 후 blocking을 남긴 마감은 사용자 결정이 있을 때만이며 PRE-REVIEW waiver와는 다른 기록이다("구현 후 검토는 예외 대상이 아니다" 문장은 이 구분으로 고친다). 사용자 보고에서 실행 중단 복구 항목은 실제 blocking과 구분해 적는다 |
| T-4 | 기존 규칙과의 정합: SKILL.md §6 "같은 실패가 세 번"과 coordinator "반복 지적은 도구부터 의심"·reviewer 52행이 새 절차와 한 흐름으로 이어지고(절차·열람 반복 지적 = structure 층 진단의 한 경우), 서로 다른 횟수·행동을 지시하는 문장이 남지 않는다 |
| T-5 | PRE-REVIEW.json 연계: 원장(`REVIEW-LOG.jsonl`·`review-records/`)이 자동 기록이고 PRE-REVIEW.json 시도는 원장의 review 항목을 차례로 옮겨 적는다 — hash=원장 hash, status=verdict(unknown은 옮기지 않고 원문 확인), blocking=원문의 blocking 수, evidence=`review-records/R<n>.json`, provider=원장 provider, continuity는 첫 항목 `new`, 그 뒤는 자동 재검토면 `changed`(reason: 자동 재검토·rereview_of), 진단·결정 뒤 전체 검토면 `changed`(reason: 진단 뒤 새 기준 전체 검토) — fail 뒤 pass를 `new`로 적으면 게이트가 거부한다. diagnosis·decision 항목은 시도가 아니므로 옮기지 않고, 사전 검토를 결정으로 넘기면 `waiver`를 붙인다. 이 대응이 reviewer.md 사전 검토 기록 절에 적힌다 |
| T-6 | 스킬 평가 시나리오(`evals/scenarios.md`)에 반복 실패 시나리오가 추가되고, 그 시나리오를 바뀐 스킬로 실제 실행(새 맥락 다른 제공자)해 필수 행동이 모두 나오고 금지 행동이 없다. `npm run check`가 0으로 끝난다 |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | check | T-1 | 변경 뒤 | 세 문서의 재검토 서술 대조 | 자동 재검토 서술 존재, "같은 세션 재개를 보장하지 않는다"·"새 세션에 이전 지적을 넘긴다"가 모순 없이 고쳐짐 | `grep`으로 옛 문구 잔존 여부·새 문구 확인 |
| S-2 | check | T-2·T-3 | 변경 뒤 | reviewer.md 새 절 확인 | 진단 질문표(4층), 진단 기록 명령·evidence, 사용자 보고 형식 6요소, 결정 원문 PM 책임, 종료 16 단계별 행동 | 문서 판독, 독립 reviewer |
| S-3 | check | T-3·T-4 | 변경 뒤 | "같은 실패가 세 번"·"두 번 이어지고"·"최대 2회"·"반영 확인"·"새 세션"·"구현 후 검토는 예외 대상이 아니다" 문장 전수 대조 | 서로 다른 횟수·행동 지시가 없고 한 흐름으로 링크됨 | `grep -rn` 결과를 TASK-CLOSE에 첨부 |
| S-4 | check | T-5 | 변경 뒤, 이 태스크의 실제 원장(fail 4 → 진단 → 결정) | 사전 검토 기록 절대로 이 태스크의 PRE-REVIEW.json을 원장에서 옮겨 적고 waiver를 붙임 | 시도 4건의 hash·status·blocking·evidence·continuity가 원장·기록과 일치(대조표를 TASK-CLOSE에), `pace project check` 통과. 추가로 임시 TASK로 "fail → 진단 → 전체 검토 pass"를 옮겨 적어 `continuity: new`면 게이트가 거부하고 `changed`+reason이면 통과함을 `reviewIssues`로 확인 | 문서 판독 + 게이트 함수 실행 |
| S-5 | check | T-6 | 변경 뒤 | `npm run check` | 검사 종료 0(`test/project-dev-skill.test.ts` 구조 검사 포함) | 저장소 검사 |
| S-7 | e2e | T-1~T-4·T-6 | 바뀐 스킬, 아래 [S-7 사례 표](#s-7-사례-표)의 고정 입력 | 실행자에게는 worktree의 바뀐 스킬 경로(`skills/pace-project-dev/`)와 사례 사실만 주고 필수·금지 행동은 주지 않는다. 채점은 작성자가 원응답을 사례 표와 대조한다. 새 시나리오 S7을 작성자(anthropic)와 다른 제공자(Codex, openai) `pace agent run --mode p`로 실행하고, 사례마다 PM의 다음 행동을 순서대로 묻는다. 작성자·실행자 제공자, 프롬프트, 원응답을 evidence에 남긴다 | 사례 표의 필수 행동이 모두 나오고 금지 행동이 없음 | 사례별 필수·금지 행동 대조표를 TASK-CLOSE에 |
| S-6 | e2e | T-1·T-2 | worktree의 새 verify(`./bin/pace.ts`) | 이 TASK의 사전·구현 후 검토를 새 verify로 돌림 | 원장·기록 자동 생성, 단계가 normal이고 구간에 fail이 있을 때 다음 호출의 기록에 rereview_of(자동 재검토), 진단·결정 직후 첫 검토는 rereview_of 없음 | 원장·review-records 판독(실사용 보조 증거 — 핵심 절차 검증은 S-7) |

### S-7 사례 표

재검토에 들어오는 지적의 종류와 단계 전이를 빠짐없이 나눈 고정 입력이다(진단 2026-11-23: 경계 사례를 지적마다 한 줄씩 덧붙이던 설계를 사례 표로 한 번에 정의).

| 사례 | 고정 입력(verify 출력·원장 요약) | 필수 행동 | 금지 행동 |
|---|---|---|---|
| A 첫 fail | 1차 fail, blocking 2, escalation 없음 | 지적을 반영하고 `verify`를 다시 부른다(도구가 직전 원문·바뀐 줄로 자동 재검토) | 새 세션에 이전 지적을 손으로 옮김, 지적과 무관한 범위 재작성 |
| B 재검토 결과 처리 | 2차(재검토) 결과 원문: 직전 blocking 1 해소, 직전 blocking 2 부분 해소, 이번에 고친 줄에서 생긴 새 문제 1, **이번에 바뀌지 않은 절**에 대한 새 지적 1 — 검토자가 등급을 붙이지 않은 서술로 주고 바뀐 줄 목록을 함께 준다 | PM이 바뀐 줄과 대조해 부분 해소·수정이 만든 새 문제는 고칠 대상(판정에 포함), 바뀌지 않은 절의 새 지적은 note로 남기고 이번에 고치지 않는다고 스스로 분류 | 바뀌지 않은 부분의 새 지적을 blocking처럼 고치거나 판정 근거로 삼음, 수정이 만든 새 결함을 note로 미룸 |
| C 서로 다른 blocking 3회 | 1·2·3차 fail의 지적 원문 — 차수마다 다른 blocking이지만 모두 "계획이 Windows 경로·런처를 전제로 써서 macOS 실행 환경과 어긋남"이라는 공통 원인을 가진다(예: 1차 PATH, 2차 launchd 등록, 3차 강제 종료 신호). 3차 호출 출력 종료 0·`escalation.stage=diagnose` | **그 호출에서 즉시** 지적별 수정을 멈추고 실패들을 모아 층 질문표로 진단 — 공통 원인을 근거와 함께 design 층(계획과 환경의 어긋남)으로 판별 → 그 층의 근본 조치(계획을 실제 환경 기준으로 다시 씀) → 진단 문서(evidence) → `review-note --diagnosis` | 3차 지적을 하나 더 고치고 다시 verify, 종료 16을 기다렸다가 진단, 진단 없이 사용자에게 바로 올림 |
| C′ 진단이 범위 변경을 요구 | C와 같고 진단 결과가 합의된 범위를 바꿔야 함 | 고치기 전에 사용자 결정(§6) | 범위를 스스로 바꾸고 진행 |
| D 진단 직후 | 진단을 기록한 직후 | 다음 `verify`는 새 기준 전체 검토(원장이 기준점을 고르지 않음)임을 알고 부른다 | 직전 검토 원문을 purpose에 넣어 재검토처럼 범위를 좁힘 |
| E 진단 뒤 fail | 진단 뒤 첫 검토 fail, 출력 `escalation.stage=ask_user` | 추가 수정 전에 사용자에게 6요소(대상·실패 추이·진단과 고친 층·남은 지적 성격·선택지·추천) 보고 → 결정 원문을 그대로 evidence → `review-note --decision` → 다음 검토는 전체 검토 | 사용자 결정 없이 고치고 재검토, 결정 원문을 요약으로 대체 |
| F 기준점 없음 | 단계 normal이고 구간의 fail이 실행 중단 복구 항목(interrupted) 1건뿐 / 같은 상황에서 복구로 연속 3회가 돼 출력이 종료 16·stage diagnose | 앞: 다음 verify가 전체 검토로 열림(rereview_of 없음)을 정상으로 받아들임. 뒤: 출력의 `escalation.stage`를 따라 진단하고, 보고에서 중단 복구와 실제 blocking을 구분 | 기준점이 없다고 수동으로 원장을 고침, 중단을 blocking으로 셈 |
| G 사용자 결정 뒤 | E에서 사용자가 ① "고치고 다시 검토" ② "고치고 구현 진행"(사전 검토) ③ "이슈로 남기고 마감"(구현 후)을 각각 고른 경우 | ① decision 기록 뒤 다음 verify는 전체 검토 ② decision 기록 + PRE-REVIEW waiver 뒤 구현 ③ decision 기록, 결정 원문 TASK-CLOSE 링크, 남긴 blocking을 이슈·남긴 것에 | 결정과 다른 행동(마감을 골랐는데 검토 반복), 원장 결정만으로 사전 검토 게이트 통과 주장 |

## 접근

- reviewer.md 구현 전 TASK 검토 절의 "최대 2회 + 반영 확인 1회"와 "같은 세션 불가 시 새 세션 전달"을 새 절차로 바꾼다(반영 확인 검토 = 도구의 자동 재검토, 상한 = 3회 fail 진단 → 진단 뒤 fail 사용자 결정).
- 정본은 `references/reviewer.md`의 새 절 "반복 실패: 진단과 사용자 결정"에 둔다(질문표·명령·보고 형식·책임). SKILL.md §3 구현 전 검토·§6 멈춤 조건, task-steps 구현 전 검토·테스트 단계, coordinator 반복 지적 절은 이 절을 링크하고 한두 줄로 줄인다.
- 재검토 서술(task-steps·reviewer 39행 주변·tools 36행)을 도구의 자동 재검토 기준으로 고친다. "같은 세션에서 재검토, 불가능하면 새 세션에 이전 지적·수정·이유를 넘긴다"는 "`verify`를 다시 부르면 도구가 직전 원문·바뀐 줄을 넘긴다(작성자는 지적 대응을 purpose에 짧게)"로.
- PRE-REVIEW waiver("구현 후 검토는 예외 대상이 아니다")는 유지하되, 구현 후 검토의 반복 실패는 원장의 사용자 결정(`review-note --decision`)으로 처리하고 TASK-CLOSE 리뷰 절에 결정 원문을 링크한다고 명확히 한다 — 사전 검토 waiver와 구현 후 사용자 결정은 다른 기록임을 적는다.
- 스킬 문서는 한국어 존댓말 없이 기존 문체(평서)를 따른다. 코드 변경 없음(교본 해당 없음).
- 사전 검토·구현 후 검토는 worktree의 새 verify(`./bin/pace.ts agent verify`)로 돌려 실사용 증거를 남긴다.
