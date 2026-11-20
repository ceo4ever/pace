# P005 T02 독립 reviewer 2단계 대조

## 받은 범위와 읽은 범위
- **받은 것:** 이번 메시지에 실린 TASK, PROJECT, BR02, reviewer 역할 기준, PRE-REVIEW.json, live-observations.md, 실행 소스 감사 사본 4개(common, apply, runtime, supervisor), execution-source-hashes.json, local-observer-preflight.json, 저장소 상태, 전체 검사 보류 문구입니다. 1단계에서 받은 JSON 8개를 함께 대조했습니다.
- **하지 않은 것:**
  - 파일 열람·검색, 명령 실행, 해시 재계산을 하지 않았습니다.
  - Bot API 호출이나 운영 재실측도 하지 않았습니다.
  - 다른 세션 호출과 보조 호출(advisor 포함)도 하지 않았고, 상태 변경도 없습니다.
- **받지 못한 것:** 설치본 `adapter.ts`, `index.ts`, `instance.ts` 원문을 받지 못했습니다. 그래서 어댑터의 거절·응답 분기와 runDaemon의 인스턴스 획득 순서는 TASK 재료 서술과 관측에 기대어 판단했습니다.
- **코디네이터가 직접 대조했다고 전한 사항**(그대로 수용): 감사 소스 4개의 해시 일치, TASK 해시가 PRE-REVIEW 마지막 pass·blocking 0과 일치, src/daemon 작업 변경 없음, 단계별 ready와 캡틴 전송 왕복.
- **전체 검사(`npm run check`)는 보류**로 둡니다. 결과를 추정하지 않습니다.

---

## 판정: pass (blocking 0)

**독립 목표 대조: 맞음.**
- 1단계 기록은 "조건부 달성"이었습니다. 한계로 든 것은 실제 제3자가 아닌 런타임 제외, 무응답식 거절, 원문 일치만 검사, 오류 경로 미실행, 토픽 라우팅 불명이었습니다.
- 2단계에서 TASK와 소스로 확인한 결과는 다음과 같습니다.
  - 런타임 제외는 캡틴이 승인한 S-4r 대안이고, 무응답 거절은 TASK가 명시한 제품 사양입니다.
  - 토픽은 General(thread 없음 또는 1)로 한정됐음을 소스로 확인했습니다.
  - 원문 일치만 검사한 점과 오류 경로가 실행되지 않은 점은 한계로 그대로 남습니다.

**목표 달성: 달성(T02 관측 범위), 마감은 보류.**
- T-1~T-3은 실제 관측과 소스로 충족됐습니다.
- S-6의 전체 검사와 비밀 검사 결과가 아직 없어 TASK를 닫을 수 없습니다. 검토 pass가 마감 가능을 뜻하지 않습니다.

---

## 기준별 대조

| | T-1 연결 구성 | T-2 허용 응답 / 불허 거절 | T-3 토큰·식별자 비노출 |
|---|---|---|---|
| 실행 | apply가 소스·폴더·파일 ACL 검사, 봇·포럼·멤버십·webhook 확인, CLI init(stdin)으로 시크릿 저장, allowedUsers 병합, loadConfig 검증, 보존 비교를 수행했습니다. | runtime 세 단계(최초 허용, 불허, 허용 복원)를 각각 별도 프로세스로 실제 수신해 시험했습니다. | API params/응답을 RAM에서 검사했고, 상태·로그·셸 기록·CLI 출력도 검사했습니다(secret-observations). |
| 선택 | 마법사·install·autostart를 배제했고 .env 입력은 캡틴이 지정했습니다. 관리자 조건을 멤버십 조건으로 완화한 것은 main 판단으로 기록돼 있습니다. | 불허 시험에는 승인된 대안(메모리 사본 `allowedUsers.telegram=[]`)을 썼습니다. 무멘션에서 봇 멘션 /status로 바뀐 것은 PROJECT 19:39 메모에 기록돼 있습니다. | 토큰이 들어가는 HTTPS URL은 비노출 주장에서 제외한다고 명시했습니다. |
| 충족 | 충족 | 충족 | 관측 범위 안에서 충족 |
| 검출력 | 각 확인이 실패하면 throw로 중단하므로, 증거의 boolean은 확인을 통과했을 때만 기록됩니다. 설정 보존은 raw에서 telegram 키만 뺀 비교와 device 비교로 확인합니다. | 아래 "불허 대안의 분리력" 참조 | `save()`가 증거 JSON에서 token·chat·user 문자열을 검사하고, 있으면 throw합니다. API 관측은 `JSON.stringify`로 원문 일치를 봅니다. 토큰 문자셋(`[0-9:A-Za-z_-]`)은 JSON 직렬화에서 이스케이프되지 않으므로 이 비교 방식은 유효합니다. |
| 약화 | `topicCreationNotRequired`는 측정값이 아니라 고정 true입니다(근거는 main의 소스 판단). | 송신 판정 범위가 좁습니다(F2). 응답 대상 연결 여부는 검사하지 않았습니다(F3). | 파일 검사 스크립트가 감사 범위 밖입니다(F1). 오류 경로와 인코딩 변형은 검사하지 않았습니다. |

