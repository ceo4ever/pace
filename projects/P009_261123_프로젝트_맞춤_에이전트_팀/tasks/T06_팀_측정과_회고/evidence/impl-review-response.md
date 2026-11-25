# 독립 첫 검토 R1 처분

- blocking1: full 기간 end를 아직 일어나지 않은 merge 시각과 일치시키던 결함. start는 시각 동등 비교, end/closed는 실제 사건에서 도출하도록 수정. 합성 실제 start→finish→merge→stats 시험 추가해 통과. 실제 P009 병합은 하지 않음.
- should_fix2: representative-task 입력 period 없으면 finish가 있어도 closed=false. 완료 영수증 없는 총량 승격을 차단하고 회귀 시험 추가.
- should_fix3: sampleCount 신고로 N을 늘릴 수 없게 samples 묶음의 명시 비중복·비중첩 구간 수에서 도출. 조건/저장소 혼합·같은 구간 복제 거부. 단일 sampleCount99도 unknown. 신고 기록 자체의 실제성/인과 효과는 인증하지 않음.
- should_fix4: 닫힘 없는 옛 기간을 closed=false로 읽고 단일 기준선은 항상 low-N unknown. legacy 수신 의도는 도달로 승격하지 않음. 현재 snapshot counts의 신고/증명 경계는 docs의 현장 감사 대상으로 유지. metadata만으로 사람 인증/완전성을 주장하지 않음.
- should_fix5: 회고 관문은 TASK·BR06의 고정 링크/typed 필드/근거/1~3 또는 무변경 이유 계약. 실제 후보의 의미·반복 지적 감사·수정 승인/적용은 T08/BR07 인터뷰이며 단순 개수 맞추기 강제는 넣지 않음. 형식 통과를 실제 회고 효과라고 보고하지 않음.
- note6: repository는 T01 v1와 같은 저장소 경로 식별자이며 실제 clone 이동 시 미확인으로 보수 처리. 안정 저장소 ID 도입은 별도 개선이고 현재 효과나 호환성을 과장하지 않음.
- note7: ISO 문자열 대신 같은 순간 비교로 수정.
- note8: 주석 표지와 활성 표지 병존은 파서가 주석을 제외하며 동작상 문제 없음. 변경을 최소화해 유지.
- 원문 R1과 최초 시험 실패는 보존. 첫 독립 판단은 계약 노출 전이며 별도 두 번째 호출에서 계약 대조 수행 중.

## tester 첫 판단 후 보완

- 실제11시험 통과·직접 반례 실행은 도구 제한으로 미수행, 정적 B1을 반환함. 전3×5=15/후2×6=12 반례를 PM이 새 회귀 시험으로 실행. N 불일치면 unknown과 이유를 표시하도록 수정.
- 전후 같은/겹치는 구간은unknown, 묶음 안 공유 경계도 거부. 비교 annotation은 legacy 원본에만 허용.
- 대표 업무 비교의 completionRef 누락은 closed=false, 존재하면 typed 영수증을 대조.
- event-log라도 감사 재검토 수 미수집이면 unknown인 보수성을 문서에 명시. 로그 실패를 감사 재검토로 추정하지 않음.
- 역할 start 검증 시험이 마지막 decision 행을 start로 잘못 읽은 fixture assertion 오류를 기록 후 실제 start 행으로 한정해 수정, 단독 통과. 제품의 start 버전 기록은 정상.

## R2 잔여 목표 지적의 추가 해소

R2가 blocking0/pass이면서 목표 미달로 남긴 두 should_fix도 보완했다. 수기 full closed도 비교 때 typed 완료 영수증이 없으면 미완료로 낮춘다. 새 참여 finish는 현재 dashboard의 미사용 후보 역할과 gate/review 반복 개선 후보를 회고 JSON에 모두 언급하고 현재 횟수와 대조한다. 실제 원인·수정 의미/승인은 자동 판정하지 않는다. 입력 안전/범위 오류도 finish 앞부분에서 보류한다. 각 반례를 회귀 시험으로 추가했다. 이 보완은 같은 회고/비교 장치 범위의 구현 선택이며 실제 도입 효과·스킬 적용 T08을 당겨 완료했다고 하지 않는다.

## 최종 tester19 pass의 남은 문구 보완

