# T01 verify 재검토 모드와 반복 실패 단계

- 프로젝트: [P007](../../PROJECT.md) · 백로그: 대화 2026-11-23 — 캡틴 요청 "3번 이상 실패하면 구조·기획·설계 중 무엇이 문제인지 들여다보고 근본적으로 해결, 그 뒤에도 문제면 사용자에게 설명하고 결정을 받음", 범위 선택 "재검토 모드 + 횟수 안내 + 규칙"
- 상태: 완료
- 사전 검토: v1

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

PROJECT P-1~P-4·P-6을 도구로 구현한다: `pace agent verify`가 재검토 입력을 받고, 실행마다 원장에 판정을 남기며, 같은 대상의 연속 fail이 3회면 근본 진단, 진단 뒤에도 fail이면 사용자 결정을 기록하기 전까지 다음 검토를 실행하지 않는다.

## 재료

- [PROJECT.md](../../PROJECT.md) 재료·설계 절(원장 `REVIEW-LOG.jsonl`, 판정 파싱, 단계 규칙, 종료 코드 16, 재검토 프롬프트).
- 지금 동작: `src/agent/verify.ts` `buildVerifyPrompt`는 kind task에서 "이전 지적과 그 대응 문서는 받거나 읽지 않는다"를 지시하고 마지막 줄 판정 한 단어(pass|fail)를 요구한다. `crossVerify`는 실행기 목록을 주입받는다. `src/cli.ts` `agentVerify`는 `--out`에 결과 JSON을 쓰고 미실행이면 종료 10. `src/agent/contract.ts` `errorCodes`는 2~15 사용. `src/project/pre-review.ts` `reviewHash`가 TASK 해시(CRLF 정규화·상태 값 제외)를 계산한다.
- 시험: `test/agent-verify.test.ts`(가짜 실행기로 `crossVerify`, `runPace`로 CLI 종료 10).

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | **재검토 기준점은 도구가 고른다**: 마지막 pass·decision·diagnosis 뒤에 fail 검토가 있으면 다음 verify는 자동으로 재검토 모드가 되고, 기준점은 그 구간의 **가장 최근 fail 검토**다(unknown 검토는 기준점이 되지 않고 건너뛴다) — 기준점 검토의 기록 원문 전체, 그 검토 때 대상 스냅숏→현재 대상의 바뀐 줄, "직전 blocking 해소 여부와 그 수정이 만든 새 결함만 판정, 바뀌지 않은 부분의 새 지적은 note" 지시, 2단계 재검토라 이전 지적을 받는다는 노출 기록 지시가 실행기에 전달되고, 1단계용 "이전 지적을 읽지 않는다"·"2단계는 호출자가 별도 전달" 문구는 빠지되, 작성자 마감·자체 판정·지적 대응 문서를 읽지 않는다는 제한과 노출 기록 지시는 남는다(허용되는 것은 기준점 검토 원문뿐). 구간에 fail 검토가 없으면(원장이 비거나 마지막이 pass·decision·diagnosis) 처음 검토(전체)다. 재검토인데 대상 해시가 그 검토와 같으면(바뀐 것 없음) 실행하지 않고 오류. 기록 파일이 없거나 스냅숏 해시가 원장과 다르면 실행하지 않고 오류(P-1) |
| T-2 | 실행된 verify는 `--out`이 없어도 대상 폴더 `review-records/R<순번>.json`에 결과를 저장하고(`--out`이 있으면 거기에도), 기록은 기존 출력 필드에 `review: { target, hash, verdict, rereview_of, snapshot }`을 더한다. `--out`이 대상·원장·잠금 파일과 같은 경로면 오류(P-1·P-2) |
| T-3 | 실행된 verify마다 대상과 같은 폴더의 `REVIEW-LOG.jsonl`에 `{type:"review", at, kind, target, hash, verdict, verifier, provider, rereview_of, record}` 한 줄을 덧붙인다. verdict는 결과 마지막 비어 있지 않은 줄이 pass·fail이면 그 값, 아니면 unknown이며 unknown이면 출력에 경고를 붙인다. 미실행(종료 10)은 적지 않는다. 원장 기록에 실패하면 종료 2로 끝나고 오류를 알린다(P-2) |
| T-4 | 단계: 마지막 pass·decision 뒤 연속 fail 수 n과 그 구간의 diagnosis로 정한다 — n<3 normal, n≥3이고 진단 없음 diagnose, 진단 뒤 첫 검토는 허용, 진단 뒤 fail≥1 ask_user. unknown은 연속을 끊지도 더하지도 않는다. diagnose·ask_user에서 verify는 실행기를 부르지 않고 종료 16(`review_escalation`)과 `escalation: {stage, consecutive_fails, next}`를 낸다. 실행 결과로 그 단계에 들어서면 그 실행 출력에도 escalation을 붙인다. 원장이 손상(해석 불가 줄)되면 실행하지 않고 종료 2와 위치를 알린다. 같은 원장의 동시 실행은 잠금 파일(`REVIEW-LOG.lock`, 배타 생성)로 막고 잠겨 있으면 종료 2(P-3) |
| T-5 | `pace agent review-note --target <파일> --diagnosis --layer structure\|planning\|design\|other --summary "<요약>" [--file <근거>]`와 `--decision --choice "<선택>" --summary "<사유>" --file <사람 결정 원문>`이 원장에 diagnosis·decision 줄을 남긴다. diagnosis는 diagnose 단계에서만, decision은 ask_user 단계에서만 받는다. decision 근거 파일은 비어 있지 않은 일반 파일이어야 한다 — 그 내용이 사람의 결정 원문인지는 도구가 보장하지 않고 PM이 책임진다(T02 스킬에 명시) (P-4) |
| T-6 | 원장이 없는 대상의 기존 verify 호출·출력 필드·종료 코드 0/10과 PRE-REVIEW 검사(`src/project/pre-review.ts`)·기존 시험이 그대로 통과하고 `npm run check`가 0으로 끝난다(P-6) |

