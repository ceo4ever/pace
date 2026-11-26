# P013 T03 독립 재검증

`impl-diff.patch`의 SHA-256 `193c54b462c1fcf49cd64be3a3ebaa97539f398ce292535998470f7172a73649`와 변경 파일 14개의 패치 적용 후 Git blob ID를 대조했다. Node.js v24.22.3에서 `npm run typecheck`와 `node --test test/{agent-structured-review,agent-review-followup,agent-review-log,agent-verify,pre-review,project-dev-skill}.test.ts`가 종료 0이었다. 집중 테스트는 98개 통과, 실패·건너뜀 0개였다. 별도 재현은 임시 태스크와 주입 실행기로 `verifyCommand`를 호출해 응답, 원장, 저장 기록, 다음 프롬프트를 확인했다.

| 기준 | 판정 | 관측 |
|---|---|---|
| T-1 | pass | 집중 시험에서 백로그·사전·구현 후 검토의 단계별 질문과 관리 밖 일반 질문을 확인했다. tester 정본은 “기준마다 증거로 통과하는가?”를 고정한다. |
| T-2 | pass | `src/report.ts:12-14`, `src/report.ts:12-14, src/read.ts:6`, `src/report.ts:12:2-14:8, src/read.ts:6:3`이 각각 원래 위치 문자열과 `blocking` 등급을 보존했다. 집중 시험에서 질문 밖 지적의 `note`·인계와 근거 누락 시 `should_fix`를 확인했다. |
| T-3 | fail | `findings`를 두 번 넣고 배열 순서를 바꾼 두 경우, 같은 키의 한쪽을 유니코드 이스케이프로 쓴 두 순서, 지적 객체에서 `severity`와 `severit\u0079`가 충돌한 경우가 모두 `unknown`이었다. 각각 호출 1회·유효 판정 0회였다. 원문 `pass`/도구 `fail`과 원문 `fail`/도구 `pass` 모두 차이 경고가 표시됐고, 원문과 계산 결과가 기록에 보존됐다. 정상 고아 기록과 계산 결과만 변조한 고아 기록은 원문을 기준으로 복구됐으나, 단계 표지가 빠진 구조화 기록은 아래와 같이 잘못 복구됐다. |
| T-4 | pass | 집중 시험에서 옛 원장과 T02a 공동·승인 회차, B1 사유 보존을 확인했다. 사전 고아 기록은 구현 후 검토를 시작할 때 원래 사전 판정으로 복구됐고 이후 사전 재검토가 그 기록을 읽었다. |
| T-5 | 집중 검사 통과 | 실제 다른 제공자 실측과 전체 검사는 별도 범위다. T04 증거 상태와 T09 수정 확인도 이 판정에서 제외했다. |

## 차단 결함 · 단계 표지가 빠진 고아 기록이 원문의 pass로 복구됨

1. 임시 `projects/P013_case/tasks/T03_case/evidence/impl.diff`를 구현 후 검토한다. 주입 실행기에서 `version: 1`, `findings: [F1]`인 블록과 마지막 줄 `pass`를 반환한다. F1은 `severity: "blocking"`, `category: "defect"`, `location: "src/report.ts:12-14, src/read.ts:6"`, 실패 조건 “빈 보고서가 사라진다”, 재현 “빈 보고서를 저장하고 다시 연다”, `confidence: "high"`다. 첫 도구 판정은 `fail`이다.
2. 저장된 `review-records/R1.json`에서 `review.verdict`를 `pass`로 바꾸고 `review.structured_stage`를 삭제한다. `assessment`, 원문, 스냅숏, 해시는 그대로 둔다. `REVIEW-LOG.jsonl`에서 R1의 `review` 행만 제거하고 호출 예약 행을 남겨 고아 기록 상태를 만든다.
3. 대상 내용을 한 줄 바꾼 뒤 같은 대상에 빈 `findings`와 마지막 줄 `pass`를 반환한다. 기대는 R1의 판정 불일치를 감지해 중단으로 복구하고, 유효 회차와 재검토 기준점에서 빼는 것이다. 실제 응답은 “기록의 판정(pass)으로 원장에 복구했다”였다. R1이 유효 판정으로 계산돼 다음 결과가 `calls=2, rounds=2, rereview_of="review-records/R1.json"`이 됐다. 다음 프롬프트는 “직전 판정은 pass였다. 해소 여부를 판정할 blocking은 없으며”라고 안내했고 F1은 도구가 산출하는 기존 blocking 목록에 나타나지 않았다.
4. 같은 절차에서 단계 표지를 두고 판정만 바꾸면 R1은 `interrupted: true`로 복구됐다. 다음 결과는 `calls=2, rounds=1, rereview_of=null`이었다. 반대로 정상 R1은 `fail`로 복구됐고, 원문의 마지막 줄이 `pass`여도 다음 프롬프트의 기계 판정 목록은 유효한 F1만 전달했다. 첫 응답에 중복 `findings`를 넣어 도구가 `unknown`을 기록한 경우에도 2단계와 같이 바꾸면 R1은 유효 `pass`로 복구됐다.

[`recoverOrphans`](../../../../../src/agent/verify-cli.ts#L127)는 단계 표지가 없으면 마지막 줄 판독으로 돌아간다. 그러면 [`loadRereview`](../../../../../src/agent/verify-cli.ts#L101)도 원장과 사본 양쪽에 단계 표지가 없는 R1을 구조화 판정으로 다시 계산하지 않는다.

독립 목표 대조: 맞음. 단계별 질문과 유효한 지적을 관문에 연결하면 해당 단계에서 확인할 결함을 다음 검토까지 추적할 수 있다. 별도 1단계 목표 판단 인계는 이 검증에서 관측하지 않았다.

목표 달성: 미달. 최초 판정의 구조 검증을 통과하지 못한 원문도 고아 복구 후 유효한 판정 회차와 재검토 범위에 영향을 줄 수 있다. 보완 대상은 T03 복구와 기준점 선택이다.

독립 판정: fail