최종 tester는19시험을 직접 실행해 blocking0·장치/출력 계약 목표 달성을 판정했다. sourceCLI 실제후보 보류→보완→finish는 단위 helper 후보시험이 아니라 같은 파일의 sourceCLI stats→비교→METRICS→회고→finish 시험 본문에 있으며 PM19/전체 검사가 실행했다. tester가 본문을 직접 정독하지 않은 범위는 그대로 보존한다. gate 실패 시도도 count에 들어가므로 실패 후stats 재조회·회고 count 갱신이 필요하고 count는 정확히 같아야 함을 문서에 명시했다. 완료 영수증의 비교JSON 폴더 기준도 해당문서에 있다. 이 마지막 보완은 문구뿐이며 runtime/test는 바꾸지 않았다.

## R3 잔여 SF1/SF2·marker 위치 보완

요청 수집 범위 확인 request_coverage를 추가해 기록 없음은 관측0/총량null로 분리했다. 완료 영수증의 ISO 시작/끝/단위와 표본을 대조해 다른 구간 재사용을 unknown으로 내린다. 기간/비교 단위 혼합도 거부한다. 실제 sourceCLI stats4개를 동일 reported 범위로 비교하는 합성 positive와 모든 음성 시험이22개 통과했다. marker를 파일끝에 붙이면 후속 결정 행이 표에서 갈라지는 문제를 PM이 실제 P009 문서에서 확인해 header 활성화로 수정하고 회귀시험을 추가했다. P009 marker도 머리로 옮겨 결정표를 복구했다.

whole-r3는 agent-p 기존 강제종료 회수시험1건만 실패했다(1162/1144pass/17skip/1fail). 이름 한정 동일 코드진단은약0.5초pass, 관련제품/시험은변경하지않았고원인미확인 이슈로남겼다. 이후구현변경 때문에최종전체검사를새로실행한다. 세번연속동일실패가아니다.

## R4 blocking B1 보완

R4는 확인된 coordinator 자체 처리 요청까지 원장 unconfirmed에 남아 전체 요청 total을 영구null로 만드는 비교능력 결함을 지적했다. BR01 원장4분류/legacy 기준선 자체는 바꾸지 않고, 명시 확인된 자체답(동일요청 coordinator answer·캡틴도달 없음·다른 확인자complete)만 별도 비교미해결 comparisonUnconfirmed에서 대조한다. 닫힌 전체 request_coverage 확인이 있어야 캡틴 신고총량을 내므로 단순 forwarded answer/미수집은 여전히null이다. 실제sourceCLI의 전캡틴답1→후코디네이터처리1·캡틴0을4개스냅샷으로 비교하는 합성 양성/확인없는답 음성을 시험했다. 원문/보고자 인증이나 과거기준선 소급재분류를 주장하지 않는다.

독립수기v1/stats-선언신고/혼합신고 입력 출처를 구별해 S1의 근거수준을 노출했다. 절대경로v1저장소식별과 다른clone 미확인 한계는 문서/남긴위험으로 유지한다. 프로젝트전체 반복지적과 측정구간 미사용역할의 서로 다른 범위도 명시했다. Markdown 표 행에 빈줄이 끼던 출력은 연결행으로 고치고 실제METRICS/비교출력의 header-separator 인접성 회귀를 추가했다.

## R5 B2 및 S3 보완

own 신고를 원장/로그의 반대 신호가 덮어쓰지 못하게, 같은요청의 by:user답(ref없음포함)·to:captain Q/E·cap decision_request/relay·cap 경로 모든 전달phase가 있으면 자체답대조에서 제외했다. 확인 및 refs 영수증의requestId도요청에결합했다. 열린범위/전체수집확인없음에서는비교미해결을줄이지않는다. 일곱 요청의 sourceCLI 합성에서plain1만own, 나머지는캡틴답1 또는미해결5가되고 원장unconfirmed6은유지됨을새시험으로검증했다.

whole-r4는기존team-lock손자생존재획득시험1건만기대1/실제2로실패(1165/1147pass/17skip/1fail). 활성잠금/그룹생존확인은통과했고재획득은보류되었다. 같은코드단독은약0.9초pass,원인미확인이슈보존. 검사중review보완으로source도바뀌어최종후보증거가아님을별도scope영수증에명시했다. 최종은허용된전체check의명시동시성2로모든시험을돌려OS프로세스관측중첩을줄이며검사/skip를축소하지않는다.

## R6 최종 첫 판단 후 경미 지적

