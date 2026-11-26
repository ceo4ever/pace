# P013 T09 독립 tester r3

- 최종 판정: **pass — 이 세션에 지정된 부분 검증 범위**.
- 검증일: 2026-11-26. 런타임: Node v24.22.3.
- 기준 HEAD: `8ece6f9b6c793b5c8f1a7f45fb98a9d5018fd2c2`.
- 작업 위치: 요청된 `t09-tester-r3/isolated` 사본. 구현·기존 테스트·계약·원장 무변경. 산출물은 이 보고서와 실행 로그 두 개다.
- 실제 제공자 실행 및 전체 검사(`npm run check`, `npm test`)는 수행하지 않았다. 전체 검사는 별도 검증 주체 담당이며 그 결과는 이 판정에 포함하지 않는다.

## 패치 동일성

대상: `projects/P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/evidence/impl-diff.patch`.

- `shasum -a 256` 결과: `60ccc6be36ae81f186bdd9d7265c95002a6dbb2fa7c86108753a41ae5fb6cdd4`. 요청값과 일치.
- `git apply --reverse --check <패치>`: 종료 0. 실제 적용·되돌리기는 하지 않았다.
- 패치의 각 `index old..new`와 현재 파일의 `git hash-object`를 읽기 전용으로 대조: 19개 파일 모두 새 blob 해시 일치. 신규 `src/agent/review-recovery.ts` 포함.
- `git diff --check`: 종료 0.

## 실행

각 명령에 임시 `PACE_HOME`을 지정했다. 테스트의 `test/helpers.ts`도 자체 임시 홈을 설정하고 `PACE_PROFILE`을 제거한다.

```sh
PACE_HOME=$(mktemp -d /tmp/pace-t09-r3-home.XXXXXX) npm run typecheck
PACE_HOME=$(mktemp -d /tmp/pace-t09-r3-home.XXXXXX) node --test test/{agent-review-log,agent-review-followup,agent-structured-review,agent-verify,pre-review,project-dev-skill}.test.ts
```

| 검사 | 실제 결과 | 원문 |
|---|---|---|
| typecheck | 종료 0 | [tester-r3-typecheck.log](tester-r3-typecheck.log) |
| 지정한 6개 테스트 파일 | 종료 0, 109 tests / 109 pass / 0 fail / 0 cancelled / 0 skipped | [tester-r3-tests.log](tester-r3-tests.log) |

추가 테스트 파일이나 실제 제공자를 실행하지 않았다. 아래 재현은 이번 세션에서 실행한 `agent-review-followup.test.ts`의 합성 실행기로 `verifyCommand`·`reviewNoteCommand`를 호출하고 실제 임시 파일·원장을 쓰는 시나리오다. 제공자의 의미 판정이나 실제 교차 제공자 실행을 증명하는 결과로 확대하지 않는다.

## 핵심 재현과 검출 근거

