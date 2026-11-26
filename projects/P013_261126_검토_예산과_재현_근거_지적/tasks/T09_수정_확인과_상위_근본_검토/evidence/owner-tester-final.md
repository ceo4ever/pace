# T09 owner 후속 — 최신 독립 tester r4

- 일시: 2026-11-26, Node v24.22.3.
- 판정 범위: 사용자 요청과 [별도 후속 계약](owner-followup-contract.md) R-1~R-4. 기존 완료 태스크 전체를 다시 승인하는 판정은 아니다.
- 실행 위치: `t09-owner-r4-tester/isolated`. 원본 작업 트리는 편집하지 않았다. 이 사본에서도 구현·기존 테스트·계약을 수정하지 않고 tester 증거만 추가했다.
- 독립성: 구현을 작성하지 않은 별도 tester 세션에서 명령과 반례를 직접 실행했다. 자동 부트의 구현 진행 요약과 사용자 설명을 받았고, 계약·diff·TASK를 읽었다. 따라서 새 블라인드 목표 검토의 1→2단계 순서나 다른 제공자 교차 검증을 수행했다고 주장하지 않는다. 이번 작업은 지정된 수정분의 독립 재검증이다.

## 사본 대조

`shasum -a 256 <태스크>/evidence/owner-followup.patch` 결과:

```
bce3f4ab90b19b99dd1b02a9f35889f4bbe8c09a318f5f847ef6c271850a8fd5
```

Python으로 `subprocess.check_output(['git','diff','--binary'])`와 패치 원문을 대조했다. 둘 모두 57,006 bytes, 바이트 완전 일치, SHA-256도 위 값과 일치했다. 검사 및 증거 추가 뒤에도 같은 대조를 다시 수행해 일치했다. 즉 해시만 있는 패치를 읽은 것이 아니라 실제 실행 사본의 추적 파일 변경도 같은 내용임을 확인했다. 비추적 후속 계약과 owner 원문은 별도로 읽어 대조했다.

## 직접 실행

| 명령 | 종료 | 실제 결과 |
|---|---|---|
| `npm run typecheck` | 0 | `tsc -p tsconfig.json`, 오류 없음 |
| `node --test test/{agent-review-followup,agent-review-log,agent-structured-review,agent-verify,pre-review,project-dev-skill}.test.ts` | 0 | tests 113, pass 113, fail 0, skipped 0, cancelled 0 |
| `node --test <태스크>/evidence/owner-tester-r4-probe.test.ts` | 0 | tests 8, pass 8, fail 0, skipped 0, cancelled 0 |

[직접 반례 소스](owner-tester-r4-probe.test.ts)와 [실행 원문](owner-tester-r4-probe.log)을 보존했다. CLI 명령 함수 `verifyCommand`/`reviewNoteCommand`와 실제 임시 파일·원장·스냅숏을 사용한다. 외부 검토 응답은 고정 executor이므로 실제 외부 에이전트의 독립성이나 판단 품질을 증명하지는 않는다. fixture와 기존 상위 흐름 준비 함수를 재사용하고, 반례의 입력·단언은 tester가 추가했다.

초기 반례 준비에서 두 건이 실행 조건 때문에 실패했다. 백로그에서 fail+다른 대상 pass로 일반 2회를 이미 사용한 뒤 unknown 실행을 기대했고(실제 종료 16), 두 사후 원장 시험에 TASK 계약을 준비하지 않았다(실제 종료 2). 구현 결함으로 분류하지 않았다. 전자는 pass 뒤 진단 유지 상태를 직접 대조하고 별도 새 백로그에서 unknown→다른 대상 fail을 실행했으며, 후자는 계약을 준비해 다시 실행했다. 최종 8건 결과는 위 실행 원문이다.

## 계약별 대조

