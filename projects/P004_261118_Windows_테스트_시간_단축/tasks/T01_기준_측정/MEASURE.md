# 측정 절차

## P004 T03에서 추가한 비교 옵션

`--concurrency 4|8`은 계측을 추가하지 않고 실제 `npm run check -- -- --test-concurrency=N` 경로로 파일 동시성을 지정한다. npm 인자 구분자 두 개는 typecheck를 그대로 수행하고 뒤의 npm test에 Node 옵션을 전달한다. 옵션이 없으면 기존 `npm run check`이며 현재 실행기의 기본값을 쓴다. T01의 보존된 원래 기준 3회는 Windows 동시성 1에서 얻은 별도 고정 자료다. 현재 기본값으로 새로 실행한 자료를 원래 기준으로 대체하지 않는다.

`--evidence-dir <프로젝트 내부 evidence 폴더>`로 뒤 태스크에 결과를 직접 저장할 수 있다. 이름이 evidence가 아니거나 프로젝트 밖·symlink를 포함한 경로는 거부한다. 명령/argv·요청값·test 파일 목록과 SHA·runner/helper SHA를 environment.json에 남긴다. 기존 5개 측정 도구 SHA와 원시 시간/판정 재검증도 유지한다.

`npm test`의 추가 옵션은 파일 앞에 배치하며 명시 동시성은 기본값을 대체한다. 값 옵션은 `--test-name-pattern=값`과 알려진 두 토큰 형태를 지원한다. 미지원 bare 옵션은 `=값` 형태를 사용하라는 오류로 거부하며 `--` 뒤는 파일만 전달한다. 기본값 검증 5회는 `--concurrency` 없이 새 묶음으로 실행한다. 비교/기본값 묶음은 실패·취소·중단·소스 변경 시 원문을 보존하고 새로 시작한다.

## 기본 사용

저장소 루트에서 실행한다. 기본 출력에 파일 식별자가 없으므로 보조 프로파일까지 포함한 전체 표 재생성 명령은 다음 한 줄이다.

```powershell
node projects/P004_261118_Windows_테스트_시간_단축/tasks/T01_기준_측정/measure.ts --runs 3 --label baseline --profile
```

이 명령은 작은 통과/실패·불완전 결과·reporter 비상속 fixture, 계측 없는 `npm run check` 3회, 별도 타입 검사와 보조 시험 프로파일 1회, 보고서 생성을 순서대로 수행한다. `--profile`은 평가 중앙값을 바꾸지 않는다. 후속 비교에는 같은 PC·도구·환경을 유지하고 label만 `t02`·`t03`·`final` 등으로 바꾼다. baseline 파일을 덮어쓰지 않고 매 실행 시각별 새 폴더를 만든다. `--profile`을 생략하면 벽시계·기본 출력 인벤토리만 얻는다.

측정 도구만 검증하는 명령은 `measure.ts --self-test --label self-test`다. 별도 재측정 없이 저장된 결과로 보고서만 다시 만들려면 프로젝트 폴더의 `report.ts <evidence 폴더>`를 실행한다.

유효한 기준선은 보존한 채 보조 프로파일만 보완하려면 `measure.ts --runs 3 --label baseline-profile --profile-only <유효한 기준선 evidence 폴더>`를 쓴다. 새 폴더에 기준 결과 참조와 보조 관측을 남기며 원래 기준선 파일을 고치지 않는다. 평가 시간은 원래 3회의 값 그대로다. 최초 도구 개발 중 Node가 파일 뒤 옵션을 해석하지 않는 점을 확인해 reporter를 argv 맨 앞에 두도록 수정했다. 이 수정은 비계측 `npm run check`의 인자나 환경에는 영향을 주지 않는다.

결과는 태스크의 `evidence/<label>-<UTC>/`에 저장된다. `results.json`은 회차별 시간·판정·기본 출력 인벤토리, `summary.json`은 유효 여부·중앙값·최소·최대, `environment.json`과 `run-N-host.json`은 도구·호스트·읽기 전용 상태 표본이다. `profile-analysis.json`에는 파일·줄·이름·결과와 실행별 인벤토리 차이가 있고 `report.md`에는 순서별 시간과 상위 항목이 있다. 시간은 JSON에서 ms, 사람이 읽는 표에서 초다.

