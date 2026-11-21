# T03 사후 검토 보완과 측정 범위

## 독립 검토 출처와 최초 판정

작성자·사전 검토와 분리된 anthropic Claude 두 세션(보고 claude-opus-5-5, low는 CLI 요청 effort)이 관측 첫 판단을 먼저 기록하고 각 같은 세션에 TASK·PROJECT·BR03·실행 소스 및 읽기 전용 보완을 받았다. 실제 명령을 검토자가 재실행하지 않았다. 원문은 post-tester-phase1/2/final.md, post-reviewer-phase1/2/final.md다.

reviewer 2단계 F1은 device 보존의 측정 근거 부족으로 blocking 1이었고, 같은 세션에 전달한 main 읽기 보완으로 해소돼 최종 양쪽 pass blocking 0이 됐다. main이 원문 전체 검사 SHA/집계, 메모리 152샘플 재계산, 감사 소스 다섯 개 원문 SHA와 현재 TASK 사전 pass 해시를 확인했다.

## F1 — devicePreserved 필드 정정

원래 lifecycle-observations.json 및 pre-relogon-final-state.json의 devicePreserved=true는 runtime device를 직접 대조해 산출한 측정값이 아니라 작성자가 넣은 고정값이었다. 해당 원본 JSON은 역사 증거로 덮어쓰지 않는다. 이 필드만으로 실제 기기 표기 보존을 입증하지 않는다.

coordinator-readonly-proof.json의 보완 관측은 운영 config 전체 SHA가 T02 마감·T03 기준점·현재에서 같고, raw config에는 명시 device가 없으며, 설치본 loadConfig는 hostname을 정규화한 기본값을 쓴다는 것을 확인했다. 현재 runtime status의 device도 그 로더 값과 일치한다. 따라서 설정을 변경하지 않았고 현재 실행이 같은 파생 정책을 쓴다는 근거는 확보했다. T02 이후 Windows hostname의 역사적 변경을 직접 추적하거나 T02 당시 runtime device 문자열과 대조한 것은 아니므로 그 전제를 명시한다. 실제 기기 이름 원문은 증거에 기록하지 않는다.

## F3 — Run 비교 범위 정정

원래 registryOwnedExact/runValueExact 표시는 설치본 ownsRunValue의 통과를 표현했으며, 그 함수는 trim 뒤 대소문자를 무시해 비교한다. 원래 관측을 엄밀한 대소문자 포함 전체 문자열 일치로 확대하지 않는다. main의 별도 읽기 보완에서 현재 Run 전체 값이 기대 launcherRunValue와 대소문자까지 일치함을 확인했다(runFullStringCaseSensitiveExact=true). 런처 바이트 일치는 기존 실측과 함께 유지한다.

## F2·F4 및 남은 관측 한계

- 기동·중복·재기동마다 Telegram 메뉴/연결 알림의 발생·건수를 직접 계측하지 않았다. 중복 경로에 새 connect가 없다는 판단은 동일 소유자 실측과 설치본 선행 분기로 추론한 것이다. 메뉴·알림 동작은 승인된 범위였지만 승인으로 실제 건수 관측을 대신하지 않는다.
- logOutputKnownTokenMatches=0 역시 별도 카운터 측정 필드가 아니라 cli()의 실제 token 일치 시 예외 검사를 통과한 경로를 요약한 고정값이다. 확인 범위는 CLI logs -n 1000 출력의 토큰 원문 정확 일치 부재이며 전체 운영 로그·chat/user ID·실패 API 예외 전체를 검사한 것으로 주장하지 않는다. 저장소 증거의 알려진 값 검사는 별도로 수행한다.
- 최초 registration-start 실패의 정확한 predicate와 초기 수정 전 컨트롤러 전체 원문을 보존하지 못했다. 설치본 포트 선행 준비와 관련된 경합은 추정이다. 최초 동작은 등록·기동 후 실제 소유 프로세스 대조로 인계했고 이후 stop/start 새 boot 경로를 정식 검증했다. 제품 결함을 확정하거나 첫 실패가 곧 실제 daemon 기동 실패였다고 단정하지 않는다.
- 자원은 실제 유휴 daemon·현재 worktree 세션·전체 검사 한 회 부하의 152샘플이다. 실제 모델 두 작업, 샘플 사이 순간 최저나 시스템 전체 OOM 부재로 일반화하지 않는다. 기존 Windows/POSIX/sh·루트 교체 skip 9건을 통과로 세지 않는다.

## 후속 인수

실제 같은 사용자 재로그온 자동 기동과 콘솔 비표시는 미실측이며 병합 후 todo를 열린 상태로 유지한다. T03 역사 기준점은 보존하고 T04·병합 뒤 최신 운영 기준점을 별도로 확보해 수동 start 없는 새 boot·단일 인스턴스·등록/런처/설정 일치와 사람의 콘솔 관측으로 인수한다. 현재 등록·정상 기동과 사용자 승인을 그 성공으로 대체하지 않는다.
