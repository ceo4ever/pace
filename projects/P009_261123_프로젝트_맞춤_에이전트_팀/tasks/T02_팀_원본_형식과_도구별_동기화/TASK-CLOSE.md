# T02 팀 원본 형식과 도구별 동기화 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

상위 목적과 맞음. 역할을 매번 입력하는 부담을 줄이기 위한 저장소 원본 한 벌과 두 도구 생성·어긋남 검사를 구현했다. 위임 실행 전 근거와 범위를 대조하고 이탈/불명확은 보류·결정 요청하는 책임을 네 역할 원본과 두 생성물에 전달한다. 계약 목표(형식·문구 전달)는 달성이다. 실제 호스트 model/effort 적용·권한 집행·보류 행동은 이 태스크의 관측이 아니며 T03/T04/T07/T08/T09에서 검증한다.

독립 첫 판단은 [reviewer](evidence/impl-review-stage1-indent.json)와 [tester](evidence/tester-indent-stage1.json), 기준 대조는 [reviewer 2단계](evidence/impl-review-stage2.json)와 [tester 최종](evidence/tester-stage2-final.json)이다. 모두 계약 목표 달성·blocking0/pass다. tester의 최초 2단계 fail은 전체 검사 증거 접근 불가였으며 구현 변경 없이 저장소 안 원문을 직접 읽고 번복했다. /tmp 원본·교본 접근 제한은 PM 대조로 보완했으며 독립 직접 확인으로 주장하지 않는다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | team new/list, 6필드·6본문 절·고정 책임 문단 검증, 기존 원본 보존. S-1 단위 및 [list 열 실제 CLI](evidence/list-repeat-result.json) |
| T-2 | 통과 | S-2 실제 CLI 3명→6개 생성→check, missing/source/settings/content/orphan 및 복합 차이, CRLF·복사본 재현·무쓰기·복구. [독립 형식 판독](evidence/native-format-result-br09.json) |
| T-3 | 통과 | 별도 worker-tiers.json, 기존 설정/일반 우선순위 불변, 두 도구×세 tier, set/reset/show, 손상·잘못된 값·constructor 회귀 |
| T-4 | 통과 | S-4/S-5 이름·경로·조상/source/output 링크·nlink·foreign 충돌 선검사·sentinel 불변, 고아 진단 무삭제·무관 파일 보존 |
| T-5 | 통과 | TEAM·정의서·WORK-PROCESS·SECURITY·README·test-map 연결, [전체 검사](evidence/check.txt), [비밀 검사](evidence/secret-scan.txt), 독립 2단계 위 링크 |

## 단위 테스트

- 구현 전 CLI RED 2건: [unit-red.txt](evidence/unit-red.txt). 초기 구현 전 unknown team/tier 실패를 확인했다.
- `node --test test/team.test.ts test/worker-settings.test.ts`: 15/15 통과. [최종 원문](evidence/unit-indent-pass.txt), 독립 tester 직접 재실행도 동일하다.
- `PACE_SKIP_BROWSER_E2E=1 npm run check`: 타입 검사 통과, tests1048/pass1031/fail0/skip17, 종료0. [실행·바이트 연결](evidence/check-receipt.json). 이후 런타임 코드와 시험은 불변이며 TEAM의 판독 한계 문장만 추가했다.
- 이전 전체 검사에서 기존 dashboard-init의 형제 저장소 스냅숏 비교 1건 실패. [실패 원문](evidence/check-br09-fail.txt)을 보존했고 단독 및 같은 조건 30회 진단은 통과했다([진단](evidence/dashboard-diagnostic.txt)). 원인은 확정하지 않았고 기존 시험/생산 코드는 바꾸지 않았다. 최신 전체는 해당 시험 포함 실패0이다.

## E2E

