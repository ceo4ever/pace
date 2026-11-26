# P013 T09 independent tester r2

판정: **pass — 이번에 지정된 격리 사본의 단위·회귀·문서 검사 범위**. blocking 0, 문서 should_fix 1.
T09 전체 완료 판정은 하지 않는다. 사용자 지시로 별도 수행하는 전체 검사와 실제 CLI 상위 경로(S-7)는 이 보고서에서 미확인이다.

- 검사 시각: 2026-11-26 03:36 UTC. Node v24.22.3.
- 작업 위치: `t09-tester-r2/isolated`의 realpath `/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated`.
- HEAD: `8ece6f9b6c793b5c8f1a7f45fb98a9d5018fd2c2` (detached).
- 첫 작업에서 패치 해시와 git 상태를 확인했다. 기존 변경 21개(수정 18개, untracked node_modules·T09 폴더·review-recovery.ts)가 있는 사본이다. 기존 변경은 손대지 않았고 이번 결과 파일만 T09/evidence에 추가했다.
- `impl-diff.patch` SHA-256: `51a16f683f9db94b6fcf32cec62cd8bf8b517152210e6d3e418b81812f6fb72b` — 요청값과 일치.
- `git apply --reverse --check .../evidence/impl-diff.patch`: exit 0. 추가로 HEAD의 파일을 임시 디렉터리에 복원하고 패치를 정방향 적용했다. 패치 대상 19개 파일을 현재 사본과 바이트 비교한 결과 불일치 0. [사본 확인 원문](tester-r2-provenance.json).
- 구현·기존 테스트·계약 문서는 편집하지 않았다. 다른 작업본이나 설치본 CLI를 사용하지 않았다. 테스트 helper가 임시 PACE_HOME을 지정하고 PACE_PROFILE을 제거한다.

## 판정 범위와 독립성

사용자가 처음부터 TASK 기준과 직전 결함을 지정한 r2 재검증이다. 문서 비노출 상태의 독립 목표 대조 1단계를 수행했다고 주장하지 않는다. TASK T-1~T-5, S-1~S-7, 결정 권한 정본 A-1/A-3/B1과 reviewer 정본, 변경 구현 및 테스트를 읽고 직접 검사했다. 목표는 기존 합의를 지키는 필수 재확인을 실행하면서 예산 우회·지적 유실·무근거 상위 실행을 막는 것이다. 관측한 기능은 그 목표와 맞는다. 실제 검토자의 독립성·owner 원문 진위는 JSON 필드의 진위까지 도구가 보증하는 것이 아니며 정본대로 허브의 실물 대조가 필요하다.

## 실행

| 명령 | 결과 | 원문 |
|---|---|---|
| `npm run typecheck` | exit 0 | [typecheck](tester-r2-typecheck.log) |
| `node --test test/{agent-review-log,agent-review-followup,agent-structured-review,agent-verify,pre-review,project-dev-skill}.test.ts` | exit 0, 108 pass, 0 fail/skip/cancel | [지정 검사](tester-r2-focused.log) |
| `node --test projects/P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/evidence/tester-r2-repro.test.ts` | exit 0, 5 pass, 0 fail/skip/cancel | [독립 시나리오](tester-r2-repro.test.ts), [관측 로그](tester-r2-repro.log) |

독립 시나리오는 기존 fixture의 명령 호출·합성 executor 준비 코드만 재사용하고 별도 단언을 추가했다. 실제 verifyCommand/reviewNoteCommand와 파일 원장·기록·보고를 사용한다. 합성 executor는 검토 응답만 제공하므로 실제 제공자 CLI E2E와 구분한다. 초기 지정 검사 실행 1회는 출력 경로 오타로 셸에서 시작 전 거부되었으며, 바로 올바른 경로에서 실행한 결과가 위 108개다.

## 직전 두 결함과 추가 재현

