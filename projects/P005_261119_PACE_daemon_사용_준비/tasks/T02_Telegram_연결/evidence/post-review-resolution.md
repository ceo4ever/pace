# T02 사후 검토와 처리

## 출처와 판정 범위

작성자·사전 검토와 분리된 두 anthropic Claude 세션(보고 모델 claude-opus-5-5)이 각각 첫 관측 판단 후 같은 세션에서 TASK·PROJECT·BR02·실행 감사 소스와 증거를 대조했다. 원문은 post-tester-phase1/2.md 및 post-reviewer-phase1/2.md에 있다. 명령·실제 API를 직접 재실행하지 않았다. main은 감사 소스 네 개의 원문 해시, 현재 TASK 정규화 해시와 사전 pass, 운영 config 해시 및 정지를 직접 확인했다.

최초 사후 판정은 reviewer pass blocking 0(검사 대기), tester fail 보류(B1 전체/비밀 검사 결과 대기, B2 로컬 확인 생성 소스 누락)다. Telegram 시험은 반복하지 않고 아래 자료를 보완해 같은 두 세션에 최종 판정을 요청한다.

같은 두 세션의 보완 검토(post-tester-supplement.md, post-reviewer-supplement.md)에서는 B2가 해소되고 T-1~T-3·최종 복원을 통과로 판정했다. tester의 남은 보류는 전체 검사 결과 B1뿐이다. main이 실제 로컬 감사 소스 세 개와 결과 네 개의 원문 해시·provenance 일치를 확인했다. 이후 같은 전체 검사 한 회가 exit 0·991 pass·0 fail·9 skipped로 끝났고 repository-check.log 및 repository-check-result.json에 원문·집계·SHA-256·skip 사유를 보존했다. 최종 판정은 해당 원문 대조 후 요청한다.

## B1·B2 처리

- **B1:** 태스크 선언 전체 검사 한 회가 exit 0·991 pass·0 fail·9 skipped로 종료됐고 전체 원문·집계·SHA-256·skip 사유를 보존했다. 같은 두 세션의 최종 판정(post-tester-final.md, post-reviewer-final.md)은 B1·S-6 포함 모두 pass blocking 0이며 T02 목표 달성을 확인했다. 선언 비밀 검사 및 실제 입력 토큰·그룹·허용 사용자 ID 기록 전체 검사도 통과했고 최종 판정·마감 자료 추가 범위를 마지막으로 다시 검사한다. 실제 메시지 관측을 단위 검사로 대체하지 않는다.
- **B2 / reviewer F1:** 실행 당시의 실제 로컬 스크립트가 임시 폴더에 남아 있어 그대로 감사 사본으로 보존했다. execution-initial-stop.mjs → allow-initial-stop.json, execution-deny-stop.mjs → deny-stop.json, execution-final-local-check.mjs → final-runtime-restoration.json 및 secret-observations.json이다. 원본 파일명·원문/LF 해시·파일 수정 시각·결과 해시는 local-check-source-provenance.json에 있다. 과거 스크립트를 새로 복원하거나 Telegram 시험을 다시 실행하지 않았다. final 스크립트는 정지 status의 exit 3을 기대하도록 실제 수정 후 재실행했던 버전이다. 잘못된 exit 0 전용 버전의 원문은 덮어써져 별도 보존되지 않았다.
- 최종 로컬 스크립트는 파일을 UTF-8로 읽어 정확 토큰 일치를 확인하고, 설치 CLI status와 logs의 stdout+stderr도 메모리에서 비교한다. 검사 대상·정지/설정 확인 단언은 감사 소스에서 확인할 수 있다. 의도된 입력 .env 및 운영 Telegram 시크릿 저장소는 비노출 검사에서 제외한다.
- 초기·불허의 stop JSON 생성 스크립트 자체는 status stopped·lock 부재·포트 획득만 단언하며 exit 0까지 단언하지 않았다. 각 supervisor의 실제 childExit 0은 작업자 도구 출력으로 회수했지만 stop JSON만의 증명 범위로 확대하지 않는다. 최종 복원 생성 스크립트는 런타임 상태 파일의 stopped·exit 0을 먼저 확인한 뒤 status·포트·설정을 확인한다. 세 범위의 차이를 유지한다.
- 선언 비밀 검사는 최초 감사 common 사본의 공백 없는 멤버접근 대입을 비밀로 의심해 실패했다. 감사 소스가 추가된 뒤에는 기록 검사 사본의 공백 없는 객체 필드가 같은 이유로 실패했다. 두 실패 원문은 security-check-initial/second.log 및 각 result.json에 보존했다. 실제 입력 토큰·그룹·사용자 ID 검사는 0건이었다. 제품 검사나 제외 목록은 수정하지 않고 두 감사 사본에 각각 공백 한 곳만 추가했다. 실제 실행 원본은 임시 폴더에 그대로 남고 원문/감사본 해시와 변환 이유를 execution-source-hashes.json 및 record-scan-source-hash.json에 구분했다. 공백 변환 뒤 선언 검사는 exit 0이다. 원본과 감사본의 바이트가 모두 같다는 주장은 철회하고 의미를 바꾸지 않은 문서 서식 변환임을 명시한다.

## should_fix 처리와 한계

