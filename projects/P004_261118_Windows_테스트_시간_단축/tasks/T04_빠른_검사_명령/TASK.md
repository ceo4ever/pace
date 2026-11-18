# T04 빠른 검사 명령

- 프로젝트: [P004](../../PROJECT.md) · 백로그: [BL261118_01_Windows_테스트_시간_단축](../../../../backlogs/BL261118_01_Windows_테스트_시간_단축/BACKLOG.md)
- 상태: 완료
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
| S-2 | e2e | T-1·T-2 | Node/Python 샘플과 프로젝트 checks 선언, 서로 다른 cwd | 설치형CLI로선택실행 및 사전검사실패 주입 | 사전검사가시험보다먼저 실제실행, 실패1·중단시후속실행/전체재시작없음; Windows Git sh의POSIX구문sentinel이성립하고cmd대역에서는실패 | 같은 CLI fixture·Git밖 소유trace·셸sentinel·exit 대조 |
| S-3 | unit | T-2 | 공통/미분류·삭제/rename·충돌/type/mode/submodule·map/정의서변경·구성/지원불확실성 | changed 실행 | 부분실행전전체전환·실제full sentinel실행; main→master→검증HEAD 기준선·전체실패1/확인불가3; 기존all/finish유지 | main없는master/trunk·unborn·저장소밖·손상ref/Git실패·선언부재도같은설치형CLI로검증 |
| S-4 | unit | T-1·T-2 | 관련단위에만실패,0건/전체skip, 선택결과확인불가, 체크timeout, 변경없음 | 오류경계 실행 | 실제실패1유지·후속전체성공으로은폐없음, 결과확인불가는전체전환, 미실행은3/명시표시, 출력상한·오류가성공아님 | 기존driver 회귀+새failure injection; 테스트소유 유한수명자식만사용 |
| S-5 | unit | T-2 | 구성cwd/시험glob/변경경로의외부symlink·탈출·특수문자 | 선택·실행 요청 | 외부시험실행없이보수적전체전환 또는입력오류; Git파일명은셸명령에보간하지않음 | 임시외부marker 보존·실제경로검사·NUL구분Git자료 |
| S-6 | e2e | T-1~T-3 | 실제설치 APP_PARTS의소유임시app(node_modules없음)와별개Git | Windows실제node app/bin/pace.ts 및소유.cmd로호출 | sourceCLI착각없이sample별구성을읽고복사된실제Node/Python driver sentinel확인; pristine실행과관측용복사본변경구별 | installer미실행·app출처manifest/driver SHA·entry/cwd/argv·원문; POSIX셔임실행은현Windows미검증한계 |
| S-7 | e2e | T-3 | 현재PACE실행소스의소유임시Git사본·실제TypeScript·대표mapped변경 | 같은설치형CLI changed 시간을측정 | 원래 전체1425.464초와최근T03전체680.918초양쪽대비공개,실제선택/제외범위·명령/SHA/환경명시. 전체범위속도나P-6달성주장없음 | src/scout/card.ts 대표변경·scout-card의실제2시험파일/실제npm typecheck·벽시계/원문; 준비시간분리 |
| S-8 | e2e | T-2·T-3 | T04최종소스의기존전체명령 | 비계측 npm run check 전체1회 | 종료0·기존970건범위/skip9보존 및신규시험통과,전체원문보존; 원인불명실패시중단/질문 | T01 measure 재사용·인벤토리/기존소스diff대조·독립tester/reviewer |
| S-9 | check | T-3 | 타저장소사용자와기존개발흐름 | README·docs·AGENTS·스킬/구성 예시를구현과대조 | map/checks작성·실행예·보수적전환/종료코드·수동매핑한계·신뢰경계·finish유지명시 | 문서의실제샘플을CLI로실행,단순문구검색으로대체하지않음 |

## 접근

### 인터페이스와 선택

