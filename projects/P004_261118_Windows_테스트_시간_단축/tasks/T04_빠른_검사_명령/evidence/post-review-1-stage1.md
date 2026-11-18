# T04 사후 코드 리뷰: 1단계 (읽기 전용)

**리뷰어 메타**: 제공자 Anthropic, 모델 Claude Opus 5.5 (`claude-opus-5-5`). 도구 실행, 편집, 메모리 기록은 하지 않았습니다. 자동으로 붙은 컨텍스트는 사용자 계정 정보(값은 생략), 실행 환경 정보(OS, 셸, 날짜, 작업 폴더), 메모리 시스템 안내입니다. 아래 판단은 제시된 diff, 소스, 증거 요약만을 근거로 합니다. 최종 gate 판정은 내리지 않습니다.

---

## 1. 범위 및 거짓 성공 문제

**F1. 커밋된 브랜치 변경은 선택 범위에 들어가지 않음 (중)**
- 근거: `changed.ts` `changes()`는 작업본과 index를 HEAD 기준으로만 비교합니다.
- 기능 브랜치에 커밋된 변경이 있고 작업본에서 파일 하나만 고친 경우, 그 파일의 unit만 실행됩니다. 결과는 "부분 통과" exit 0입니다.
- 변경이 커밋만 있으면 "변경 없음"으로 끝나고 exit 3입니다(성공은 아님).
- `scope` 문구로 이 범위를 고지하고는 있습니다. 그러나 목표인 "관련 시험 전부 선택"과는 차이가 있으므로, PROJECT 수준에서 수용할지 결정해야 합니다.

**F2. 부분 통과가 exit 0을 반환함 (확인 필요)**
- 문구는 "부분 통과 · 전체 회귀 제외"이지만 exit code는 완전 통과와 같습니다.
- finish나 다른 소비자가 exit code만 보고 판단하는지 확인해야 합니다. 이번 diff 범위에서는 영향이 보이지 않습니다.

**F3. fail-fast 때문에 나머지 관련 시험이 실행되지 않음 (저)**
- 첫 실패에서 다른 unit과 남은 파일을 건너뜁니다.
- 실패는 보존되지만 "관련 시험 전부 실행"은 실패 상황에서 성립하지 않습니다. 의도된 설계라면 TASK 문서에 명시하는 것이 좋습니다.

**F4. 예외 경로가 분류되지 않음 (중)**
- `runner.ts`에서 `changed` 분기는 `try` 밖에 있습니다.
- `fileResults` 내부 `inside()`의 realpath 실패나 `windowsGitShell` 예외가 나면 rejection이 그대로 올라갑니다. 1/3으로 분류되지 않아 CLI 종료 코드를 알 수 없습니다.
- 거짓 성공 가능성은 낮지만 계약 밖의 동작입니다.

**F5. Windows `python` 실행 별칭 (저)**
- Store 별칭 stub이 있으면 프로세스는 시작되지만 9009로 종료됩니다. 이것이 "확인 불가 → 전체 전환"이 아니라 시험 실패(exit 1)로 기록됩니다.
- 거짓 실패이며, legacy와 동일한 동작입니다.

**F6. skip-worktree, assume-unchanged, sparse 파일 미검출 (미확인)**
- 이런 파일의 변경은 status/diff에 나타나지 않습니다.
- 다른 변경과 섞여 있으면 부분 통과가 나올 수 있습니다.

## 2. 신뢰 경계 문제

**T1. base에 선언이 없으면 작업본 `검사`를 실행함 (중~고)**
- 근거: `harness.ts` `executionCommand`가 `return base ?? local`입니다.
- `changed`의 full fallback은 `revision`(main SHA)을 넘기지만, main에 `검사` 선언이 없고 작업본 docs에만 있으면 **커밋되지 않은 작업본 명령이 실행**됩니다.
- 시험 `absent`는 작업본에도 선언이 없는 경우만 다룹니다. 따라서 "committed full declaration만 실행한다"는 주장은 이 경우에 대해 증명되지 않았습니다.
- legacy 시험 "base 조회 실패는 작업본 선언으로 성공하지 않는다"와 이 코드가 어떻게 양립하는지 `committedCommand`/`declaredCommand` 본문으로 확인해야 합니다(제공되지 않음).

**T2. main/master가 없으면 HEAD를 신뢰 기준으로 삼음 (중)**
- 기본 브랜치가 trunk, develop처럼 다른 이름이거나, 로컬 main 없이 원격만 있는 경우가 해당합니다.
- 이때 기능 브랜치에 커밋된 검토 전 map/checks가 그대로 실행됩니다. 라벨 "HEAD"로 표시는 되지만 보호 수준이 달라집니다.
- `repo.base` 설정을 무시하고 자체 탐지를 하므로 finish와 기준이 어긋날 수 있습니다.

**T3. 명령 본문 외 스크립트 내용은 고정되지 않음 (고지된 한계)**
- `npm run typecheck` 같은 명령은 작업본의 `package.json`과 스크립트를 실행합니다.
- `package.json` 변경이 미분류라 full로 전환되는 것은 보수적인 동작입니다. 다만 map이 넓은 glob을 쓰면 우회될 수 있습니다.

## 3. 경로, cwd, 셸 문제

**P1. Git stderr가 있으면 즉시 실패 처리 (중, 실환경 미검증)**
- `readGit`은 stderr가 비어 있지 않으면 실패로 봅니다.
- Git for Windows 기본값(`core.autocrlf=true`, system config)에서는 status/diff가 CRLF 경고를 낼 수 있습니다. 그러면 매번 full fallback(`changes`)이나 exit 3(`context`)이 됩니다.
- 모든 fixture가 `GIT_CONFIG_NOSYSTEM=1`과 `autocrlf=false`를 쓰므로 이 경로는 시험되지 않았습니다. 거짓 성공은 아니지만, 빠른 검사의 효과가 사라질 위험이 있습니다.

