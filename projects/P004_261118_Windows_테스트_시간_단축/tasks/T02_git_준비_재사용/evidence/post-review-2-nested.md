# T02 사후 리뷰 (중첩 wrapper 선행 수정, 도구·실행 없음)

이번 범위는 승인된 중첩 wrapper 수정과 진단 증거뿐입니다. 진행 중인 전체 실행은 건드리지 않았고, 재실행도 요청하지 않습니다.

## 1. 코드 판정: **pass** (blocking 0 · should_fix 0 · nit 4)

### 확인된 사항

- **단언 보존:** 19개 파일 목록, `count("fail") === 0`, `tests >= 168`, skip 허용 정책 모두 diff hunk 밖에 있어 바뀌지 않았습니다. 바뀐 것은 다음 두 가지뿐입니다.
  - `result.error === undefined` 단언 추가. 검사를 약화하지 않고 강화합니다.
  - status 실패 메시지를 끝부분 잘라내기에서 전체 출력으로 교체.
- **파일 무변경:** 제시된 diff에는 `test/playbook-maker.test.ts`만 있습니다. 다만 이 diff 자체가 승인 범위로 걸러진 것이므로, guard와 19개 `.mjs`가 바뀌지 않았다는 판단은 그 필터를 전제로 합니다.
- **격리 방식:** 각 파일 worker가 기존 `helpers.ts`를 preload해 자기 소유 `tempRoot`를 쓰고, TMP·`PACE_HOME`을 분리하며, 종료 시 정리합니다.
  - launcher가 preload를 실행하지 않는다는 점은 Node 24.22.3에서 관측된 동작입니다.
  - launcher가 preload를 실행하는 버전이라도 helper의 상속 경로(형제 루트 할당) 덕분에 안전한 방향입니다.
- **오류 처리:** ENOBUFS를 구별해 표시하고, status·signal·error와 maxBuffer 메타데이터를 메시지에 남깁니다. 16 MiB를 넘는 출력은 완전하다고 주장하지 않고 실패로 처리합니다. 실패 시 메시지에 전체 출력을 담는다는 점은 합성 6KB 이상 출력의 시작·중간·끝·stderr가 모두 보존된 것으로 입증됐습니다. 기존 2000자 절단이었다면 검출되었을 회귀입니다.

### nit

1. `test/playbook-maker.test.ts`의 `resolve("test/helpers.ts")`가 cwd에 의존합니다. 기존 파일 목록 계산과 같은 패턴이긴 합니다.
2. 실패 메시지가 최대 32 MiB까지 커질 수 있습니다. 상위 wrapper나 measure 도구가 이를 다시 자를 수 있습니다.
3. wrapper는 worker별 격리가 실제로 적용됐는지 단언하지 않습니다. 나중에 `--import`를 빼도 순차 실행에서는 통과하고, 간섭은 동시 실행에서만 간헐적으로 나타납니다. T03 동시성 시험 전에 고려할 점입니다.
4. 진단 스크립트들이 만든 공용 temp 디렉터리를 정리하지 않습니다. 진단 전용이라 영향은 작습니다.

### 새로 생긴 위험 (관측되지 않음)

- helper의 exit 정리가 실패하면 worker의 `exitCode`가 1이 되므로, 중첩 실행이 새로 실패할 수 있습니다. 의도된 동작(SF-2)입니다. 다만 Windows에서 파일 잠금(EBUSY)이 생기면 flaky 원인이 될 수 있습니다.
- 모든 `.mjs` worker가 `src/core/paths.ts`를 import하게 되어 결합이 생깁니다. `src/core`가 `common`에 있어 전체 검사로 전환되므로 검출은 됩니다.

## 2. worker별 소유 입증

- **최초 진단:** 결과는 `verified=false`, 자식 시험 181건 통과, `status=0`이었습니다. launcher도 preload를 실행할 것(20개)이라는 잘못된 기대가 원인이었다고 기록되어 있고, 원문을 보존한 점은 적절합니다.
- **재검증:** `revalidation.json`의 판정은 다음과 같습니다.
  - worker 19개, 공통 runner PID.
  - 서로 다른 소유 루트, 공용 루트와도 분리.
  - 정리 완료, 잔존 0.
- **증거 한계:**
  - **(a)** 받은 `diagnose-nested-isolation.ts`는 이미 runner 부재를 허용하는(`!runner||…`) 형태입니다. false를 낸 최초 버전 코드는 제시되지 않았습니다.
  - **(b)** `revalidation.json`은 boolean 요약뿐입니다. worker별 PID·tmp 목록 원문이나 재검증 로직, 그 해시가 연결되어 있지 않습니다.
  - **(c)** 진단 env는 `PACE_TEST_TMP_OWNER/PARENT`를 삭제합니다. 반면 실제 wrapper는 `process.env`를 상속하므로, 상속 owner가 있을 때의 경로는 이 진단으로 입증되지 않았습니다.
  - **(d)** S-6/S-7의 guard 진단 결과(TAP, trace)는 이번에 제시되지 않아 검증하지 못했습니다.
- **판단:** 서술과 요약은 서로 정합하며 그럴듯합니다. 다만 원문 수준에서 독립 검증한 것은 아닙니다.
- **증거 계층 보완 권장 1건 (should_fix):** 재검증 로직(또는 명령과 해시)과 원시 trace 경로를 `revalidation.json`에 연결하십시오. 코드 판정과는 별개입니다.

## 3. 결과 구분

| 항목 | 상태 |
|---|---|
| wrapper 코드 | **pass**: B0 · SF0, 증거 보완 1 |
| T02 전체 결과 | **보류**: S-5 종료 0이 필수이며, 계약 전체 실행이 수집 중입니다. |
| 기존 T02 실패의 정확한 중첩 원인 | **미확정**: 통제 재현(S-6)은 공용 TMP 간섭 가설과 정합하지만, 원래 단회 실패의 원인을 입증하지는 않습니다. 원래 출력은 잘려 있습니다. |
| 후속 성공 관측의 해석 | 성공하더라도 Git 준비 재사용과 중첩 격리 수정이 함께 반영된 결과임을 공개해야 합니다. 두 변경의 효과를 분리해 판단하지 않습니다. |
