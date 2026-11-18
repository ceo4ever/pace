# T03 중간 코드 리뷰 — Phase 2

## 판정
**중간 코드: PASS** (blocking 0 · should_fix 2 · nit 4)

이 판정은 코드 결함만 다룹니다. 비교 그룹(S-4)이 진행 중이고 S-5~S-7은 아직 수행 전이므로, 이는 미완료이지 결함이 아닙니다. 공식 종료 판정과 성능·안정성 판단은 보류합니다.

## 1단계 지적 재평가

| 1단계 지적 | 재평가 |
|---|---|
| `toolHashes` 누락 (차단 의심) | **철회.** 전체 writer의 `host.toolHashes`에 measure, report, measurement-data, reporter, diagnose-nested 5개가 root 기준 상대 키로 기록됩니다. 앞서 본 diff hunk 밖의 기존 코드였습니다. `sourceFingerprint` 요건을 충족합니다. |
| `check` 인자 전달 위치 | **해소.** `package.json`의 `check`는 `npm run typecheck && npm test`라서 `-- --test-concurrency=N`이 `npm test`에 붙습니다. `npm-forward-preflight.json` 원문(`> node runner.cjs --test-concurrency=4`)과 일치합니다. |
| 기준 1 대비 개선 판단 | **철회.** TASK가 합의한 규칙은 4 대 8, 5%, 이후 기본값 5회입니다. BR03은 단축 시간을 "기록"하라고만 요구하므로 추가 수치 기준을 두지 않습니다. |
| 2표본·5% 잡음 | 합의된 운영 규칙입니다. 결함이 아니며, 한계 공개 대상으로만 남깁니다. |
| `.gitattributes` 범위 | **해소.** 파일이 P004 디렉터리 안에 있어 패턴이 해당 프로젝트에만 적용됩니다. `git-evidence-eol-green.json`에서 T02·T03 evidence는 `text: unset`, measure.ts·helpers·`P003_fake`는 `unspecified`이고, checkout SHA와 CRLF check-in blob이 보존되었습니다. |

## should_fix

모두 **그룹 종료 후 사후 검증**으로 처리할 수 있습니다. 측정 중에는 코드나 도구를 수정하지 마십시오.

**SF-1. "같은 소스" 판정 범위가 좁습니다** (T-3, S-4 조건 "같은 코드")
- `observations.ts:sourceFingerprint`는 test 파일 95개, runner, helpers, toolHashes만 묶습니다. `src/`, `package.json`, tsconfig, lockfile 변경은 탐지하지 못합니다.
- writer는 `commit`, `diff --stat`, `gitStatus`를 이미 기록하지만 `compare.ts`가 이를 대조하지 않습니다.
- 주의할 점: 그룹 실행 중 새 evidence 폴더가 생기므로 `gitStatus`를 그대로 fingerprint에 넣으면 거짓 불일치가 납니다.
- 조치: 네 개 `environment.json`에서 `commit` 동일 여부와 P004 evidence 밖 `gitStatus`·`diff` 동일 여부를 사후 대조해 기록합니다. 다음 그룹 전에는 이 대조를 도구에 반영하는 것이 좋습니다.
- 같은 사후 대조에서 node, npm, power, defender, cores의 회차 간 차이도 공개합니다. 이는 수치 기준이 아니라 공개 항목입니다.

**SF-2. 회차별 실효 동시성 증거가 없습니다** (T-1·T-2)
- `requestedConcurrency`와 `nodeArguments`는 측정기가 `testArguments`로 *계산한* 값입니다. 자식 프로세스가 실제로 받은 argv가 아닙니다.
- 실제 npm 경로 확인은 fixture와 일회성 `measure-option-validation.json`뿐입니다.
- 조치: npm이 각 `run-1.log`에 출력하는 `> node scripts/test.ts --test-concurrency=N` 줄을 사후에 회차별로 대조합니다. 원시 로그만으로 재실행 없이 확인할 수 있습니다.
- S-5에서는 반대로 override 인자가 없음을 같은 방법으로 확인합니다.

## nit
1. `compare.ts`의 `toolHashes` 키가 절대 경로입니다. 로컬 사용자 경로가 증거에 남고 이식성이 떨어집니다. measure.ts처럼 상대 키를 권합니다.
2. S-4는 "중앙값 및 범위 공개"를 요구하지만 `comparison.json`에는 median만 계산됩니다. `observations[].elapsedMs`로 산출할 수 있으니 보고서에 min·max를 명시하면 됩니다.
3. `scopeComparison`은 이름·판정 다중집합만 대조하며, suites 총계를 T02 기준과 비교하지 않습니다. 파일 귀속 한계는 SF-3 방침대로 S-6에서 보완합니다.
4. `test-command.test.ts`의 겹침 시험은 3초 배리어와 20초 spawn 제한을 씁니다. 이번 4·8 전체 실행 안에서 처음 고부하로 돕니다. 실패하면 fail-closed로 그룹이 무효가 되므로, 원문을 보존하고 원인을 분리 진단하십시오. 판정 완화나 재시도는 BR03 범위 밖입니다. 현재는 관찰 항목입니다.

## 근거 범위
- **원문을 직접 확인한 증거:** `npm-forward-preflight.json`, `measure-option-validation.json`(잘못된 concurrency 0·2·누락과 evidence 경로 거부, 명시 4의 argv, source 95개), `git-evidence-eol-green.json`.
- **문서상 주장만 확인한 증거:** runner RED/GREEN, compare self-test, tsc 결과. 원문은 이번에 받지 않았으므로 확인으로 간주하지 않습니다.
- **코드상 TASK와 일치하는 항목:**
  - 옵션을 glob 앞에 두는 처리와 유일한 양의 정수 concurrency (SF-1 방침)
  - 비Windows 기본값 유지
  - 4→8→8→4 직렬 순서
  - `median8 ≤ 0.95·median4`이면 8을 선택
  - 실패 시 중단, 재시도 없음, 원문 보존

## 미완료 (결함 아님)
- S-4 그룹 결과
- 기본값을 1에서 선택값으로 바꾸고 첫 test-command 기대값 갱신
- S-5 override 없는 새 연속 5회. S-5는 `measure --runs 5`만으로는 T02 범위·skip 대조가 되지 않으므로, `observations.ts`를 재사용한 대조 단계가 필요합니다.
- S-6 보조 프로파일
- S-7 이력·브레인·문서 기록
- T02 최초 실패 원인 미확정 상태 유지

**다음 지점:** 그룹 종료 후 SF-1·SF-2 사후 대조 결과를 첨부해 재검토를 받으십시오. 그 뒤 기본값 변경 diff를 검토합니다.
