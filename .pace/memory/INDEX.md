# 메모리 목차

> 자동 생성 — 직접 고치지 말 것. 변경은 `pace memory` 명령.

## 진행 상황

- [진행 상황](status.md) — 어디까지 했나 · 다음 할 일 · 막힌 것

## 지킬 것 · 하지 말 것

- [Orca 안 전체 검사는 브라우저 E2E 끔](orca-안-전체-검사는-브라우저-e2e-끔.md) — Orca 터미널에서 npm run check는 PACE_SKIP_BROWSER_E2E=1로 돌린다 — playbook E2E 4개가 Orca 브라우저 탭을 열어 사용자 화면을 어지럽힌다. 브라우저 동작을 바꾼 일만 켠다
- [구판 호환 설계 금지](구판-호환-설계-금지.md) — PACE 변경에 구판 CLI 호환 장치(별도 경로·표지·이중 판독)를 만들지 말고 신판 하나로 고친다

## 열린 이슈

- [Windows 설치 스크립트 미실행 검증](windows-설치-스크립트-미실행-검증.md) — Windows pace agent 자손 추적·회수를 실기 검증하고 부모 강제 종료용 reaper를 보완한다
- [대시보드 잠금 복구와 호환성](대시보드-잠금-복구와-호환성.md) — 복구 잠금 중단 뒤 잔여물 정리와 하드링크 미지원·Windows 실측을 확인한다
- [자식 표시 환경 상속과 회귀 검사](자식-표시-환경-상속과-회귀-검사.md) — 회귀 검사 시 자식 표시 상속 여부를 확인하고 실패 원문·격리 환경 결과를 함께 보고한다
- [Canvas 도구 설치본 자가 재설치 Windows 실측](canvas-도구-설치본-자가-재설치-windows-실측.md) — Windows에서 설치본 CLI가 구버전을 치우도록 자기 app 폴더를 교체할 때 rename 성공 여부를 확인한다
- [Canvas 추출 도구 Chrome 프로필 잔여](canvas-추출-도구-chrome-프로필-잔여.md) — 0.1.2 렌더 뒤 소유 Chrome 임시 프로필이 남는 경합을 상류에 전달하고 새 봉인 버전에서 확인한다
- [검사 실행 자손 회수와 결과 무결성](검사-실행-자손-회수와-결과-무결성.md) — 정상 종료 자손·Windows 회수와 테스트 결과 위조 경계를 개선·실기 검증한다
- [POSIX 감시자 PID 재사용 검토](posix-감시자-pid-재사용-검토.md) — POSIX 감시자의 부모·감시자 PID 재사용 경합을 검토한다
- [Windows Git 명령 탐색 경계 검토](windows-git-명령-탐색-경계-검토.md) — Windows에서 이름으로 실행하는 Git이 작업 폴더 실행 파일을 선택하는지 실측하고 안전한 절대 경로 탐색을 검토한다
- [Windows 감시 채널 인증 실패 테스트](windows-감시-채널-인증-실패-테스트.md) — Windows 감시자 제어 채널의 인증 실패와 중복 연결을 실패 주입으로 회귀 검증한다
- [Windows 설치 스킬 교체 EPERM](windows-설치-스킬-교체-eperm.md) — Windows 설치가 스킬 폴더 교체 중 EPERM으로 실패하면 잠근 프로세스를 확인하고 재시도·이름 바꾼 뒤 지우기를 검토한다
- [Windows 실제 ACP 세션 환경 검증](windows-실제-acp-세션-환경-검증.md) — Windows 실제 Claude ACP 세션에서 Git Bash 위치 환경과 요청 흐름을 검증한다
- [daemon-store S-15 간헐 실패 — Windows 제외 포트 범위](daemon-store-s-15-간헐-실패-windows-제외-포트-범위.md) — 임시 PACE_HOME의 해시 인스턴스 포트가 Windows 제외 범위면 listen EACCES 실패 — 다음 후보 포트로 넘어가게 고침
- [main 직접 finish 브레인 반영 검사 모순](main-직접-finish-브레인-반영-검사-모순.md) — main 직접 프로젝트 finish가 커밋 안 한 변경만 보고 브레인 반영을 판정해, 브레인을 고친 main 직접 프로젝트는 통과 불가 — 프로젝트 번호 커밋도 보게 고친다
- [playbook-guard 임시 폴더 시험 병렬 경합](playbook-guard-임시-폴더-시험-병렬-경합.md) — playbook-guard 저장 경계 시험이 공용 tmpdir의 pace-playbook-* 증가로 판정해 병렬 실행 때 다른 시험 파일의 임시 폴더를 잡고 실패 — 시험 전용 임시 루트로 격리
- [Canvas 미리보기 소유 Chrome 관찰 간헐 실패](canvas-미리보기-소유-chrome-관찰-간헐-실패.md) — intent-preview 실제 렌더 시험이 Windows에서 간헐 'owned Chrome not observed' — 감시자 관찰 방식을 보강한다
- [changed check timeout 시험 부하 민감](changed-check-timeout-시험-부하-민감.md) — test/changed-test.test.ts 'changed check timeout and parent OS termination …'이 전체 검사 부하에서 실패 — 단독은 통과, 시간 여유나 부하 독립 판정으로 고친다
- [daemon 초기 준비 확인 실패 관측](daemon-초기-준비-확인-실패-관측.md) — Windows daemon 초기 소유자 확인 실패가 재발하면 원문과 시점을 확보해 원인을 구분한다
- [Windows 루트 교체 검사 skip](windows-루트-교체-검사-skip.md) — Windows의 루트 교체 훅 skip 원인을 확인해 실제 경로 재검증 시험의 실행 가능성을 점검한다
- [2단계 검토 판정 원장 미반영](2단계-검토-판정-원장-미반영.md) — goal-review 2단계(작업 문서 받은 뒤 호스트 판정) blocking이 검토 원장에 안 들어가 1단계 pass·2단계 blocking 반복이 반복 실패 단계로 안 잡힌다 — 최종 판정 확정 절차를 설계한다
- [ACP 쓰기 편집 경로 미대조](acp-쓰기-편집-경로-미대조.md) — ACP 쓰기 모드에서 편집 도구 자동 허용이 경로를 대조하지 않아 작업사본 밖 편집도 승인 없이 허용될 수 있다 — 워크트리 안 경로만 자동 허용하게 고친다
- [Gateway 인증 시간 초과 시험 부하 민감](gateway-인증-시간-초과-시험-부하-민감.md) — test/daemon-process.test.ts Gateway 인증 시간 초과·미인증 연결 상한 시험이 전체 검사 부하에서 간헐 실패 — 단독은 통과, 시간 여유나 부하 독립 판정으로 고친다
- [Orca 메뉴 경로 복구 전체 검사 불안정](orca-메뉴-경로-복구-전체-검사-불안정.md) — 전체 검사에서 메뉴 경로 승인 뒤 screen-mismatch가 반복되면 단독 실행과 비교하고 실패 원문을 보존한다
- [Orca 캡처 래스터 배율의 운영 경로 대조](orca-캡처-래스터-배율의-운영-경로-대조.md) — 실제 플레이북 재캡처에서도 viewport 정보와 JPEG 배율이 일치하는지 확인한다
- [직접 CLI 관측의 Orca 수명 보고 상속](직접-cli-관측의-orca-수명-보고-상속.md) — 중첩 Codex 실측은 Orca 세션 환경을 격리하고 부모 작업 종료로 오인되지 않는지 확인한다
- [daemon stop 직후 start 무시](daemon-stop-직후-start-무시.md) — macOS에서 pace daemon stop 직후 start가 서비스를 띄우지 않음 — stop이 종료 확인 전에 반환하는지, launchctl start가 종료 중 작업에 걸리는지 확인한다
- [daemon 준비 시험의 인스턴스 포트 충돌](daemon-준비-시험의-인스턴스-포트-충돌.md) — T06 전체 S-16 임시 인스턴스 포트 점유 exit2 원문 보존; 단독과 후속 전체를 구분
- [dashboard-init 정션 시험 부하 민감](dashboard-init-정션-시험-부하-민감.md) — test/dashboard-init.test.ts '상위 정션 아래 모호한 cwd도 형제 저장소를 바꾸지 않는다'가 전체 검사 부하에서 실패 — 단독 5회 통과, 비교 스냅숏에 .git 파일이 들어가 부하 중 내용이 바뀌는지 확인한다(BL261124_01 BR01 대상)
- [dashboard-init-형제-스냅숏-간헐-실패](dashboard-init-형제-스냅숏-간헐-실패.md) — dashboard-init의 형제 저장소 불변 스냅숏이 전체 검사에서 간헐 실패하면 원문·단독·무변경 재실행을 대조해 원인을 찾는다
- [T04 사후 사전검토 지적 3건](t04-사후-사전검토-지적-3건.md) — daemon 승인·복구 검증 보강 3건 — 만료 시각 지난 pending 승인 콜백 단위 시험, 부분 쓰기 뒤 강제 중단 복구 실측, 강제 종료 직전 daemon 소유권 대조
- [대시보드 형제 보존 시험의 간헐 실패](대시보드-형제-보존-시험의-간헐-실패.md) — 형제 폴더 보존 스냅샷 실패 원문을 유지하고 단독/파일 전체 재현과 비교한다
- [부모 종료 자식 회수 시험의 간헐 실패](부모-종료-자식-회수-시험의-간헐-실패.md) — 전체 검사에서 agent-p 강제 종료 회수 시험이 간헐 실패하면 단독 재현과 최초 원문을 함께 보존하고 원인을 확인한다
- [손자 생존 잠금 시험의 간헐 미확인](손자-생존-잠금-시험의-간헐-미확인.md) — 전체 검사에서 손자 생존 잠금의 재획득 code가 미확인2로 나오면 최초 원문과 단독 관측을 함께 대조한다
- [역할-지문-crlf-호스트-대조](역할-지문-crlf-호스트-대조.md) — Windows CRLF checkout에서 역할 지문 정규화와 정상 원본 보류 여부를 실제 호스트로 확인한다
- [잠금 소유자 조회 미확정](잠금-소유자-조회-미확정.md) — 첫 실측의 owner unknown 원인을 확정하지 말고 재발 시 ownerCheck와 조회 실패 조건을 수집한다

