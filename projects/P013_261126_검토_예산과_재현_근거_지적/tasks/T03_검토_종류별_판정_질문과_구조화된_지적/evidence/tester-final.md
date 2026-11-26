# P013 T03 독립 테스터 r3

검증일: 2026-11-26. 대상은 이 격리 복제본에 적용된 T03 구현이다. 원본 작업 위치는 읽거나 수정하지 않았다. 구현·기존 시험·태스크 기준은 수정하지 않았으며, 아래 변이 시험은 `/tmp`의 별도 사본에서만 실행했다. 실제 제공자 호출은 하지 않았다.

## 대상과 범위

- `impl-diff.patch` SHA-256: `3ca4f2043ed6a6863c0ec7cc89ca4f0cc6793a5eca5ae2e81677908d820298d2` — 요청값과 일치.
- 패치의 변경 파일 16개 모두 현재 파일의 Git blob SHA-1이 패치의 적용 후 `index`와 일치했다. 신규 구조화 구현·시험 2개도 포함한다. [파일별 대조](tester-r3-patch-check.json).
- Node.js `v24.22.3`. 기준은 `TASK.md`의 T-1~T-5와 S-1~S-4다. r2의 T-3 차단을 우선 검증했다.
- 이 판정은 사용자 지정 집중 검사와 복구·재검토 호환 범위에 한정한다. 전체 검사와 실제 타 제공자 응답은 별도이며, T-5 전체 완료나 태스크 마감을 판정하지 않는다. 별도 목표 우선 1단계 입력·회수는 이 세션에서 수행하지 않았으므로 두 단계 독립 검토를 완료했다고 주장하지 않는다.

## 실행 결과

| 명령 | 종료 | 결과 |
|---|---|---|
| `npm run typecheck` | 0 | 타입 검사 통과 |
| `node --test test/{agent-structured-review,agent-review-followup,agent-review-log,agent-verify,pre-review,project-dev-skill}.test.ts` | 0 | 99개 pass, fail/cancelled/skipped/todo 모두 0 |
| `node projects/P013_*/tasks/T03_*/evidence/tester-r3-probe.ts` | 0 | 별도 재현 12개 모두 기대 결과 |
| `python3 <evidence>/tester-r3-mutation.py` | 0 | 변이 3종 검출 확인. 변이 대상 시험 자체는 예상대로 각각 종료 1 |

원문: [타입 검사](tester-r3-typecheck.log), [집중 검사](tester-r3-tests.log), [재현 스크립트](tester-r3-probe.ts), [재현 결과](tester-r3-probe.json), [변이 실행 스크립트](tester-r3-mutation.py), [변이 요약](tester-r3-mutations.json). 재현은 임시 `PACE_HOME`을 사용하는 시험 헬퍼와 주입 실행기로 실제 `verifyCommand` 경로를 호출한다. 단순 파서 결과만 확인하지 않고 기록·원장·다음 프롬프트·호출 수·판정 회차를 대조했다.

## r2 차단 조건 재현과 대조

각 사례는 새 임시 `projects/P013_case/tasks/T03_case/evidence/impl.diff`로 시작한다. 첫 응답은 단일 `pace-review` 블록의 F1과 footer `pass`다. F1은 등급 `blocking`, 연결 `defect`, 위치 `src/report.ts:12-14, src/read.ts:6`, 실패 조건 “빈 보고서가 사라진다”, 재현 “빈 보고서를 저장하고 다시 연다”, 확신도 `high`를 갖춘다. 첫 기계 판정은 `fail`이다.

고아 사례는 R1 저장 기록의 `review.verdict`를 `pass`로 조작하고, 원장에서는 R1 review 행만 지워 call 예약을 유지한다. 원문·스냅숏·해시는 유지한다. 대상은 한 줄 바꾸고, 다음 응답은 빈 findings와 footer `pass`를 반환한다.

| 고아 R1 조작 | 현재 결과 | 다음 결과 |
|---|---|---|
| 판정만 pass, 단계·assessment 유지 | 불일치로 `interrupted: true` 복구 | `calls=2`, `rounds=1`, `rereview_of=null` |
| 판정 pass + `structured_stage` 삭제 (r2 차단) | 불일치로 `interrupted: true` 복구 | `calls=2`, `rounds=1`, `rereview_of=null` |
| 판정 pass + 단계·assessment 동시 삭제 | 원문의 구조화 fence로 새 기록임을 식별, 중단 복구 | `calls=2`, `rounds=1`, `rereview_of=null` |
| 정상 구조화 R1 유지 | 원문 blocking에서 fail 복구 | `calls=2`, `rounds=2`, 기준점 R1, 다음 프롬프트에 기계 blocking F1 유지 |

위 세 조작 모두 r2의 “기록의 판정(pass)으로 복구”가 나오지 않는다. 호출은 보존하고, 손상 기록은 유효 판정과 재검토 기준점에서 제외한다. 별도로 중복 `findings` 키로 첫 판정이 `unknown`인 원문에도 단계 삭제 및 단계·assessment 동시 삭제를 적용했다. 두 경우 모두 중단 복구되어 `calls=2`, `rounds=1`, `rereview_of=null`이었다. 판독 불가 원문도 footer pass로 승격되지 않았다.

## 재검토 기준점과 옛 기록

