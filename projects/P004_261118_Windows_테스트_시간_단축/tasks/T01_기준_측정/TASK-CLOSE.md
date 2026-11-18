# T01 기준 측정 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

유효한 Windows 기준선과 재사용 측정법을 확보했다. 비계측 전체 검사 3회는 각각 종료 0·963건(954 통과·실패 0·건너뜀 9), 이름·판정 차이 0이다. 벽시계 중앙값은 1425.464초, 최소 1425.406초·최대 1444.136초다. P-6 목표는 712.732초 이하이며 개선 달성은 후속 태스크에서 확인한다.

구현 후 3차 독립 reviewer/tester가 T01 목표 달성을 확인했다. 원문은 `evidence/post-review-3.md` 및 `evidence/post-tester-3.md` 다. main 판단 A에 따라 보조 실패를 정상 성능과 분리하고 T03에 인계했다. 원래 도구 버전·동시 작업·개인 경로의 한계는 `evidence/measurement-limitations.md` 에 공개했다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1: `evidence/baseline-2026-11-18T08-56-17-364Z/results.json` 및 `evidence/baseline-2026-11-18T08-56-17-364Z/summary.json` |
| T-2 | 통과 | S-2: `evidence/baseline-profile-2026-11-18T10-08-53-748Z/report.md` 및 `evidence/cause-samples.md` 및 `evidence/nested-failure.md` |
| T-3 | 통과 | S-3: measure.ts·프로젝트 report.ts·measurement-data.ts·reporter.ts·MEASURE.md, `evidence/duration-source-fix-2026-11-18T11-07-03-465Z/self-test.json` 및 `evidence/duration-source-fix-2026-11-18T11-07-03-465Z/report-integrity-checks.json` |

## 단위 테스트

- `measure.ts --self-test --label duration-source-fix`: 종료 0·16점검. 실제 Node 두 시험의 정상 보고서는 종료 0, 기본 행/저장 행/보조 이벤트 누락·요약 불일치·잘린 JSON·저장 시간 삭제/654321 변조는 각각 종료 1이다. 시간 주입 두 경우는 기준 무효·timingDifferences 1·정상 순위 0으로 거부됐다.
- 코드 5개(measure.ts·report.ts·measurement-data.ts·reporter.ts·diagnose-nested.ts)를 Node 24.22.3·TypeScript 7.0.2의 strict tsc로 검사해 종료 0이다. 사용 옵션은 `--ignoreConfig --types node --noEmit --target es2024 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --erasableSyntaxOnly --verbatimModuleSyntax --strict --noUncheckedIndexedAccess --skipLibCheck` 다. projects/는 기본 tsconfig include 밖이라 별도 확인했다.
- 기존 원시 자료 재대조는 기준 3회 모두 유효·시간 차이 0, 정상 시험 954그룹×3표본과 중앙값을 보존했다. 근거는 `evidence/baseline-profile-2026-11-18T10-08-53-748Z/baseline-revalidation.json` 및 `evidence/baseline-profile-2026-11-18T10-08-53-748Z/baseline-test-times.json` 이다. 전체 검사는 재측정하지 않았다.
- 비밀 검사는 추가 원문을 포함한 1438개 파일에서 종료 0이었다. 개인정보 경로 유지 이유와 별도 점검은 `evidence/privacy-check.md` 에 기록했다. 브레인 오류/경고 0·diff check 통과도 확인했다. 최종 check 뒤 파일 수가 바뀌면 커밋 전 검사를 갱신한다.
- 최종 사전 해시 근거·스냅숏과 done 기록까지 반영한 커밋 전 비밀 검사는 1440개 파일에서 종료 0이다. check·done도 통과했다.

## E2E

- 계측 없는 `npm run check` 3회의 원문은 `evidence/baseline-2026-11-18T08-56-17-364Z/run-1.log` 및 `evidence/baseline-2026-11-18T08-56-17-364Z/run-2.log` 및 `evidence/baseline-2026-11-18T08-56-17-364Z/run-3.log` 다. 실행별 소유 TMP·TEMP·TMPDIR·PACE_HOME과 symlink·도구 조건을 기록했다.
- 수정 argv의 별도 보조는 종료 1·953 통과·실패 1·skip 9다. root 963개 결과와 entryFile 94개 목록은 완전하며 wrapper 한 시험의 pass→fail만 다르다. `evidence/baseline-profile-2026-11-18T10-08-53-748Z/profile-analysis.json` 에 원시/목록과 key별 차이를 보존했다. 실패 파일/시험을 정상 순위에서 제외했고 정상 시험 시간은 비계측 원시에서 계산한다.
- 전체 중첩 진단은 181건 중 180 통과·실패 1·skip 0·종료 1, guard 단독은 3 통과·실패 0·skip 0·종료 0이다. 각각 `evidence/nested-diagnostic-2026-11-18T10-22-48-842Z/result.json` 및 `evidence/nested-diagnostic-2026-11-18T10-27-49-775Z/result.json` 에 남겼다. 시험 코드·skip 설정은 바꾸지 않았다.
- 초기 보조 argv 오류 실행은 소유 자손과 함께 중단해 원래 복합 명령 종료 1을 보존했다. 수정 보조의 실제 실패 종료 1과도 구별한다. `evidence/argv-order.md` 에 근거와 비상속 검증을 남겼다.

