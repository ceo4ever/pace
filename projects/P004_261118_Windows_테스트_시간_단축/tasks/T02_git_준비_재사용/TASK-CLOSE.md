# T02 git 준비 재사용 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

실제 Git 복사본 독립성과 준비 비용 감소를 관측했다. 첫 전체 검사는 968건 중 통과 958·실패 1·skip 9·종료 1이었고 원문을 유지한다. 이후 캡틴 승인으로 실패 조사·최소 수정을 선행한 새 전체 관측은 968건 중 통과 959·실패 0·skip 9·종료 0이다. 기준 3회 각각과 기존 963건의 이름·판정 차이 0, skip 사유 동일, 신규 5건 전부 통과를 확인했다. 최종 독립 openai tester는 T-1~T-3 및 S-5~S-8과 T02 목표 달성을 확인했고 독립 anthropic reviewer의 코드 판정은 blocking 0·should_fix 0이다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | `evidence/post-tester-1-fixture-agent.tap` 및 `evidence/post-tester-1-stage2.md` |
| T-2 | 통과 | S-2·S-3 원래 본문·실제 Git 보존, S-6~S-8 격리·원래 누수 검출 유지. `evidence/existing-test-body-audit.json` 및 `evidence/fixed-full-inventory-comparison.json` 및 `evidence/nested-isolation-2026-11-18T12-40-06-394Z/revalidation-v2.json` |
| T-3 | 통과 | S-4 준비 비용 공개, S-5 새 전체 종료 0. `evidence/fixture-benchmark-2026-11-18T11-37-57-425Z/result.json` 및 `evidence/t02-fixed-2026-11-18T12-44-08-858Z/report.md` |

## 단위 테스트

독립 tester가 helper+agent-chain 31건과 HOME 1건을 실제 실행해 모두 통과했다. 세션 한정 임시 격리·GIT_OPTIONAL_LOCKS=0 사용과 실행 범위는 원문에 공개했다. PM helper 4건·HOME·S-11 좁은 검사, pace test unit git-fixture 및 typecheck도 종료 0이다. 프로젝트 진단 TypeScript 3개와 준비 벤치는 기본 tsconfig include 밖이므로 strict tsc로 따로 확인해 종료 0이다.

## E2E

PM 최초 비계측 전체 1회는 1390.0615859초·종료 1이다. 원시 결과와 환경, 시간은 `evidence/t02-2026-11-18T11-40-54-469Z/results.json` 및 `evidence/t02-2026-11-18T11-40-54-469Z/environment.json`에 있다. 신규 5건 모두 통과·기존 963건 삭제 0·skip 9 동일이며 wrapper 한 건만 판정이 달라졌다. 정확한 내부 실패 원인은 로그 절단 때문에 확인되지 않는다.

- S-5 새 실제 전체 관측: 2026-11-18T12:44:10.878Z~13:07:53.902Z, 1423.0238333초·종료 0·968건(959 통과·실패 0·skip 9). 원문은 `evidence/t02-fixed-2026-11-18T12-44-08-858Z/run-1.log` 및 `evidence/t02-fixed-2026-11-18T12-44-08-858Z/results.json`이다. 실제 wrapper도 통과했다. 기준 3회 대조는 `evidence/fixed-full-inventory-comparison.json`, 원시 skip 사유 대조는 `evidence/fixed-skip-reasons.json`이다.
- S-6/S-7: `evidence/guard-peer-shared-2026-11-18T12-33-56-695Z/guard.tap`은 동료 생성 오인으로 실패, `evidence/guard-peer-isolated-2026-11-18T12-34-20-877Z/guard.tap`은 3건 통과, `evidence/guard-own-isolated-2026-11-18T12-34-22-631Z/guard.tap`은 자기 누수 단언으로 실패다. 같은 폴더 trace에 생성 PID·위치를 남겼다.
- S-8: 실제 19개 중첩 181건 전부 통과·skip 0·19개 worker 루트 분리/정리 잔존 0이다. `evidence/nested-isolation-2026-11-18T12-40-06-394Z/nested.log` 및 `evidence/nested-isolation-2026-11-18T12-40-06-394Z/revalidation-v2.json`에서 원시 trace와 재검증 코드/해시를 연결한다. launcher도 preload된다는 진단 도구의 잘못된 기대와 상속 OWNER/PARENT를 지운 진단의 한계는 `evidence/post-review-2-disposition.md`에 공개했다.
- 실패 출력 보존/ENOBUFS 구별은 `evidence/wrapper-errors-2026-11-18T12-41-11-397Z/result.json`의 실제 wrapper 두 실패 주입으로 확인했다. 기존 guard·19개 mjs 소스·skip 정책은 변경하지 않았다.
- 새 전체의 시험 소스·실행기·측정 도구는 실행 중 변경하지 않았다. 추가 시험/중첩 진단 실행은 겹치지 않았으나, 읽기 코드 리뷰·원시 trace 재검증 파일 읽기/해시·문서 기록·진행 로그 읽기는 수집 중 수행했다. 이 부하의 영향량과 호스트의 다른 부하는 정량 확정하지 않는다. 결과에는 Git 준비 재사용과 격리 수정이 함께 포함된다. 1425.464초 기준 중앙값과 새 단회 차이를 최적화만의 효과 또는 통계적 개선으로 주장하지 않는다.