고아로 만들지 않고 원장과 저장 기록의 판정을 함께 pass로 조작했다. 단계 삭제 시에는 원장과 저장 기록 양쪽에서 삭제했다. 원문과 해시를 유지하고 대상을 변경한 뒤 다음 검토를 요청했다.

| 기준점 조작 | 결과 |
|---|---|
| 판정만 pass, 단계 유지 | 종료 2, “기준점의 판정이 원장과 맞지 않는다” |
| 단계 삭제, assessment 유지 | 종료 2, “기준점의 단계가 원장과 맞지 않는다” |
| 단계·assessment 동시 삭제 | 종료 2, “기준점의 단계가 원장과 맞지 않는다” |

세 사례 모두 주입 실행기의 누적 호출은 첫 검토 1회 그대로다. 조작한 기준점으로 두 번째 제공자 실행을 시작하지 않았다.

호환 대조군은 원문을 `옛 검토 기록\npass`로 바꾸고 단계·assessment를 제거해 옛 footer 형식의 기록을 구성했다. 원장 보존 사례는 `result_hash`도 해당 원문과 일치시켰다. 고아와 일반 기준점 두 경우 모두 종료 0, `calls=2`, `rounds=2`, 기준점 R1이었고 다음 프롬프트는 직전 pass를 전달했다. 구조화 표지와 fence가 없는 옛 기록의 footer 경로는 정상 작동했다. 정상 구조화 fail 대조군도 고아·일반 기준점 양쪽에서 F1을 다음 프롬프트에 전달했다.

## 새 회귀 시험의 실제 검출력

원본 복제본의 코드는 그대로 두고 `src/`·`test/`를 임시 사본에 복사했다. 해당 사본의 `verify-cli.ts`에서 아래 두 방어를 독립적으로, 그리고 함께 되돌렸다.

1. 고아 복구의 구조화 판별을 `structuredStage !== undefined`만 보도록 변경했다. 새 고아 회귀 시험은 종료 1이었다. 이 단독 변이는 남아 있는 재검토 방어에 걸려 응답이 오류가 되며, 시험은 `recovered[0]` 접근의 TypeError로 실패한다. 따라서 이 결과만을 명확한 동작 단언의 증거로 삼지 않았다. [로그](tester-r3-mutant-orphan.log).
2. 재검토 판별에서 assessment·원문 fence 검사를 제거했다. 새 기준점 회귀 시험은 실제 종료 0과 기대 종료 2의 차이를 단언해 실패했다. [로그](tester-r3-mutant-rereview.log).
3. 두 방어를 함께 r2 방식으로 되돌렸다. 고아 시험은 실제 “기록의 판정(pass)으로 원장에 복구했다”가 기대 `/서로 맞지 않는다/`와 달라 실패했다. 기준점 시험도 실제 0과 기대 2의 차이로 실패했다. **두 시험 모두 잘못된 동작을 실행한 뒤 단언으로 검출했다.** [로그](tester-r3-mutant-combined.log).

현재 수정본에서는 두 시험을 포함한 집중 검사 99개가 모두 통과했다. 새 시험은 단순히 현재 구현을 따라 항상 통과하는 시험이 아니며, r2 결함을 되살리면 실패한다. 단독 고아 변이의 실패 메시지는 더 명료하게 만들 여지가 있으나 검출력 차단 사항은 아니다.

## 기준별 판정

| 기준 | 이번 범위 판정 | 근거 |
|---|---|---|
| T-1 | pass | 3단계 프롬프트의 고유 질문·하위 확인 및 일반 목표 질문 유지 시험 통과. tester 정본의 “기준마다 증거로 통과하는가?” 고정 확인 |
| T-2 | pass | 질문 밖 note·인계, 필수 근거 누락 should_fix, 원래 등급·위치·확신도 보존, blocking과 거짓 footer 차이 시험 통과. 별도 재현에서도 복수 파일·줄 범위의 F1 보존 |
| T-3 | pass | r2 차단 조건 해소. 단계·assessment 동시 누락과 판독 불가 원문도 중단 처리. 재검토 조작 거부, 정상 기계 blocking 유지, 새 회귀 시험의 변이 검출 확인 |
| T-4 | pass | 옛 footer 고아·기준점 두 대조군 정상. 기존 원장·공동/승인 회차 및 B1 사유 관련 집중 시험 통과. 기존 시험 변경은 구조화 응답 어댑터와 지적 문자열 조정이며 원래 예산·권한 관련 단언은 유지됨 |
| T-5 | 집중 검사 부분 pass / 전체 미판정 | 지정 타입·집중 검사 통과. 실제 타 제공자 호출과 전체 검사는 사용자 지정 별도 범위 |

signals: 이 범위에서 새 차단 결함 없음. 전체 검사·실제 타 제공자 증거는 이번 결과로 대체하지 않는다. T04 증거 상태·문턱과 T09 수정 확인은 평가하지 않았다.

목표 대조: 구조화된 blocking이 복구·재검토에서도 같은 판정 근거로 유지돼야 한다는 T03 목적에 부합한다. r2의 차단 결함은 이번 재현과 변이 대조에서 해소됐다. 아래 최종 판정은 요청받은 한정 독립 재검증의 결과다.

독립 판정: pass