- 새 `pace test changed`는 인자 없는 단일 모드다. 기준은현재작업본이며 다른 revision/변경파일 강제 지정 옵션은 만들지 않는다. repo/HEAD 확인불가도3으로분류하도록changed는기존openRepo보다먼저전용문맥확인을한다. Git은실제루트cwd·인자배열·-z로 staged/unstaged/ignore되지않은untracked의합집합을읽으며untracked는--untracked-files=all로파일까지펼친다. status/diff에--ignore-submodules=none과rename최적화해제를사용한다. 충돌·typechange·실행모드변경·gitlink/submodule은전체전환한다. raw모드와status를대조하며오류/절단/stderr경고를비어있는성공집합으로취급하지않는다.
- changed는소스뿐아니라tests에일치하는단위를모두선택하고단위의전체tests를실행한다. 한파일의모든소속을합치고단위내파일을중복제거한다. 기존file의직접test단일파일선택과unit/all의의미는바꾸지않는다. 선택근거의경로는특수문자를escape해출력하며Git파일명을셸에보간하지않는다.
- 변경이없으면 `변경 없음 — 검사 미실행`과종료3으로검사를실행한성공과구별한다. 무시된파일은Git의기존ignore정책밖으로추적하지않는다. ignored runtime입력은추적/매핑하거나전체검사를사용해야한다.
- 커밋된 feature 브랜치의 차이는 작업본 모드의 범위가 아니다. 깨끗한 작업본에서 그 변경을 검증한 것처럼 표시하지 않고 출력/문서에 '커밋된 변경 제외·전체 검사는 pace test all/finish'를 명시한다.
- 설정제어파일 `.pace/test-map.json`과harness가실제로읽는export된DEFINITION_FILES의변경은암묵공통이다. 정의서경로를별도로하드코딩하지않는다. 선언common이단위보다우선하고미분류·삭제·rename·디렉터리/submodule·해석불가·구성/지원불확실성은실행전전체전환한다. 경로는기존실경로검증을재사용하고시험목록을먼저확정한다.
- Windows에서는공통/소속선택시경로와glob모두case-fold하여대소문자차이로단위를누락하지않는다. 비Windows는대소문자를구별한다. glob으로찾은실제파일과실경로는다시검증하고동일단위내파일중복을Windows동일경로기준으로제거한다. 실제Windows대소문자표본과가상platform비교를검증한다.

### 프로젝트별 타입/사전 검사

- test-map v1에 `checks: [{cwd: ".", command: "npm run typecheck"}]`를추가한다. 명령내용은프로젝트가정하며npm/tsc/PACE경로를제품에하드코딩하지않는다. cwd는junction/symlink도실경로로 검증하여프로젝트안디렉터리만허용한다. 단일행·NUL없는비어있지않은명령문을그대로실행하며변경파일/값의보간을하지않는다.
- checks는자동추론데이터가아니라사용자가명시적으로신뢰하는코드실행선언이다. 현행 test-map.md의'임의셸명령금지'를변경하는이유는다른프로젝트의타입/선행검사를하드코딩없이존중하기위함이다. 그문서를개정해오직checks만예외로허용하고단위runner에는여전히임의명령을허용하지않는다. 전체명령은복제하지않고정의서에남긴다.
- checks와전체선언은아래에서확정한동일한커밋기준을사용한다. 빠른경로는기준commit의map과작업본map이JSON데이터로 동일할때만허용하고checks는기준map에서읽는다. map차이/미커밋도입/기준map부재는전체전환한다. 순수 작업본JSON의새명령을빠른검사로 곧바로실행하지않는다. 채택map을기준브랜치에커밋해야활성화되는점을문서화한다.
- 셸은기존export된runDeclaredShell을통해정의서전체검사와같은Windows Git설치경계의sh/POSIX sh로고정한다. export추가는필요없다. checks기본제한은기존helper30분·출력16MiB이며CLI에서변경옵션은만들지않는다. 내부executeTest의테스트용timeout인자가있으면checks에도동일적용한다.
- changed의빠른실행에는checks배열명시가필수다. 명시빈배열은사전검사가없다는프로젝트선언이며, 필드부재/형식오류는기존전체검사로전환한다. 기존file/unit에서는필드를의무화하지않아호환성을유지한다. 타입/린트/생성검사등필수사전검사를누락없이선언하도록사용자문서에설명한다. 실제언어도구나명령을자동추론하지않는다.
- 모든선택/지원성을먼저검증한뒤checks를순서대로실행하고기존runner를실행한다. 실패/중단은즉시종료하며후속checks/시험/전체를실행하지않는다. 기존driver의interrupted 신호도동일하다. timeout·출력상한은실행이시작됐다면실패1이다. 직접자식회수라는기존실행경계의한계를넘어Windows임의자손완전회수를보장한다고쓰지않는다.

### 전체 검사·범위·보안

- fallback은아래한정확장한runDeclaredCheck(root,검증commit)를호출하는실제실행이다. 기존all/finish의인자없는호출과main기준/출력/ok의미는바꾸지않는다. finish명령/생명주기/전체선언은수정하지않는다.
- 기존map/단위검증·driver를공유하고필요한내부함수만모듈로나눠순환import를피한다. 구체파일은아래목록에고정한다. 런타임의존성·설치스크립트는추가/수정하지않는다.

### 커밋 기준·구조화된 실행 상태

- changed만기존main고정가정에서벗어난다. 로컬main존재를읽기전용으로확인하고있으면그commit, 없으면master, 그것도없으면현재HEAD의검증된commit을 선택한다. 원격조회/기준브랜치생성/checkout은하지않는다. 선택label과commit을출력한다. 존재하지않는ref와손상ref/권한/조회오류를구분해실제 오류는3으로중단하며작업본선언으로폴백하지않는다. 각 후보의실제commit을검증하고SHA를고정해조회한다.
- 공유helper의제한확장: DEFINITION_FILES를export하고runDeclaredCheck에옵션기준revision인자를추가(생략시종전main), runDeclaredShell/Check에실행상태메타데이터를추가한다. 기존ok/output내용과인자없는all/finish동작은보존한다. 상태는셸발견·spawn의 pid/status/error/signal등구조값에서만만들며오류문구로실행시작여부를추정하지않는다. 새changed만그필드로1/3을분류한다.
- Windows Git sh를확보못함/OS spawn실패는미시작3이다. 셸이시작된뒤명령을못찾아127을낸것은실제셸검사실패1로구별한다. timeout/출력초과/신호는시작된실행의실패 또는 중단1이며후속전체실행없다.