| 기준 | 관측 및 검출력 | 판정 |
|---|---|---|
| R-1 | 태스크와 백로그 모두 근거 없는 진단은 종료 2. 검토 안 된 다른 대상 진단도 종료 2. 적합한 진단 뒤 근거 파일을 바꾸면 종료 2이며 executor 추가 호출 0. 지정 테스트는 이른 진단의 `recovery_evidence.source`·64자리 지문도 확인한다. `confirmationDiagnosis`는 같은 대상의 최신 유효 fail을 대조하고 `diagnosisLink`는 실행 직전 파일 지문을 다시 확인한다. | pass |
| R-2 | 태스크 post 진단→pre 대상 pass→unknown→pre fail에서 즉시 `upper_review`, 후속 post 진입 종료 16, trigger는 원래 diagnosis ID. 백로그 다른 대상 pass 뒤 `activeDiagnosis` 유지, 별도 백로그 unknown→다른 대상 fail도 단위 보류. 같은 basename인 루트 `change.patch`와 `evidence/change.patch` 사이에서도 다른 원장의 pass가 진단을 닫지 않는다. 반대로 원래 대상의 pass는 태스크·백로그 모두 진단을 닫는다. 태스크는 이후 다른 단계 fail에도 상위 발동 없음, 백로그는 진단 종료와 기존 예산 차단을 구별했다. 기존 지정 테스트는 공동 1회만 사용한 재실패와 일반 예산이 남은 재실패, 상한 소진 뒤 수정 확인 진단 재실패도 확인한다. | pass |
| R-3 | 지정 테스트의 백로그 종료 보고는 일반 호출 4, 일반 판정 2, 공동 2, 수정 확인 2(진단 전/후), 두 상위 원인·적용 해결안과 마지막 `BACKLOG.md:19` 재현을 단언한다. 직접 태스크 반례에서도 상위 두 회 fail→`agreement_required`, 추가 실행 종료 16. 두 원인 `근본 원인 1/2`, 해결안 `실제 적용 1/2`, 마지막 `failure.ts:2`·재현 원문을 확인하고 저장 JSON과 응답의 endpoint를 완전 대조했다. | pass |
| R-4 | `review-recovery.ts`의 공식 선택 `기준 조정`, `보류`, `한 번 더`와 종료 응답·저장 파일이 일치. 지정 테스트는 허브의 `기준 조정` 추천·이유·`source: hub`, 직접 반례는 추천 미제공 시 `보류`·이유·`source: default`를 확인했다. 비공식 추천 선택은 종료 2로 거부됐다. | pass |

`src/agent/review-followup.ts:143`의 pass 조건은 진단의 원장과 대상이 모두 같은 때만 닫힘으로 계산한다. fail은 같은 단위의 다른 대상·단계도 발동시킨다. unknown·interrupted·void는 유효 확정 판정에서 빠진다. 원장 복구·구조화 판정·A-3·pre-review의 기존 검사도 지정 113건에서 통과했다.

## 잘못된 구현에 대한 검출 확인

원본과 실행 사본을 그대로 둔 채 `/tmp/owner-r4-mutant-*`에 추가 사본을 만들었다. 그 안에서만 pass의 `ledger === latestDiagnosis.ledger && row.target === latestDiagnosis.row.target` 조건을 제거했다. 직접 반례 중 다른 대상 pass→fail과 같은 이름 다른 원장 pass를 선택해 실행한 결과 **종료 1, 2건 실패**했다. 전자는 예상 `upper_review`가 사라졌고 후자는 `activeDiagnosis`가 사라졌다. 따라서 핵심 반례가 이번 수정 이전의 잘못된 종료를 실제 검출한다. [변이 실행 원문](owner-tester-r4-mutation.log).

## 종료 보고·정본·범위

- [owner 원문](owner-endpoint.md)과 별도 후속 계약을 기준으로 `docs/AGENT-CALL.md`, `skills/pace-project-dev/references/reviewer.md`, `decision-rights.md`, BR09의 종료 보고·세 선택을 대조했다. 두 번의 원인·해결안·재현과 허브 추천/기본 추천 출처가 일치한다.
- 기존 TASK의 T-4는 당시의 합의 조정·보류 문구를 유지한다. 최신 R-4는 owner 후속에 따라 세 선택을 명시하며, 이번 판정은 그 별도 후속 계약에 대한 것이다. `한 번 더`는 종료 보고 선택지이지 자동 추가 실행 허가가 아니다. 실제 owner 회신과 실행 범위는 이후 별도 확정한다.
- 독립 목표 대조: 이번 한정 목표와 맞음 — 다른 대상의 성공으로 진단이 지워지는 우회를 막으면서 동일 대상 성공과 유효 재실패를 구별했다.
- 목표 달성: 이번 후속 계약 범위에서 달성. 지정 검사와 반례로 관측했다. 실제 외부 대상·실제 외부 검토자 실행, `npm run check` 전체 검사, 기존 T09 전체 완료의 재승인은 범위 밖이며 수행하지 않았다.
- signals: 구현 결함 미검출. 실제 외부 대상과 전체 검사 결과는 별도 필요하며 이 증거로 대체하지 않는다.

pass
