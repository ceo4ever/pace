# T04 빠른 검사 명령

- 프로젝트: [P004](../../PROJECT.md) · 백로그: [BL261118_01_Windows_테스트_시간_단축](../../../../backlogs/BL261118_01_Windows_테스트_시간_단축/BACKLOG.md)
- 상태: 진행
- 사전 검토: v1

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

설치된 PACE가 다른 Git 저장소에서도 변경에 관련된 시험을 빠르게 실행하도록 한다(P-4·BR04). 선택 근거와 실제 실행 결과를 확인하며, 범위를 확정하지 못하면 해당 저장소의 전체 검사로 전환한다. T03의 전체 실행 최적화와 별개이며 finish 전체 검사를 유지한다.

## 재료

- [BR04](../../../../backlogs/BL261118_01_Windows_테스트_시간_단축/BR04_빠른_검사_명령.md), PROJECT P-4 및 [T03 남긴 것](../T03_Windows_병렬_실행/TASK-CLOSE.md). T03은86ae36d로 완료, 기본4 새전체5회970건·실패0·중앙680.918초다. 최종 P-6은 미판정이며 후속 전체3회가 남는다.
- `src/test-runner/runner.ts`는 `.pace/test-map.json` v1의 sources/tests/common 및 node-test/python-unittest를 읽고 file/unit/all을 실행한다. file/unit은 공통·미분류·미지원/전제/설정에서3(확인불가)을 내고 전체를 권고한다. 실제 드라이버는0건·전체skip·실패를 거부한다. all은 `runDeclaredCheck`의 base 우선 전체 선언을 사용한다.
- 현재 map은4단위이며 타입 검사 연결이 없다. Node/Python 외 러너를 새로 구현하지 않는다. 타입 검사를 npm이나 PACE 경로로 하드코딩하지 않고 프로젝트가 명시한 명령으로 연결한다.
- 설치 APP_PARTS는bin/src/templates/skills/package.json이다. 실제 설치기를 실행하지 않고 소유 임시 app에 같은 구성물을 복사해, 외부 Git cwd에서 그 bin/pace.ts를 호출한다. 사용자 홈 설치/훅/설정 변경은 범위 밖이다.
- 기준 문서는 AGENTS.md·docs/README.md, 기존 runner 테스트, pace-project-dev testing/security, TypeScript/verification 색인이다. 브레인 검색에는 변경 기반 선택기 설계 답이 없었다. 실제 선택 누락·sandbox/설치 경로 불일치·오류 상태의 성공 누출을 중점 대조한다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `pace test changed`가 현재 Git 저장소의 staged·unstaged·untracked 변경을 합쳐 기존 test-map의 관련 단위를 빠짐없이 선택하고, 변경→단위→실제 시험 및 프로젝트별 사전 검사 명령/시간/판정을 출력한다. 지원 Node/Python 러너와 cwd를 존중하며 PACE 전용 명령에 의존하지 않는다(P-4). |
| T-2 | 공통·미분류·삭제/이름변경·추적/구성/지원 불확실성은 프로젝트의 base 우선 전체 검사로 실제 전환한다. 전체 선언/확인 불가를 성공과 구별하고, 실제 검사 실패·0건/전체skip·시간초과·신호를 성공이나 재실행 성공으로 숨기지 않는다. 기존 file/unit/all 및 finish 전체 경로를 보존한다(P-4). |
| T-3 | 설치 형태의 제품 CLI를 외부 독립 Git 샘플에서 검증하고, 선택 누락/불필요 실행/실제 전체 전환/확인 불가 및 PACE 자체 대표 변경의 빠른 시간과 제외 범위를 재현 가능하게 기록한다. 사용자 문서·AGENTS·개발 스킬에 타 저장소 채택과 부분/전체 경계를 남기며 실제 전체 회귀가 통과한다(P-4·BR04). |

## 테스트

