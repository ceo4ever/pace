---
type: concept
title: 플레이북 작성·주행·복구 함정 모음
summary: "식별자 검사 String(undefined), Windows heredoc 정규식, 합의 대조 누락, Orca 동기 호출과 같은 프로세스 서버, 가림은 값의 모든 노출 위치, 기본 브라우저 프로필은 로그인 상태, 학습 뒤 해시 불일치, 화면 말줄임·button value·내용 따라 움직이는 box, 세션 기록의 사용자 환경(tab list·폴더 인코딩)"
tags: [playbook, pitfalls, orca, capture]
sources: [대화:2026-11-17, code:skills/pace-playbook-maker/tools/healer.mjs, code:skills/pace-playbook-maker/tools/capture-core.mjs, code:skills/pace-playbook-maker/tools/driver.mjs, code:skills/pace-playbook-maker/tools/build.mjs]
related: [playbook-maker-구조와-결정, 작업-하네스-실측-함정]
created: 2026-11-17
updated: 2026-11-17
status: active
---

## 작성(T02~T03)
- `IDENT.test(String(undefined))`는 통과한다 — 식별자 검사는 `typeof v==='string'`을 먼저 본다.
- 합의 대조(`checkAgreement`)를 생성 단계에 두지 않으면 지도 검사는 통과하는 불일치(결과 위치·민감도)가 생긴다.
- Windows 셸 heredoc이 정규식 백슬래시를 지운다 — 정규식·코드 패치는 Write 도구로 만든 스크립트나 Edit로.
- 사례 저장소 이름·서비스명은 추적 파일에 쓰지 않는다 — 매핑은 저장소 밖 로컬 파일에만, 테스트의 금지어 목록도 커밋하지 않는다.

## 캡처(T06)
- **가림은 추출 대상 요소만으로 부족하다**: 같은 값이 파일 목록·About 같은 다른 위치에 보이면 이미지에 남는다 — `value_exposed`(추출 값이 대상 밖에 가려지지 않고 보이면 캡처 거부) 검사를 둔다. 값이 3자 미만이면 검사에서 빠지므로(예: 별 0개) 그 위치는 마스크 규칙(`[class*=…]`·정규식)으로 직접 가린다.
- **Orca 기본 브라우저 프로필은 사용자의 로그인 상태**다 — 시범·측정은 `orca tab profile create --scope isolated`로 만든 빈 프로필로만 연다(`orca tab create --profile <id>`). 로그아웃은 `a[href^="/login"]` 존재·`meta[name=user-login]` 부재로 확인.
- DOM `button.type`은 폼 밖에서도 `submit`이다 — 제출 판정은 `type` 속성 유무와 `form` 소속을 같이 본다.

