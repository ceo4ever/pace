# T04 팀 호출 검증(team verify) — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

팀 원본을 실제 읽는지 빠르게 검사한다는 목적에 맞게 `team verify [이름|--all] [--agent claude|codex]`를 구현했다. 공통 roleInstruction 뒤에 호출자의 지문 검증 책임 고지와 기대 답 없는 네 질문을 붙이고, 정체성과 원본 금지 표지의 어휘 일치만 판정한다. 의미의 진실성이나 권한 집행을 증명한다고 주장하지 않는다. 원본을 읽을 수 없다는 명시 응답·잘못된 정체성·삭제/변경은 fail, 누락·의역·표지 없는 legacy는 확인 필요다.

실제 3명×두 호스트의 원본 읽기 응답 6건은 정확한 이름과 구성원별 원본 표지 두 개를 포함했다. 당시 판정표는 Claude pass/확인 필요/pass, Codex fail/fail/pass였다. 한국어 조사와 단일 fenced JSON 처리 결함을 RED 뒤 고쳐 같은 실제 응답을 결정적으로 재평가해 모두 pass다. [최종 재평가](evidence/actual-hosts/normal-fixed-replay-unique.json)는 모델 호출을 추가하지 않았다. 최종 코드로 정상 신규 호출을 실행하지 않았으며 새 기본 생성기로 만든 원본 자체의 live 관측도 없다. 사용자 승인과 위임된 코디네이터 판단은 증거 인정 방식을 정한 것이며, 실제 원본 읽기 달성 판단은 위 응답과 지문 대조에 근거한다.

독립 [reviewer 최종 첫 판단](evidence/impl-review-unique-stage1.json)과 [tester 보완 첫 판단](evidence/tester-unique-stage1.json), [reviewer 2단계](evidence/review-stage2.json)·[tester 2단계](evidence/tester-stage2.json)는 모두 pass/blocking0다. reviewer의 T-5 진행 중 표시는 당시 미작성 마감과 tester 회수 전의 절차 상태였고, 두 결과 회수·아래 보완을 마친 PM은 T-5까지 달성으로 판단한다. check/done의 형식 통과가 이 의미 판정을 대신하지 않는다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 같은 prefix·고지·질문, 두 호스트 기본 및 선택, 기대 답 비노출, 잘못된 옵션의 호출 전 거부. [관련75건](evidence/focused-final.txt) |
| T-2 | 통과 | 정체성 경계·모든 표지·loaded:false 우선 판정, 부분/전체 누락·의역·legacy 확인 필요, fence 밖 답/복수 JSON 음성 회귀. [네 차례 RED](evidence/default-markers-red.txt)와 관련 시험 |
| T-3 | 통과 | 고유 wx/0600 보고서·링크/hardlink 거부·64KiB/비밀 검사·오류 원문 비저장, CLI 종료0/1/2·stdout Report와 usage stderr 구별 |
| T-4 | 통과 | 실제 정상 응답의 승인된 재평가, 미적재·읽기 불가·삭제·legacy와 native 해당 없음. [증거 직접 대조](evidence/proof-pass.txt)와 아래 출처 구분 |
| T-5 | 통과 | 전체1092건 실패0, 비밀 검사, 문서·기본 생성 표지와 기존 원본 무수정, 독립 두 단계 판정 및 should_fix 처리 |

## 단위 테스트

- initial CLI RED, 호출 책임/loaded:false/직전 지문 RED, 한국어 이름·fence 판정 RED, 구성원 고유 기본 표지 RED를 각각 `unit-red.txt`, `responsibility-red.txt`, `evaluator-red.txt`, `default-markers-red.txt`로 보존했다. 초기 CLI --json stderr 결함 기록도 덮어쓰지 않았다.
- 관련 시험 75/75 통과. `PACE_SKIP_BROWSER_E2E=1 npm run check`: 타입 검사 포함 tests1092/pass1075/skip17/fail0. [전체 원문](evidence/check.txt). 제품/시험은 최종 첫 판단 뒤 바뀌지 않았고 이후 변경은 문서와 마감 기록이다.
- [증명 스크립트](evidence/check-actual-proof.mjs) 1/1 통과·모델 호출0. 현재 fixture 원본과 실제 Claude 세션 자료 2개를 재감사했다. 이후 cli 등이 바뀌면 T04 checkout에서 재실행해야 하며, 임시 fixture/원시 세션이 사라진 환경에서는 보존 사본의 내부 일치만 확인할 수 있다. 원시 세션이 남아 있을 때의 재감사와 동일하다고 주장하지 않는다.
- 새 표지는 구성원 생성 시에만 무작위로 만들고 sync/verify는 회전시키지 않는다. 형제 표지로 답하면 pass가 되지 않으며 기존 원본을 이행/수정하지 않았다. [생성 전용 결합 근거](evidence/actual-hosts/creation-only-binding.json)는 실측 원본4개·판독 함수6개와 실제 호출 경로가 그대로임을 대조한다. 검출력 강화의 별도 근거는 RED·단위·전체 검사다.

## E2E