R6은blocking0/pass·장치/출력목표달성을판정했다. tester R6도23개직접pass했다. 남은S4를반영해반대신호의신뢰대조는같은요청의전체기록을보고, 기간밖답은과거도달수에더하지않되독립처리의확신만철회한다. 수신미상질문도own에서빼고, confirmation/ref각각만틀린비대칭·열린기간/전체coveragepartial분기도직접단언한다. 최신24시험으로최종계약대조/전체검사를수행한다. R6자체에는새source가모두포함됐다고하지않는다.

## 최종 계약 대조 및 작은 잔여 보완

새제공자맥락reviewer는R6첫판단을읽은뒤실제PROJECT/TASK/BR을대조해blocking0/should_fix0·목표달성·계약축소없음을판정했다. 직접tester도24시험pass/장치목표달성을확인했다. 문서의confirmationRef와refs조건은둘다필수라고명확화했다. 관측own의열린기간값은total이아닌reported관측이며captain_input은초기지시일수있어질문답으로자동승격하지않는경계를유지한다.

PM은수신의도카운터가logQ/E만보면원장만의decision_request를누락함을확인해동일IDunion으로보완했다. 기존질문사건/FIFO/BR01도달분류는그대로이며기존시험에원장captain의도3을추가했다. 같은직접reviewer/tester세션에작은delta최종확인을요청했다.

## 코디네이터 해석과 공식 현재대상 검토

main은①진행을지시하면서이구현후태스크에는reviewer.md:29의같은제공자새세션대체를적용하며cross-verify의큰산출물사용자동의규칙을새승인조건으로삼지말라고명확히했다. 불필요한추가승인해석은정정하고원래질문/답요약을보존한다. 실제createPExecutor(codexP)하나만동일verifyCommand에주입해같은impl-diff.patch/원장의현재전체artifact를읽기전용새맥락으로검토중이다. --allow-same-provider/crossfalse이며mock/새경로/가짜다른제공자가아니다. 제품소스/목적/PRE는바꾸지않았다.

## 공식 현재대상 R7(OpenAI/crossfalse) fail5·should_fix2

R7은원문을새로검토하고현행함수의메모리fixture로5차단을재현했다. 원문/고유R7기록/해시/실제제공자범위를보존하며기존R6pass로덮지않는다. 조치는합의된T06증명범위안의설계/구현갭인PM경로이며목적/범위/PRE를축소하지않는다.

- B1: 팀projection의by:user ref는typed영수증+동일requestId를요구. collectHandoffs의기본옛predicate/4분류는그대로두고팀collector에만추가증거predicate와검증한eventSnapshot을공급한다. 무관한PROJECT파일은팀미확인,옛handoffs보고는원래값을유지한다.
- B2: 요청/손작업/감사품질의총량및own을비교미해결에서빼는확인근거는confirmationRef와refs중하나의period.start/end/unit이최종구간과같아야한다. 다른구간/merge전짧은범위의확인을연장된전체범위에재사용하지않는다.
- B3: 새팀의eventJSONL은엄격UTF8/중복키/필드/validateEvent로검사하고손상/미지원은stats2/noJSON·finish보류. 옛readEvents/FIFO는그대로. 파일부재는별도미수집상태로관측하한만내며도달/로그품질총량을확정하지않는다. 빈파일은명시빈수집이고확인범위가있을때만0총량가능.
- B4: 각비교표본의observed_counts가해당nonnull counts보다큰모순을합산전에거부한다.
- B5: fenced/HTML/comment안의예시를제외하고실제3열header+separator뒤의팀행만인정. 단순bare행/코드예시로통과하지않는다.
- SF6: 역할관측이름유효성은전체이력,미사용후보는현재구간의start와참여선언으로구분한다.
- SF7: 팀적용여부를먼저기존PROJECT읽기조건으로확인하고새경로단일링크제약은팀맥락에서만적용한다. 팀없는하드링크PROJECT의stats/회고비적용을보존한다.

새7반례RED는7실패였으며그중손상로그fixture는미생성log를읽는fixture오류도포함했다. 독립R7의실제손상행재현은원문에보존된다. 첫수정실행6실패는미수집로그를손상과같이전면거부한조기구현과미생성fixture차이였다. 파일부재는unknown·손상은error로구분하고명시빈수집fixture를수정한뒤기존24+새7=31/31pass했다. 이전고정전체1167pass는R6후보의증거로만유지하고새후보에서독립두단계/전체검사를다시한다.

