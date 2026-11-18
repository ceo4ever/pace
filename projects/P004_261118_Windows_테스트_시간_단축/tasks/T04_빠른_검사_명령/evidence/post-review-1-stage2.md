# T04 사후 리뷰 2단계 (최종)

리뷰어는 Anthropic Claude Opus 5.5이며, 1단계와 같은 독립 맥락에서 읽기만 했습니다(도구 실행, 재실행, 편집 없음).

**판정: fail. blocking 1 · should_fix 3 · nit 3**

---

## 1. 1단계 지적의 계약 대조 결과

| 1단계 항목 | 계약 근거 | 결론 |
|---|---|---|
| T1: base에 선언이 없으면 작업본 선언 사용 | TASK의 전체 검사 절에 "선언이 없으면 기존 정책대로 작업본 선언"이 명시됨. `committedCommand`는 실제 부재만 건너뛰고, 조회 실패는 `git()` 예외로 처리됨 | 계약 내. 기존 동작과 호환 |
| T2: HEAD 대체 기준 | TASK 표와 사전 SF-3에서 승인되고 문서화됨 | 계약 내 |
| F1: 커밋된 변경 제외 | TASK 접근에 명시됨. 출력의 scope 줄에 표시됨 | 계약 내 |
| P1: Git stderr 경고 시 전체 전환 또는 3 | TASK에 "stderr 경고를 빈 성공 집합으로 취급하지 않는다"고 명시됨 | 계약 내. 보수적 동작이며, autocrlf 기본 환경에서는 속도 이점이 줄어드는 성능 한계 |
| P2: 부모 종료 시 자식 정리 | 범위 밖으로 합의됨(강화 주장 없음) | 대상 아님 |
| E5: results 6/5 | evidence에서 cli 6건 + scout 5건, 실제 typecheck로 설명됨 | 해소 |
| `openRepo` | 기본 base `main`은 형식 검증만 함. 외부 저장소에서 동작함 | 해소 |

## 2. Blocking

**B1. index에서만 삭제된 파일이 부분 통과로 새어 나감 (조정자 관측 재현, 계약 위반)**

- **재현 상황**: `git rm --cached src/a.txt`를 실행하면 status는 `D  src/a.txt`와 `?? src/a.txt`를 함께 보고합니다.
- **원인 코드**: `changes()`에서 두 레코드가 `Set`으로 하나로 합쳐집니다. 이어서 `plan()`은 삭제 여부를 `lstat` 존재 여부로만 판단합니다. raw `--cached` diff의 `D`도 `uncertain` 조건에 들어 있지 않습니다.
- **결과**: 커밋될 상태에서는 파일이 빠지는데, 작업본에 남은 파일로 시험이 통과합니다. 커밋 결과와 다른 상태를 검증하고 exit 0을 내는 **거짓 성공 선택**입니다.
- **계약 근거**: T-2와 S-3의 "삭제는 부분 실행 전에 전체로 전환", TASK의 "raw 모드와 status를 대조"에 위배됩니다.
- **수정 방법**:
  - status 레코드의 X 또는 Y에 `D`가 있으면 `uncertain = "삭제"`로 표시합니다.
  - raw의 `header[3] === "D"`도 `uncertain`으로 처리합니다.
  - 같은 경로가 tracked 상태와 `??`로 동시에 나오면 전체 전환합니다.
  - 기존 deleted 시험은 그대로 유지하고, `rm --cached` 회귀 시험을 하나 추가합니다.

## 3. Should fix

**SF1. assume-unchanged / skip-worktree 숨김 (tester 관측 재현)**

- **분류**: 계약 문구상 blocking은 아닙니다. 사용자가 로컬 index 플래그로 Git에 숨기도록 명시한 경우이고, 그 편집은 add/commit에도 들어가지 않습니다. TASK의 "Git 기존 정책 밖으로 추적하지 않음"과 같은 성격입니다.
- **문제**: 그래도 T-1의 "작업본 기준 빠짐없이"와 실제 작업본 상태가 어긋나고, 관측상 실제 실패가 감춰졌습니다.
- **수정 방법**: `git ls-files -v -z`에서 소문자 태그(assume-unchanged)나 `S`(skip-worktree)가 하나라도 있으면 전체 전환하거나, 최소한 출력에 명시합니다. 수정 비용이 작습니다.

