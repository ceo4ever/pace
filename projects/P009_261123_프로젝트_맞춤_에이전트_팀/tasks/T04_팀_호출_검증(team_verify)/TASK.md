# T04 팀 호출 검증(team verify)

- 프로젝트: [P009](../../PROJECT.md) · 백로그: [BR04](../../../../backlogs/BL261123_01_프로젝트_맞춤_에이전트_팀/BR04_팀_호출_검증(team_verify).md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

BR04/P-2에 따라 실제 역할 적재를 빠르게 점검한다. T03과 같은 원본 읽기 지시를 재사용하고 기대 답을 넣지 않은 고정 질문을 원본 표지와 대조한다. 미적재를 통과시키지 않으며 의미가 모호하면 사람이 확인한다.

## 재료

BR04, T03 TASK-CLOSE의 보류·일반화·CRLF 후속, src/team/{model,store,worker-role}.ts, src/agent/{contract,p-executor,process}.ts, src/cli.ts, TEAM·AGENT-CALL·SECURITY·TESTING, TypeScript/verification 교본. Mac sandbox-exec의 제어 원본 읽기 거부·대조 파일 읽기 성공은 evidence/sandbox-capability.json이다.

## 증명 범위

- 판정 주체: 구조·문자열·CLI·파일 안전은 자동 시험, 실제 두 호스트의 적재/미적재/삭제는 PM과 독립 tester/reviewer가 실행·출력·격리 증거로 대조한다. 의미 동등성은 자동 승인하지 않고 확인 필요로 남긴다.
- 포함: 같은 적재 지시·tier, 기대 답 없는 질문, 표지 대조·3상태 판정·저장, 세 명×두 호스트 정상 및 실제 접근 차단 음성 대조, 모든 실제 시도·비밀/쓰기 안전.
- 범위 밖: 업무 품질/지속 효과(T06/T08), 새로운 위임의 일반 보류(T08), native 선택/변조(원본 prompt라 해당 없음), OS 읽기 제한 제품화(실험 조건이며 역할의 권한 집행 주장이 아님). Windows CRLF 실제 오보류는 기존 이슈로 넘기고 정규화 시험·관측 한계를 유지한다. 경로/비밀/파일 안전은 제외하지 않는다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `pace team verify <이름> 또는 --all [--agent claude 또는 codex]`가 T03 roleInstruction 및 host tier 설정으로 적재한 뒤 누구·맡는 일·하지 않는 일·막힘의 네 고정 질문을 한다. agent 생략은 두 호스트다. 이름/--all 중복·누락/잘못된 host는 호출 전 거부한다. 기대 이름·키워드·본문은 질문에 넣지 않는다. |
| T-2 | 원본 이름과 하지 않는 일 bullet 앞 짧은 backtick 키워드를 기대 항목으로 추출한다. 필수 응답·이름·모든 표지가 맞으면 pass, 명백한 다른 정체성/미적재·원본 선검사/host 실패는 fail, 표현·형식·키워드 불명확은 확인 필요다. 키워드 없는 정의는 확인 필요이며 임의 기대 답/의미 판정으로 통과시키지 않는다. |
| T-3 | host·member·prompt 경로·원본 지문·요청 설정과 보고 모델 근거·판정/이유를 표와 `.pace/team/verify/` 고유 JSON에 남긴다. pass만 종료0, fail 있으면1, fail 없이 확인 필요면2다. 원본/생성물/설정은 보존하고 조상 링크·nlink·충돌은 거부한다. 비밀 후보 답·host 오류 원문은 출력/저장하지 않는다. |
| T-4 | 세 명×두 호스트의 실제 정상 응답이 같은 원본·설정·공통 지시로 얻어지고 pass 표로 대조된다. 판정기만 수정한 정상 부분은 아래 사용자 승인에 따라 같은6응답의 결정적 재평가로 대체하며 최종코드 새 정상 호출·실제 CLI 표/JSON/종료를 새로 측정한 것으로 표시하지 않는다. 각 host의 시작 지시 없는 음성은 같은 원본/생성물 접근 불가한 제어 cwd/OS 읽기 거부 조건에서 fail, 임시 원본 삭제는 적재 선검사 fail이다. native 변조는 이유 있는 해당 없음. 모든 실패/거부/재시도·원본/설정 지문·argv·질문·실제 응답·종료를 보존하고 의도와 관측을 구분한다. |
| T-5 | 키워드·확인 필요·한계 문서/템플릿, 관련/전체·비밀 검사와 독립 tester/reviewer 두 단계 blocking0·계약 목표 달성 후 마감한다. 기존 정의는 자동 개정하지 않는다. |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 임시Git/격리홈·fake executor·3명/2host | CLI/API·prompt/args 캡처 | 동일 roleInstruction·tier·기대 답 없는 동일 질문·조합 오류 시 호출0 | test/team-verify.test.ts RED→CLI |
| S-2 | unit | T-2 | 독립 정상/다른이름/누락/의역/과대·키워드 없음 | 평가 | 정상만 pass, 미적재 fail, 모호한 답 확인 필요 | 경계·음성·독립 기대값 |
| S-3 | unit | T-3 | result/source 링크·hardlink·충돌·secret sentinel·host error | 저장/실패 | 외부/원본 불변, 비밀 출력/저장 없음, 고유파일/상태/종료코드 | 실제fs/CLI snapshot |
| S-4 | e2e | T-4 | 임시팀3명·두 실제CLI·제어cwd | 정상all·지시 없는 음성·原本삭제 | 정상3명pass/host(판정기 수정분은 승인된 같은6응답 재평가), 최종판정기의 음성fail/host·지시있음/읽기불가 pass아님·삭제fail/host·native변조N/A | evidence/actual-hosts 原文·argv·sandbox read거부/대조read성공 |
| S-5 | check | T-5 | 최종코드/문서 | full/secret·독립2단계 | 실패0·계약목표달성 | PACE_SKIP_BROWSER_E2E=1 npm run check |

## 접근

1. TASK-only 사전 검토·해시/원장 뒤 PROJECT/BR04/T03 대조 2단계를 회수하고 구현한다. RED는 verify CLI/판정 분기다.
2. src/team/verify.ts에서 기대 항목·고정 질문·평가·저장을 나누고 teamCommand를 async로 연결한다. T03 resolveWorkerRole/roleInstruction을 재사용하고 read-only p-executor를 호출한다. 적재 구역 뒤 네 질문은 JSON identity/duties/dont/blocked 형식과 원본의 짧은 키워드가 있으면 인용하도록만 묻는다. 기대 값은 질문에 넣지 않는다. 단발 p 안에서 지시→원본읽기→질문 순서를 요구하고 실제읽기는 실측한다. Codex p resume 미지원이므로 두 프로세스에 내용을 복제하지 않는다.
3. 하지 않는 일 bullet 첫 backtick 표식(1~32자, 중복·비밀·제어 없음)을 명시적 키워드로 삼는다. 새 템플릿은 기존 금지 의미를 보존한 두 표식을 넣고 기존 원본은 쓰지 않는다. 표식 없는 문단은 확인 필요다. 이름은 경계 포함 대조하고 응답 필수값이 비면 통과시키지 않는다. 의역 동등성/진실성은 자동 보증하지 않는다.
4. 모든 output 조상을 검사하고 일반 단일 링크 파일의 고유 이름을 wx 생성한다. 답은 64KiB 상한·hasSecret 검사 뒤 안전한 것만 저장한다. host 오류는 코드/일반 사유만 남겨 stderr·인증 원문을 노출하지 않는다. request rawDir는 쓰지 않는다. 원본은 지문/표지만 기록하고 본문은 복사하지 않는다.
5. 실제 정상은 임시Git 팀3명에서 source CLI all을 host별 실행한다. 음성은 같은 질문/평가 함수에 roleInstruction 없이 별도 빈 cwd를 쓰고 Mac sandbox-exec가 같은 임시 원본 저장소 전체 읽기를 거부하게 한다. 실제읽기거부·대조파일성공을 증명한다. wrapper는 실험 전용이며 제품 OS 의존성으로 도입하지 않는다. 차단 미확인은 실패/미확인으로 남긴다. 삭제는 임시 원본만 제거한 CLI 선검사 fail 후 복구하며 실사용 데이터는 건드리지 않는다.
6. 독립 기대해시·안전 실패 시험/관련·전체/비밀 검사·tester∥reviewer 첫 판단→작업문서대조·TASK-CLOSE→check→done→커밋. CRLF 실제호스트 및 일반 새 위임 보류는 기존이슈/BR08 후속을 유지한다.

### 실제 첫 정상 호출 뒤 원인 층 보완

첫 정상 호출은 Claude3건 확인 필요, Codex3건 pass다. Claude는 원본을 읽었으나 Read/Grep/Glob만으로 정규화 SHA를 자체 계산할 수 없어 보류했다. 원문·지문·인자·결과는 evidence/actual-hosts에 보존한다. 도구 차이와 지문 검증 책임의 설계 갭이며 결과 변동을 위한 재시도가 아니다.

코디네이터 A 결정(main 판단)에 따라 공통 roleInstruction과 같은 원본을 반드시 읽는 조건을 유지한다. verify 적재 구역에 호출자가 정규화 SHA256을 호출 직전·응답 뒤 직접 대조하고, 읽기 전용 모델 세션에는 자체 셸 검산을 요구하지 않는다고 명시한다. verifyLoadedRole도 호출 직전 원본을 다시 읽어 이미 달라진 파일은 host 미호출 실패, 사후 변경/삭제는 실패다. 읽기 실패의 명시적 보고(적재 구역의 loaded:false)는 질문의 기대 내용 없이 실패로 분리하며, 미적재 대조·키워드/의미 판정 경계는 유지한다. 네 역할 질문에는 기대 답/키워드를 넣지 않는다. tools·권한·native 경로는 추가하지 않는다. 수정 전 원문과 결정을 연결하고 보완 사전 검토 뒤 한 번의 허용된 최종 정상 재실측을 수행한다.

R3 첫 판단의 B1은 [실제 source·BR04 대조](evidence/review-pre3-stage2.json)에서 해소됐다. 기존 공통 지시는 검증 주체나 자체 셸 계산을 명시하지 않고, T03 실제 작업자는 셸을 사용할 수 있었다. 동일성은 공통 roleInstruction prefix와 같은 파일을 실제 읽는 것이며 질문/검증 책임 고지가 같은 전체 프롬프트라는 뜻은 아니다. prefix는 바이트 그대로 유지한다. 별도 고지는 호출자의 책임만 명시하며 모델 적재를 인증하거나 원본 읽기를 대신하지 않는다. 추가 고지·질문에는 실제 구성원 이름·표지·본문을 새로 넣지 않는 시험을 둔다. 고지와 세션 자체 검산 미관측을 보고서·TEAM에 공개한다. loaded:false는 JSON 최상위 선택 필드로 정체성보다 먼저 fail, 없으면 기존 판정, loaded:true만으로는 pass가 아니며 키워드를 계속 요구한다. resolve 뒤 호출 직전 source 변경도 host 호출0으로 실패하는 시험과 가짜 CLI의 확인 필요/종료2/Report·phase=result 시험을 추가한다.

결정 근거: [코디네이터 원문](evidence/coordinator-A-decision.md), PROJECT 결정 메모 및 log.jsonl의 question/answer. 이것은 사용자 승인으로 위장하지 않으며 실제 목표 달성은 아래 승인된 정상 증거 방식과 최종 음성 대조로 판정한다. R3 실패와 차수별 원문은 그대로 보존한다.

### 정상 적재 증거 인정 방식 (사용자 결정 · 코디네이터 전달)

한 번의 허용된 실제 재실측에서 6개 응답은 모두 올바른 이름·원본 표지를 포함했으나, 판정기의 한국어 이름 조사 경계와 단일 fenced JSON 뒤 보충 문장 판독 결함으로 일부 실패/확인 필요가 나왔다. RED 후 두 결정적 판독만 수정했다. 원본·설정·공통 역할 모듈·CLI·정확한 질문/고지/prompt builder와 원래 실제 응답의 지문을 대조한 뒤 같은6응답을 재평가해 전부 pass임을 확인했다. 추가 정상 모델 호출은 0이며 **최종 코드 바이트로 새로운 정상 호출은 실행하지 않았다**.

코디네이터가 전달한 사용자 A 승인에 따라 이 결정적 재평가를 정상 적재 증거로 인정한다. 원래 실패표·원문·당시 source snapshot을 보존하고 새 live 실행으로 표시하지 않는다. [결정 원문](evidence/coordinator-reassessment-decision.md), [재평가와 지문](evidence/actual-hosts/normal-fixed-replay.json), [실행 스크립트](evidence/replay-normal.mjs)가 근거다. 이는 정상 표본 추가/골라내기가 아니며, 미적재·원본 삭제·legacy 대조·전체 검사·독립 최종 검토 기준은 유지한다. 향후 같은 증거 동등성 판단은 사용자가 코디네이터에게 위임했다는 전달을 받았다.

### 사전 검토 상세 보완

- 판정 경계: 잘못된/없는 identity는 fail, 정확한 identity와 누락·0개 키워드는 확인 필요, 비어 있는 duties/dont/blocked 및 JSON 형식 불명확은 확인 필요, 과대·비밀·실행 오류는 fail, 명백한 다른 이름은 fail, 네 필수값·모든 표지 일치만 pass다. 의역·표지 없는 기존 정의는 확인 필요다. 사용 조합 오류는 기존 CLI 관례의 종료2이며 실행 판정과 이유/단계를 구분한다.
- 실측 팀 표지는 매 실행의 무작위 canary로 만들고 질문에는 넣지 않는다. 시작 지시 없는 음성은 표지 적중0도 대조한다. 별도로 지시 있음+읽기 불가 조건을 각 host에서 실행해 pass 아님을 증명한다. parent의 선검사 이후 읽기 실패 상황을 모사하며 실제 도구의 원본 읽기 거부와 답을 보존한다.
- 실제 양성은 같은 정의·설정·공통지시의 host별 첫 all 응답을 대상으로 정상3명 모두 pass여야 하며, 판정기만 수정한 부분은 아래 사용자 승인 방식으로 같은 실제6응답을 재평가한다. 단순 답 변동을 이유로 pass까지 반복하지 않는다. 구체적 코드/환경 결함을 고친 경우에만 최대1회 재실측하며 앞선 실패와 수정 이유·새 지문을 모두 보존한다. 고쳐도 미달이면 마감하지 않고 원인을 올린다.
- 두 실제 적용 저장소는 읽기 전용 목록 확인에서 아직 .pace/team 자체가 없다. 따라서 기존 팀 실사용 호출은 T08 도입 뒤 수행하고 T04에서 그 저장소에 원본/보고서를 만들지 않는다. 기존 T02 템플릿 원본을 임시 저장소에 그대로 둔 실제 호출의 확인 필요 결과로 하위 호환 한계를 확인하며 자동 표지 추가는 하지 않는다.
- 비밀 비저장은 실험 evidence에도 동일 적용한다. 비밀 후보 답/오류는 가림된 상태·사유·시도만 보존하고 원문을 복사하지 않는다. 무해한 응답만 보존하고 최종 secret-scan으로 확인한다. buildChildEnv로 부모 세션 수명/부트를 격리하며 양성/음성의 전역 지침·도구·자동 맥락 한계도 기록한다. 사람 확인 결과의 추후 기록 경로는 도입/회고(T08)로 넘긴다.

### 최종 대조의 출처와 음성 회귀

S-2는 같은 접두의 다른 이름+조사 실패, 복수 JSON/JSON 밖 정체성 진술 확인 필요, 보충문장에만 표지가 있으면 확인 필요를 포함한다. S-3은 phase=result·Report(stdout)인 확인 필요와 stderr·보고서 없음인 사용 오류를 가짜 CLI로 구분한다. 최종 실제 CLI의 정상 출력/종료를 새로 실측한 것으로 확대하지 않는다.

코디네이터의 [위임 범위 A 판단](evidence/coordinator-controls-decision.md)에 따라 Claude는 같은 실제 세션의 control Read 성공·대상 Read error를, Codex는 실제 세션 control cat 성공·미적재 응답과 동일 native readonly profile의 별도 Codex sandbox 원본/alias cat 거부·control cat 성공·쓰기 거부를 결합해 원본 접근 불가를 확인한다. 직접 sandbox 시험은 모델이 실행한 명령/같은세션 실패 이벤트로 표시하지 않는다. 원래 외부 sandbox_apply 초기화 실패·수집기 미확인은 보존한다. native JSON control 모델 출처는 requested이며 실제 보고 모델로 부풀리지 않는다. 이 실험 전용 native profile 대체는 중첩 sandbox 때문에 모든 읽기가 막힌 원인을 고친 것이며 제품/사용자 권한을 바꾸지 않는다. 정상·음성·legacy 모두 최종 판정기와 같은 입력 지문으로 대조한다.
