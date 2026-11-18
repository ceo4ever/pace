# T05 함수 전환 수정 계획 재검토 (B1/B2 해소 확인)

**검토자:** Anthropic · Claude Opus 5.5 (`claude-opus-5-5`). 도구·실행·편집 없이 문서만 대조했습니다.
**자동 첨부 맥락:** 사용자 계정 이메일 범주가 붙었으나 사용하지 않았고 값도 쓰지 않습니다.

## 판정: **통과(pass)** — blocking 0 · should_fix 2

계획은 구현에 들어가도 될 수준입니다. 전환 효과, 변이 결과, 새 세 회 결과는 아직 측정 전입니다. 과거 stale-lock·대시보드 원인은 계속 미확정으로 둡니다.

## 1. 이전 blocking 해소

**B1 모듈·프로세스 상태 격리: 해소**
- **재사용 범위 축소.** 자식을 블록별 scope로 나누고, HOME fixture가 바뀌면 새 자식 세대를 만듭니다. 재사용은 같은 fixture의 main↔worktree 사이로만 한정했습니다(TASK 「시험용 직접 호출 프로세스」 2번째 항목). 처음 fork할 때 첫 요청의 env/cwd를 쓰므로 import 시점의 문맥도 고정됩니다.
- **같은 fixture 안에서 남는 상태는 정적 대조로 연결.** `project-main-state-audit.md`의 다음 행들이 근거입니다.
  - cwd: `openRepo`가 호출 때마다 생성됩니다.
  - HOME: `paceHome`·`readWorkerSettings`가 호출 때 env와 파일을 읽습니다.
  - 하네스 전역: `gitLimits`는 `withGitLimits`에서만 대입·복원됩니다.
  - 리스너/타이머: 등록 없음.
  - 대상 밖 캐시(`cachedCodePage`, `reaperStats`)는 범용 안전성을 주장하지 않는 것으로 한정했습니다.
- **동적 확인 연결.** done/finish/merge의 실제 상태는 원래 3블록의 단언으로 검증합니다. S-3에서는 새 HOME에서 새 자식 세대가 생기는지, 요청 뒤 복원되는지를 확인합니다.
- 남는 위험(같은 fixture 안에서 발견되지 않은 메모리 상태)은 한계로 공개되어 있습니다. 발견되면 중단합니다.

**B2 bin과의 예외·상태 동등성: 해소**
- `bin/pace.ts` 원문과 매핑이 같습니다.
  - main 반환값 → status
  - 예외 → `pace: ${(error as Error).message}\n`, `UsageError`는 2, 나머지는 1
- `UsageError`는 실제로 import한 `cli.ts`의 같은 클래스로 판정하므로 `instanceof`가 맞게 동작합니다.
- 이미 처리되어 반환된 HarnessError 1은 다시 변환하지 않습니다.
- 도구 측 실패(timeout, IPC, overflow, 예기치 않은 종료)는 제품 실패 1로 감추지 않고 별도 실패로 처리합니다.
- S-3에서 UsageError, parseArgs 예외, HarnessError를 같은 입력으로 실제 CLI와 직접 호출에 넣어 대조합니다.

## 2. 이전 should_fix 처리

| 항목 | 판정 | 근거 |
|---|---|---|
| SF-1 출력 | 해소 (아래 신규 SF-A로 경계 보완) | JS write 후킹을 선택했습니다. audit의 stdout/stderr 행에서 `fs.writeSync`나 inherit 사용이 없음을 확인했고, 예상 밖 raw 출력과 늦은 출력은 도구 실패로 처리합니다. |
| SF-2 같은 단언 | 해소 | 원래 assert 번호·식·메시지·행 매핑과 실제 stack을 함께 기록합니다. 앞선 단언에 도달했는지 확인하고, 변이 사본의 `cli.ts` URL/SHA로 출처를 확인합니다. |
| SF-3 M3 | 해소 (아래 신규 SF-B로 귀속 보완) | M3은 유지 경로 증거로 다시 분류했습니다. M2를 EIO 블록의 직접 merge에도 적용합니다. |
| SF-4 반환·비정상 | 해소 | `signal:null`·`error:undefined`로 맞췄고, 사용하는 필드는 3개로 감사에 연결했습니다. scope 폐기 뒤 후속 요청도 보이는 실패로 끝납니다. |

## 3. 이번 수정으로 생긴 should_fix

**SF-A 요청 구간 밖 출력의 분류 규칙**
- "부모 pipe의 예상 밖 raw 출력은 도구 실패"라는 규칙은 맞습니다. 다만 다음 출력이 언제 어디로 가는지 정해야 합니다.
  - import·ready 이전의 출력
  - Node 런타임 경고(예: `.ts` 로딩 관련 warning, deprecation)
- 이런 출력이 있으면 정상 시험이 허위로 실패할 수 있습니다. 반대로 요청 안에서 경고가 나오면 stderr에 섞입니다.
- 최소 보완:
  - ready 이전 출력은 별도 기록 후 실패로 처리하고, 요청 구간 밖 출력과 구분해 둡니다.
  - S-3의 stderr 동등성 대조를 실제 CLI 원문 전체(런타임 경고 포함 여부)로 확인합니다.
  - 정규화나 무시는 하지 않습니다.

**SF-B EIO 블록에서 M2의 귀속 확인**
- EIO 블록은 실제 CLI로 남는 주입 경로(runPace 4회)와 직접 merge가 섞여 있습니다.
- M2(`applyMerge`의 최종 `writeBacklogState` 생략)로 실패한 BL 완료 단언이 실제로 직접 전환된 merge가 남긴 상태에서 나온 것이어야 합니다.
- 그 단언 직전에 `applyMerge`에 도달한 마지막 호출이 runDirect인지 기록해야 합니다. argv 순서 원문으로 충분합니다. 그래야 "EIO 블록의 직접 전환 경로를 검증했다"는 주장이 성립합니다.

## 4. 이번 수정에서 생기지 않은 문제 (확인)
- A→B→A처럼 fixture가 다시 바뀌어도 새 자식을 만듭니다. 더 보수적인 방향이며, 비용은 늘지만 결함은 아닙니다.
- `ctx.after`(Node 24)로 블록마다 자식을 닫은 뒤 임시 root를 정리합니다. Windows의 cwd 잠금 순서와 맞습니다.
- import 시점에 `process.stdout.write`를 미리 참조해 캡처를 우회하는 출력도 raw pipe에서 드러납니다. 숨겨지지 않습니다.
- 다음은 이전과 같습니다: 감사 도구에 scope 삽입이 허용되는지, 70블록이 byte 동일한지, 예외 파일이 2개뿐인지, 609개 파일 수, 996/987/0/9 집계, T-3 판정식.

## 5. 증거 한계
- 다음 원문은 보지 못했습니다: `project-main-module-graph.json`(87개 노드), `projectCommand`·harness 소스, 3블록 본문, EIO 블록의 호출 순서. audit 문서에 적힌 내용을 근거로 판단했습니다.
- 정적 대조는 현재 코드에 대한 계획 근거일 뿐입니다. 런타임에 전역 상태가 없다는 증명이 아닙니다.
- 구현, 변이, 시간 효과, 최종 세 회는 모두 실행 전입니다.