## 할 일

- [pace agent Codex 호스트 조건 안내 확인](pace-agent-codex-호스트-조건-안내-확인.md) — Codex 호스트의 네트워크 허용·중첩 Codex의 샌드박스 해제 필요 안내가 실제 사용 때 드러나는지 확인한다
- [호스트 실사용 검증](호스트-실사용-검증.md) — GUI 호스트와 Windows에서 프로젝트 역할 수신·부트를 실사용으로 확인한다
- [로그온 자동 기동 병합 후 실측](로그온-자동-기동-병합-후-실측.md) — P005 병합 후 운영 PC(macOS)에서 재로그온 뒤 launchd(io.pace.daemon RunAtLoad)로 daemon이 수동 start 없이 새로 뜨는지 실제 확인한다 — Windows PC daemon은 캡틴이 제거
- [P011 병합 후 Orca 장애 대응 인수](p011-병합-후-orca-장애-대응-인수.md) — 실제 작업자 escalation부터 허브의 결정과 워크트리 재개·재검증까지 Orca 1건을 관측한다
- [백로그 기획자 실제 작업 인수 검증](백로그-기획자-실제-작업-인수-검증.md) — P012 병합·설치 후 실제 백로그에서 기획자 위임과 독립 검토를 점검한다
- [검토 하네스 병합 뒤 품질 관측](검토-하네스-병합-뒤-품질-관측.md) — 허브 PM이 병합 뒤 프로젝트 3개 또는 백로그 검토 3건 마감 시 검토 비용과 필수 결함을 대조한다.
- [Git 독립 릴리즈 설치 Windows 실측](git-독립-릴리즈-설치-windows-실측.md) — Windows PowerShell 5.1에서 원격 신규·업데이트와 캐시 보존을 검증한다