## R8 공식 재검토 fail2·SF1 및 새tester 첫판단 fail2·SF2

공식R8은요청/기간검사의각기다른refs·중복신고결합과comment전처리로fence를가짜닫는2차단을재현했다. 독립freshtester는33/33과기존26회귀를직접통과시켰지만분산근거와data없는review행이품질0으로되어개선판정되는2차단을별도실제CLI로재현했다. 원문/모델/교차아님과이전pass범위를구별해보존한다.

- 동일영수증 predicate에requestId와period를동시에적용한다. 같은신고행에서confirmationRef와최소1refs가각각두조건을모두충족한경우만trustedOwn에넣고,타행find/독립some조건을조합하지않는다. 쪼갠refs/쪼갠중복행은미확인,한완전한행이있으면중복제거한1개만인정하는실제CLI음/양성을추가했다.
- fence안의원문은comment처리전에닫힘을판별한다. 밖의comment라인은구조를바꿔strip하지않고opaque로유지해코드줄의comment가닫는fence로변하지않는다. 단일/여러줄comment반례와정상독립comment뒤실제표양성으로고정했다.
- 로그미수집의blocking/reviewfail/gate값을null로보존해비교의alias재계산도0으로되살리지않는다. 리뷰수치/판정필드가불완전하면팀로그품질을unknown으로내리고자유문구에서0을추론하지않는다.기존base읽기/개선후보는유지한다.
- 역할숫자는현재period결합refs가있을때reported로보이고과거기간refs만있으면null/이유를낸다. 이름검증용전체이력과현재사용판단구간은구분한다.
- marker는PROJECT머리의실제필드만읽고fence/comment/본문예시를무시한다. adopt는실제머리에active필드를삽입해본문placeholder를실수로활성화하지않고version-start우회방지는유지한다.

새반례RED3+추가tester RED3를각각실제실패후수정했고39집중시험후보를검증한다.이전1167전체pass는여전히옛후보이므로새고정후보의전체검사를별도로수행한다.목적/범위/PRE/원장4분류는축소하지않는다.

## R9 diagnosis and owner decision

R9 fail2/SF1 triggered diagnosis immediately on consecutive fail3; post-r9-design-diagnosis.md and the same target ledger preserve the action. Shared teamMarkdown now keeps section boundaries and excludes inline comment examples/fenced/HTML blocks. Independent stage2 fail4/SF1 is addressed by ordering, review consistency, answer causality and period-bound unused-role evidence. Owner naming follows the relayed user decision; user actors remain unchanged and T01 immutable baseline keys are adapted only on legacy input. Previous full1182/1164pass/17skip/1daemon-port failure is not the final current check. New focused42 and related78 pass; fresh verification pending.

## R10/독립 stage3 처리

공식 R10 fail5/SF2 뒤 PM 분류·근본 조치 결정(post-r10-pm-decision.md)을 같은 원장에 기록했다. 사용자 명시 owner/no-compat 조건은 다음 첫판단의 독립 상위 목적에 전달해 재판정받으며 기존 실패는 무효/waiver로 바꾸지 않는다. 사용자 답/전달의 시각, 별도 기간 결합 log_coverage, 미래 비교 거부, 들여쓴/Setext 절 경계를 보완하고 final rebase/check 뒤 회고를 현재 후보로 재대조한다. 현재 역할 관측/참여와 observed-none 충돌도 거부한다. 별도 tester stage3의 HTML 속성 주석 결함은 raw HTML block과 속성을 먼저 구별하는 공유 구조 처리로 해결한다. 미완성 코드/주석 혼합은 보수적 보류이며 전체 Markdown 인증을 주장하지 않는다. 집중45pass; 이전78 관련은 owner 변경 후보 범위로 남기고 현재 관련/전체/독립 결과는 다시 회수한다.

## R11과 독립 stage4 반례 대응