1. 일반 2회 및 공동 2회 fail 뒤 최신 유효 원문에 F1=`fixture.ts:1`, F2=`save.ts:2`를 둔다. F1 수정 확인을 열어 F1만 blocking인 fail을 돌려준다. 전달된 프롬프트에는 “지정한 지적과 적용한 수정의 영향만 판정한다”가 있고 이전 전체 blocking 해소를 요구하는 기본 판정 범위 문장은 없다. 전체 원문은 비교 입력으로 남지만 범위 밖 기존 지적은 note 지시다. 일반 확인과 달리 **진단 뒤** 확인은 다른 잔여 blocking도 확인하라는 별도 명시가 있다.
2. 위 F1 fail 뒤 `confirmation_source`는 원래 원문을 계속 가리키고 `confirmation_findings`는 F1·F2 모두다. F2 수정 확인만 pass하면 남은 목록은 F1, 누적 ordinary 확인은 2, 다음 action은 `diagnose`다. F1 fail이 F2를 잃게 하던 결함은 관측되지 않았다.
3. 별도 F1·F2 원문에서 두 확인을 각각 pass시켰다. 이후 verify는 exit 16, action=`confirmed_findings`, 남은 목록=[]이다. 확인 결과는 두 pass로 보고되지만 일반 원장의 최신 유효 판정은 fail이고 일반 예산은 calls=2/rounds=2 그대로다. 따라서 한 지적의 pass를 단계 전체의 새 pass로 덮어쓰지 않는다.
4. 진단 확인 fail → 독립 상위 근거 → 계약 문구 변경에서 `agreement: confirmed`는 거부된다. `equivalent`라도 comparison 누락은 거부된다. 이전·현재 지문과 비교 근거를 갖춘 equivalent는 허용되고 독립 upper 확인 pass가 기록·보고된다. 후속 verify는 exit 16, 일반 calls/rounds=2/2, 공동=2, ordinary 확인=1, 진단 확인=1이다. 일반 예산은 재시작하지 않는다. upper 결과에 별도 pass가 남고 후속 action은 `classify_followup`이다.
5. 수정 확인의 교차 실행기 없음은 exit 10이다. 같은 제공자 B1로 복구하면 원래 grant ID가 유지되고 `cross:false`, `cross_unavailable:["다른 제공자의 -p 실행기가 없다"]`가 응답·기록과 confirmation 보고에 남는다. 확인 소모는 1회, 일반 calls/rounds는 2/2다.
6. 상위 근거와 upper-check를 연결한 뒤 상위 원문 파일을 바꾸면 exit 2, executor 호출 수 불변이다. 근거 지문 검증이 실행 전에 실제로 차단함을 확인했다.

## 기준·시나리오 대조

| 기준 / 시나리오 | 판정 | 실행에서 확인한 근거 |
|---|---|---|
| T-1 / S-1 | pass | 다른 ID·원래 위치·변경 지문과 패치 파일 수정 영향 누락 거부. 일반 두 원장·단계 분리와 백로그 폴더 공유 예산 유지. 태스크 사전·사후 확인 합산 2회, 같은 지적 두 번째는 진단 전 거부. 미실행은 소모하지 않고 동일 확인 B1 복구. F1 fail/F2 잔여 유지 독립 재현. |
| T-2 / S-2 | pass | calls=4/rounds=2 및 공동 2회 소진 뒤 진단 전 거부, 같은 원장 diagnosis 뒤 한정 1회. fail 즉시 upper_review, 다음 보통 verify exit 16. 다른 단계·joint·void 우회 거부, 진단·횟수·근거 보고. |
| T-3 / S-3 | pass | 상위 원문 없이 upper-check 거부. reviewer=worker, cross:false에 사유 누락 거부. 적합한 trigger·slot·대상·해시·새 context의 원문과 허브 적용 근거 뒤에만 확인. 해결안 대상 변경과 필수 검증 확인, upper 결과 별도 보고. 원문 변경 시 실행 전 차단도 독립 재현. |
| T-3·T-4 / S-4 | pass | 1차 fail 뒤 2차 독립 context 재사용과 backlog 대조 누락 거부. 2차 fail은 agreement_required, A-1 선택지 합의 조정/보류, 추가 호출 exit 16. 예산 calls/rounds=4/2와 기존 확인 누적 유지. |
| T-4·T-5 / S-5 | pass | 승인 없는 실제 계약 변경과 이전 지문 그대로의 가짜 reset 거부. user/A-1 원문 참조·실제 새 계약 지문을 맞춘 reset 뒤 해당 post 단계만 calls/rounds=0/0. pre는 rounds=2, 공동=2·확인=1 보존. 합의 유지 문구 변경은 equivalent 대조 후 확인하며 예산 유지(독립 재현). |
| T-4·T-5 / S-6 | pass | uncertain 합의는 A-1, weaken/accept_blocking은 필수 검증을 만족하는 근거로 인정하지 않음. 실제 skip/weaken 요청은 A-3·선택지·모든 최신 지적 판정 필요. 요청 중 verify 및 upper-check 차단, user 결정의 동일 대상·해시·선택 대조. required 확인의 unknown은 같은 확인에서 복구하고 pass 결과를 기록. 기존 B1 사유 보존 대조. |
| T-5 호환·보고·정본 | pass, 아래 비차단 의견 | 옛 일반 산출물의 3 fail→diagnose→진단 fail→ask_user, 옛 원장/구조 전용 검토·중단·unknown·무효·잠금·고아 복구·PRE-REVIEW 호환 모두 지정 검사 통과. 후속 보고의 두 원장 시각순 이력·cross 사유·일반 판정과 확인 pass 구별을 대조. |
| T-5 / S-7 | 별도·미확인 | 사용자 지시대로 전체 `npm run check`와 실제 CLI의 T09 상위 경로 재현은 수행하지 않음. 지정 검사에 포함된 기존 CLI 종료 16 회귀 통과는 S-7 전체의 대체 증거가 아님. |