<!-- 기준마다 한 줄 이상. 유형: unit(테스트 코드) · e2e(화면·프로세스 시나리오, e2e/S-n.md 또는 E2E 테스트 코드) · check(문서·설정 확인). 가장 싼 충분한 계층을 고른다 -->

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 독립 Git의staged/unstaged/untracked, 소속 겹침, 공백·한글 경로 | 변경 선택 계획과 실제 단위 실행 대조 | 관련 단위 전부와단위전체시험 포함, 동일단위/단위내파일중복방지·서로다른cwd맥락보존, 무관한 실패 sentinel 미실행, 선택 이유 명시 | 새test/changed-test.test.ts의 실제 임시 Git/시험·외부 trace; pure계획만으로 충족하지 않음 |
| S-2 | e2e | T-1·T-2 | Node/Python 샘플과 프로젝트 checks 선언, 서로 다른 cwd | 설치형CLI로선택실행 및 사전검사실패 주입 | 명시 사전검사가시험보다먼저 실제실행, 실패는1이고 전체성공으로숨기지않음; Node/Python판정·cwd유지, checks[]는명시사전검사없음 | 같은 CLI fixture·각명령/시험의 Git밖 소유trace와 exit 대조 |
| S-3 | unit | T-2 | 공통/미분류, 삭제/rename, map/정의서변경, map/검사선언부재·미지원러너/config/requires/잘못된구성 | changed 실행 | 부분 실행 전 전체 전환 이유 출력·실제 전체 sentinel 실행, base선언우선, 전체실패1·전체확인불가3; 과거 file/unit/all 그대로 | 실제 declared full 명령의 양성/음성 marker; 전체권고문구만으로 충족하지않음 |
| S-4 | unit | T-1·T-2 | 관련단위에만실패,0건/전체skip, 선택결과확인불가, 체크timeout, 변경없음 | 오류경계 실행 | 실제실패1유지·후속전체성공으로은폐없음, 결과확인불가는전체전환, 미실행은3/명시표시, 출력상한·오류가성공아님 | 기존driver 회귀+새failure injection; 테스트소유 유한수명자식만사용 |
| S-5 | unit | T-2 | 구성cwd/시험glob/변경경로의외부symlink·탈출·특수문자 | 선택·실행 요청 | 외부시험실행없이보수적전체전환 또는입력오류; Git파일명은셸명령에보간하지않음 | 임시외부marker 보존·실제경로검사·NUL구분Git자료 |
| S-6 | e2e | T-1~T-3 | 실제설치 APP_PARTS의 소유임시app와 별개독립Git저장소 | 그 app/bin/pace.ts를외부cwd/임시PACE_HOME에서실행 | checkout소스CLI를착각해사용하지않고sample별test-map·full선언을읽음; source SHA와entry/cwd·argv기록 | installer미실행·app출처manifest·제품CLI원문·검출력 sentinel |
| S-7 | e2e | T-3 | 현재PACE실행소스의소유임시Git사본·실제TypeScript·대표mapped변경 | 같은설치형CLI changed 시간을측정 | 원래전체기준1425.464초보다크게짧은반복개발검사,실제선택범위/제외범위/명령/SHA/환경공개. 전체범위속도나P-6달성으로표현하지않음 | 소유사본src/scout/card.ts 대표변경·기존해당단위시험/실제tsc·벽시계/원문; 준비시간분리 |
| S-8 | e2e | T-2·T-3 | T04최종소스의기존전체명령 | 비계측 npm run check 전체1회 | 종료0·기존970건범위/skip9보존 및신규시험통과,전체원문보존; 원인불명실패시중단/질문 | T01 measure 재사용·인벤토리/기존소스diff대조·독립tester/reviewer |
| S-9 | check | T-3 | 타저장소사용자와기존개발흐름 | README·docs·AGENTS·스킬/구성 예시를구현과대조 | map/checks작성·실행예·보수적전환/종료코드·수동매핑한계·신뢰경계·finish유지명시 | 문서의실제샘플을CLI로실행,단순문구검색으로대체하지않음 |

## 접근

### 인터페이스와 선택