- 첫 실제 정상 호출은 Claude3건 모두 자체 셸 지문 계산 불가로 확인 필요, Codex3건 pass였다. 코디네이터 A 결정 뒤 공통 prefix를 보존하고 호출자가 전후 지문을 검증한다는 고지를 추가한 한 번의 정상 재측정을 했다. 그 실제6응답의 옛 실패표·원문·모델 출처·설정·source snapshot을 모두 보존했다. [관측 이력](evidence/observations.md)의 full rerun pending 문구는 당시 기록이며 최종 수치는 위 check.txt의1092다.
- [재평가 사용자 승인](evidence/coordinator-reassessment-decision.md), [접근불가 근거 결합 main 판단](evidence/coordinator-controls-decision.md), [생성 전용 변경 동등성 main 판단](evidence/coordinator-creation-decision.md)을 연결한다. 최종 정상 근거는 처음 만든 normal-fixed-replay.json이 아니라 `normal-fixed-replay-unique.json`이며 이전 재평가도 역사로 보존했다.
- Claude 음성은 같은 실제 세션에서 대조 파일 Read 성공과 도구 권한 계층의 Read 거부/경로 확인 실패를 확인했다. OS sandbox 거부라고 확대하지 않는다. [제한된 실제 도구 사건 사본](evidence/actual-hosts/claude-control-events-archive.json)은 원시 자료 지문과 묶였으며 전체 채팅·인증 파일은 복사하지 않았다.
- Codex는 실제 native readonly 프로필 세션에서 대조 파일 cat 성공과 fail 응답을 관측했다. 같은 cwd/프로필의 별도 직접 sandbox 시험에서 원본/alias 읽기 거부와 쓰기 거부를 확인했다. 이는 모델이 실행한 거부 명령이나 같은 세션의 실패 이벤트가 아니다. [정책·경로 대조](evidence/actual-hosts/codex-native-path-proof.json)와 proof는 이 구분을 단언한다. 모델 출처는 requested다. 중첩 outer sandbox 초기화 실패·잘못된 프로필 키·옛 미확인 표시도 그대로 남겼다.
- 시작 지시 없는 양쪽 응답은 fail·원본 canary0, 지시가 있으나 읽기 불가한 양쪽 응답은 loaded:false/fail이다. 이는 readonly p 조건 관측이며 실제 Orca 작업자 자체 지문 계산/오류 행동 전체로 확대하지 않는다.
- 임시 fixture의 알려진 구성원 원본을 잠시 제거한 named verify는 양쪽 모두 호출 없이 fail/종료1이고 바이트 동일하게 복원했다. `--all`은 현재 존재하는 원본 목록만 보므로 사라진 구성원 목록을 기억하지 않는다. legacy는 실제 양쪽 호출 뒤 확인 필요/종료2이고 원본 무수정이다. native 변조는 prompt 경로에서 해당 없음과 이유를 기록한다.
- 모델을 호출하는 제품 권한은 확대하지 않았다. 실험 전용 접근 제한과 JSON 사건 수집 adapter는 제품 코드가 아니다. 브라우저 경로 변경이 없어 Orca 브라우저 E2E는 기존 규칙대로 제외했다. 비교 대상 두 실제 저장소는 팀 원본 유무만 읽었고 도입은 T08에 남겼다.

## 리뷰

- 사전 R1~R6 원문과 각 TASK 해시는 PRE-REVIEW.json에 보존했다. R3 blocking1은 같은 적재 경로/책임 고지를 소스와 대조해 해결했고 R4~R6 pass/blocking0다. 상세 should_fix와 승인된 (b) 보완 방식은 [사전 응답](evidence/pre-review-response.md)에 남겼다. 원 TASK 해시를 소급 수정하지 않았다.
- 구현 R1: reviewer pass/blocking0, tester pass/blocking0. 공유 기본 표지의 약한 구분력을 반영하고 원본·현재 코드·prefix 결합 단언과 임시 자료 사본을 보강했다. 최종 R2: reviewer pass/blocking0, 같은 tester 보완 pass/blocking0/should_fix0; 최종 두 작업 문서 대조 모두 pass/blocking0다.
- reviewer 2단계는 같은 Anthropic의 다른 새 맥락에 첫 판단을 전달한 것이며 동일 세션이나 새 블라인드 검토로 주장하지 않는다. tester는 같은 최초 세션을 재개했다. 작성 Codex/OpenAI와 검토 Claude/Anthropic는 다른 제공자다. 자동 맥락·직접 열람·실행 한계는 원문에 공개했다.
- 최종 reviewer SF1은 위임 main의 생성 전용 동등성 확인과 두 최종 증거 연결로 처리했다. SF2는 SECURITY에 패턴 검사 뒤 응답 원문이 버전 관리되며 local-only는 gitignore로 선택함을 명시했다. TEAM의 결과 보존 정책과 일치한다. 패턴 탐지가 모든 민감 정보를 찾아낸다는 보장은 없다.
- tester SF1은 최종 unique 근거 연결, SF2는 Claude의 실제 도구 권한 오류라는 표현으로 처리했다. marker 전부 누락과 의역은 같은 확인 필요 상태지만 이유·missing 배열을 구분하며 의미 판정 제외 계약을 유지한다.
- 교본: TypeScript/verification/security — 외부 JSON 필드 타입·크기/UTF-8/비밀/파일 경계, shell 없는 실행 인자, 독립 무작위 canary·음성 대조·실제 호스트와 결정적 평가 분리. note의 부정 정체성 의미 판정·표지 조사 경계·TOCTOU는 공개한 어휘 검사의 한계다.

## 남긴 것

- T05 공유 자원 잠금, T09 소통 계약, T06 지표·회고, T07 팀 설계, T08 실제 도입은 별도 계약이다. 이 태스크로 팀 운영 효과나 직렬화를 증명하지 않는다.
- T08에서 새 기본 생성 원본의 실제 호출·Orca 작업자 자체 지문/읽기 실패·일반 템플릿 인계·Windows CRLF를 확인한다. 최종 코드 신규 정상 호출 미실행 및 creator live 미관측 한계를 유지한다.
- 결과 JSON은 버전 관리하는 근거다. 로컬 전용 사용자는 `.gitignore`로 정한다. 비밀 필터는 패턴 수준이며 사용자 데이터 전체 감사는 아니다. push·설치·배포·병합·실제 저장소 삭제는 하지 않았다.
