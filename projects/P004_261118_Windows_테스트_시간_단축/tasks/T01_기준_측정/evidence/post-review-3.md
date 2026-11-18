# T01 3차 좁은 재검토

## 판정: **PASS** (blocking 0, should_fix 0)

이전 문제는 보고서가 저장된 결과 파일의 시간 값만 믿고 순위를 냈다는 점이었습니다. 이 문제는 해소되었고, 수정으로 생긴 회귀나 새 차단 결함은 찾지 못했습니다.

## 1. 시간 출처 결함의 해소

**순위의 출처가 원시 로그로 바뀜**
- 정상 시험 순위(`report.ts`의 `samples` 루프)는 이제 `results.json`의 `run.inventory`가 아니라 `rawInventories`를 씁니다. `rawInventories`는 원시 기본 로그를 다시 파싱한 결과입니다.
- 이 루프는 `baselineValid`가 참일 때만 실행됩니다.

**저장 값 변조나 누락은 기준 무효로 거부**
- `timingDifferences`가 원시 항목과 저장 항목을 같은 순서 위치끼리 비교합니다. 비교 대상은 이름, 판정, 시간입니다.
- 원시 로그에 통과 시험의 시간이 없거나 음수이면 `missingRawTime`으로 기록합니다.
- 차이가 하나라도 있으면 `valid=false`가 되어 `baselineValid=false`, 종료 1이 되고, 순위는 0건이 됩니다.

**경계 경우도 막힘**
- 저장 쪽 항목이 더 많거나 적은 경우: `checkInventory(stored)`와 `compareItems`가 개수와 판정 다중집합 불일치로 거부합니다.
- 같은 다중집합에서 순서만 바뀐 경우: 위치 비교가 거부합니다.
- 파싱 중 예외가 나는 경우: `catch`에서 `valid=false`가 되므로, `rawInventories`에 일부만 채워진 상태로 순위가 계산되지 않습니다.

**fixture 결과** (`duration-source-fix-…/report-integrity-checks.json`)
- 새로 추가된 `missing-stored-duration`과 `wrong-stored-duration`은 모두 기대값과 실제값이 종료 1로 일치합니다.
- 정상 대조군은 종료 0입니다.
- 이전 6가지 결함 주입 사례도 기대값과 실제값이 일치하므로, 회귀는 없습니다.

## 2. 기존 의미 보존

- **기준선 판정:** 시간 일치 조건이 하나 추가됐을 뿐, 기존 조건은 그대로입니다. 작성자 기록에 따르면 기존 3회는 유효하고 `timingDifferences` 0, 중앙값 1425.464초입니다.
  - 이것이 성립할 근거가 있습니다. 예전 파서와 새 파서는 같은 `([\d.]+)` 문자열에서 `Number`를 만들고, JSON에 저장했다 다시 읽어도 double 값이 그대로 보존되므로 두 값은 정확히 같아야 합니다.
- **보조 판정:** `profileValid`의 조건식은 바뀌지 않았습니다. 기존 보조 실행이 실패 1건, 종료 1인 결과도 그대로입니다.
- **0이 아닌 종료 코드의 의미:** `baseline-revalidation.json`에 `timingDifferences`가 추가로 남을 뿐, 성공과 실패를 가르는 방향은 이전과 같습니다.

## 3. 비차단 제안

- **TAP 형식 경로:** TAP 출력의 `ok N - name` 행에는 시간이 없습니다. 그래서 통과 시험이 하나라도 있으면 `missingRawTime`으로 항상 거부됩니다. 실패를 막는 안전한 방향이고 현재 기준은 spec 출력이라 영향이 없습니다. 다만 MEASURE.md에는 "spec/TAP"로 적혀 있으므로, "기준 측정은 spec 출력 전용"이라고 고쳐 적기를 권합니다.
- **원시 로그 자체의 위조:** 원시 로그를 직접 고친 경우는 이 대조로 잡을 수 없습니다. 원시 로그가 판정의 정본이라는 설계상 정상입니다. 필요하다면 이후 실행에서 로그 해시를 `results.json`에 남기는 정도로 충분합니다.

## 4. 검토 한계

- `measure.ts` self-test에 새로 추가된 두 사례의 코드는 제공되지 않았습니다. 그 결과인 `report-integrity-checks.json`과 작성자 기록으로만 확인했습니다.
- 다시 생성된 기존 기준선과 보조 폴더의 `baseline-revalidation.json`과 `baseline-test-times.json` 원문은 보지 못했습니다. "954개 그룹, 각 3회 시간 유지"는 작성자 기록 기준입니다.
- strict tsc 종료 0과 self-test 16개 점검 완료도 작성자의 진술입니다.
- 전체 검사는 다시 실행하지 않았고, 다시 실행할 필요도 없다고 판단합니다.