## 검출력과 약화 여부

- F1/F2 독립 단언은 원래 source 및 **전체 잔여 ID·위치 배열**을 비교한다. fail 확인을 latestDefinitive로 다시 취급하면 F2가 사라져 실패한다. F2 pass 후 F1 잔존과 2회 문턱도 확인하므로 footer pass나 호출 성공만으로 통과할 수 없다.
- 프롬프트는 올바른 한정 범위의 존재와 잘못된 전체 blocking 기본 문장의 부재를 동시에 검사한다. 기존 결함처럼 두 문장이 함께 있으면 부재 단언이 실패한다. 이는 프롬프트 계약 검출이며 실제 LLM이 지시를 따르는지는 별도 CLI 확인 대상이다.
- equivalent 시험은 pass뿐 아니라 비교 누락·이전 방식의 confirmed 거부, 후속 exit 16, 일반·공동·확인의 정확한 누적값을 단언한다. 무조건 예산을 재시작하는 구현은 통과할 수 없다.
- B1은 결과의 cross뿐 아니라 동일 grant·횟수·사유의 원문 일치를 단언한다. 상위 근거 변경 시험은 반환 오류와 executor 미호출을 함께 확인한다.
- 기존 test diff의 5개 삭제는 import/fixture 확장, 구조화 응답 직접 전달, 예상 action `classify_followup`→`confirm_findings` 변경이다. 기존 상한·공동 횟수·미실행 및 원장 단언을 제거하지 않았고 보고 파일 문자열 검사를 JSON action 동등 검사로 강화했다.
- 구현을 바꾸는 mutation 실험은 수행하지 않았다. 위 검출력 평가는 직접 실행한 음성 입력·상태/원문 단언과 변경 테스트 검토에 근거한다. 테스트에 사용한 독립성·owner 영수증은 합성 데이터이며 실제 사람 승인을 얻었다는 증거로 쓰지 않는다.

## 비차단 의견 및 최종

should_fix D1 — `skills/pace-project-dev/references/reviewer.md:100`: equivalent 설명 끝의 “일반 예산은 유지한다” 바로 다음에 “해당 단계의 일반 예산이 다시 시작되고”가 이어진다. 후자는 실제 A-1 계약 변경에만 해당한다고 문장을 분리하면 문서 해석의 혼동을 줄일 수 있다. 결정 권한 정본 및 구현/테스트는 두 경우를 올바르게 구별하므로 blocking은 아니다. 구현·문서는 수정하지 않았다.

signals: 원인 불명 실패·불안정·추가 회귀 신호 없음. 전체 회귀와 실제 CLI 상위 경로는 별도 담당 증거와 합쳐야 한다.

**최종 pass (지정 tester 범위).** 직전 두 결함의 재현 경계, equivalent 후속 확인·예산 유지, 확인통과 보고를 포함해 지정 108개와 독립 재현 5개가 통과했다. T09 전체 완료 및 S-7 pass는 이 결과만으로 선언할 수 없다.