## 리뷰

- 사전 1차: anthropic reviewer pass blocking 0 should_fix 4, `evidence/pre-review-1-stage2.md` 및 `evidence/pre-review-disposition.md`.
- 구현 후 1차: anthropic reviewer 코드 pass blocking 0 should_fix 0 nit 5 · openai tester 집중 검증 통과/S-5 fail. 전체 미충족을 유지한다. `evidence/post-review-1-stage2.md` 및 `evidence/post-tester-1-stage2.md`, 처리 이유는 `evidence/post-review-1-disposition.md`.
- 추가 사전 2차: 동일 anthropic reviewer pass blocking 0 should_fix 4, `evidence/pre-review-2-nested.md` 및 `evidence/pre-review-2-disposition.md`.
- 구현 후 2차: 동일 독립 anthropic reviewer wrapper 코드 pass blocking 0 should_fix 0 nit 4·증거 보완 1, `evidence/post-review-2-nested.md` 및 `evidence/post-review-2-disposition.md`. 원시 trace·해시 연결을 보완했다.
- 최종 tester 재판정: 별도 openai tester pass, T-1~T-3 및 S-5~S-8 충족·목표 달성. `evidence/post-tester-3-phase-3-final.md` 및 `evidence/post-tester-3-phase-3-executable.log` 및 `evidence/post-tester-3-nested-reverify.txt`. 원시 기준3회와 새전체의 이름/순번/판정/skip 사유를 독립 대조했고 실제 OWNER/PARENT 상속 peer 3건 통과·own 누수 실패·형제 루트 정리를 직접 실행했다. 원문은 `evidence/post-tester-3-peer-inherited.tap` 및 `evidence/post-tester-3-own-inherited.tap`이다. 앞선 tester fail 원문도 당시 관측의 판정으로 유지한다.
- 교본: typescript·verification의 공유 상태·오류 상태 유출·상태 격리 대조. 초기화/복사 실패 캐시 거부와 실제 Git object 손상 비전파를 검증했다.

## 남긴 것

SF-1 반영으로 seed를 첫 대상 HOME에 의존시키지 않고 전용 세 번째 HOME/bin으로 초기화했다. TASK 접근과 차이는 `evidence/pre-review-disposition.md`에 기록했다. 기존 실제 대상의 HOME/app 경로와 Git 환경을 유지한다. 별도 nit의 지원 경계와 처리 이유는 `evidence/post-review-1-disposition.md`에 있다. 이후 캡틴이 실패 조사·최소 수정 선행을 승인했고 추가 사전/사후 검토·새 전체·최종 tester 판정까지 완료했다. 최초 실패의 내부 원인 미확정은 유지한다.

- T03: 동시성 4·8 반복 비교와 선택값 전체 최소 5회 실패 0을 수행한다. 이번 peer/own 검출과 실제 상속 형제 루트 원문, 19파일 범위·판정·skip 보존을 인계한다. 순차 실행 도입 이력과 추가 포트/잠금/전역 상태 간섭을 조사한다.
- 최종 시간 절반 목표는 미달이며 후속으로 남는다. 준비 벤치는 직접332.905ms/재사용24.697ms지만 새 전체 1423.024초는 기준 중앙값과 2.440초 차이인 단회 복합 변경 관측이다. 최적화 단독 효과로 귀속하지 않는다.
- 진단 누수 증거용 소유 임시 루트는 보존했다. 실제 helper 소유 worker 루트 정리는 완료됐다. 원문 민감 확인에서 실제 비밀 값은 발견하지 않았고 최종 저장소 비밀 검사 1557개 파일 통과·브레인 lint 오류/경고 0을 확인했다. 마감 필수 절 제목 누락으로 최초 check는 실패했으며 단위 테스트/E2E/남긴 것 절을 보완한 뒤 check·done이 통과했다.