R11 fail5/SF2와 별도 tester stage4 fail3/SF0을 보존했다. 합의 범위 안의 구현 갭으로 분류하고 목적/PRE를 유지했다. 팀 projection은 고아 answer/delivery를 미확인으로 남기고 요청 전 status 전송을 질문 도달로 쓰지 않는다. review_failures를 snapshot과 품질 가드로 전달하고 리뷰 수치는 정수 token을 정확히 한 번 검증하며 gate의 msg/data/ok 모순도 unknown으로 둔다. PI/CDATA/선언 HTML을 가리고 닫는 # 앞 공백을 요구한다. 기존 유효 책임 문단은 호칭만 정규화해 읽으며 이전 actor/JSON 호환은 추가하지 않는다. active marker 후보가 없는 옛 프로젝트는 새 Markdown 검사를 하지 않는다. 독립 검토 원문의 실제 재현을 RED 근거로 유지하고 새62시험(측정48+team14)이 통과했다. 추가 fixture 최초 실행에는 status의 허용 밖 필드와 sent receipt의 hash 누락이 있어 제품 결함의 RED와 구별한다. 현재 R12와 독립 stage5를 회수 중이다.

## R12 / tester stage5 처리

R12 fail3/SF1와 별도 tester stage5 fail3/SF0은 ID 없는 답의 early-return/재집계 누락, Setext 제목·inline 주석 marker, 실패 요청 시도의 조건 분리와 gate 여러 명령 키를 재현했다. 요청 미확인과 실패 시도를 handoff 집계의 같은 결과로 재사용하며, 같은 범위의 request 이전/무관 status 시도는 요청 실패로 더하지 않는다. ID 없는 답도 원장 유무와 무관하게 미확인으로 보존한다. bare underline 경계와 활성 표지의 inline comment를 처리하고 구두점 정수 표기만 정규화해 소수/지수/음수/중복 거부를 유지했다. gate는 하나의 올바른 명령 키만 허용해 다른 명령 수치의 모순을 unknown으로 둔다. 현재 집중51+team14=65pass이며 같은 타깃 R13과 별도 tester stage6를 회수한다.

비밀 검사2건은 숫자 파서의 지역변수 이름 token에 대한 코드 표현식 오탐이었다. 실제 자격증명은 없으며 countText로 이름을 바꾸고 탐지기/예외는 바꾸지 않았다. 이전 raw patch는 차수 gzip/리뷰 원문에 정확히 보존하고 현재 patch를 갱신해 다시 검사한다.

## R13 진단 뒤 근본 조치

공식R13 fail1/SF1/노트1은 추가 들여쓰기 허용으로 생긴 하위 목록 표지 회귀와 agent 수신확인의 과잉 unknown, Setext 접두사 예외를 기록했다. 별도 tester stage6 fail1/SF1은 들여쓴 코드의 주석 기호로 표지/절이 가려지는 실제 CLI 반례를 냈다. 세 번째 fail 즉시 post-r13-design-diagnosis.md와 같은 원장에 design 진단을 기록했다.

임의 들여쓴 표지 수용을 제거하고 원래 최상위 열0 필드를 유지한다. 실제4칸/탭 코드 블록은 경계에서 opaque 처리한다. 새 회고의 기계 표 구간은 원래 템플릿 ATX/3열 계약을 사용하며 Setext/가로선은 추측 변환하지 않고 입력 오류로 안내한다. 일반 표 뒤 HR 지원 확장은 남은 should_fix로 명시하며 새 필수 구간의 형식을 ATX/빈 줄로 정리해야 한다. 기존 팀 없는 프로젝트에는 이 회고 형식을 소급하지 않는다. by:user의 미연결 답은 보존하고 agent 수신확인/에이전트 전송을 사용자 요청 누락으로 바꾸지 않는다.

기존 책임 문단의 줄/문단 사이로 호칭이 갈린 추가 회귀를 PM이 직접 RED 재현하고 공백 결합 뒤 의미를 정규화하도록 고쳤다. 필수 책임 약화 거부는 유지한다. 현재 측정54+team14=68pass, 타입검사 pass이며 같은 대상의 진단 뒤 전체 첫판단 R14와 독립 tester stage7을 회수한다. 원문/지문/실패 이력을 보존하고 목표·PRE를 축소하지 않는다.

비밀 오탐이 과거R12 JSON의 코드 snapshot에서도 발견돼, 정확한 원본 bytes는 gzip에 보존하고 JSON 문자 escape만 바꿔 모든 decoded 값이 동일함을 검증했다. secret-json-serialization-R12.json에 지문/동일성을 남겼으며 실제 비밀을 감추거나 탐지기 예외를 늘린 것이 아니다.

## R14 PM 결정과 수정

