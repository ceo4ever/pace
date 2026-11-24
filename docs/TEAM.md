# 저장소 팀 원본과 호스트 정의

팀은 저장소의 `.pace/team/<name>.md` 한 벌에서 관리한다. 개인 비서 프로필·워크스페이스 `.pace/AGENT.md`와는 별개다. Claude·Codex native 정의는 생성물이므로 직접 편집한 내용은 `sync`로 덮어쓴다. 원본을 먼저 고친다.

```sh
pace team new athena --role lead
pace team new builder --role maker
pace team new quality --role reviewer
pace team list
pace team sync
pace team sync --check --json
```

Git 저장소의 어느 하위 폴더에서 실행해도 최상위 `.pace/team`을 사용하며 첫 커밋 전에도 동작한다. 저장소 밖에서는 거부한다. `new`는 기존 원본을 덮어쓰지 않는다. 생성된 공통 골격의 단계·업무·자원·도구를 저장소 상황에 맞게 편집한다. 팀 명단만 만든다고 프로젝트 작업자의 역할이 자동 선택되지는 않는다.

## 원본 형식

```md
---
name: athena
role: lead
stage: [분석, 설계, 구현]
tier: high
resources: [studio]
tools: [Read, project-skill]
---

# 아테나

## 정체성
이 저장소의 리드다.

## 맡는 일
계약을 확인하고 담당과 독립 검토를 배정한다.

## 하지 않는 일
사용자 승인이나 전문 담당자의 구현을 대신하지 않는다.

## 실행 전 대조
위임을 받으면 실행 전에 지시가 근거(캡틴 원문·확인된 해석 또는 계약)와 같은 범위인지 대조한다. 범위가 달라졌거나 근거가 불명확하면 실행을 보류하고 결정 요청 형식(결정 주체·근거·선택지)으로 올린다. 미확인 해석을 승인된 것으로 바꾸지 않는다.

## 인계·결정 요청·완료 보고
결정 요청에는 결정 주체·요청·근거·선택지·추천과 이유를 담는다.
실행 전 대조에서 보류한 요청도 이 형식으로 올린다.
역할 밖 일은 HANDOFF: lead | 요청 | 근거로 올리고 완료 시 수행·검증·남은 일을 보고한다.

## 도구 안내
tools의 스킬·도구 지침을 읽고 실행 환경의 권한 설정을 따른다.
```

| 필드 | 계약 |
|---|---|
| name | 파일명과 같은 1~64자 소문자 ASCII kebab 이름. 숫자는 첫 글자 뒤 허용하며 Windows 예약명은 거부한다. 호스트가 이 이름을 실제 수용하는지는 해당 호스트 실측에서 확인한다 |
| role | lead·maker·reviewer·coordinator |
| stage | 저장소에서 맡는 업무 단계의 중복 없는 문자열 배열 |
| tier | high·medium·low. 새 lead/reviewer는 high, maker/coordinator는 medium |
| resources | 공유 자원 이름의 중복 없는 문자열 배열. 자원 사용 허가는 실행 측에서 별도 확인한다 |
| tools | 스킬·도구 안내 이름의 중복 없는 문자열 배열. 권한 목록으로 자동 변환하지 않는다 |

stage/resources/tools는 초안에서 빈 배열을 허용한다. 전체 필드는 한 번씩 있어야 하며 모르는 키·중복·잘못된 종류·이름 불일치·빈 필수 본문 절은 거부한다. 본문 필수 절은 위 예시와 같다. description은 `맡는 일`의 첫 문단과 role·stage에서 도출해 Unicode 코드포인트 500개로 자른다.

`실행 전 대조`의 위 문단은 계약 v1의 공통 책임이다. 공백·줄바꿈 차이만 허용하며 문단을 바꾸거나 약화하지 않고 앞뒤 별도 문단으로 보충한다. 일반 주석·코드 펜스·4칸/탭 들여쓰기·인용 예시만으로는 충족하지 않는다. v1은 CommonMark 전체 판독기가 아니다. 혼합 공백/탭, 4칸 이상 들여쓴 펜스 및 주석과 펜스를 섞은 경계에서는 코드 예시를 일반 문단으로 오인할 수 있다. 원본의 책임 문단은 일반 본문으로 두고 맞춤 보충의 의미는 team verify와 설계 검토에서 대조한다. 필수 절 제목을 중복하지 않는다(예시 안에서도 같은 제목을 반복하지 않는다). 기존 원본에 이 문단이 없으면 list/sync/check가 입력 오류2로 기대 문장과 갱신 위치를 안내한다. 원본을 직접 갱신하되 맞춤 내용은 보존하며 CLI가 자동 덮어쓰지 않는다.

