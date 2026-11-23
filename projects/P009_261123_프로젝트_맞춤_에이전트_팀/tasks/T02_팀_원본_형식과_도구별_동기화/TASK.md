# T02 팀 원본 형식과 도구별 동기화

- 프로젝트: [P009](../../PROJECT.md) · 백로그: [BR02](../../../../backlogs/BL261123_01_프로젝트_맞춤_에이전트_팀/BR02_팀_원본_형식과_도구별_동기화.md)
- 상태: 완료
- 사전 검토: v1

## 목적

BR02와 P-2에 따라 팀 정의를 저장소 원본 한 벌로 관리하고 Claude·Codex 생성물의 누락·원본 변경·손수정을 검출한다. 호스트별 원본 두 벌과 스킬 복사는 채택하지 않는다. 실행 역할 선택·실제 역할 적재 보증은 T03·T04에서 검증한다.

## 재료

- BR02, T01 TASK-CLOSE의 BR02 필드 목록·BR03 적재 방식과 host-loading.md. 실제 tier는 high/medium/low다.
- src/core/frontmatter.ts·worker-settings.ts·fsutil.ts, src/cli.ts, docs/README.md·SECURITY.md·WORK-PROCESS.md, TypeScript 및 verification 교본 색인.
- roblox-studio/tools/sync-agents.mjs(읽기 전용): 렌더·어긋남 검출을 참고하되 스킬 복사·자동 삭제는 가져오지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | team new <name> --role lead/maker/reviewer/coordinator가 .pace/team/<name>.md를 생성하고 list가 역할·단계·등급·자원을 표시한다. 필수 필드·자료형·중복·이름 불일치·enum·본문 필수 절과 실행 전 대조 책임을 검증하고 기존 원본을 덮어쓰지 않는다. |
| T-2 | 빈 임시 Git 저장소에서 new 3명→sync로 .claude/agents/*.md와 .codex/agents/*.toml을 생성한다. 같은 본문·역할 메타를 두 형식에 보존하고 원본 경로·생성물 표지를 기록한다. --check는 쓰지 않고 누락·원본 수정·출력 손수정을 실패로 검출하며 sync 후 통과한다. 모델 매핑 변경은 설정 차이로 별도 진단하며 유효 입력이 같으면 결정적이다. |
| T-3 | worker-settings.json과 같은 PACE_HOME의 별도 worker-tiers.json에 도구별 tiers 대응표를 두고 high/medium/low를 실제 model·effort로 해석한다. 기존 model/effort·우선순위는 유지하며 tier 설정 CLI·초기화 및 손상/잘못된 값 거부를 검증한다. |
| T-4 | 저장소 안 정규 경로에만 읽고 쓴다. 이름 경로 탈출·심볼릭 링크/하드링크·사용자 소유 출력 충돌을 쓰기 전에 거부하고 무관 native 정의를 보존한다. 원본이 사라진 관리 생성물은 검출하되 삭제하지 않는다. |
| T-5 | 원본 형식·명령·매핑·생성물 복구·tools와 권한 차이를 문서화하고 전체 검사와 독립 tester/reviewer가 blocking0·계약 목표 달성으로 판정한다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 임시 원본·잘못된 인자/필드 | new/list·파싱 | 유효 원본·표, enum·중복·불일치·본문 누락 거부, 원본 재생성 불변 | test/team.test.ts |
| S-2 | e2e | T-2 | 빈 임시 Git repo·임시 PACE_HOME | CLI new 3명→sync→check, 원본/출력 수정→check→sync | 두 형식 6개·특수문자/개행 보존, check 무쓰기·비영0, 복구 후0 | team.test.ts 실제 CLI·독립 형식 판독 |
| S-3 | unit | T-3 | 기존/등급 설정·손상 JSON | resolve·worker CLI set/reset/show | 기존 동작 불변·도구×tier 매핑·초기화·거부 | worker-settings.test.ts·team.test.ts |
| S-4 | unit | T-4 | 외부 sentinel·source/output 링크·foreign 정의 | new/list/sync/check | 비영0·외부/사용자 파일 불변, 뒤 대상 충돌도 앞 대상 쓰기 전 거부 | team.test.ts 음성 경로 |
| S-5 | unit | T-4 | 원본 없는 관리 출력·무관 native 파일 | sync/check | 고아 진단·무삭제·무관 파일 보존·반복 결정적 | team.test.ts |
| S-6 | check | T-5 | 최종 산출 | TEAM 문서·정의서·WORK-PROCESS·보안 대조 | 형식/매핑/권한 한계 추적 | 독립 tester/reviewer 2단계 |
| S-7 | check | T-5 | 코드 완료 | PACE_SKIP_BROWSER_E2E=1 npm run check·비밀 검사 | 타입·실행 시험0건 아님·전체 회귀 실패0 | evidence/check.txt |

## 접근

1. TASK 해시를 보존하고 다른 제공자의 사전 검토 pass 후 구현한다. 민감 경로는 사용자 설정·파일 생성으로 보안 관점을 먼저 본다.
2. src/team/의 모델·저장/렌더·명령을 분리한다. Git 최상위 경로를 인자 배열·기한 제한 조회로 구하고 첫 커밋 없는 Git 저장소·하위 디렉터리도 지원한다. 메모리 루트 추론은 재사용하지 않는다. 부트·역할 자동 선택은 바꾸지 않는다.
3. name은 두 native 호스트 공통 소문자 ASCII kebab 이름(1~64자, Windows 예약명 제외), 파일명과 같아야 한다. role은 위 enum, tier는 high/medium/low, stage/resources/tools는 제어문자 없는 중복 없는 문자열 배열이다. new 초안에서 빈 배열을 허용한다. tools는 안내 데이터로 본문에 보존하며 native 권한 목록으로 승격하지 않는다. 본문은 정체성·맡는 일·하지 않는 일·실행 전 대조·인계·결정 요청·완료 보고·도구 안내의 비어 있지 않은 절을 둔다. 팀 파서는 frontmatter 중복·알 수 없는 키·잘못된 줄/자료형을 거부하여 공용 YAML-lite의 느슨한 해석을 그대로 믿지 않는다.
4. templates/team/member.md에서 역할에 맞는 초기 업무·경계와 tier(lead/reviewer high, maker/coordinator medium)를 만든다. stage/resources/tools는 빈 배열이다. 저장소 맞춤 설계는 T07이며 크기 상한64KiB·일반 파일 검사를 적용한다.
5. worker-settings.ts의 같은 설정 관리 계층에서 PACE_HOME/worker-tiers.json을 별도 관리한다. 구조는 {agent: {high|medium|low: {model?,effort?}}}이며 기존 worker-settings.json에는 새 키를 쓰지 않아 옛 설치본/다른 worktree 판독기와 호환한다. 팀 해석은 tier.model override→worker model/default, effort는 tier.effort override→tier 문자열이다. 일반 worker effort는 팀 등급을 덮지 않는다. 기본 모델은 현재 worker 기본/사용자 설정을 쓰므로 공급자 신제품 이름을 추정하지 않는다. worker set <agent> tier.<tier>.<model|effort> <value>·reset과 show의 teamTiers로 대응표를 관리한다. 기존 resolveWorkerSettings의 명시 인자>설정>기본 및 effort default는 그대로다.
6. description은 맡는 일 절의 첫 유효 문단과 role·stage에서 500자 이내로 결정적으로 도출한다. Claude는 유효 frontmatter(name/description/model/effort)·생성물 표지·역할 메타·본문, Codex는 name/description/model/model_reasoning_effort/developer_instructions를 생성한다. TOML basic string과 YAML scalar를 이스케이프해 따옴표·역슬래시·개행·구분자로 깨지지 않게 한다. tools를 native 권한 필드에서 생략하고 지침으로만 보존한다. 두 native 형식의 동일 developer 지침 본문에 원본 role/stage/tier/resources/tools 메타를 보존한다. native subagent와 최상위 Orca worker 선택을 구분한다. tools 생략은 부모 도구 상속이며 reviewer도 쓰기 도구를 가질 수 있다.
7. source/output 조상 디렉터리·파일의 링크/일반 파일/nlink를 검사한다. new는 배타적 생성, sync는 전체 입출력 사전 검사 후 파일별 원자 교체를 한다.foreign 출력 충돌은 거부하고 같은 source 관리 표지가 있는 출력만 갱신한다. --check는 mkdir/쓰기 없이 비교한다. 무관 native 파일은 유지하며 원본 없는 관리 출력은 비영0 진단·무삭제로 사용자가 별도 처리한다. 여러 파일 트랜잭션·악의적 동시 디렉터리 교체 방어는 보장하지 않는다. 부분 I/O 실패 뒤 sync/check로 수렴시킨다.
8. docs/TEAM.md를 정본으로 추가해 docs/README.md 구성/문서 표·WORK-PROCESS·SECURITY·README 명령과 연결하고 .pace/test-map.json에 시험 단위를 연결한다. 임시 PACE_HOME·로컬 Git 외 실제 호스트·사용자 설정은 쓰지 않는다. 실제 호스트 적용 실측은 T03·T04이며 스킬 복사는 제외한다.
9. 관련 검사·CLI 시나리오·전체 검사 뒤 별도 tester/reviewer의 목표 1단계→작업문서 2단계를 회수한다. TASK-CLOSE→check→done→태그 커밋으로 닫는다.

### 생성 입력과 재현·호환 경계

생성 입력은 원본과 현재 호스트별 유효 모델 매핑의 두 가지다. 저장소 파일에 개인 설정이 들어가는 선택을 명시하며, 실제 매핑값과 별도 매핑 SHA256을 생성물 표지에 기록한다. source SHA256은 LF 정규화한 원본 기준이다. --check는 파일 없음·원본 차이·매핑 설정 차이·생성물 내용 차이를 구별한다. 다른 사용자/CI 또는 PACE 기본 모델 변경 시 매핑 차이가 날 수 있으며 이를 손수정으로 오판하지 않는다. 필요하면 worker tier 설정을 동일 값으로 맞춘 뒤 sync한다. 매핑을 저장소 정본으로 복사하지 않는 이유는 BR02의 worker 설정 위치 계약과 호출자의 기존 모델 선택을 보존하기 위해서다. native 생성물은 해당 매핑의 스냅숏이고 실제 실행 인자 전달은 T03에서 다시 수행한다.

S-2·S-3에 사용 중인 매핑 변경→설정 차이 진단→sync→check 통과를 추가한다. 별도 tiers 파일을 써도 기존 worker-settings 파일 바이트와 일반 resolve 결과는 불변이며, 일반 effort=high와 tier effort=low 동시 설정에서는 팀만 low다. show의 기존 settings/effective 키는 유지하고 teamTiers를 추가한다. 모든 등급과 두 호스트를 표로 대조한다.

CRLF 원본/출력은 비교·해시·렌더 전에 LF로 정규화해 의미 없는 손수정 진단을 막는다. 혼합 개행도 같은 규칙이며 생성은 LF다. S-2에 CRLF와 이스케이프 사례(: 공백, #, 선행 하이픈/따옴표, 세 겹 따옴표, 역슬래시, 개행)를 추가한다. 독립 형식 판독은 이 환경의 python3.14 -I tomllib로 TOML을 읽는 실제 CLI 시나리오에서 수행한다(런타임 의존성 추가 없음). YAML은 호스트 frontmatter 지원 문법과 별도의 파싱/필드·본문 대조를 수행하며 같은 렌더 결과만 재사용하는 기대값은 쓰지 않는다. 독립 판독기를 사용할 수 없는 환경은 미실행/사유를 기록하고 이 로컬 실측을 대체했다고 주장하지 않는다. Git 조회는 rev-parse만 사용하며 status·훅 실행 경로를 호출하지 않는다.

### 검토에서 확정한 세부

모든 차이(설정만 다른 경우 포함)는 --check 종료1이며 일치하면0, 입력/경로 오류는2다. 매핑 표지의 값과 SHA256이 불일치하거나 메타가 손상되면 생성물 내용 차이다. 원본이 같고 로컬 매핑이 다를 때는 표지의 기존 매핑으로 다시 렌더한 내용과 실제 출력도 대조해, 설정 변경이 손수정을 가리지 않게 한다. S-2에 매핑 변경+출력 손수정 동시 발생 시 두 분류가 모두 나오는 경우를 넣는다. 원본도 바뀌어 옛 본문을 재구성할 수 없으면 내용 차이의 원인이 원본 변경인지 손수정인지는 단정하지 않고 원본 차이와 함께 보고한다. 표지는 진위 서명이 아니라 생성 입력 추적 정보다.

등급 설정 파일도 일반 파일·심볼릭 링크/nlink·64KiB 상한과 model/effort의 빈 값·제어문자·개행 거부를 검사한다. 기존 worker reset <agent> <model|effort>는 기존 파일의 해당 필드만, tier.<tier>.<field> reset은 별도 등급 파일의 해당 필드만 지운다. description은 맡는 일 절에서 첫 빈 줄 전의 문단을 공백으로 연결하고 role·stage를 앞에 둔 뒤 Unicode 코드포인트 500개로 자른다. S-1에서 둘째 문단 제외·절/메타 포함·500개 경계를 고정 기대값으로 확인한다.

독립 판독기는 Python3.11 이상 tomllib(이 환경은 python3.14 확인 완료)과 Ruby 표준 YAML.safe_load를 사용한다(이 환경 /usr/bin/ruby 2.6.10 확인 완료). 실제 CLI 생성 후 원문 대비 필드·본문/메타를 이 두 판독기로 확인하며 런타임 의존성은 추가하지 않는다. 다른 환경의 판독기 부재는 skip과 사유로 남기되 이 로컬 실측을 대신했다고 하지 않는다. Node 회귀 시험은 해당 도구 없이도 돌아간다.

### 2단계 계약 대조 보완

필수 본문 절 인계·결정 요청·완료 보고에는 역할 밖 인계뿐 아니라 결정 주체에게 올리는 요청·근거·선택지와 완료 보고 형식을 명시한다. S-1은 이 절 누락을 거부하고 새 템플릿이 이를 포함하는지 확인한다. 생성물 표지는 TOML 주석·Claude frontmatter 안 YAML 주석으로 두며 모르는 native 키를 추가하지 않는다. 원본 경로는 저장소 기준 상대 POSIX 경로이고 시각·사용자명·절대 경로는 넣지 않는다. 매핑 스냅숏은 (해당 host, 해당 멤버 tier)의 유효 model/effort만이다. S-2에 같은 입력/매핑으로 다른 위치에 복사한 저장소의 check0 및 쓰지 않는 low 등급 매핑 변경 후 check0을 추가한다.

team sync --check --json은 {members, differences:[{path,kind}], ok}를 stdout JSON 한 건으로 내고 kind는 missing/source/settings/content/orphan이다. 차이가 있으면1, 같으면0, 입력/경로/설정 오류는2이며 JSON 모드의 오류는 {ok:false,error}다. 다른 환경의 매핑 설정 차이는 settings로 기계적으로 구분 가능하되 무시하여 성공으로 만들지는 않는다. S-2는 각 분류·복합 분류·오류2 및 JSON 계약을 고정 기대값으로 확인한다.

T08 인계 전 기존 native tools 제한 여부를 반드시 확인한다. T02는 foreign 출력을 거부하고 기존 정의를 자동 이전하지 않으므로 현재 권한을 넓히지 않는다. 기존 제한이 있는 정의의 이전은 해당 제한을 보존할 실행 방법을 정한 뒤 수행하고, 제한 없이 상속하도록 바뀌었다면 같은 권한이라고 보고하지 않는다. 출력 디렉터리의 무관 파일도 링크/nlink/일반 파일/64KiB 검사를 지키며 읽고, .pace/team의 이름 규칙 위반 .md는 거부한다.

### 승인된 BR09 선행 계약 반영 (main ab34132)

최종 검증 중 코디네이터가 승인된 새 BR02·BR01·BR09 계약 반영을 지시했다. 이전 소스·검사·검토는 pre-br09 스냅숏으로 보존하고 새 TASK 해시를 다시 사전 검토한다. T02의 실행 전 대조 책임은 원본 본문의 별도 필수 절(## 실행 전 대조)과 공통 템플릿에 넣는다: 위임을 받은 쪽은 실행 전에 지시가 근거(캡틴 원문·확인된 해석 또는 계약)와 같은 범위인지 대조하고, 달라졌거나 근거가 불명확하면 실행을 보류하고 올린다. 미확인 해석을 스스로 승인된 것으로 바꾸지 않는다.

S-1은 새 절이 없으면 파싱 거부하고 네 역할의 new 원본 모두에 책임 문구가 들어가는지 확인한다. S-2는 그 절의 원문이 Claude·Codex 지침에 그대로 보존되는지 독립 파서로 대조한다. S-6에서 가이드와 템플릿의 보류·올림 형식 및 근거 세 종류를 대조한다. 의미상 범위 비교는 위임받은 에이전트의 책임이라는 문서 계약이며, 해석 확인 사슬·전송·종결의 기계 검증은 T09가 맡는다. T02의 검사 통과가 에이전트의 실제 대조 행동까지 증명한다고 쓰지 않는다.

기존의 입력/경로 오류2에는 foreign 충돌·링크/nlink 거부도 포함하고 JSON 여부와 관계없이 같다. native model/effort 필드의 실제 적용은 미확인(T01에서 선언 high→실제 medium), T03·T04에서 실측한다. BR01 최신 요청 단위 도달 규칙은 기존 to:captain 행수와 다르므로 T01 원장을 보존한 채 요청별 답/전송 근거의 후속 분류 위치를 남긴다. T06은 그 최신 정의와 BR09 기록을 쓰며 T08은 두 저장소의 위임 보류·감사·handoff.mjs 이전 계약을 따른다.

### 실행 전 대조의 검출 경계 확정

절의 비어 있지 않음만 검사하는 대안은 맞춤 원본에서 책임을 지워도 통과하므로 채택하지 않는다. 다음 공통 불변 문장이 원본의 실행 전 대조 절에 포함됐는지(연속 공백·줄바꿈만 한 칸으로 정규화) 검사하고 사용자는 앞뒤에 보충만 할 수 있다: 위임을 받으면 실행 전에 지시가 근거(캡틴 원문·확인된 해석 또는 계약)와 같은 범위인지 대조한다. 범위가 달라졌거나 근거가 불명확하면 실행을 보류하고 결정 요청 형식(결정 주체·근거·선택지)으로 올린다. 미확인 해석을 승인된 것으로 바꾸지 않는다.

S-1의 고정 기대값은 이 전체 문장과 세 근거·두 보류 조건·미확인 해석 금지·결정 요청 형식 연결이다. 제목만 있고 해당 없음/무관 내용인 절은 거부하며, 문장 중 어느 필수 요소를 지워도 거부한다. 템플릿의 인계·결정 요청·완료 보고 절도 실행 전 대조에서 보류한 건을 같은 형식으로 올린다고 연결한다. 문장 존재 검사는 임의 추가 문장의 의미 충돌이나 실제 대조 행동을 판정하지 않으며 T04/T07 의미 검토·T09 기록 검증·T08 현장 보류 사례로 검증한다.

사전 검토 v1은 기록 스키마 버전이고 검토 횟수가 아니다. 해시 파일과 PRE-REVIEW attempts로 차수를 보존한다. 코드 초기 구현은 R3 pass 뒤 시작했고 새 계약이 들어올 때마다 이전 스냅숏을 보존하고 계획/구현 정합을 다시 검토한다.
