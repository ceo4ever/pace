# T02 승인 선행 수정 사후 코드 검토 요청

승인된 최소 수정은 실제 `test/playbook-maker.test.ts`의 Node argv에 기존 helper file URL preload 추가, maxBuffer 16 MiB 명시, spawn error와 status 구분 및 전체 캡처 출력 보존이다. 기준 커밋 `1f01f62` 대비 T02 전체 변경과 추가 사전 원문 `pre-review-2-nested.md`, 처리 `pre-review-2-disposition.md`를 대조한다. 기존 Git fixture 사후 1차 결과도 유지한다.

## 완료된 집중 검증

- `nested-diagnostic-2026-11-18T12-31-42-214Z/nested.log`: 수정 전 실제 19개, 181건 중 guard 한 건 실패. 이전 T02 실패의 내부 원인과 동일하다고 확정하지 않는다.
- `guard-peer-shared-2026-11-18T12-33-56-695Z/`: 다른 PID의 공용 루트 폴더를 원래 guard가 누수로 오인해 실패.
- `guard-peer-isolated-2026-11-18T12-34-20-877Z/`: 후보 격리의 peer 폴더 생성은 3건 모두 통과.
- `guard-own-isolated-2026-11-18T12-34-22-631Z/`: 자기 tmpdir 누수는 원래 guard 단언으로 실패.
- `nested-isolation-2026-11-18T12-40-06-394Z/`: 실제 wrapper 기본 argv에 진단 trace preload만 추가한 실제 19개 실행, 181건 전부 통과·skip 0·종료 0. trace 19개의 PID/PPID, TMP·PACE_HOME 분리와 PACE_PROFILE 없음, 모든 exit 후 정리 완료·공용 루트 잔존 0 확인.
- 위 최초 진단 `result.json`의 verified false는 runner에서도 preload가 실행돼 trace 20개여야 한다는 진단 도구 가정 오류다. Node 24에서는 file worker 19개에만 trace가 실행됐다. 원래 raw/result는 보존하고 `revalidation.json`은 실제 trace를 다시 읽어 19개 서로 다른 루트·동일 runner 부모·소유 정리 완료를 검증한다. 후보 단일 파일로 복수 파일 격리를 주장하지 않는다. 도구의 새 실행 검증 조건도 실제 관측에 맞게 수정했다.
- `wrapper-errors-2026-11-18T12-41-11-397Z/`: 실제 wrapper에 일반 실패·ENOBUFS 결과를 주입해 두 경우 모두 종료 1이며 캡처 시작/중간/말미·stderr 보존과 상태/한도 분류를 검출했다. 무제한 캡처 보존을 주장하지 않는다.
- PM `npm run typecheck`와 진단 TypeScript 3개 strict 검사 종료 0. 기존 `test/playbook/` 소스 diff 없음, guard·19개 목록·기존 count/pass/fail/skip 단언 유지.

## 진행 중인 전체 관측과 요청 경계

2026-11-18T12:44:10.878Z에 코드·도구 고정 후 `measure.ts --runs 1 --label t02-fixed`로 새 비계측 전체 검사를 시작했다. 원래 실패한 t02 관측을 대체하지 않는다. 새 전체 결과에는 Git 준비 재사용과 실패 수정이 함께 포함되므로 최적화만의 효과로 귀속하지 않는다.

전체가 끝나기 전에는 통과·완료로 판정하지 않는다. 지금은 독립 코드 reviewer의 읽기 검토를 요청하며, 성능 관측과 겹치는 추가 시험/진단은 실행하지 않는다. 독립 tester의 실행과 최종 전체 판정은 이 수집이 끝난 뒤 별도로 요청한다.
