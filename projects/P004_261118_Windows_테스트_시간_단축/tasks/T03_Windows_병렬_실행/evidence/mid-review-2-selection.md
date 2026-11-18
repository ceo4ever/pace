# T03 중간 코드 재검토 (읽기 전용)

## 판정
**중간 코드: PASS** (blocking 0 · should_fix 1 · nit 4)

이 판정은 코드와 이미 완료된 비교 증거만 대상으로 합니다. 기본값 5회(S-5), 보조 프로파일(S-6), 문서·브레인 기록(S-7)은 아직 수행 전이므로 결함이 아니라 미완료입니다. T03 종료 판정과 성능·안정성 결론은 내리지 않습니다.

## 1. 선택 계산 검증 (사전 5% 규칙)

`comparison.json` 원값으로 다시 계산했습니다.

| 항목 | 계산 | 결과 |
|---|---|---|
| median4 | (692 948.1093 + 702 170.3589) / 2 | 697 559.2341 ms ✔ |
| median8 | (633 831.0254 + 657 638.7758) / 2 | 645 734.9006 ms ✔ |
| 임계값 | 0.95 × median4 | 662 681.27 ms |
| 감소율 | 1 − median8 / median4 | 7.43 % ✔ |

- median8(645 734.9)은 임계값(662 681.27)보다 작으므로 `selected=8`이 사전 규칙과 정확히 일치합니다.
- 순서는 4→8→8→4이고, 네 회차 모두 `status 0`, `differences: []`입니다.
- 두 설정의 범위가 겹치지 않습니다(4: 692.9–702.2초, 8: 633.8–657.6초). 다만 이는 기술적 관찰일 뿐이며, 새 기준으로 쓰지 않습니다.

## 2. 기본값 8의 적용 범위 (`scripts/test.ts`)

- 기본값은 `platform === "win32" && !concurrency`일 때만 들어갑니다. 명시 override가 있으면 Windows 기본값을 대체하며, concurrency 인자는 하나만 생깁니다.
- 비Windows의 기본 동작은 변하지 않습니다.
- 첫 시험은 win32에서 `--test-concurrency=8`, linux·darwin에서 동시성 인자 없음을 단언합니다. 두 번째 시험은 win32에서 override 2가 단일 인자로 남는지 검증합니다.
- 실행·신호 전달 코드는 바뀌지 않았습니다.
- **결론: 요구한 범위대로 정확히 적용됩니다.**

## 3. 1·2차 지적 처리 평가

| 지적 | 평가 |
|---|---|
| SF-1 같은 소스 | **충족(한계 공개).** `audit-comparison.ts`가 네 회차의 commit, fingerprint, code 경로 status 행, log를 제외한 diff stat, 호스트 환경이 같은지 대조합니다. src·package 등이 dirty 목록에 없으면 해당 내용은 commit으로 고정됩니다. dirty인 runner·test·도구는 SHA로 고정됩니다. 남은 차이(log.jsonl 5줄→7줄, 151→153)는 원문 그대로 공개되었습니다. |
| SF-2 실효 동시성 | **충족.** 각 raw 로그에서 `> node scripts/test.ts --test-concurrency=N` 줄이 정확히 1건이고, 4·8·8·4와 일치합니다. 중첩 출력이 섞이지 않았음도 `length===1`로 확인됩니다. |
| nit1 절대 경로 키 | 이 그룹의 provenance 보존을 위한 의도적 유지입니다. 수용합니다. |
| nit2 범위 | 표와 audit `ranges`에 공개되었습니다. ✔ |
| nit3 suites | parseText가 suites≠0을 거부한다는 설명은 그럴듯하지만, 문서상 주장일 뿐 원문으로 확인하지 못했습니다. |
| nit4 배리어 | 4·8 실제 4회 모두 통과했습니다. 판정 완화나 재시도는 없었습니다. ✔ |

## 4. 새 지적

**SF-1. `assess-selected.ts`는 5회 동안 소스가 고정되었는지 검증하지 못합니다** (S-5 조건 "고정 소스", T-2)
- 비교 그룹은 회차마다 `environment.json`이 있었습니다. 반면 기본값 묶음은 시작 시점 스냅숏 하나뿐입니다.
- 비교 그룹 수집 중에도 project log 편집이 실제로 겹쳤습니다. 5회는 약 55분 동안 이어지므로, 그 사이 runner나 test가 바뀌어도 탐지되지 않습니다.
- 또한 `nodeArguments`의 8은 측정기가 *계산한* 값입니다. raw 로그의 `> node scripts/test.ts`는 override가 없다는 사실만 증명할 뿐, 기본값이 8이었다는 것을 직접 증명하지는 않습니다. 이 둘을 연결하려면 runner SHA가 고정되어 있어야 합니다.
- **조치:** 평가 시점에 `testSources`, `runnerSha256`, `helpersSha256`, toolHashes를 다시 계산해 `environment.json`과 대조합니다. 함께 종료 시점의 `gitStatus` code 행과 diff stat을 시작 스냅숏과 대조합니다(`audit-comparison.ts` 로직 재사용).
- 이는 사후 확인이므로 측정을 다시 시작할 필요는 없습니다. 차이가 관측될 때만 SF-4 방침에 따라 새 묶음으로 구분합니다.

**nit**
1. `assess-selected.ts`의 `selected` 인자를 `comparison.json`의 `selected`와 묶지 않습니다. 소스 기본값과 인자를 둘 다 잘못 넣으면 통과합니다. 같은 값인지 단언하기를 권합니다.
2. `statusRows`의 `/evidence/` 제외 조건은 P004 밖의 evidence까지 제외합니다. 문서의 "P004 evidence 밖" 표현보다 범위가 넓습니다. 접두사를 P004 경로로 한정하는 것이 좋습니다.
3. audit 스냅숏은 각 회차 *시작* 시점입니다. 4회차 진행 중 또는 그룹 종료 시점의 편집은 대조되지 않습니다. limitation에 "회차 시작 시점"을 명시하십시오.
4. power 출력이 깨진 인코딩으로 기록되어 있습니다. 비교 자체는 일관되지만 사람이 판독할 수 없습니다. 코드페이지를 고정하거나 GUID만 비교하기를 권합니다.

## 5. 증거 한계
- **원문 확인:** `comparison.json`, `environment-and-invocation-audit.json`, 도구 코드 두 개, `scripts/test.ts`, test-command 앞부분.
- **문서상 주장만 확인:** 기본값 반영 뒤 test-command 8건, typecheck, strict tsc 통과. 원문은 받지 않았습니다.
- **스냅숏 한계:** status·stat 스냅숏은 파일 내용을 연속 감시한 결과가 아닙니다. 같은 줄 수의 수정이나 기존 dirty 파일의 추가 수정은 검출하지 못합니다. 이미 공개된 한계이며, 이번 결과에서 관측된 결함은 아닙니다.
- **호스트 부하:** 수집 중 리뷰·편집이 겹쳤고, 조용한 호스트임을 증명할 수 없습니다. 2표본·5%는 통계가 아니라 운영 선택 규칙입니다(공개됨).
- 비교 4회는 S-5 5회에 포함되지 않습니다(설계상 분리).

**다음 지점:** 새 연속 5회와, SF-1 대조를 포함한 `selected-assessment.json`을 받은 뒤 재검토하고, 이어서 S-6·S-7을 검토합니다.