### 불허 대안(런타임 제외)이 실제로 거절을 분리하는가: 분리한다
1. **같은 메시지 조건:** 세 단계 모두 같은 실제 사용자, 같은 chat, General, 같은 명령 형태를 후보 조건으로 씁니다. 단계 사이에 바뀌는 변수는 메모리 사본의 허용 목록 하나뿐입니다.
2. **판정 경로 확인:** connect 래퍼가 `host.isAllowed(...) !== (phase!=='deny')`를 확인하고, 다르면 throw합니다. 그래서 불허 단계에서 실제 판정 함수가 이 사용자를 false로 판정했고 허용 단계에서는 true로 판정했음이 기동 시점에 강제됩니다.
3. **실제 수신 증명:** 후보는 getUpdates 응답에서 직접 잡습니다. 따라서 privacy mode 때문에 메시지가 오지 않은 경우를 거절 성공으로 착각할 수 없습니다. TASK 요구와 맞습니다.
4. **복합 조건으로 통과:**
   - 거절 통계는 ready 시점 기준값 대비 정확히 +1이어야 합니다.
   - ready 이후 같은 chat에 다른 메시지가 오면 혼선(interference)으로 세고, 혼선은 0이어야 합니다. 그래서 다른 발신자가 통계를 올렸을 가능성은 배제됩니다.
   - 이 밖에 새 작업 0, 후보 이후 송신 0이 함께 필요합니다.
5. **대조군:** 앞뒤 허용 단계에서 응답이 나왔으므로, 거절이 봇이나 폴링 고장 때문이 아니라는 대조가 성립합니다.
6. **디스크 무변경:** 운영 config 해시가 세 단계 내내 같았습니다. 승인 조건대로 디스크 권한·설정 변경 없이 시험했다는 증거입니다.
7. **남는 한계:** 실제 다른 계정, 다른 chat, 비멘션 입력은 다루지 않았습니다. adapter 판정이 user id만으로 갈린다는 전제는 adapter 원문 없이 TASK 재료 서술에 기댄 것입니다.

### 응답(reply) 대상 범위
- **송신으로 세는 대상:**
  - 메서드: sendMessage, editMessageText, sendDocument, sendPhoto 4종뿐입니다.
  - 시점: 후보를 받은 뒤의 호출만 셉니다.
  - 대상: `chat_id`가 승인된 그룹인 경우만 셉니다.
- **세지 않는 것:**
  - 개인 DM이나 다른 chat으로 보낸 송신
  - sendChatAction, setMessageReaction, copyMessage/forwardMessage, sendMediaGroup 등 다른 메서드