환경 해석: `os.cores`는 Node cpus()의 길이인 논리 프로세서 수다. 이 PC의 Ryzen 7 5800X는 모델명 기준 8코어이고 기록된 논리 프로세서는 16개다. 회차별 Get-Process의 CPU는 누적 사용 시간으로 부하 상태의 참고 표본이며 순간 CPU 이용률을 측정한 값은 아니다. 전원 계획은 GUID로 식별하며 현지 코드 페이지 때문에 이름이 깨질 수 있다. T01에서 별도로 확인한 TypeScript 버전은 7.0.2다. 미확인 상태나 외부 부하를 완전히 통제했다는 주장은 하지 않는다.

기준 실행은 reporter·preload·추적 환경을 추가하지 않는다. `NODE_OPTIONS`·`NODE_V8_COVERAGE` 등 오염 환경이 있으면 실행을 거부한다. `npm run check`의 spawn 직전부터 close까지를 벽시계로 잰다. stdout·stderr는 동일 파일에 도착 순서대로 기록한다. 보조 실행은 현재 `scripts/test.ts`의 `testArguments`를 직접 사용해 같은 glob과 플랫폼 동시성을 유지하고 reporter만 argv에 추가한다. 보조 reporter는 환경 변수로 전달하지 않으며 fixture가 자식 출력을 확인한다.

실행별 소유 임시 루트에서 TMP·TEMP·TMPDIR·PACE_HOME을 고정한다. 루트 경로는 회차 JSON에 남기고 자동 삭제하지 않는다. 사용자 홈·Git 설정·보안/전원 설정은 변경하지 않는다. Git Bash 없는 환경에서 sh 시험이 skip이면 그대로 기록하며 다른 환경의 skip 수와 혼동하지 않는다.

최초 비정상 종료·불완전 결과·시험 실패·취소 시 다음 기준 회차를 시작하지 않고 종료 코드 1로 멈춘다. 원시 실패는 보존하며 실패 회차를 성공 회차로 교체하지 않는다. 중단 시 생성된 원시 로그도 보존되며 `summary.json`이 없거나 valid가 false이면 유효한 기준선으로 취급하지 않는다. 검사가 오래 실행되는 동안 임의의 timeout을 걸어 실패를 숨기지 않는다.

기본 spec 출력의 이름·판정 다중집합과 보조 이벤트 인벤토리 및 총계를 대조한다. 기본 출력에 파일 정보가 없으므로 파일·줄은 보조 이벤트 근거로만 제공하고, 같은 이름이 중복될 때 파일별 동일성을 확정하지 않는다. 차이는 보고서/JSON에 남기고 원인을 별도로 확인한다. 파일 내부 시간 합계와 보조 시험 벽시계 간극은 프로세스 기동·모듈 로딩·reporter 비용 등을 포함하므로 원인별 비중을 실측이라고 주장하지 않는다.

비계측 기준 측정은 이 환경의 Node 기본 **spec 형식 전용**이다. TAP의 ok 행은 개별 시간을 담지 않으며 이 도구는 TAP의 중첩 YAML 시간까지 복원하지 않는다. TAP으로 바꾼 기준 자료는 정상 순위에 필요한 원시 시간이 없어 유효한 시간 보고서로 인정하지 않는다. 중첩 진단의 TAP은 실패 지점/판정 확인용이며 spec 기준 3회와 구별한다.

완전성 검증은 measurement-data.ts가 맡는다. 요약의 tests·모든 판정·suites와 개별 목록 수가 일치해야 하며, 기본 텍스트의 suite 구별이 모호하면 성공하지 않는다. 보고서는 원시 기본 로그와 저장 인벤토리를 다시 대조하고 보조 root/entryFile 요약도 검증한다. 잘린 JSON은 diagnostics로 남겨 보조 유효 false와 종료 1을 유지한다. self-test는 정상 보고서와 개별 행/이벤트 누락·요약 불일치·잘린 JSON 실패 주입을 포함한다.

개별 시간 순위는 다시 읽은 원시 로그에서 계산한다. 저장 개별 시간의 누락/변조는 timingDifferences에 기록해 무효로 거부하며, self-test에서 시간 삭제 및 654321 변조를 각각 확인한다. 기존 자료의 시간 대조도 baseline-revalidation.json으로 재현한다.

이후 실행의 환경에는 도구 5개 SHA-256·미추적 포함 git status를 남기며 기준 summary는 baseline-only임을 표시한다. 기존 원래 도구 해시 부재·동시 작업 겹침·개인 경로 유지의 한계는 evidence/measurement-limitations.md를 따른다. 기존 기준선의 도구 바이트 동일성이나 동시 부하의 영향량은 사후에 확정하지 않는다.