공식R14 fail3/SF1과 tester stage7 fail2/SF1을 회수하고 post-r14-pm-decision.md를 같은 원장에 PM 결정으로 기록했다. 팀 전체 종료는 기존Git근사와 분리하여 실제 cli 성공 start/merge를 사용하고, should_fix 합도 독립 품질 가드로 전달한다. 등급명 자체의 등장 수로 값 없는 중복을 거부한다. 탭을4열로 계산하고 thematic 구분선 뒤 코드도 opaque 처리한다. block comment의 종료 줄과 계속 inline comment 행에서 문서 구조를 새로 만들지 않는다. 원문 경로 금지는 정규화된 scheme/구분자로 검사한다. 실제 데이터나 비밀을 옮기지 않고 기존 금지 입력의 검출을 보완했다.

회고의 제한된 ATX/3열 기계 구간은 독립 tester가 BR06/07 목표를 충족할 수 있다고 판정했다. 밑줄/구분선 전용 행의 금지를 일관되게 적용하며 보통 본문 전체에 소급하지 않는다. 현재 측정58+team14=72pass·타입pass이고 같은 대상의 결정 뒤 전체목표검토 R15와 별도 tester stage8을 회수한다. 이전 결과/진단/실패/스냅샷을 보존하고 현재 전체 검사는 아직 수행 전이다.

## R15 및 독립 tester stage8 대응

감사 기준 선택이 raw 로그 품질을 숨기지 않도록 blocking 양 축을 대조하고 부분 감사도 수집 사실을 유지했다. native 성공 종료가 시작보다 이르면 입력 부재에서도 오류로 보류한다. HTML block 시작 종류/끝과 complete inline 태그를 구별하고 inline 문단 주석이 새 블록을 삼키지 않도록 했다. 소속이 불확실한 독립 generic 태그는 회고 기계 구간을 끊으며 일반 텍스트로 안내한다. 기존 소통 요약에는 상태 전송 포함 가능성과 팀 측정과의 비합산 경계를 명시했다. 실제 전후/누락 품질·역전 구간·span/문단 주석·정상 표 대조군을 추가했다. 새 구간 시험 첫 실행은 팀 채택 누락으로 74/75였으며 채택한 fixture로 바로잡았다. 제품 수정 후 전체/독립 검토 결과는 별도 원문으로 회수하며 이전 pass를 대체하지 않는다.

## R16 재검토

공식 R16은 fail1/SF0이며 R15 품질 양 축과 inline span, 소통 집계 경계 문구는 해소를 확인했다. 새 block tag 접미사 판별의 `/` 단독 허용이 `<div/foo>`에서 다음 실제 절을 숨겼다. PM도 별도 현재 함수 대조로 같은 gap을 확인했다. 합의 목적·범위·데이터/외부 영향 없이 HTML 시작 구분자 검출력을 보완하는 PM 구현 결정이다. 현재 tester stage9와 전체 실행이 끝날 때까지 candidate-r16.json 후보를 보존하고 후속 수정은 새 후보로 검증한다.

## R16 follow-up candidate

Independent stage9 fail1/SF1 reproduced invented ATX from inline comment removal in real finish and stats. Block markers must exist in source before inline projection. Added positive spaced-ATX and negative invented-boundary controls. R16 malformed slash suffix now requires exact />. Empty-list dash remains unsupported canonical input, but warning accurately names empty lists rather than claiming all symbolic rows are thematic breaks. These are PM gap fixes within the agreed goal/scope, with no user-data/external effects. Initial regexp escape typo was caught by typecheck and corrected before validation. Prior full1205/1188pass/17skip remains R16 historical evidence.

## R17 stage2 and tester stage10 root fix

Formal R17 first-stage pass0/SF0 was followed by contract fail2/SF1 and tester fail2/SF0. Preserve both, not a final pass. See post-stage10-structure-diagnosis.md for pre-edit impact classification and root design. Canonical source block boundaries and escape-aware table grouping replace invented root headings/columns; malformed JSON scalar coercion is rejected only in strict team reader. Scheme-agnostic slash paths in versioned receipt metadata are rejected per opaque-ID contract. The actual synthetic role worktree flow closes the integrated S7 observation gap. Original criteria and PRE hashes remain unchanged. New test initially asserted the wrong JSON field total instead of linked; changed the assertion to the actual public linked field and reran, preserving failed output.

## R18 first-stage and independent stage11