- **상태 응답 판정:** sendMessage 본문에 `pace-pc`와 `실행`이 함께 있는지로 봅니다. `reply_to_message_id`나 `message_thread_id`가 후보 요청과 맞는지는 확인하지 않습니다.
- **허용 단계는 견고합니다.** 송신이 정확히 1건이고 연결 알림은 ready 전에 이미 끝났으므로, 그 1건이 상태 응답이라는 해석이 성립합니다.
- **불허 단계의 "응답 없음"은 위 4종 메서드와 같은 그룹 chat 범위에서만 증명됩니다.**
- 참고로 불허 단계의 API 호출 수(params 12)가 최초 허용 단계(11)보다 1 많습니다. 관측 창이 더 길어 폴링이 늘었을 가능성이 높지만, 메서드별 집계가 없어 확정할 수 없습니다.

### 토큰 원문 검사 대상과 미검사 범위
- **검사한 것:**
  - 단계별 API params/응답 전부(RAM)
  - telegram init 자식 프로세스의 stdout/stderr
  - daemon의 status.json, daemon.log, state.json, telegram.json(offset 파일)
  - 로컬 셸 기록 1종
  - CLI `daemon status`와 `daemon logs` 출력
  - `save()`로 쓴 증거 JSON(token, chat, user를 함께 검사)
- **검사하지 않은 것:**
  - 요청 URL: 인증 구조상 토큰이 들어가며, 작업자도 명시적으로 제외했습니다.
  - API 오류와 예외 메시지 경로: apiFailures가 0이라 이 경로가 실행되지 않았습니다.
  - runtime 자식의 stdout/stderr: 이 출력은 supervisor가 버리므로(stdio ignore) 남지 않았습니다.
  - 인코딩·부분 일치 변형
  - 셸 기록: PowerShell 외 셸이나 다른 에이전트 셸의 기록
  - `%TEMP%` 아래 runtime root에 남은 상태 파일: 구조상 토큰을 쓰지 않습니다.
  - 덤프·이벤트 로그
  - `save()`를 거치지 않은 저장소 증거: live-observations.md와 감사 사본. 이 부분은 S-6 비밀 검사에서 확인해야 합니다.
  - 운영 시크릿 파일: 의도된 저장소라 검사 대상이 아닙니다.

### 일찍 시도한 복원 기동(exit 2)의 구분
- **소스 경로:** 그때 runtime은 prototype을 패치한 뒤 runDaemon을 호출했고, 반환값 2로 `finish('runtime-ended')`가 실행됐을 것입니다.
  - 그 결과 `live-allow-restored.json`이 passed:false, readyReached:false로 한 번 쓰였을 것입니다.
  - `ownedStop`은 잠금 파일의 PID가 자기 것이 아니라서 아무것도 하지 않았을 것입니다. 실행 중이던 불허 단계 daemon은 건드리지 않습니다.
- **현재 파일과의 구분:** 현재 파일은 readyReached:true, reason:observed, 요청 1, 응답 1입니다. 실패 기록과 내용으로 구분됩니다.
- **불허 결과 보존:** 성공한 불허 결과가 `live-deny.json`과 정상 정지 기록으로 남아 있고, 그 시험은 반복하지 않았습니다. 처리가 적절합니다.
- **남는 한계:**
  - 실패 기록은 덮어써져 로그 서술로만 남았습니다.
  - "어댑터가 생성되기 전에 인스턴스 획득에서 막혔다"는 주장은 index.ts 원문 없이 관측에만 기댑니다.

---

## 지적

**F1 [should_fix] 파일 쪽 비밀 검사와 정지·복원 확인의 실행 소스가 감사 범위 밖입니다.**
- **문제:** `secret-observations.json`, `*-stop.json`, `final-runtime-restoration.json`을 만든 스크립트는 받은 감사 사본 4개에 없습니다. 그래서 T-3의 파일·CLI 쪽 검사 방법(대상 경로, 원문 비교 방식, 셸 기록의 범위)과 검출력을 감사할 수 없습니다.
- **조치:** 해당 비밀 없는 실행 소스의 감사 사본과 해시를 증거에 추가합니다. 불가능하면 이 한계를 TASK-CLOSE에 명시합니다.