이 검사는 책임 문단의 존재를 확인한다. 추가 문장의 의미 충돌이나 에이전트가 실제로 대조하는지는 판정하지 않는다. 의미 검토는 team verify·팀 설계에서, 해석 확인 사슬·전송·종결 기록 검증은 소통 계약에서, 실제 보류 행동은 현장 적용에서 확인한다. 통과를 실제 행동 보장으로 해석하지 않는다.

frontmatter는 PACE YAML-lite의 제한된 문법이다. 인라인 목록은 따옴표 없는 문자열 목록(`[Read, Bash]`)을 쓰고, 인용·쉼표가 필요한 항목은 `tools:` 아래 `- '항목'` 줄 목록을 쓴다. 중첩 배열/객체와 확장 escape는 지원하지 않는다. 숫자·불리언처럼 보이는 목록 값은 인용한다. 목록 항목은 공백/제어문자·중복 없이 256자 이하다. UTF-8 일반 파일 64KiB 이하이며 CRLF는 LF로 정규화한다. 원본이 상한 안이어도 메타를 합친 출력이 64KiB를 넘으면 동기화를 거부하므로 원본을 줄인다.

## 모델과 effort 대응표

기존 일반 작업자 설정은 `PACE_HOME/worker-settings.json`, 팀 등급 override는 같은 폴더의 별도 `worker-tiers.json`에 둔다. 옛 설치본이 새 키를 손상으로 읽지 않도록 기존 파일 형식과 바이트를 바꾸지 않는다.

```sh
pace worker show
pace worker set claude tier.high.model claude-opus-5-5
pace worker set claude tier.high.effort high
pace worker set codex tier.medium.model gpt-6.2-sol
pace worker set codex tier.medium.effort medium
pace worker reset codex tier.medium.model
```

등급의 model은 해당 `(host,tier)` override → 일반 worker model → PACE 배포 기본값 순이다. effort는 해당 등급 override → tier 문자열 순이다. 일반 worker effort는 팀 등급을 덮지 않는다. 따라서 기본값에서 세 등급의 **모델은 같고 effort만 다르다**. 다른 모델을 쓰려면 각 등급을 명시한다. 일반 `worker set/reset <host> model|effort`는 기존 파일만, `tier.<tier>.<field>`는 등급 파일의 그 항목만 바꾼다. show의 기존 settings/effective는 유지하고 teamTiers를 추가한다.

등급 파일은 `{ "codex": { "high": { "model": "모델 이름", "effort": "high" } } }` 형태다. 일반 단일 링크 파일·64KiB 상한을 검사하며 잘못된 키·빈 값·제어문자·개행·1024자 초과 값과 effort `default`를 거부한다. 원자 교체로 저장한다. 호스트별 실제 model/effort 허용 목록까지는 검증하지 않으므로 잘못된 제공자 값은 실제 호스트에서 거부될 수 있다.

짝 없는 Unicode surrogate도 거부해 잘못된 TOML escape를 내보내지 않는다. 등급 파일이 손상돼도 `worker show`는 기존 settings/effective를 JSON으로 표시하고 teamTiers는 null·teamTiersError를 기록한 뒤 종료2로 알린다.

## 생성물과 검사

Claude는 `.claude/agents/<name>.md`, Codex는 `.codex/agents/<name>.toml`이다. 문자열은 인용/이스케이프해 내보내고 두 형식의 지침 본문에 같은 role/stage/tier/resources/tools 및 원문을 넣는다. 관리 표지는 Claude frontmatter의 YAML 주석과 TOML 머리 주석에만 둔다. 본문 속 비슷한 줄을 관리 소유권으로 인정하지 않는다.

생성 입력은 **원본과 해당 host×멤버 tier의 유효 model/effort**다. 표지에는 상대 POSIX 원본 경로, LF 원본 SHA256, 매핑 값과 SHA256을 기록하며 절대 경로·시각·사용자명을 넣지 않는다. 사용하지 않는 등급 변경은 다른 생성물에 영향을 주지 않는다.