## 주행·복구(T04~T05)
- **학습으로 원본 해시(`sourceHash`)가 바뀌면 같은 실행의 완료 기록이 모두 불일치**가 되어 끝난 비가역 단계가 다시 수행될 수 있다 — 행동이 그대로인 단계(와 승격한 단계)의 실행 기록을 새 해시로 옮긴다. `rollback`도 같다(state 필수).
- 승인 `once`는 소모뿐 아니라 실행 예약이 있어야 부분 실패 뒤 다른 실행이 재사용하지 못한다. 복구 맥락의 승인에는 계정·업무·흐름·식별 키가 있어야 한다.
- history에 해시 앞 12자를 그대로 쓰면 ~1.5%가 계좌·전화 형식으로 오탐된다 — 숫자를 `g~p`로 바꿔 쓴다.
- 테스트 프로세스가 Orca를 동기 호출(`spawnSync`)하는 동안 같은 프로세스의 HTTP 서버는 응답하지 못한다 — 가상 화면 서버는 별도 프로세스로. Orca 탭이 쌓이면 호출이 점점 느려진다.
## 실제 서비스 시범·측정(T06)
- **화면이 줄인 글자는 값이 아니다**: GitHub 첫 화면은 긴 커밋 제목을 서버에서 `…`로 자르고 전체 글자는 속성·스크립트 어디에도 없다 — 펼침 단추를 눌러야 `…`로 시작하는 이어지는 글이 나온다. 주행 라이브러리는 `…`·`...`로 끝나는 값을 넘기지 않고 `truncated`로 멈추고, 전체 값을 읽는 방법은 단계 `command`에 적는다. 측정 입력의 제목이 짧으면 이 경로가 시험되지 않는다 — 긴 제목 저장소로 따로 확인한다.
- **`<button>`의 `value`는 빈 문자열**이다 — `e.value ?? e.textContent`는 버튼 글자를 못 읽는다. value는 INPUT·SELECT·TEXTAREA만.
- **내용 길이에 따라 움직이는 요소의 box**(제목 옆 커밋 링크)는 입력이 바뀌면 IoU가 떨어져 `moved`로 멈춘다 — rebaseline 복구가 실제 페이지에서 고치지만, 첫 주행부터 복구 1회가 든다.
- **가림 대상 요소는 복구 후보에서 빠진다**(값 보호 설계) — 추출 대상이 모두 가림 대상인 업무는 선택자가 바뀌면 자동 복구가 안 된다(사람 확인 후보는 아이디어로 발의).
- **세션 기록에 사용자 환경이 섞인다**: `orca tab list` 결과에 다른 탭 URL·작업 폴더가, Claude 프로젝트 폴더 이름 인코딩(`C--Users-<이름>-…`)과 8.3 단축 이름(`ABCDEF~1.XYZ`)에 사용자 이름이 들어간다 — 기록 가리기에 셋 다 넣는다. 부트 훅이 도는 세션(사용자 설정 사용)의 기록에는 대상 저장소의 프로젝트 메모리까지 들어가므로 원문을 남기지 않는다.
- **생성 머리말의 `--dir`**은 실행 위치 기준 상대 경로라, 임시 폴더에서 만든 플레이북에는 사용자 이름이 든 절대 경로가 박힌다 — 실행 위치 밖이면 자리표시로.
- **민감 형식 검사(`scanSensitive`)는 지도용**이라 세션 기록에 그대로 쓰면 UUID·tool id·커밋 SHA·비용 숫자·epoch가 대량 오탐된다 — 파일 종류를 나누고 메타데이터 종류를 빼되, 빼기 전에 걸린 글자를 직접 확인한다(오탐 정리 중에 다른 탭 URL 노출을 찾았다).
- 픽셀 가림 검사는 평균색이 아니라 box 안 가림색 픽셀 비율로 — 가림 상자의 흰 `●●●` 글자가 작은 box 평균을 흐린다. 기준은 대조군(가림 없는 같은 화면)을 돌리기 전에 정한다.
- Orca `eval`에 이미지 data URL을 넣으면 Windows 명령 줄 길이 한도를 넘는다 — 별도 프로세스 로컬 HTTP(CORS 허용)로 내준다.
- GitHub 공개 API는 익명 시간당 60회 — 정답 조회(세션당 4회)·실페이지 확인이 한 시간에 몰리면 막힌다.
- `--tools Read`만 준 세션은 스킬 목록을 조회할 수단이 없다 — 스킬 구별을 답으로 확인하려면 init 이벤트 스킬 목록으로 본다.
- `~/.claude/skills/synced/`의 관리 파일은 실행 중인 Claude Code가 주기적으로 다시 쓴다 — 실제 HOME 불변 검사는 그 폴더를 따로 본다.
- 측정용 헤드리스 세션(`claude -p`)에서 허용 도구 패턴 `Bash(orca *)`는 `P=…`로 시작하는 명령을 막는다(읽기 전용 `cat`·`find`는 도구가 자체 허용) — 프롬프트에 'orca로 시작하는 단일 명령만'을 적고 두 군에 같게 둔다.