**F2 [should_fix] runtime의 불허 판정에서 송신 판정 범위가 좁습니다.**
- **문제:** `sendsAfterCandidate`가 4종 메서드와 승인된 그룹 chat으로 한정돼 있습니다. 다른 chat이나 DM, 반응·타이핑 표시 같은 다른 메서드 호출은 놓칩니다.
- **조치:** 이번 결과는 위 범위의 무응답이라고 TASK-CLOSE에 명시합니다. 이후 관측(T04)에서는 후보 이후의 모든 non-getUpdates 호출을 메서드별 건수로 기록합니다(식별자 제외).

**F3 [should_fix] 상태 응답과 후보 요청의 연결을 검사하지 않았습니다.**
- **문제:** 상태 응답을 본문 키워드로만 판정하고, thread나 reply 대상을 확인하지 않습니다. 이번 결과는 송신 1건이라는 정황이 보완하지만 검출력은 약합니다.
- **조치:** 한계로 기록합니다. 재사용한다면 `message_thread_id`(General)와 reply 여부를 boolean으로 추가합니다.

**F4 [should_fix] 모듈 해시 고정 범위가 실제 import보다 좁습니다.**
- **문제:** `verifyModules`는 5개 모듈만 봅니다. 실제로 쓰인 `instance.ts`, `secrets.ts`(redactor), `bin/pace.ts`, adapter가 다시 import하는 하위 모듈은 고정되지 않았습니다.
- **조치:** TASK-CLOSE에 범위를 명시하거나 해시 목록을 넓힙니다.

**F5 [should_fix] main이 운영 secrets 폴더 ACL을 바꾼 결정 근거가 결정 로그에 없습니다.**
- **문제:** live-observations에 따르면 main이 사용자 홈의 민감 경로 권한을 바꿨습니다. PROJECT 결정·진행 메모에는 이 변경과 그 승인 출처가 없습니다. 작업자 쪽 처리(저장 전에 멈추고 main에 올림)는 TASK대로였습니다.
- **조치:** 결정 로그에 변경 대상·범위·승인 출처를 추가합니다.

**F6 [should_fix] 감사 사본에 봇 사용자명 리터럴(`pace_dev1_bot`)이 들어 있습니다.**
- **문제:** T-3이 금지한 토큰·사용자·chat ID는 아니지만, 저장소 증거에 승인 봇의 식별 정보가 들어갑니다.
- **조치:** 민감 경로 기준(AGENTS.md, docs/README.md)상 허용되는지 확인하고, 허용되지 않으면 사본에서 가립니다.

**F7 [handoff] 문서 동기화**
- TASK 본문의 "현재는 ACL·형식 확인까지만 수행" 서술과, S-3의 "멘션 없는 /status"는 실행 뒤 상태와 다릅니다.
- 기준 T-1~T-3은 바뀌지 않았으므로 TASK를 고치지 말고(해시 유지), TASK-CLOSE에서 PROJECT 19:39 메모와 실제 실행을 연결합니다.
- BR02와 BACKLOG의 상태는 마감 동기화 때 반영합니다.

**F8 [handoff] 미검증 경계는 T03·T04로 넘깁니다.**
- 실제 다른 계정이나 다른 chat에서의 거절
- 비General 토픽에서의 처리
- API 오류 경로에서의 토큰 노출
- `%TEMP%`의 runtime root 디렉터리와 포인터 파일 정리. 비밀은 없지만 정리 대상입니다.

**교본:** 해당 없음. 제품 코드 diff가 없고 src/daemon 변경도 없습니다. 감사 사본은 일회성 실행 스크립트라 교본 대조 대상에서 뺐습니다.

---

## 결론
- **검토 판정은 pass(blocking 0)입니다.** 목표 이탈이나 검증 누락은 없습니다. 승인된 런타임 제외 대안은 소스와 관측 양쪽에서 거절을 분리합니다.
- **목표 달성은 T02 관측 범위에서 달성입니다.**
- **마감은 보류입니다.** S-6의 전체 검사와 비밀 검사 결과가 오기 전까지는 닫을 수 없습니다. 그 결과가 오면 F1~F6 처리 내역과 함께 PM이 합산하면 됩니다.