| 경우 | changed 최종판정·동작 |
|---|---|
| 저장소밖·초기root/HEAD확인중Git미존재/오류·unborn | 3 확인불가, 사용자작업본명령실행없음 |
| main부재·master존재 | master검증commit기준으로계속;부재자체는오류아님 |
| main/master부재·다른HEAD존재 | HEAD검증commit기준으로계속 |
| ref/기준조회실제오류 | 3, 다른기준/작업본명령으로숨기지않음 |
| 검증commit확정뒤변경열거/status/diff/map조회불확실 | 해당commit의실제전체검사로전환; 전체선언조회자체실패는3 |
| 전체선언부재·선언조회오류·셸확보/OS spawn실패 | 3 확인불가, 실행전문제와실제실패를구별 |
| checks/시험실제실패·0건/전체skip·timeout·중단 | 1, 즉시종료·나머지/전체재시작없음 |
| 부분결과확인불가3 후 전체가실제성공0 | 전체범위를실행했다는표시와최종0;부분통과로표시하지않음 |
| 부분불확실 후 전체실패1 또는확인불가3 | 각1 또는3;1이한번관측되면후속0으로덮지않음 |
| checks와모든선택시험정상 | 0 부분통과, 전체회귀/커밋변경제외명시 |
| 작업본변경없음 | 3 미실행, 검사통과로표시하지않음 |

전체선언은기존DEFINITION_FILES에서선택commit을우선하고그commit에선언이없으면기존정책대로작업본선언을사용한다. 이것은프로젝트사용자가신뢰해명시하는선언실행이며자동코드샌드박스가아니다. 기준조회오류와진짜선언부재를혼동하지않는다.

### 변경 파일과 검증 경계

- `src/test-runner/runner.ts`: changed진입/기존드라이버공유. 필요시`map.ts`에기존검증을옮기고`changed.ts`에새계획/실행을둔다. `src/cli.ts`: help(기존test dispatch재사용). `src/project/harness.ts`: 바로위공유상수/선택기준인자/실행상태확장만허용한다.
- `test/changed-test.test.ts`, `test/test-runner.test.ts`와필요한공유helper회귀: 기존all/finish의main정책과ok/output불변·master/HEAD/미시작상태를실제실행으로검증한다. 설치복사본에서정상실행후, 복사된실제node-driver.mjs/python-driver.py의본문은유지하고관측prefix만붙인별도 시나리오로해당app경로의 driver사용을증명한다. 원본/관측판SHA·성공판정동일성을남긴다.
- `.pace/test-map.json`: checks는`[{cwd:".",command:"npm run typecheck"}]`로명시하고새runner시험단위를등록한다. 기존4단위/공통을보존한다. 구형 config가알 수 없는 필드를무시함을현재소스/회귀로대조하며v1호환을유지한다.
- `README.md`, `docs/README.md`, `AGENTS.md`, `skills/pace-project-dev/references/testing.md`, `skills/pace-project-init/references/test-map.md`: 새 명령/기준 commit/checks 신뢰 예외/실행 셸/전체 전환/채택/미실행·작업본 범위/수동 map 한계를 반영한다. 공유 목차를 직접 편집하지 않는다.
- Windows설치체인은`pace.cmd → node "<home>/app/bin/pace.ts" %*`이며추가Node플래그/로더가없다. 같은Node24실행체인과소유.cmd를검증한다. APP_PARTS에는node_modules가없고런타임의존성도없다. PACE자체사본의tsc에만기존개발의존성을연결하며제품app에는 넣지않는다. POSIX셔임의실제실행은Windows실측의검증범위가아님을남긴다.
- map은사용자가관리하는실행선언이며임의로신뢰할수없는저장소를실행하는샌드박스가아니다. 새shell경계는이명시선언에한정하고cwd/패턴/실경로를검증한다. 소유임시app/Git/trace외사용자설정·전역Git·실제설치는변경하지않는다. 실제설치 APP_PARTS fixture로sandbox/제품경로차이를검출한다.
- 수동map은import의전이의존성을자동발견하지않는다. 공유helper/설정/생성입력을common에포함하고관련단위를모두선언하는것이채택계약이다. 알수없는변경을선택성공으로낙관하지않으며빠른검사출력에부분범위와전체회귀제외를명시한다.
- 먼저새명령이없는현재CLI에서대표제품시나리오RED를확인한뒤구현한다. 전체S8뒤최종독립tester/reviewer를받고TASK-CLOSE/check/done/커밋한다. T05와최종P-6세회는별도다.
