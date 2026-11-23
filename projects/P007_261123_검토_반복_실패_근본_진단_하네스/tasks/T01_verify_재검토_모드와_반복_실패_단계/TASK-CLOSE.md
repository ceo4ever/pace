# T01 verify 재검토 모드와 반복 실패 단계 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적(PROJECT): 같은 대상의 검토가 거듭 fail할 때 땜질 반복을 끊고, 재검토는 직전 지적과 바뀐 부분 중심으로, 3회 fail이면 근본 진단, 진단 뒤에도 fail이면 사용자 결정을 도구가 강제한다.
- 달성: 도구 부분은 **달성**. `pace agent verify`가 원장(`REVIEW-LOG.jsonl`)에 판정을 자동으로 남기고, 직전 fail이면 원장이 고른 기준점의 원문·바뀐 줄로 재검토하며, 연속 3회 fail·진단 뒤 fail에서 실행기를 부르지 않고 종료 16으로 멈춘다(S-5 전체 전이, S-9c 실제 진입점). 이 태스크 자체가 규칙을 실측했다 — 사전 검토 4회(3회 fail→진단→pass), 구현 후 reviewer 4회(3회 fail→진단→fail→**캡틴 결정**)로 정확히 이 흐름을 밟았고, 범위를 지정한 재검토(2차부터)는 직전 지적만 다뤄 수렴했다.
- 한계: 사용자 결정 근거 파일이 실제 사람의 결정인지는 도구가 보장하지 않는다(T-5 합의, PM 책임 — T02 스킬에 명시). 원장을 사람이 직접 고치면 우회할 수 있다(자동 복구는 위조 기록을 fail(중단)로 넣어 차단을 유지).
- 독립 판정: tester 4차 pass(새 맥락 Claude), reviewer(Codex) 4차 fail 뒤 [캡틴 결정](evidence/user-decision-post-1.md) — "남은 3건을 고치기 전에 전체 재검토로 빈틈을 찾아 보완, 그 뒤 tester·전체 검사로 마감".

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1(재검토 프롬프트·1단계 문구 없음·작성자 자료 제한 유지), S-2(가장 최근 fail·unknown 건너뜀), S-3(무변경·기록 삭제·스냅숏/원문 변조 거부), S-9h(큰 변경도 거친 비교로 재검토), S-9i·S-9k(중단 항목은 기준점 제외) |
| T-2 | 통과 | S-1(review-records 자동 저장·스냅숏·세션 ID 없음), S-9·S-9f·S-9j(--out 관리 경로·대소문자 거부, rename 교체로 링크·하드링크 너머 불변, 원장 확정 뒤 사본) |
| T-3 | 통과 | S-1·S-4(원장 줄·판정 파싱·unknown 경고), S-9d(미실행은 원장·기록 없음), S-7·S-9f(원장 기록 실패 종료 2), S-9j·S-9l(판정 단어 변형·구분자) |
| T-4 | 통과 | S-5(3회→16→진단→허용→ask_user→16→결정→전체 검토), S-6(pass 초기화·unknown 유지·대상별), S-7(손상·알 수 없는 항목·잠금·남은 잠금 PID), S-9c(실제 진입점 16), S-9i(중단 복구가 연속 fail을 줄이지 않음), S-9k(위조 기록으로 차단이 풀리지 않음) |
| T-5 | 통과 | S-5·S-8·S-9g(단계 밖 거부, 빈·공백·폴더·대상 자체 근거 거부, 원장 쓰기 오류 종료 2) |
| T-6 | 통과 | `npm run check` 종료 0 — 1028개 통과 1011·실패 0·건너뜀 17(임시 PACE_HOME, 마지막 실행). 기존 `test/agent-verify.test.ts` 10개 통과 |

## 단위 테스트