R18 fail3/SF2 is the first full fail after pass/change, not an open diagnose. See post-r18-measurement-decision.md for pre-edit classification: strict Team preserves missing-proof human answers as unknown despite failed attempts; quality sample vectors and collection-origin equivalence are not inferred from equal totals/completion receipts. Uniform same-origin positive controls remain. Stage11 fail2/SF0 found noncanonical wider tables with missing edges/short separators; consume every contiguous source pipe-row run once, not only successfully parsed tables. Plain summary excludes HTML/comments/entities, preventing hidden-only content; restore adjacent grade punctuation while rejecting malformed numeric counts. Synthetic role worktree S7 was independently observed by stage11. Prior current full1209/1192pass/17skip is R18 historical evidence; do not claim final pass.

## R19 first-stage pass0/SF1

All three R18 blockers and prior two SF repros resolved in actual independent probes. Remaining SF: HTML-summary guard also rejects A<B and angle-bracket Markdown destinations. Retain as a validator precision limitation, not a safety waiver; use A < B with spacing or normal [label](https://...) link syntax. The canonical template remains usable. Empty-label Markdown link was noted as pre-existing, not a new R19 verdict item; independent contract/tester still must assess the complete T06 goal. Do not mark task complete from R19 first-stage pass alone. Separate contract19 and tester stage12 are pending.

## R19 contract + independent stage12

Contract19 fail1/SF2 and tester12 fail1/SF1 prevent task closure despite first-stage pass. See post-stage12-text-diagnosis.md for pre-edit/root classification. Shared header/link-label/summary usable-text predicate rejects empty links, invisible controls, inline comments/code, HTML/entities; complete tag boundaries retain A<B and named angle URL links. Structural Markdown whitespace is ASCII, including fence closing, blank HTML/block boundaries, metadata ATX and table trims. Add direct negative and positive controls, preserve fixed JSON/owner/legacy boundaries, and revalidate the entire goal after changed pass candidate.

## R20 full + independent stage13

R20 first full fail3/SF0 and tester13 fail2/SF0 remain actual failed verdicts. See post-r20-boundary-diagnosis.md for before-edit PM classification. Separate request-root cohort from period observations; outside-root in-period activity creates explicit boundary unknown in linked/unconfirmed and blocks total/direction. Period roles, failed request attempts, kinds and agents use actual period rows. Raw legacy report unchanged. Walk explicit Markdown LF lines with whole-heading equality rather than JS multiline anchors; default-ignorables and BRAILLE PATTERN BLANK do not establish visible cell text. Actual focused88 passes including false improvement, current role participation/observed-none rejection, Unicode fake headings and visible text controls. Initial new test unit type was widened; typecheck caught it and as-const fixed the annotation before final candidate.

## R21 and independent stage14

R21 fail1/SF1 confirmed all prior three blockers resolved but found lone-CR section splitting; tester14 fail1/SF1 found link-wrapped filler labels borrowing destination ink. Root decisions in post-r21-line-and-link-decision.md: normalize only projection line endings, validate each link-label ink, condition boundary hold text on nonzero count. Actual focused90 passes with original-byte preservation, CR/CRLF/LF negatives/positives, wrapped filler controls and visible links. Numerical cohort/period changes are unchanged from independently verified stage14. Current rechecks must assess the whole T06 goal; no final pass claimed yet.

## R22 first-stage pass0/SF1

CR/CRLF/LF repro and zero-boundary text inconsistency resolved. Retain SF with reason: escaped literal filler-link examples are conservatively rejected by canonical label inspection. Use ordinary descriptive text for actual retrospective summaries; this is a precision/usability expansion, not hidden empty evidence acceptance or a security waiver. Do not claim a general Markdown renderer. Independent tester15 and final contract22 still must judge complete goal; current whole is running and will be sealed against candidate-r22.json. No task done from first-stage pass alone.

## R22 first pass followed by independent stage15 fail

Formal R22 pass0/SF1 did not close the goal: stage15 fail1/SF1 reproduced escaped-literal and quoted-title false rejection. Replace raw label searching with bounded escape-aware bracket/destination/title projection, validating actual label ink. Actual visible ordinary text/title controls stay valid; actual empty labels, images, unclosed/deep constructs and presented HTML remain held. PI/declaration/CDATA presentation is covered as HTML, with escaped literal controls. Whole-CR generic close section validation is a retained pre-existing broader harness limitation, explicitly distinguished from safe Team row projection. Current focused91 pass includes known failures and positives; prior whole1220/1203pass/17skip belongs to candidate22. New candidate23 still needs independent/current whole judgment. See post-stage15-link-lexer-decision.md for impact classification before edits.