- S-2: 임시 Git/격리 PACE_HOME에서 실제 CLI, Python3.14 tomllib 3건·Ruby YAML.safe_load 3건과 본문·메타·책임 문단 3건 통과. 특수문자·개행·구분자 주입도 원문으로 보존한다. 렌더러 기대값을 재사용하지 않았다.
- Claude 정적 native 스키마 검증은 정상 strict 종료0, description 제거 음성 대조 strict 종료1/경고로 실제 검출을 확인했다([원문](evidence/claude-native-schema-check.json)). 실제 model/effort 적용·권한 집행 증명은 아니다. [공식 필드 출처](evidence/host-schema-sources.md).
- `check-list-repeat.py`는 단계·등급·자원 열 값과 반복 sync의 두 생성물 바이트 일치를 별도 확인했다. 사용자 홈·설치본·실사용 대상 저장소를 변경하지 않았다.

## 리뷰

- 사전 R1 fail blocking1→R2~R6 pass. [PRE-REVIEW.json](PRE-REVIEW.json)에 TASK 해시와 원문을 연결했다. 코드 초기 구현은 R3 pass 뒤 시작했고 새 승인 계약을 반영할 때 계획/구현을 재대조했다.
- 구현 reviewer 1단계의 Unicode·show 손상·constructor 문제, BR09 문구·도달 사유/근거 수준과 전송 분류 0의 의미, 들여쓰기 회귀를 반영했다. [처리·미반영 이유](evidence/review-response.md).
- tester 1단계 pass→2단계 fail(전체 증거 접근 불가)→같은 세션에서 직접 증거 판독 후 pass. reviewer 1단계 pass·2단계 pass blocking0이며 2단계는 같은 제공자의 다른 새 맥락에 첫 판단을 전달했다. 같은 reviewer 세션 재개/완전 블라인드라고 주장하지 않는다.
- 특수 기능: 독립 검토는 작성자 Codex/OpenAI와 다른 Claude/Anthropic를 사용했다. 실제 CLI 및 별도 TOML/YAML 판독, Claude strict 양성/음성 대조를 골랐다. tester의 Bash는 지정 시험만 허용했고 검토자는 파일을 편집하지 않았다.
- 교본: typescript/verification — 외부 JSON 검증·타입 가드, 안전한 키 접근, 경로/크기/링크·nlink 검사, 실행 전 거부·sentinel 음성·왕복·별도 판독기. PM은 색인을 열람했으며 reviewer는 바깥 교본 접근 거부를 공개했다.

## 남긴 것

- T03: 원본 prompt 적재 + tier의 명시적 model/effort 전달, 역할 미지정 회귀·없는 역할 선거부를 구현한다. 도구 안내를 권한 차단으로 표시하지 않으며 실제 적용 항목을 실측한다.
- T04/T07/T08/T09: 고정 문구는 의미 충돌·실제 보류 행동을 보증하지 않는다. v1은 CommonMark 전체 판독기가 아니어서 혼합 들여쓰기·주석/펜스 경계 오인이 남는다. TEAM에 공개했고 독립 reviewer가 nonblocking으로 판정했다. 맞춤 의미·현장 위임 보류는 후속 검증한다.
- 관리 생성물은 sync가 원본으로 복구하므로 직접 손수정은 덮어쓴다. 경로별 복구 출력 개선은 남긴다. 사용자 소유 충돌은 거부하며 고아 자동 삭제는 하지 않는다.
- 무관 native 링크/하드링크·64KiB 초과도 보수적으로 거부한다. 첫 적용에서 기존 구조를 확인한다. 다중 파일 트랜잭션과 악의적 동시 디렉터리 교체 방어는 보장하지 않는다.
- 승인된 main BR09 최종 계약을 3-way로 반영했고 T09를 T05 뒤/T06 앞에 등록했다. BR01 요청 단위 도달 정의의 T01 후속 분류는 역사적 원장을 보존한다. cap reply10/전송근거0/실패근거0/unknown6은 수신자10/4/2와 별개 축이며 전송 0은 실제 횟수 측정값이 아니다. 수기 답 요약7/Orca 답 참조3의 근거 강도·PM 가림 발췌 한계를 공개한다.
- T02 커밋 뒤 main 조상 이력을 안전하게 통합하고 T09 착수 전 BR09 최종 판정 commit 포함 여부를 재확인한다. 전체 프로젝트 finish·보안·현장 실측과 병합 승인 절차는 아직 남아 있다.