## 메모 (사실·결정)

- [비밀 검사 오탐 축소 결정](비밀-검사-오탐-축소-결정.md) — (사용자 결정) secret-scan 파일 단위 제외 5개 제거, hasSecret은 코드 표현식 오탐만 축소 — 리터럴 탐지는 유지

## 개선 아이디어

- [브레인 변경 감지 후속 정밀화](브레인-변경-감지-후속-정밀화.md) — stale-source 검사의 날짜·main 직접 프로젝트·특수 경로 한계와 기존 경고 후보를 후속 점검
- [slugify 코드 포인트 단위 자르기](slugify-코드-포인트-단위-자르기.md) — slugify의 80자 자르기를 코드 포인트 단위로 — 서로게이트 중간에서 잘리면 멱등이 깨져 항목을 못 연다
- [기존 메모리 가드 점검 명령](기존-메모리-가드-점검-명령.md) — 저장된 메모리 중 쓰기 원칙 위반 항목을 목록으로 보여 주는 점검 명령 검토(pace memory lint)
- [메모리 이름 Windows 장치명 예약](메모리-이름-windows-장치명-예약.md) — Windows에서 con·nul·aux·com1 등 장치 이름 slug를 예약어로 막는다
- [브레인 페이지 파일 경로 검증](브레인-페이지-파일-경로-검증.md) — brain addPage의 file 입력을 slugify 결과로 제한한다
- [비밀 판정 규칙 보강](비밀-판정-규칙-보강.md) — hasSecret이 대문자 값·한글 키워드·구분자 없는 비밀번호를 놓친다 — 규칙 보강 검토
- [설치 스킬 경로 경계 강화](설치-스킬-경로-경계-강화.md) — 스킬 복사 시 심볼릭 링크와 대상 경로 경계를 검증한다
- [에이전트 호출 공용 SDK](에이전트-호출-공용-sdk.md) — pace agent 핵심을 SDK로 제공하고 각 앱 저장소가 복사해 쓰게 한다 — 루카스 재요청 시 착수
- [테스트 임시 정리 신호와 취소 보완](테스트-임시-정리-신호와-취소-보완.md) — 테스트 임시 정리의 신호 종료와 정상 취소 오탐 개선을 검토한다
- [commands 태스크 경로 내용 합치기](commands-태스크-경로-내용-합치기.md) — S3가 매번 읽는 commands.md의 check·done·log를 태스크 경로 문서로 합칠지 검토
- [백로그 교차 검증 재검토 반복](백로그-교차-검증-재검토-반복.md) — §2 교차 검증에 blocking 수정 뒤 pass까지 재검토 반복을 명시한다
- [브레인 대규모 lint와 긴 이력 실측](브레인-대규모-lint와-긴-이력-실측.md) — 수천 페이지 lint와 긴 Git 이력 쓰기의 상한을 실측하고 필요하면 최적화한다
- [브레인 동시 쓰기 목차 경합](브레인-동시-쓰기-목차-경합.md) — 동시 쓰기에서 브레인 목차 누락을 막는 잠금·재생성 방식을 검토한다
- [ACP 테스트 간헐 실패](acp-테스트-간헐-실패.md) — test/agent-acp.test.ts:52 agent_failed 간헐 실패를 재현해 원인을 찾는다
- [Orca 작업자 PATH의 orca](orca-작업자-path의-orca.md) — Windows codex 작업자 터미널에서 orca 명령을 찾도록 PATH를 보장한다
- [Windows 검사 시간 단축](windows-검사-시간-단축.md) — Windows npm run check(순차 약 29분, Linux 7분)를 줄일 방법을 찾는다
- [스트림 출력 비밀 제거](스트림-출력-비밀-제거.md) — daemon 이벤트 스트림·메신저로 나가는 에이전트 출력의 비밀 제거를 체감 속도를 지키며 설계한다
- [진행 중 프로젝트 작업자 재기동](진행-중-프로젝트-작업자-재기동.md) — 커밋이 쌓인 worktree에 새 작업자를 띄우는 명령을 만든다 — start --launch는 main 조상 검사로 거부
- [pace-intent L3 렌즈 후보(예시가 쓰지 않음)](pace-intent-l3-렌즈-후보-예시가-쓰지-않음.md) — L3 예시가 부르지 않은 렌즈 후보 — 다음 L3 예시가 부르면 만든다
- [pace-intent process: 질문에 보는 렌즈를 밝히지 않음](pace-intent-process-질문에-보는-렌즈를-밝히지-않음.md) — 질문 이유 줄에 지금 보는 렌즈 이름이 없어 왜 묻는지 헷갈린다는 지적 — 시험 세션 2회(실사용 0회)
- [pace-intent proof: L3 결제 시퀀스 요구](pace-intent-proof-l3-결제-시퀀스-요구.md) — L3는 IA 최상위·핵심 흐름만인데 결제 유스케이스는 시퀀스를 요구 — 깊이별 시퀀스 규칙 정리 후보
- [pace-intent usecase secondary 누락 렌더 실패](pace-intent-usecase-secondary-누락-렌더-실패.md) — usecase 템플릿이 선택 필드 secondary 없으면 'u.secondary is not iterable'로 빈 화면 — verify 13검사 통과
- [pace-intent wireframe 데스크톱 영역 배치](pace-intent-wireframe-데스크톱-영역-배치.md) — wireframe이 세로 쌓기만, 사이드바·본문·우측 패널 배치 불가, 기본 모바일 — opalwrite layout.html 수작업
- [pace-scout 번역 요약이 원문에 없는 숫자를 만듦(툴박스)](pace-scout-번역-요약이-원문에-없는-숫자를-만듦-툴박스.md) — 영어 출처 주장을 한국어로 요약하며 October→10월, one percent→1%로 바꿔 검사 ①이 실패
- [pace-scout 본문 추출 잡음과 카드 범위](pace-scout-본문-추출-잡음과-카드-범위.md) — fetch 본문에 사이트 메뉴·관련 기사가 섞여 인용 대조가 본문 밖 글자도 통과시키고, 카드가 근거 출처의 모든 주장을 펼친다
- [test-map 단위 확장](test-map-단위-확장.md) — test-map 단위가 2개뿐이라 테스트 87개 중 85개가 단위 밖 — 영역별 단위로 나눠 부분 검사를 살린다
- [확장 후보](확장-후보.md) — 다중 프로필·프로필 브레인 등 남은 확장 후보 — 착수 시 새 백로그로
- [가림 요소 사람 확인 복구 후보](가림-요소-사람-확인-복구-후보.md) — 가림 대상 읽기 요소의 선택자가 바뀌면 구조 선택자·box만으로 사람 확인 필수 복구 후보를 만든다
- [사람 확인 대기 완료 표시 명령](사람-확인-대기-완료-표시-명령.md) — pendingHumanChecks 대기 항목을 사람이 이미지 확인 뒤 확인 완료로 표시하는 명령을 둔다
- [main 직접 프로젝트 착수 기록](main-직접-프로젝트-착수-기록.md) — main 직접 프로젝트도 start처럼 상태 진행·착수 결정 log.jsonl을 남기는 명령(start --main 등)을 둔다
- [대시보드 local.js 복구 경합](대시보드-local-js-복구-경합.md) — ensureLocalLink 복구가 내용 확인 직후 교체된 파일을 덮을 수 있는 좁은 창 — local.js 쓰기를 refresh 잠금 안으로 옮기는 안 검토
- [읽기 전용 실행기 버전 재검증](읽기-전용-실행기-버전-재검증.md) — CLI 버전이 바뀌면 읽기 전용 강제의 기존 실측 증거를 재검증하도록 개선한다
- [문서 표 SECURITY 적용 범위 정렬](문서-표-security-적용-범위-정렬.md) — 정의서 문서 표의 docs/SECURITY.md 적용 범위를 민감 경로 표와 맞춘다(src/test-runner/·skills/pace-playbook-maker/tools/·src/project/situation.ts 누락)
- [서브 문서 내부 구조 정리](서브-문서-내부-구조-정리.md) — 원문 그대로 옮긴 DAEMON.md(한 문단)·DASHBOARD.md(절 없음)·TESTING 검사 선택(한 문장)을 절로 나눠 찾기 쉽게 — 정의서 크기 여유 6%도 함께 본다
- [정의서 측정 도구 제공](정의서-측정-도구-제공.md) — pace-project-init의 정의서 측정(크기·절·비고·미등록 폴더·문서·서브 문서)을 CLI나 스킬 도구로 제공 — 지금은 analysis.md에 재는 법만 있다
- [daemon 설정 PC 이전](daemon-설정-pc-이전.md) — daemon 설정 내보내기·가져오기로 새 PC 설치를 토큰 입력 하나로 줄인다
- [ask_user 단계 지적 크기 기준](ask-user-단계-지적-크기-기준.md) — reviewer.md 반복 실패 절: 진단 뒤 fail도 PM이 근본 조치(채우기·덜어내기) 뒤 재검증하고 사후 보고 — 사용자 사전 결정은 심각한 오류·보안·목적·범위 변경만
- [공유 잠금 가용성 보강](공유-잠금-가용성-보강.md) — 안전 확인을 보존하는 guard 복구·busy 대기 큐를 별도 설계한다
- [사람 식별자 user·owner 통일](사람-식별자-user-owner-통일.md) — 결정 주체 user(review-note·LogActor·waiver)와 수신자 owner(P009 --to)를 owner로 통일하고 user는 옛 값으로 읽기 검토
- [소통 원장 운영 보강](소통-원장-운영-보강.md) — 실사용 근거로 영수증 형식·부분 stats·증분 조회와 guard 가용성 보강을 설계한다
- [Codex 작업자 worktree 신뢰 사전 점검](codex-작업자-worktree-신뢰-사전-점검.md) — 작업자를 Codex로 바꿀 때 worker-start가 agent-trust-workspace로 막힌다 — 착수 전 계정별 신뢰 점검·안내를 넣는다
- [Orca ack 안내 불일치와 우편함 비보존](orca-ack-안내-불일치와-우편함-비보존.md) — Orca check --ack에 delivery id가 필요한데 메시지에 없고, 코디네이터 터미널 우편함은 닫으면 사라진다 — Orca 상류 전달 또는 PACE 쪽 보존 절차를 검토한다
- [upper_review 종료 뒤 owner 재개 경로](upper-review-종료-뒤-owner-재개-경로.md) — 두 번째 상위 근본 검토 뒤 owner가 '한 번 더'나 범위를 정해 재개하는 결정을 기록·해제하는 하네스 경로가 없다 — 새 백로그로 발의한다
- [단계형 백로그 중간 관문 병합](단계형-백로그-중간-관문-병합.md) — 백로그 1개=프로젝트 1개라 중간 관문 결과를 먼저 병합할 길이 없다 — 단계형 업무 안내나 부분 병합을 검토한다
- [백로그 brief 명령 worktree 실행 제한](백로그-brief-명령-worktree-실행-제한.md) — pace backlog brief는 main 체크아웃에서만 돌아 프로젝트 worktree에서 BR을 추가하려면 임시 main 사본 우회가 필요하다 — worktree 실행 허용 또는 안내를 검토한다
- [백로그 전체 검토의 예산 원장 연결](백로그-전체-검토의-예산-원장-연결.md) — 백로그 폴더 전체를 묶은 스냅숏을 verify 대상으로 쓰면 백로그 검토 예산·공동 시도 원장이 적용되지 않는다 — 폴더 단위 검토 대상을 지원하거나 절차를 안내한다
- [병합 대기 중 memory 쓰기가 merge 차단](병합-대기-중-memory-쓰기가-merge-차단.md) — 병합 대기 중 pace memory가 main에 파일을 써서 merge가 커밋 안 한 변경으로 막힌다 — merge 전 메모리 변경 처리 절차·게이트를 검토한다
- [의도적 대기 작업자 경보 억제](의도적-대기-작업자-경보-억제.md) — owner 응답을 일부러 기다리는 작업자를 '보고 없이 멈춤'으로 escalation하지 않게 workerSpec에 대기 신호를 둔다