native model/effort는 의도 매핑의 스냅숏이다. T01에서는 Claude native model 별칭은 반영됐으나 선언 effort high는 실제 medium이었다. 전체 모델 ID와 생성된 effort의 **실제 적용은 미확인**이며 T03·T04에서 실행 인자 및 호스트 실측으로 구별한다. Codex custom subagent 정의가 최상위 Orca 작업자를 선택한다는 의미도 아니다.

native model/effort를 생략해 부모 설정을 상속하는 방법은 환경 간 차이가 줄지만 등급 의도값을 생성물 자체에서 검토할 수 없다. 이 때문에 명시적 매핑 스냅숏을 택했다. 다른 사용자/CI는 같은 매핑으로 맞춘 뒤 검사하거나 settings 차이 실패를 명시적으로 처리해야 한다. 서로 다른 매핑으로 반복 sync하면 공유 생성물이 번갈아 바뀔 수 있다. 차이를 자동 무시하거나 성공으로 바꾸지 않는다.

| check kind | 의미 |
|---|---|
| missing | 생성 파일 없음 |
| source | 표지의 원본 지문과 현재 원본이 다름 |
| settings | 표지의 유효 매핑과 현재 매핑이 다름 |
| content | 기록된 매핑으로 다시 생성한 내용과 다르거나 표지가 손상됨 |
| orphan | 관리 표지는 있지만 대응 원본 없음 |

같은 경로에 여러 kind가 나올 수 있다. 매핑이 바뀌어도 기존 표지의 매핑으로 내용을 별도 비교하므로 손수정이 가려지지 않는다. 원본까지 바뀐 경우 내용 차이가 원본 변경인지 손수정인지는 단정하지 않는다. CRLF만 다른 경우는 일치로 본다.

`sync --check`는 mkdir·파일 갱신 없이 비교한다. `--json`은 `{members: 개수, differences: [{path,kind}], ok}` 한 건을 stdout에 내며 원본 이름·host 순, 각 항목의 source/settings/content 순으로 결정적이다. 차이가 없으면0, 하나라도 있으면1이다. 입력·설정·경로 오류, foreign 충돌, 링크/nlink 거부는 JSON 여부와 관계없이2이며 JSON 모드는 `{ok:false,error}`를 낸다. 일반 sync도 성공0/거부2이고 고아는 자동 삭제하지 않고2로 거부한다.

## 보존과 권한 경계

원본과 출력의 조상 링크·파일 링크·하드링크·일반 파일 여부를 검사한다. 고아를 찾을 때 여는 무관 native 파일에도 같은 제한과 64KiB 상한을 적용한다. 이름 규칙에 맞지 않는 `.pace/team/*.md`는 거부하고 다른 확장자는 읽지 않는다. 같은 경로의 사용자 소유 출력은 덮어쓰지 않으며 무관 native 파일은 보존한다. 모든 사전 검사를 마친 뒤 각 파일을 원자 교체한다. 여러 파일 트랜잭션이나 악의적인 동시 디렉터리 교체 방어는 보장하지 않는다. 중간 I/O 실패 뒤 sync/check를 다시 실행해 확인한다.

따라서 native 정의를 링크로 공유하거나 64KiB를 넘는 파일을 같은 agents 폴더에 둔 저장소에서는 검사·동기화가 거부된다. 관리 고아 검출을 건너뛰지 않기 위한 보수적 정책이며 기존 파일을 자동 변환하지 않는다. 원본 이름을 바꾸면 이전 관리 생성물을 검토해 별도로 정리한 뒤 sync한다.

관리 표지는 진위 서명이 아니다. 사용자가 같은 표지를 붙인 파일은 관리 파일로 취급될 수 있으므로 표지를 위조하지 않는다. 팀 파일에는 비밀을 넣지 않는다.

## 프로젝트 작업자 역할

`pace project start P123 --role builder --agent codex`는 팀 구성원 이름 `builder`를 선택한다. `team new --role maker`의 역할 종류와 다르다. 선택 순서는 start의 `--role` > PROJECT 머리의 `- 작업자 역할:` > 없음이다. 자동 lead는 없으며, 팀 원본과 native 생성물이 있어도 역할 미지정 경로는 기존과 같다. 역할 실행은 Claude·Codex를 지원한다. 다른 도구는 역할을 빼거나 `--agent claude|codex`를 선택한다.