- `node --test test/agent-review-log.test.ts test/agent-verify.test.ts` — 30개 통과, 실패 0.
- `npm run check`(임시 PACE_HOME) — 1028개, 통과 1011, 실패 0, 건너뜀 17. 중간 실행에서 관련 없는 부하 간헐 실패가 있었다: Gateway 인증 시간 초과(daemon-process), dashboard-init 정션, telegram-flow S-9g·S-4b — 모두 단독 재실행 통과이거나 main에서도 같은 기존 문제(S-4b는 단독 실행 시 항상 실패, 이슈 `telegram-flow-s-4b-단독-실행-실패`; Gateway는 이슈 `gateway-인증-시간-초과-시험-부하-민감`).
- 결함 주입: tester 4회 + 작성자 확인으로 총 70여 건 주입, 기준 동작 결함은 모두 검출([tester 기록](evidence/tester-rounds.md)).

## E2E

해당 없음 — 명령 함수를 가짜 실행기로 직접 부르는 단위 시험과 실제 진입점 프로세스 시험(S-9c)으로 같은 경로를 검증했다.

## 리뷰

- 사전 검토(Codex): 1차 fail(blocking 3) → 2차 fail(3, 범위 지정 재검토) → 3차 fail(1) → [진단](evidence/diagnosis-1.md)(설계 문서 동기화) → 4차 pass. [PRE-REVIEW.json](PRE-REVIEW.json).
- tester(새 맥락 Claude, 같은 세션): 1차 fail(blocking 4) · 2차 fail(작성자가 실행 중 파일을 고친 실수 포함, S-9d 새 결함) · 3차 pass · 4차 pass(should_fix 7건 전부 반영) — [tester-rounds.md](evidence/tester-rounds.md).
- reviewer(Codex, 구현 후): [1차](evidence/post-review-1.json) fail(blocking 4) · [2차](evidence/post-review-2.json) fail(4, 부분 해소) · [3차](evidence/post-review-3.json) fail(3) → [진단](evidence/diagnosis-post-1.md)(설계: 경로 금지 목록 땜질 → rename 교체) · [4차](evidence/post-review-4.json) fail(3: 큰 변경 막다른 길, pending 복구 기준점, 대소문자 무시 볼륨) → [캡틴 결정](evidence/user-decision-post-1.md). 결정에 따라 작성자 전체 재검토로 6건(위 3건 + 남은 잠금 PID, 판정 단어 변형, 임시 이름) 보완, tester 4차 should_fix(위조 판정 복구 등) 반영.
- 남김+이유: reviewer #1 "재검토에 현재 산출물 전체를 넣지 말라"는 반영하지 않았다 — 해소 판단에 전체 맥락이 필요하고, 범위는 판정 지시로 좁힌다(PROJECT P-1에 명시, 결정 메모). #3 결정 근거의 진위는 T-5 합의대로 PM 책임.
- 교본: typescript — 안티패턴 대조(동기 fs는 CLI 단발 명령이라 기존 코드와 같은 방식, 타입 단언은 원장 검증 뒤로 한정), 오류는 계약 종료 코드로 변환.

## 남긴 것

- T02: 스킬에 재검토 모드 사용, 진단 절차(층별 질문·`review-note --diagnosis`), 진단 뒤 fail의 사용자 보고 형식(실패 유형·고친 층·남은 지적 성격·선택지와 추천), 결정 근거 원문은 PM이 사람의 말 그대로 남긴다는 책임, PRE-REVIEW.json과 원장의 관계를 적는다. 원장이 자동으로 쌓이므로 PRE-REVIEW 시도 기록을 원장에서 옮기는 방법도.
- 설치본(`~/.pace`)은 병합 뒤 재설치해야 새 verify가 쓰인다 — 이번 태스크의 검토는 설치본(옛 verify)으로 돌렸고 재검토 범위는 purpose에 직전 원문을 넣어 수동으로 지정했다.
- 발견(브레인 후보): 독립 reviewer는 매 회 새 맥락이면 새 갈래를 계속 찾는다 — 범위를 지정한 재검토가 수렴의 핵심이었다. tester가 결함 주입 중일 때 작성자가 파일을 고치면 복원 과정에서 수정이 지워질 수 있다(이번엔 남았음을 확인) — 병렬 검증 중 편집 금지.
- 기존 시험 간헐 실패 2건은 프로젝트 이슈로 기록(위 단위 테스트 절).