1. **General·reply 연결:** 이번 관측은 준비 이후 같은 그룹·사용자·General의 새 요청 한 건과 같은 그룹의 성공한 상태 응답 한 건을 연결했다. 응답 params의 message_thread_id와 원 메시지 reply 여부를 별도 boolean으로 남기지는 않았다. 설치본 adapter.ts의 general(status) → say 경로와 상태 응답의 device·실행 문자열 형식은 소스로 확인되지만, 이것을 누락한 실제 응답 필드 관측으로 대신하지 않는다. 이후 T04에서 실제 응답 경로를 재사용할 때 계측을 보강한다. 성공한 T02 메시지는 재전송하지 않는다.
2. **불허 무송신 범위:** sendsAfterCandidate는 sendMessage·editMessageText·sendDocument·sendPhoto 네 메서드와 승인 그룹으로 한정한다. API call의 모든 params/성공 응답은 토큰 검사했으나 다른 chat·DM·타이핑·반응 등 모든 non-getUpdates 메서드별 카운트는 남기지 않았다. 이번 무응답 결론은 그 관측 범위와 실제 권한 거절 카운터/작업 부재에 한정한다. T04의 후속 계측에서 모든 non-getUpdates 호출과 대상 일치 여부를 건수로 분리한다.
3. **상태 응답 형식:** 해시로 고정한 설치본 adapter.ts의 General status는 host.overview에서 device/running/queued/quarantined를 받아 say로 보낸다. 본문의 pace-pc 및 실행 문자열은 이 경로와 일치한다. 단, 키워드만의 판정이라는 한계를 유지한다.
4. **해시 범위(reviewer F4):** 사전·적용·runtime·최종 재대조 범위는 adapter.ts, api.ts, index.ts, cli.ts, config.ts 다섯 설치 모듈이다. bin/pace.ts, instance.ts, secrets.ts 및 전이 import 전체를 각 실행 직전에 고정한 증거는 없다. 다섯 모듈 고정을 설치본 전체 무변경 보증으로 확대하지 않는다. 설치·업데이트는 이 태스크에서 실행하지 않았다.
5. **조기 exit 2 증거:** 정지 확인 전 복원기동을 시도해 acquireInstance가 exit 2로 차단했다. 그때 status에서 readyWasReached=false·exit 2를 읽었다. 같은 출력 경로를 쓴 탓에 실패 결과·상태 파일은 정상 복원 결과로 덮어써졌다(생성 코드 흐름과 이후 파일 갱신 기준). 실패 JSON 전체 원문은 따로 보존하지 못했고 사후 재구성하지 않는다. 프로젝트 사건 로그·실제 도구 실행 결과의 exit 2·감사 소스의 단일 인스턴스 선행 경계와 소유 PID 보호로 한계를 설명한다. 현재 성공 JSON은 ready=true·reason=observed·요청/응답 한 건의 별개 실행이다.
6. **ACL 결정(reviewer F5):** PROJECT 결정 로그에 main 판단을 추가했다. 범위는 승인된 안전 저장을 위한 새 secrets 폴더의 보호 ACL만이며 기존 운영 시크릿 없음·입력 setup/env SDDL 보존·부모 .pace 미변경이다. 작업자가 추가 계정 원문을 기록하거나 권한을 수정하지 않았다.
7. **기록 전체 비노출:** save()의 JSON 차단 검사만으로 markdown·프로젝트 로그·감사 소스까지 안전하다고 주장하지 않는다. T02 폴더 전체와 PROJECT·log.jsonl·프로젝트 메모리·원본 백로그·생성 대시보드를 실제 입력 토큰·그룹·사용자 ID로 메모리 비교했고 일치 0건이었다. 대상·건수는 repository-sensitive-records-scan.json에 있다. 파일이 추가되면 마감 전 해당 범위를 다시 확인한다.
8. **공개 봇 사용자명:** 감사 사본의 공개 봇 사용자명은 실제 실행 대상 대조 리터럴이다. 토큰·등록된 사람의 사용자 ID·그룹 ID와 구분하며 실제 소스 원문 해시의 무결성을 위해 유지한다. 개인/그룹 식별값은 감사 사본에도 리터럴로 넣지 않았다.

## 문서·후속 범위

TASK의 승인 반영 절이 이전 숨김 입력·디스크 임시 제외를 대체한 실행 정본이다. 이후 main의 General status 멤버십 조건·봇 멘션 결정과 실제 수행 경과는 PROJECT 로그와 TASK-CLOSE에 연결한다. TASK의 과거 시점 문구를 완료 상태처럼 고쳐 사전 검토 해시를 깨뜨리지 않는다. BR02/BACKLOG는 done에서 동기화한다.

T03: 상시 기동·자동 시작과 resource 검증. T04: 실제 workspace/체인 작업·쓰기 승인과 필요한 실제 다른 계정/다른 chat·비General 토픽·응답 연결·모든 송신 메서드 관측. API 실패 예외 객체·메모리 덤프·시스템 이벤트 로그까지 검사한 것으로 주장하지 않는다. 임시 runtime root·비밀 없는 포인터는 보존하며 무단 삭제하지 않는다. 승인돼 이미 송신한 메뉴·알림도 삭제하지 않았다.