**SF2. changed 경로 예외가 분류되지 않음**

- **문제**: `runner.ts`의 `changed` 분기가 `try` 밖에 있습니다. `fileResults` 내부 `inside()`의 TOCTOU 실패 같은 동기 예외가 나면 CLI 종료 코드를 알 수 없습니다.
- **수정 방법**: `executeChanged` 전체를 감싸고 다음처럼 분류합니다.
  - 실행 시작 전 예외는 3으로 처리합니다.
  - 이미 실패 1이 관측된 뒤의 예외는 1을 유지합니다.

**SF3. 증거 정합성**

- **불일치**: `implementation-evidence`는 runtime 전후 스냅샷이 "모두 동일"하다고 하지만, 독립 대조는 `fullyEqual: false`입니다. `captured`나 `limitations`처럼 원래 달라지는 필드 때문일 수 있으나 현재는 증명되지 않았습니다.
- **필요 조치**: `files` 607개 배열만의 동등성 결과를 별도로 기록하고, 전체 회귀가 최종 소스 트리 해시(또는 커밋)와 연결됨을 명시해야 합니다.
- **추가 사항**: `focused-final.tap`이 최종 소스 이전 버전(overflow 명령이 다름)임을 안내 문서에 적어야 합니다. 후속 tap의 분리 설명은 이미 있습니다.

## 4. Nit

1. 출력 scope 줄에 TASK가 요구한 "전체 검사는 `pace test all`/`finish`" 안내를 추가하면 좋습니다(현재는 문서에만 있을 수 있음).
2. `.pace/test-map.json`에서 `harness.ts`/`shell-result.ts`가 common과 unit sources에 중복으로 들어 있습니다. 이 때문에 legacy `pace test file src/project/harness.ts`가 이제 3을 반환합니다. 데이터상의 호환성 변화이며 거짓 선택은 아닙니다.
3. Windows Store `python` 별칭은 legacy와 같은 거짓 실패 1을 냅니다. 성공으로 새지 않으므로 문서에 한계로만 남기면 충분합니다.

## 5. 선택·실행·성능 확인

- **실제 실행 확인됨**:
  - 설치 복사본 app이 외부 임시 Git에서 실행되었습니다.
  - check → 선택 unit 순서 실행, 비선택 unit 제외, 실제 full 전환이 marker로 확인됩니다.
  - 이 확인은 Windows 한정이며, 정제된 Git 설정의 fixture에서 이루어졌습니다.
- **성능**: 중앙값 14.687초(준비 시간 4.67초 분리)이며, 범위가 다른 비교임이 공개되어 있습니다. BR04의 "크게 짧다"는 이 범위 조건 아래에서 충족되고, P-6 달성 주장은 없습니다.
- **기존 경로 보존**: 인자 없는 `all`/`finish`의 main 기준과 `ok`/`output` 의미가 코드상 유지됩니다. 전체 회귀는 991건, 실패 0, 기존 970건 판정 차이 0, skip 9로 보존되었습니다.

## 6. 재검증 범위 권고

- **B1·SF1·SF2 수정 후**: `changed-test.test.ts`와 `test-runner.test.ts`의 focused 실행에 새 회귀 시험을 추가하면 충분합니다.
- **전체 1회 재실행**: S-8은 "최종 소스" 기준이므로 제품 코드를 수정하면 계약상 전체 1회 재실행이 걸립니다. 가설이 아니라 실제 수정이므로 해당하며, 수행 여부는 main이 결정할 사안입니다.
- **SF3**: 기존 자료를 다시 대조하는 것만으로 해소됩니다.