| 요구 | 관측된 동작과 단언 | 판정 |
|---|---|---|
| 상위 검토 전 합의 문구만 변경 | 진단 확인 실패 후 계약 문구를 변경. 동등 대조 없는 `recordRoot`는 종료 2. `agreement: equivalent`, 이전·현재 계약 지문, `comparison`을 담으면 상위 근거 기록 종료 0, 해결안 확인 종료 0. `상위 검토 전에 확인된 문구 동등성과 진단 실패의 최신 원문을 잇는다` 케이스가 실행됐다. | pass |
| 문구 동등성의 예산 유지 | `기존 합의 안의 계약 문구 변경을 실행·보고하며 일반 예산을 다시 열지 않는다`에서 대조 없는 확인은 종료 2, 동등 대조 후 pass, 다음 일반 호출은 종료 16. 일반 calls/rounds는 `[2, 2]`, decision은 null. 상위 처리의 일반 예산 비차감은 별도 상한 소진 케이스에서 `[4, 2]` 유지로도 확인. 코드상 동등 대조 경로는 reset을 기록하지 않고, 일반 재시작은 A-1 `contract_reset`의 offsets에만 연결된다. | pass |
| 실패 진단의 가장 최근 원문 전달 | 앞선 지적 F1 뒤 진단 확인에서 새 F9 / `diagnosis.ts:9`를 실패 응답으로 제공. 상위 확인에 전달된 프롬프트에 `F9 [blocking] diagnosis.ts:9`가 있고 `review.rereview_of`가 `report.upper.source`와 일치한다는 단언 통과. `readRecovery`의 `upper.failed`는 진단 확인 결과에서 시작하며, `verify-cli.ts`는 상위 확인에 이 결과를 기준점으로 사용한다. | pass |
| 확인 실패 뒤 원래 지적 목록 유지 | 원래 F1·F2 중 F1만 반환하는 실패 확인 뒤에도 `confirmation_source`는 원래 값, `confirmation_findings`는 F1·F2를 유지. 이어 F2를 확인하여 pass한 뒤에는 F1만 남는다. 프롬프트가 지정 지적·수정 영향만 판정하고 일반 재검토의 전체 blocking 해소 문구를 쓰지 않는 단언도 통과. | pass |
| 상위 근거·승인 문턱 | 상위 근거 없는 확인, worker와 같은 reviewer, 대체 근거 없는 `cross: false`, `agreement: uncertain`, 검증 완화는 종료 2. 실제 계약 변경은 A-1 원문 전 확인 종료 2 및 검토 종료 16. 이전 계약 지문을 승인 대상으로 재사용하면 거부. 새 지문과 일치하는 A-1 뒤 해당 단계만 `[0, 0]`에서 재개하며 다른 단계 rounds 2, 공동 2회·수정 확인 1회는 보존. A-3 요청 대기 중에도 검토와 확인 진입 차단. | pass |
| 두 번의 상위 확인 실패 후 종료 | 백로그 시나리오에서 첫 확인 fail 뒤 `upper_review`. 두 번째에 같은 독립 맥락을 재사용하거나 백로그 대조를 누락하면 종료 2. 유효한 두 번째 근거·확인도 fail이면 `agreement_required`. 다음 호출 종료 16, decision A-1, choices `합의 조정`·`보류`, 상위 검토 2건, 일반 예산 `[4, 2]` 유지. | pass |

위 케이스들은 허용 경로만 실행하지 않고 동등성 근거 누락, 잘못된 승인 지문, 독립 맥락 재사용, 원래 지적 누락과 추가 호출을 구체적인 실패 조건으로 단언한다. 최신 원문은 이전 F1과 다른 F9를 사용해 구별하므로 이전 원문을 재사용하면 해당 단언이 실패한다. 기존 테스트 삭제·약화 여부는 패치의 테스트 diff를 함께 읽어 대조했으며 기존 T02a 케이스는 유지되고 T09 케이스가 추가됐다.

## 범위별 결론

- 독립 목표 대조: 맞음 — 요청한 목표는 예산을 우회하지 않는 제한 확인과 필요한 상위 전이의 재현이다. 지정한 실행에서 위 허용·거부 경로가 관측됐다. 별도 목표 검토 1·2단계를 수행했다고 주장하지 않는다.
- T-1·T-2: 이번 부분 검사에서 확인한 수정 확인·진단·단위 차단 경로 pass.
- T-3·T-4: 이번 부분 검사에서 확인한 독립 근거, 문구 동등성, 최신 실패 원문, 승인과 예산 보존, 두 차례 종료 경로 pass.
- T-5: 지정된 원장 호환·기존 검토·문서 정본 회귀 검사 pass. 전체 검사와 실제 제공자 증명은 별도 주체 담당으로 남긴다. T09 전체 완료 판정으로 확대하지 않는다.
- signals: 지정된 실행에서 실패·불안정·skip 없음. 앞선 독립 실행의 네트워크 EPERM 및 허브 전체 검사 진행 상황은 사용자 인계 정보이며 이 세션에서 재현하거나 결과를 확인하지 않았다.

최종 **pass**는 위 패치에 대한 요청 범위의 독립 재실행 결과다. 구현 수정 요청 사항 없음.