- 새 `pace test changed`는 인자 없는 단일 모드다. 기준은현재작업본이며 다른 revision/변경파일 강제 지정 옵션은 만들지 않는다. 루트는기존openRepo로찾는다. Git은인자배열·-z로 staged/unstaged/ignore되지않은untracked의합집합을읽는다. rename최적화를끄고삭제/추가양쪽경로를남긴다. 오류·출력절단은비어있는성공집합으로취급하지않는다.
- changed는소스뿐아니라tests에일치하는단위를모두선택하고단위의전체tests를실행한다. 한파일의모든소속을합치고단위내파일을중복제거한다. 기존file의직접test단일파일선택과unit/all의의미는바꾸지않는다. 선택근거의경로는특수문자를escape해출력하며Git파일명을셸에보간하지않는다.
- 변경이없으면 `변경 없음 — 검사 미실행`과종료3으로검사를실행한성공과구별한다. 무시된파일은Git의기존ignore정책밖으로추적하지않는다. ignored runtime입력은추적/매핑하거나전체검사를사용해야한다.
- 설정제어파일 `.pace/test-map.json`, `docs/README.md`, `docs/PROJECT.md`의변경은암묵공통이다. 선언common이단위보다우선하고, 미분류·삭제·rename·디렉터리/submodule·해석할수없는경로·잘못된/없는구성·미지원runner/config/requires는부분계획전체를불확실로보고실행전에전체전환한다. 경로는기존실경로검증을재사용하고유효한시험목록을실행전확정한다.

### 프로젝트별 타입/사전 검사

- test-map v1에 `checks: [{cwd: ".", command: "npm run typecheck"}]`를추가한다. 명령내용은프로젝트가정하며npm/tsc/PACE경로를제품에하드코딩하지않는다. 패키지별cwd도허용하되실제프로젝트안디렉터리만허용한다. 단일행·NUL없는비어있지않은명령문을전체선언으로실행하며변경파일의문자열대입을하지않는다.
- changed의빠른실행에는checks배열명시가필수다. 명시빈배열은사전검사가없다는프로젝트선언이며, 필드부재/형식오류는기존전체검사로전환한다. 기존file/unit에서는필드를의무화하지않아호환성을유지한다. 타입/린트/생성검사등필수사전검사를누락없이선언하도록사용자문서에설명한다. 실제언어도구나명령을자동추론하지않는다.
- 모든선택/지원성을미리검증한뒤checks를순서대로실행하고기존지원runner를실행한다. 공통실행경계를재사용하되제한시간·출력상한·비정상종료를유지한다. 사전검사나실제시험실패는1로끝내며전체의재성공으로덮지않는다. 결과를해석할수없어3인경우에는전체검사로전환하되실제실패를이미관측한경로는전환하지않는다.

### 전체 검사·범위·보안

- fallback은문구권고가아니라기존runDeclaredCheck/전체실행코드를호출한다. base우선선언과전체결과를존중한다. 전체선언부재/실행경계확인불가는3, 실제선언명령의실패는1, 실제성공은0으로출력한다. 기존all의오류코드의미는바꾸지않는다. finish와하네스소스/선언은수정하지않는다.
- 기존map/단위검증·driver를공유하고필요한내부함수만모듈로나눠순환import를피한다. 대상은src/test-runner,CLIhelp,새/기존runner시험,PACE test-map,README/docs/AGENTS/개발스킬이다. 런타임의존성·설치스크립트는추가/수정하지않는다.
- map은사용자가관리하는실행선언이며임의로신뢰할수없는저장소를실행하는샌드박스가아니다. 새shell경계는이명시선언에한정하고cwd/패턴/실경로를검증한다. 소유임시app/Git/trace외사용자설정·전역Git·실제설치는변경하지않는다. 실제설치 APP_PARTS fixture로sandbox/제품경로차이를검출한다.
- 수동map은import의전이의존성을자동발견하지않는다. 공유helper/설정/생성입력을common에포함하고관련단위를모두선언하는것이채택계약이다. 알수없는변경을선택성공으로낙관하지않으며빠른검사출력에부분범위와전체회귀제외를명시한다.
- 먼저새명령이없는현재CLI에서대표제품시나리오RED를확인한뒤구현한다. 전체S8뒤최종독립tester/reviewer를받고TASK-CLOSE/check/done/커밋한다. T05와최종P-6세회는별도다.