## 테스트

S-9c를 뺀 CLI 경로 시험은 `src/agent/verify-cli.ts`의 명령 함수를 가짜 실행기(받은 프롬프트 기록)로 직접 호출해 실제 명령과 같은 경로를 탄다.

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1·T-2·T-3 | 빈 원장, 대상 v1 | verify(가짜 fail) → 대상 v2로 수정 → verify(가짜 fail) | 1회차 프롬프트는 처음 검토, 2회차 프롬프트에 1회차 원문·v1→v2 바뀐 줄·재검토 지시 포함·1단계 문구 없음·작성자 자료 제한과 노출 기록 지시는 있음. 원장 2줄(두 번째 rereview_of=첫 기록), review-records 2개 | 가짜 실행기가 받은 프롬프트·원장·기록 단언 |
| S-2 | unit | T-1 | v1 fail → v2 fail → v3 / v1 fail → v2 unknown → v3 | 세 번째 실행 | 앞: rereview_of가 v2 검토, 바뀐 줄 v2→v3. 뒤: rereview_of가 v1 검토(unknown 건너뜀), 원문은 v1 검토, 바뀐 줄 v1→v3 | 프롬프트·원장 |
| S-3 | unit | T-1 | 직전 fail 뒤 대상 무변경 / 기록 파일 삭제 / 기록 스냅숏 변조 | verify | 각각 실행기 호출 0·오류·원장 변화 없음 | 호출 수 |
| S-4 | unit | T-3 | 가짜 결과 "…\npass"·"…\nrevise" | verify | verdict pass·unknown, unknown은 출력 경고 | 원장·출력 |
| S-5 | unit | T-4·T-5 | 빈 원장, 대상 v1 | v1 fail → v2로 고쳐 재검토 fail → v3로 고쳐 재검토 fail(3회차 출력 escalation diagnose) → verify(종료 16·호출 0) → diagnosis 기록 → verify 허용(처음 검토 전체, fail, 출력 ask_user) → verify(16·호출 0) → decision 기록 → verify 실행(처음 검토 전체). 진단 직후·결정 직후 두 실행에서 실행기가 받은 프롬프트에 이전 검토 원문·바뀐 줄·재검토 지시가 없음 | 각 단계 종료 코드·escalation·실행기 호출 수·원장 줄 | 한 시험에서 전체 전이 |
| S-6 | unit | T-4 | pass 뒤 fail 2 / unknown 끼임 | 단계 계산 | pass가 연속 초기화, unknown은 연속 유지 | 단계 함수 표 |
| S-7 | unit | T-4 | 손상 원장 / 잠금 파일 존재 / 원장 쓰기 불가 | verify | 실행기 호출 0(앞 둘)·종료 2·안내, 쓰기 불가는 실행 뒤 종료 2 | 호출 수·종료 코드 |
| S-8 | unit | T-5 | normal·diagnose·ask_user 원장 | review-note diagnosis/decision을 단계 밖·근거 없이·빈 근거로 호출 | 오류·원장 불변, 단계 안에서는 한 줄 | 명령 함수 |
| S-9 | unit | T-2 | `--out`이 대상·원장 경로 | verify | 실행기 호출 0·오류 | 호출 수 |
| S-9c | e2e | T-4 | 원장에 fail 3줄, 실행기 없는 PATH | 실제 진입점 `runPace(["agent","verify",…])` | 종료 16(실행기 탐색 전에 차단, 10이 아님)·escalation JSON — `src/cli.ts`가 새 명령 함수로 위임함을 확인 | 프로세스 실행 |
| S-10 | check | T-6 | 변경 완료 | `npm run check`(임시 PACE_HOME) | 종료 0, 기존 verify·pre-review 시험 통과 | 저장소 검사 |

## 접근

- 신규 `src/agent/review-log.ts`: 원장 경로·읽기(손상 줄 위치 보고)·덧붙이기, `parseVerdict`, `reviewStage(entries)`(순수 함수: stage·consecutive_fails·rereview 기준 항목), 잠금(`openSync(..., "wx")` 배타 생성·종료 때 삭제), 줄 단위 비교 `lineDiff`(의존성 없는 LCS, 바뀐 줄과 앞뒤 1줄 맥락). 해시는 `src/project/pre-review.ts` `reviewHash` 재사용.
- 신규 `src/agent/verify-cli.ts`: `verifyCommand(args, deps)`·`reviewNoteCommand(args, deps)` — deps로 실행기·출력·시각 주입. `src/cli.ts`는 여기로 위임만 한다.
- `src/agent/verify.ts`: `buildVerifyPrompt`에 선택 인자 `rereview?: { previousText, diff }`, `crossVerify`가 그것을 받아 실행기로 전달.
- `src/agent/contract.ts`: `review_escalation: 16`.
- 원장·기록에 비밀·세션 ID를 넣지 않는다(결과의 session_id는 기록 파일에서 빼고 저장).
- `docs/AGENT-CALL.md`의 verify 서술·`src/cli.ts` 도움말을 함께 고친다. 스킬 문서는 T02.
