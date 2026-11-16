# 메모리 목차

> 자동 생성 — 직접 고치지 말 것. 변경은 `pace memory` 명령.

## 진행 상황

- [진행 상황](status.md) — 어디까지 했나 · 다음 할 일 · 막힌 것

## 지킬 것 · 하지 말 것

- (없음)

## 열린 이슈

- [Windows 설치 스크립트 미실행 검증](windows-설치-스크립트-미실행-검증.md) — Windows pace agent 자손 추적·회수를 실기 검증하고 부모 강제 종료용 reaper를 보완한다
- [대시보드 잠금 복구와 호환성](대시보드-잠금-복구와-호환성.md) — 복구 잠금 중단 뒤 잔여물 정리와 하드링크 미지원·Windows 실측을 확인한다
- [자식 표시 환경 상속과 회귀 검사](자식-표시-환경-상속과-회귀-검사.md) — 회귀 검사 시 자식 표시 상속 여부를 확인하고 실패 원문·격리 환경 결과를 함께 보고한다
- [Canvas 도구 설치본 자가 재설치 Windows 실측](canvas-도구-설치본-자가-재설치-windows-실측.md) — Windows에서 설치본 CLI가 구버전을 치우도록 자기 app 폴더를 교체할 때 rename 성공 여부를 확인한다
- [Canvas 추출 도구 Chrome 프로필 잔여](canvas-추출-도구-chrome-프로필-잔여.md) — 0.1.2 렌더 뒤 소유 Chrome 임시 프로필이 남는 경합을 상류에 전달하고 새 봉인 버전에서 확인한다
- [검사 실행 자손 회수와 결과 무결성](검사-실행-자손-회수와-결과-무결성.md) — 정상 종료 자손·Windows 회수와 테스트 결과 위조 경계를 개선·실기 검증한다
- [POSIX 감시자 PID 재사용 검토](posix-감시자-pid-재사용-검토.md) — POSIX 감시자의 부모·감시자 PID 재사용 경합을 검토한다
- [Windows 감시 채널 인증 실패 테스트](windows-감시-채널-인증-실패-테스트.md) — Windows 감시자 제어 채널의 인증 실패와 중복 연결을 실패 주입으로 회귀 검증한다
- [Windows 설치 스킬 교체 EPERM](windows-설치-스킬-교체-eperm.md) — Windows 설치가 스킬 폴더 교체 중 EPERM으로 실패하면 잠근 프로세스를 확인하고 재시도·이름 바꾼 뒤 지우기를 검토한다
- [Windows 실제 ACP 세션 환경 검증](windows-실제-acp-세션-환경-검증.md) — Windows 실제 Claude ACP 세션에서 Git Bash 위치 환경과 요청 흐름을 검증한다
- [Windows Git 명령 탐색 경계 검토](windows-git-명령-탐색-경계-검토.md) — Windows에서 이름으로 실행하는 Git이 작업 폴더 실행 파일을 선택하는지 실측하고 안전한 절대 경로 탐색을 검토한다
- [daemon-store S-15 간헐 실패 — Windows 제외 포트 범위](daemon-store-s-15-간헐-실패-windows-제외-포트-범위.md) — 임시 PACE_HOME의 해시 인스턴스 포트가 Windows 제외 범위면 listen EACCES 실패 — 다음 후보 포트로 넘어가게 고침

## 할 일

- [원격 저장소 공개 여부](원격-푸시-여부-결정.md) — 저장소 공개 여부를 결정한다 — 비공개라 README curl·irm 익명 설치 404
- [호스트 실사용 검증](호스트-실사용-검증.md) — GUI 호스트와 Windows에서 프로젝트 역할 수신·부트를 실사용으로 확인한다
- [pace agent Codex 호스트 조건 안내 확인](pace-agent-codex-호스트-조건-안내-확인.md) — Codex 호스트의 네트워크 허용·중첩 Codex의 샌드박스 해제 필요 안내가 실제 사용 때 드러나는지 확인한다

## 메모 (사실·결정)

- [비밀 검사 오탐 축소 결정](비밀-검사-오탐-축소-결정.md) — (사용자 결정) secret-scan 파일 단위 제외 5개 제거, hasSecret은 코드 표현식 오탐만 축소 — 리터럴 탐지는 유지

## 개선 아이디어

