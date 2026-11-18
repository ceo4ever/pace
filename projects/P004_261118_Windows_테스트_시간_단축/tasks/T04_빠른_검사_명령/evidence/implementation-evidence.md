# T04 구현·검증 자료 안내

## 제품 경계

`pace test changed`의 변경 기준은 staged/unstaged/untracked 작업본이다. 로컬 main→master→검증 HEAD commit을 고정하고 기준 map/checks와 작업본 JSON이 같을 때만 빠른 경로를 사용한다. 부재와 조회 오류, 미실행과 실제 실패를 구별한다. 선언 경로 상수·실행 셸은 기존 하네스와 공유하고 기존 file/unit/all 및 finish 생명주기는 유지한다.

기존 map 검증과 driver 실행을 `map.ts`, `execute.ts`로 분리했다. 새 changed 모드만 stopEarly를 사용한다. 단위 안의 첫 실제 실패 뒤 다음 파일을 실행하던 계약 차이는 `red-stop-same-unit.tap`으로 검출한 뒤 보완했다. 구형 file/unit의 계속 수집·실패 우선 의미는 변경하지 않았다. 파일과 모든 소속을 선택하며, 임의 명령을 unit runner에 추가하지 않았다.

## 실제 선택·전환 검증

`focused-final.tap`의 새 changed 검증과 기존 runner 회귀30건이 모두 통과했다. 이후 추가한 정의서 외부 링크 거부 및 실행 시작 경계는 `focused-final-boundaries-3.tap`, 실제 Python 부재와 legacy 판정 보존은 `focused-driver-start.tap`에 있다. 이 후속 좁은 관측은 새 전체 회귀의 증거와 별개다.

선택 양성 marker, 무관한 실패 시험의 미실행, 관련된 다른 단위의 실패 보존, 같은 단위 후속 파일 중단, 실제 전체 marker를 사용했다. main 없는 master/trunk, unborn/저장소 밖/Git 부재/손상 ref, 공통/미분류/삭제/rename/충돌/mode/gitlink, 잘못된/없는 map·checks·runner/config/requires, 실제 shell cwd·POSIX 구문·실패 중단, 실경로 탈출·Windows case-fold·특수문자, 0건/전체 skip와 결과 미확인을 검증했다.

설치 APP_PARTS 복사본은 node_modules 없이 실제 Node 진입점과 공백 경로의 .cmd를 실행했다. pristine 실행과 복사된 실제 Node/Python driver의 관측 prefix 실행을 구별하며 byte/SHA와 실제 app 경로를 확인했다. README JSON 예시를 읽어 독립 Git 샘플에서 실제 실행했다. 사용자 홈 설치·POSIX 셔임 실행·설치 업그레이드 자체를 검증한 것으로 확대하지 않는다.

## 구현 중 실패 보존

- `red-changed-cli.tap`: 새 모드가 없던 실제 제품 CLI의 최초 RED다.
- `python-cache-fixture-failure.tap`: Python이 만든 미추적 __pycache__가 보수적 전체 전환을 일으켰다. 제품의 미분류 전환을 약화하지 않고, 샘플의 정상 ignore 정책을 선언해 결과 미확인 단계의 전환을 시험했다.
- `focused-python-installed.tap`: helper가 공백 포함 임시 prefix를 거부한 fixture 작성 오류다. 허용된 소유 prefix 아래 공백 하위 폴더를 만들도록 보완했다.
- `focused-python-installed-2.tap`: direct Node/두 실제 driver는 통과했으나 Node가 cmd 인자를 다시 인용해 .cmd 호출이 실패했다. 소유 cmd fixture에 windowsVerbatimArguments를 사용해 원래 인용 문자열을 전달했고 `focused-installed-3.tap`에서 통과했다. 설치 코드 변경은 없다.
- `focused-definition-boundary.tap`: git rm이 마지막 파일과 빈 docs 폴더를 함께 제거해 symlink 생성 전에 부모 폴더가 없던 fixture 오류다. 소유 폴더를 재생성했다.
- `focused-final-boundaries-2.tap`: 두 경계 단언은 통과했지만 임시 루트 정리에서 EPERM을 관측했다. 자식 수명 경합 가능성을 줄이기 위해 fixture가 자식 PID의 소멸을 확인하도록 보완했고 `focused-final-boundaries-3.tap`은 정리까지 종료0이다. 최초 EPERM의 OS 원인을 확정한 것은 아니며 실제 제품 전체 실패와도 구별한다. 원문을 유지한다.

초기 도구 타입 검사에는 compiler의 --ignoreConfig/--types node 명시가 빠졌고, 이를 명시한 strict 검사와 프로젝트 npm run typecheck가 통과했다. 런타임 의존성·설치 스크립트는 변경하지 않았다.

## 초기 v1 개발 중 검사 시간