새 worktree는 기본으로 실행하며 `--no-launch`는 준비와 역할 포함 직접 실행 안내까지만 한다. 기존 worktree에 작업자를 다시 띄울 때는 `--launch`를 쓴다. 기존 worktree에 `--role`만 주면 적용했다고 오인하지 않도록 거부한다. 역할 옵션 없이 기존 경로를 안내하는 단순 재개는 작업자를 띄우지 않으며, 폴더가 이동한 경우에도 기존 안내를 유지한다.

새 branch의 역할은 체크아웃될 HEAD의 커밋된 원본에서 읽는다. main의 커밋되지 않은 역할 편집은 자동 반영하지 않는다. 기존 branch 복구는 그 ref의 원본·PROJECT를 미리 검사하고, 기존 worktree 재실행은 실제 실행 checkout의 원본·PROJECT를 쓴다. 도구 선택은 기존 main PROJECT/저장소/세션 규칙을 유지하므로 도구와 역할의 출처가 다를 수 있다. 준비·병합이 끝난 실행 직전에 원본/선택/설정을 다시 확인한다. 달라지면 실행을 보류하고 worktree를 보존하므로 원본/커밋을 확인한 뒤 `start --launch`로 재시도한다. 역할 원본과 역할 필드를 실제로 선택한 PROJECT는 64KiB 이하 UTF-8 일반 파일이어야 한다. 역할 필드가 없으면 PROJECT 탐색은 기존 읽기 방식을 유지해 큰 파일·하드링크에 이 제한을 새로 적용하지 않는다. 명시 role은 PROJECT 역할 필드보다 우선한다.

두 호스트 모두 시작 지시 첫 줄에서 `.pace/team/<이름>.md`를 읽는다. 시작 지문은 CRLF를 LF로 정규화한 UTF-8 텍스트의 SHA256이며 지시문에도 계산 기준을 넣는다. native subagent는 최상위 Orca 작업자 선택과 다르고, 공유 settings 교체는 동시 실행에 간섭하므로 쓰지 않는다(T01 실측). 각 model/effort 필드는 명시 start 옵션 > tier 해석 순이다. tier의 model은 tier override → 일반 worker model/기본값, effort는 tier override → tier 문자열이며 일반 worker effort가 덮지 않는다. 명시 `--effort default`는 기존 의미대로 effort 인자를 생략한다. 값은 비밀·선행 대시·Unicode 제어/서식 문자 없는 well-formed 문자열(1024자 이하)이며, 공백·셸 메타문자는 한 argv 값으로 전달하고 직접 안내에서는 인용한다. 시작 구성원 이름도 비밀 후보를 거부해 진단·기록에 넣지 않는다. 모델별 실제 지원은 호스트 결과로 확인한다.

start 사건의 선택 `role` 객체에는 name/source(option 또는 project), definition(상대 경로), hash(시작 검증 지문), method(prompt), model/effort, settingsStatus, toolsPermissionApplied(false), runtimeObserved(false)를 기록한다. settingsStatus는 planned(직접 안내/미실행), arguments(Orca 인자 전달), unconfirmed(실행 응답 불명), rejected(실행 실패)다. **전달은 실제 적용이 아니다.** 런타임 model/effort·적재 행동은 별도 세션 관측으로 확인하고 불일치·미확인은 이슈와 후속 검증으로 남긴다. 시작 지문은 이후의 동시 편집까지 고정하지 않는다. 도구 권한은 적용하지 않으며 역할 정의 자체도 보안 경계가 아니다.

역할 없는 옛 사건은 그대로 읽는다. 잘못된 role 객체가 붙은 사건은 기존 잘못된 to와 같은 엄격 정책으로 행 전체가 제외되므로 손상 기록을 통계의 0으로 해석하지 않는다. 지침 원문·인증정보를 role 객체에 넣지 않는다. 실제 업무의 지속 효과와 원본 미적재/삭제 뒤 보류 행동은 추가 관측 대상이다.

**tools 지침은 권한 제한이 아니다.** native tools 필드를 생략하므로 부모 도구를 상속하며 reviewer도 쓰기 도구를 가질 수 있다. 실제 읽기 전용 등은 호스트 실행 인자/권한 설정으로 집행한다. 기존 native tools 제한이 있는 저장소는 이전 전에 제한을 확인하고 보존할 방법을 정한다. T02는 기존 foreign 정의를 자동 이전하지 않는다. 실제 이전·적용은 T08에서 별도 확인한다.