## 리뷰

- 사전 1차: anthropic 교차 fail blocking 1 should_fix 3. 비계측/보조 분리·환경·식별자·추정 구분을 반영했다. 원문은 `evidence/pre-review-1-stage1.md` 및 `evidence/pre-review-1-stage2.md` 다.
- 사전 2차: 동일 세션 pass blocking 0 should_fix 2. 보조 인벤토리 대조·단일 재생성 안내를 반영했다. 원문은 `evidence/pre-review-2.md` 다. 실제 대상의 LF 전체 해시와 main 공급 해시가 일치함을 확인하고 하네스 상태 제외 해시의 표기를 정정했다. `evidence/pre-review-hash-reconciliation.md` 에 원래 해시·스냅숏·검증을 보존했다.
- 구현 후 1차: reviewer pass blocking 0 should_fix 4 · tester fail(T-3 목록 누락 판정). 종합 막힘으로 수정했다. 원문은 `evidence/post-review-1-stage1.md` 및 `evidence/post-review-1-stage2.md` 및 `evidence/post-tester-1-stage1.md` 및 `evidence/post-tester-1-stage2.md` 다. 처리는 `evidence/post-review-1-disposition.md` 다.
- 구현 후 2차: reviewer pass blocking 0 should_fix 0 · tester fail(T-3 저장 시간 출처). 종합 막힘으로 좁게 수정했다. 원문은 `evidence/post-review-2.md` 및 `evidence/post-tester-2.md` 다. 처리는 `evidence/post-review-2-disposition.md` 다.
- 구현 후 3차: 동일 독립 세션 anthropic reviewer pass blocking 0 should_fix 0 · openai tester pass(T-1/T-2/T-3 모두 통과). 원문은 `evidence/post-review-3.md` 및 `evidence/post-tester-3.md` 다. 종합 통과로 확정했다. spec 전용 안내를 MEASURE.md에 반영했다.
- 교본: typescript·verification 색인 및 저장소 testing 기준 대조. 실행별 임시 상태 분리, 실패·불완전·전체 skip 거부, 원시/저장 개별 시간 대조를 적용했다. 특수 기능은 필요하지 않았고 Node subprocess·파일·JSON을 사용했다.

## 남긴 것

- T02: 정상 보조 파일 중 project-harness 540.390초, agent-chain 59.379초, dashboard-init 50.610초 등. repoFixture의 git init·config·첫 커밋 반복과 CLI 기동은 원인 표본이다(각 비용 비중은 추정). test/project-harness.test.ts의 repoFixture 호출 위치는 66곳이며 루프 실행 횟수와 같지는 않다.
- T03: `evidence/nested-failure.md` 의 전체/단독 원문, 동료 임시 폴더 교차 실행·소유 폴더 누수 실패 주입·선택 동시성 전체 5회 실패 0 조건을 인계한다. 공용 TMP 간섭은 유력 가설이다. 최초 보조 내부 원인과 생성 PID는 미확인이다. 중첩 .mjs 19개 시간 분해도 후속으로 남긴다.
- 환경: 기존 Windows skip 9건 사유, 논리 프로세서 수와 누적 CPU 표본, 전원 이름 코드 페이지 한계, 원래 도구 해시 부재와 겹친 작업, 개인 경로 유지의 한계를 공개했다. 실패 보조 파일의 정상 파일 시간·전체 정상 순위는 미확인이다. 동시성 4·8 비교는 이름 순번만으로 같은 시험을 확정하지 않고 파일/줄 식별자도 대조한다.
- T04: 캡틴의 다른 Git 저장소용 PACE 제품 CLI 요구를 PROJECT·BR04·BACKLOG·사건에 반영했다. T01 기준선 재정의는 아니다.