사후 검토 전 v1 실행 소스의3회는 `fast-2026-11-18T17-43-49-763Z`다. 15.224/14.647/14.687초, 중앙14.687초·모두종료0이다. 실제 npm typecheck와 cli6건/scout5건, 합11건을 매회 실행했다. 설치형 app과 독립 PACE 사본의 source byte manifest, 기준 map 커밋, 실행 argv/cwd, 준비4.670초와 검사시간을 분리했다. 이 자료를 수정된 v2 소스의 시간으로 재사용하지 않는다.

원래 전체1425.464초의1.030%, 최근 T03 전체680.918초의2.157%다. 범위가 다른 개발 workflow 지연 비교이며 같은 범위 최적화나 P-6 달성이 아니다. 실제 선택 목록과 제외된 전체 회귀 범위를 원문에 남겼다. 앞선 `fast-2026-11-18T17-34-40-252Z`의3회도 보존한다(중앙14.674초). 최종 정의서 링크 거부/fixture 수명 보완 전 소스이므로 최종 통계에 섞지 않았다. 첫3회와 새3회 모두 실패는 없었다.

## 초기 v1 전체 회귀

기본값4의 원래 npm run check 전체1회는710.587초·종료0,991건 중982통과·실패/취소0·기존skip9다. 자료는 `t04-full-2026-11-18T17-44-49-141Z`다. 원본을 다시 파싱한 `t03-regression-comparison.json`은 T03 다섯 회 각각 대비 기존970건 제거/판정차이0·skip사유동일, 새 파일의 명시된21개 시험 전부통과를 확인한다. 기존95개 test byte/helper/runner 동일이며 새test파일1개뿐이다.

실행 코드/시험/문서/자산607개 파일의 byte SHA 배열은 `runtime-before-full.json`, `runtime-after-full.json`에서 동일하다. JSON 전체 객체는 captured 시각 때문에 다르다. `runtime-v1-comparison.json`이 filesEqual=true/fullyEqual=false와 다른 키 captured 하나를 명시한다. 연속 감시나 조용한 호스트를 보증하지 않는다. 수집 중 다른 시험·컴파일·진단은 실행하지 않았다. 원본 읽기와 프로젝트 evidence 기록은 겹쳤으며 그 부하를 정량화하지 않았다. 이 단회는 후속 P-6 최종3회 및 수정 후 v2 전체와 구별한다.

전체 종료 뒤 별도 `execution-observation.json`은 실제 Git sh의 자기 SIGTERM이 Windows에서 status3840/started=true/failed로 전달됨과 Git sh 확보 불가가 started=false/unavailable임을 확인했다. 출력 문구가 아닌 구조값을 사용한다. 이 보조 관측은 전체 시간에 포함하지 않는다.

## 사후 불통과와 수정 후 v2

초기 green991건은 staged 삭제와 숨김 플래그의 선택 누락을 검출하지 못했다. 독립 reviewer/tester의 불통과를 보존했고 `post-review-1-disposition.md`에 차단2건·다른 지적 처리 및 RED를 연결했다. 최초 소스 원문은 `v1-source-provenance.json`의 SHA 대조 복사본으로 보존한다. `focused-final.tap`은 초기 개발 단계30건이며 v1/v2의 최종 실행 소스로 표시하지 않는다.

v2의 `post-review-focused-all.tap`은25개 새 시험과 기존 runner11개, 총36건 전부통과다. 실제 관련 B 단위 실패1과 수정 전 부분0을 확인한 뒤, assume-unchanged/skip-worktree에서 실제 전체가 B까지 실행해1을 유지한다. staged D+같은경로??, 실제 sparse checkout와 sparse-index 설정, 예외3과 실패 우선, flags/index byte 불변도 단언한다.

v2 빠른3회는 `fast-2026-11-18T18-26-09-503Z`의15.299/14.746/14.794초·중앙14.794초이며 모두실제타입+11건·종료0이다. 준비4.686초는분리했다. 원래전체의1.038%,최근T03전체의2.173%이며상이한범위의개발workflow지연이다. 과거표본과섞거나P-6으로표현하지않는다.

최종 v2 전체는 `t04-fixed-full-2026-11-18T18-29-13-627Z`의710.7117803초·종료0,995건 중986통과·실패/취소0·기존skip9다. T03의5회 각각 대비기존970건제거/판정차이0·skip사유동일·기존95개시험/helper/runnerbyte동일, 새25건전부통과다. 원본 대조는 같은폴더의 `t03-regression-comparison.json`이다.

`runtime-v2-before-full.json`, `runtime-v2-after-full.json`, `runtime-v2-comparison.json`은607개files배열동일·메타시각만다름을구별한다. `runtime-v2-run-binding.json`은두파일/전체환경/결과SHA와동일source tree digest를연결한다. 새whole중제품소스는편집하지않았고다른시험/진단/컴파일은겹치지않았다. 원본조회·절차읽기·evidence기록은겹쳤다. 독립양쪽재판정과후속P-6최종3회는별도단계다.