## 실제 적재 빠른 점검

`pace team verify builder --agent claude` 또는 `pace team verify --all`로 검사한다. host 생략은 Claude·Codex 양쪽이며 이름과 `--all`은 함께 쓰지 않는다. T03의 같은 원본 읽기 시작 지시 뒤 read-only 단발 CLI에서 네 고정 질문을 한다. 표의 적재 방식은 **prompt**다. 최상위 Orca 업무 전체·native 선택·업무 품질 검증은 아니다.

하지 않는 일의 bullet 첫 부분에 backtick으로 감싼 짧은 키워드를 하나씩 둔다(예: `vfy-s-<고유값>`, `vfy-r-<고유값>`). new는 구성원별 고유한 표지를 한 번 생성하며 sync/verify가 다시 만들지 않는다. 32자 이하이며 중복·제어문자·비밀 후보는 거부한다. 이름과 모든 키워드가 답에 있어야 pass다. 키워드 일부/전부 누락·의역·형식 불명확은 **확인 필요**, 다른/없는 정체성·원본/호스트 실패는 fail이다. 기존 정의를 자동 개정하지 않고 키워드가 없으면 확인 필요다. 고정 표지는 추측·자동 맥락 노출 가능성이 있고 이름은 시작 지시에도 있으므로 pass는 진실성/의미 전체의 보증이 아니다. 맡는 일·막힘 답은 비어 있지 않은 구조만 확인한다.

공통 roleInstruction prefix와 같은 원본 읽기는 유지하면서 verify 적재 구역에 **호출자 지문 검증 책임**을 알린다. 호출 직전·응답 뒤에 원본의 정규화 SHA를 대조하고, readonly 모델의 자체 셸 검산은 요구하지 않는다. 이 고지는 적재 인증이나 원본 읽기의 대체가 아니다. 읽기 실패 보고는 JSON 최상위 선택 필드 `loaded:false`이며 정체성보다 먼저 fail이다. 필드가 없으면 기존 규칙을 따르고 true만으로는 통과하지 않는다. 고지에는 기대 이름·키워드·본문이 없고 질문과 분리된다.

verify의 Claude 도구는 Read/Grep/Glob이며 실제 Orca 작업자의 셸 구성은 호스트에 달려 있다. T04는 실제 작업자의 자체 지문 계산 성공을 관측하지 않으며 T08 현장 후속으로 남긴다. 보고서에도 고지와 자체 검산 미관측을 기록한다. 호출 중 바꿨다가 되돌린 원본은 전후 지문만으로 검출하지 못한다.

`.pace/team/verify/<고유 ID>.json`에 결과를 보존하고 stdout의 `Report:`가 경로를 가리킨다. 요청 설정과 보고 모델의 출처를 구분하며 effort 실제 적용은 미확인이다. 원본·생성물·사용자 설정을 쓰지 않는다. native 변조는 해당 없음이며 파일 차이는 `sync --check`로 검사한다.

결과 JSON은 저장소에서 버전 관리하는 검증 근거로 취급한다. `project finish`의 `git add -A` 대상이므로 소스와 함께 보존된다. 로컬 전용 보존이 필요한 저장소는 `.gitignore`에 `.pace/team/verify/*.json` 규칙을 관리한다.

| 결과 | 종료 | 출력/기록 |
|---|---|---|
| 전부 pass | 0 | stdout 표·Report 경로·phase=result JSON |
| 원본 없음/손상·설정/호스트 fail | 1 | 안전한 결과 경로가 있으면 실패 행·보고서 |
| fail 없이 확인 필요 | 2 | stdout 표·Report 경로·phase=result JSON |
| 옵션·Git 루트/출력 경로 안전 거부 | 2 | stderr 진단, 보고서 없음 |

종료2만으로 판단하지 말고 채널·보고서 상태를 함께 확인한다. 원본 조상이 위험해 결과 경로도 안전하지 않으면 보고서 대신 거부한다. `--all`은 현재 원본 목록이므로 삭제 대조는 이름을 지정한다. 원본 없는 관리 생성물은 `sync --check`와 함께 본다. 답은 UTF-8 64KiB 상한이며 비밀 후보 답·오류 원문은 출력/저장하지 않는다. 사람 확인 결과는 후속 도입/회고에 연결한다.