**P2. 부모 종료 시 check 자식 프로세스 정리 미증명 (중)**
- check는 `spawnSync`로 실행되며 시그널 핸들러가 없습니다.
- 시험은 700ms 후 스스로 끝나는 자식만 확인하므로, 2시간짜리 full 검사가 고아로 남는지 증명하지 못합니다. POSIX의 SIGTERM 단독 전달 상황은 특히 불명입니다.

**P3. 출력 상한 16MB (저)**
- 대형 외부 저장소의 full 검사에서 ENOBUFS가 나면 "failed"로 기록되는 거짓 실패가 생길 수 있습니다. legacy와 동일한 동작입니다.

**P4. POSIX 경로 미실행**
- `posixShimExecuted: false`이고 모든 증거가 win32입니다.
- 실제 POSIX에서 실행되지 않은 경로: detached 그룹 kill, `sh`, `python3`, 대소문자 구분.

**P5. 확인된 양호 동작**
- 경로 처리: `-z` 파싱, `--no-renames`, `--no-ext-diff`, fsmonitor 끔, `inside` realpath 검사, 한글·공백·`;` 경로 처리.
- cwd: 하위 폴더 실행 시 toplevel 해석, 선언 cwd 검사.

## 4. 증거 정합성

**E1. focused TAP이 최종 소스와 일치하지 않음 (중)**
- TAP의 overflow 명령은 `node -e "process.stdout.write(...)"`입니다. 최종 시험 소스는 `overflow.pid`를 기록하는 다른 명령이므로, 이전 버전 코드로 실행한 결과입니다.
- 그 증거에는 changed 시험 21개 중 19개만 있습니다. "escaping working definition", "Windows missing Python" 두 건이 빠져 있습니다.

**E2. 전체 회귀 결과의 코드 기준 확인 불가**
- run-1에서 991건 중 0 fail, 9 skip, 신규 21건이 확인됩니다.
- 그러나 실행 당시의 commit/트리 해시가 없어 최종 코드와 연결할 수 없습니다. 9건 skip의 내역도 불명입니다.

**E3. legacy SIGTERM 시험이 0.26ms로 ✔**
- 시험 내부에서 조기 return한 것으로 보입니다. skip으로 집계되지 않았으므로 실제로 검증된 것으로 간주하면 안 됩니다.

**E4. execution-observation: interrupted 분류가 관측되지 않음**
- Windows에서 시그널이 status 3840으로 변환되어 "failed"로 기록되었습니다. exit code는 1로 같지만 `interrupted` 분기 자체는 Windows에서 관측되지 않았습니다.
- 이 관측을 만든 스크립트는 제공되지 않았습니다.

**E5. results.json/summary.json의 출처 불명**
- 대상 저장소, 명령, 커밋을 알 수 없습니다.
- counts 6/5는 PACE `test-runner` unit의 시험 수(11/21)와 맞지 않습니다.
- `percentOfOriginalFull ≈1%`는 `comparisonsHaveDifferentTestScope: true`이므로 같은 범위끼리의 속도 비교가 아닙니다.

## 5. 선택과 외부 실행이 실제로 일어났는가

**실행된 것으로 판단되는 부분**
- 설치 복사본(`installed home/app`)의 엔트리와 복사된 Node/Python 드라이버가 별도의 임시 Git 저장소에서 실행되었습니다. trace 이벤트와 드라이버 변조 마커로 확인됩니다(Windows 한정).
- check → 선택 unit 순서로 실행되고, 비선택 unit(b)이 제외된 것도 trace로 확인됩니다.
- full 전환 시 커밋된 `node full.cjs`가 실제로 실행되었습니다.

**한계**
- 외부 저장소가 모두 정제된 환경(system config 없음, autocrlf 끔)의 합성 fixture입니다. 실제 타 프로젝트(기본 Git 설정, 대형 출력, 비-main 기본 브랜치)에서 실행한 증거는 없습니다. results.json도 출처를 확인할 수 없습니다.

## 6. 기존 file/unit/all/finish 보존

- **all, finish**: `runDeclaredCheck`와 `executionCommand`는 기본값 경로가 동일합니다. 반환값에 필드만 추가되었고 `ok` 판정 방식은 같습니다. 보존된 것으로 보입니다.
- **file**: `.pace/test-map.json`의 `common`에 `src/project/harness.ts`와 `shell-result.ts`가 추가되었습니다. 이 PACE 저장소에서 `pace test file src/project/harness.ts`는 이제 "공통 경로 → exit 3"을 반환합니다. 데이터 변경에 따른 행동 변화이며, 이전에 어느 unit에 속했는지는 diff만으로 확인할 수 없습니다.
- **legacy all의 main 경계**: master/trunk 저장소에서 `all`이 1을 반환하는 기존 동작이 유지됩니다(시험 확인).

## 7. 2단계 전 확인 요청

1. `committedCommand`, `declaredCommand`, `openRepo` 본문. T1 판단을 확정하려면 필요합니다.
2. 최종 커밋 해시에 묶인 focused/full 재실행 증거. 21건 전체가 포함되어야 합니다.
3. 기본 Git for Windows 설정(autocrlf, system config)에서 `changed`를 실제 실행한 관측.
4. results.json의 대상 저장소, 명령, 커밋 출처.
5. 긴 check 실행 중 부모를 종료했을 때 자식이 정리되는지 확인하는 시험(자식이 무한 대기하는 fixture 사용).