- [브레인 변경 감지 후속 정밀화](브레인-변경-감지-후속-정밀화.md) — stale-source 검사의 날짜·main 직접 프로젝트·특수 경로 한계와 기존 경고 후보를 후속 점검
- [기존 메모리 가드 점검 명령](기존-메모리-가드-점검-명령.md) — 저장된 메모리 중 쓰기 원칙 위반 항목을 목록으로 보여 주는 점검 명령 검토(pace memory lint)
- [메모리 이름 Windows 장치명 예약](메모리-이름-windows-장치명-예약.md) — Windows에서 con·nul·aux·com1 등 장치 이름 slug를 예약어로 막는다
- [브레인 페이지 파일 경로 검증](브레인-페이지-파일-경로-검증.md) — brain addPage의 file 입력을 slugify 결과로 제한한다
- [비밀 판정 규칙 보강](비밀-판정-규칙-보강.md) — hasSecret이 대문자 값·한글 키워드·구분자 없는 비밀번호를 놓친다 — 규칙 보강 검토
- [slugify 코드 포인트 단위 자르기](slugify-코드-포인트-단위-자르기.md) — slugify의 80자 자르기를 코드 포인트 단위로 — 서로게이트 중간에서 잘리면 멱등이 깨져 항목을 못 연다
- [설치 스킬 경로 경계 강화](설치-스킬-경로-경계-강화.md) — 스킬 복사 시 심볼릭 링크와 대상 경로 경계를 검증한다
- [에이전트 호출 공용 SDK](에이전트-호출-공용-sdk.md) — pace agent 핵심을 SDK로 제공하고 각 앱 저장소가 복사해 쓰게 한다 — 루카스 재요청 시 착수
- [테스트 임시 정리 신호와 취소 보완](테스트-임시-정리-신호와-취소-보완.md) — 테스트 임시 정리의 신호 종료와 정상 취소 오탐 개선을 검토한다
- [백로그 교차 검증 재검토 반복](백로그-교차-검증-재검토-반복.md) — §2 교차 검증에 blocking 수정 뒤 pass까지 재검토 반복을 명시한다
- [commands 태스크 경로 내용 합치기](commands-태스크-경로-내용-합치기.md) — S3가 매번 읽는 commands.md의 check·done·log를 태스크 경로 문서로 합칠지 검토
- [브레인 대규모 lint와 긴 이력 실측](브레인-대규모-lint와-긴-이력-실측.md) — 수천 페이지 lint와 긴 Git 이력 쓰기의 상한을 실측하고 필요하면 최적화한다
- [브레인 동시 쓰기 목차 경합](브레인-동시-쓰기-목차-경합.md) — 동시 쓰기에서 브레인 목차 누락을 막는 잠금·재생성 방식을 검토한다
- [ACP 테스트 간헐 실패](acp-테스트-간헐-실패.md) — test/agent-acp.test.ts:52 agent_failed 간헐 실패를 재현해 원인을 찾는다
- [Orca 작업자 PATH의 orca](orca-작업자-path의-orca.md) — Windows codex 작업자 터미널에서 orca 명령을 찾도록 PATH를 보장한다
- [Windows 검사 시간 단축](windows-검사-시간-단축.md) — Windows npm run check(순차 약 29분, Linux 7분)를 줄일 방법을 찾는다
- [스트림 출력 비밀 제거](스트림-출력-비밀-제거.md) — daemon 이벤트 스트림·메신저로 나가는 에이전트 출력의 비밀 제거를 체감 속도를 지키며 설계한다
- [진행 중 프로젝트 작업자 재기동](진행-중-프로젝트-작업자-재기동.md) — 커밋이 쌓인 worktree에 새 작업자를 띄우는 명령을 만든다 — start --launch는 main 조상 검사로 거부
- [확장 후보](확장-후보.md) — 다중 프로필·프로필 브레인 등 남은 확장 후보 — 착수 시 새 백로그로
- [pace-intent L3 렌즈 후보(예시가 쓰지 않음)](pace-intent-l3-렌즈-후보-예시가-쓰지-않음.md) — L3 예시가 부르지 않은 렌즈 후보 — 다음 L3 예시가 부르면 만든다
- [pace-intent process: 질문에 보는 렌즈를 밝히지 않음](pace-intent-process-질문에-보는-렌즈를-밝히지-않음.md) — 질문 이유 줄에 지금 보는 렌즈 이름이 없어 왜 묻는지 헷갈린다는 지적 — 시험 세션 2회(실사용 0회)
- [pace-intent proof: L3 결제 시퀀스 요구](pace-intent-proof-l3-결제-시퀀스-요구.md) — L3는 IA 최상위·핵심 흐름만인데 결제 유스케이스는 시퀀스를 요구 — 깊이별 시퀀스 규칙 정리 후보
- [pace-intent usecase secondary 누락 렌더 실패](pace-intent-usecase-secondary-누락-렌더-실패.md) — usecase 템플릿이 선택 필드 secondary 없으면 'u.secondary is not iterable'로 빈 화면 — verify 13검사 통과
- [pace-intent wireframe 데스크톱 영역 배치](pace-intent-wireframe-데스크톱-영역-배치.md) — wireframe이 세로 쌓기만, 사이드바·본문·우측 패널 배치 불가, 기본 모바일 — opalwrite layout.html 수작업
- [pace-scout 번역 요약이 원문에 없는 숫자를 만듦(툴박스)](pace-scout-번역-요약이-원문에-없는-숫자를-만듦-툴박스.md) — 영어 출처 주장을 한국어로 요약하며 October→10월, one percent→1%로 바꿔 검사 ①이 실패
- [pace-scout 본문 추출 잡음과 카드 범위](pace-scout-본문-추출-잡음과-카드-범위.md) — fetch 본문에 사이트 메뉴·관련 기사가 섞여 인용 대조가 본문 밖 글자도 통과시키고, 카드가 근거 출처의 모든 주장을 펼친다
- [test-map 단위 확장](test-map-단위-확장.md) — test-map 단위가 2개뿐이라 테스트 87개 중 85개가 단위 밖 — 영역별 단위로 나눠 부분 검사를 살린다
