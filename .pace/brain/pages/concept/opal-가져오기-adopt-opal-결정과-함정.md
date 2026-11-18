---
type: concept
title: OPAL 가져오기 adopt opal 결정과 함정
summary: "adopt opal은 git mv로 .opal을 .pace로 옮기고 AGENT 표지·훅·진입점을 안전하게 바꾼다 — 판별은 원문 일치만, 복구는 변경 전 등록, 참조 보고는 위치만"
tags: []
sources: [code:src/project/adopt-opal.ts, test:test/adopt-opal.test.ts, test:test/adopt-opal-e2e.test.ts, test:test/adopt-opal-recover.test.ts, doc:README.md]
related: [작업-하네스-흐름]
created: 2026-11-16
updated: 2026-11-19
status: active
---

## 결정

- `pace adopt opal`은 `.opal/`을 `git mv`로 `.pace/`에 옮기고(이력 유지) AGENT.md의 표지 키(`opal_agent_version`→`pace_agent_version`)와 **본문의 `.opal/` 경로만** 바꾼다. 복사 후 삭제나 `.opal`을 읽는 호환 계층은 쓰지 않았다(유지할 형식이 늘어난다).
- 기본은 미리보기. `--apply`는 계획을 다시 만들어 같을 때만 쓴다(AGENT 원문·등록부·훅·진입점 지문). 검증은 이동 전에 끝내 복구 구간을 줄이고, 실패하면 이번에 바꾼 것만 되돌린다(undo는 변경 **전에** 등록).
- OPAL 홈(`~/.opal`) 프로필은 옮기지 않는다 — 캡틴 결정. 새 PC는 온보딩으로 새 프로필.
- 훅은 알려진 OPAL v1 원문과 정확히 같을 때만 교체(백업 `commit-msg.opal-backup`, 기존 백업은 덮어쓰지 않음). 수정된 훅은 보존하되 OPAL 제거 뒤 게이트가 빠진다고 경고한다.
- 대시보드 진입점은 OPAL 시절 `page.html`을 PACE v1 템플릿(설치본 file URL을 직접 담던 형태, `renderLegacyEntry`)에서 파생해 비교하고 — 교체는 v2 진입점과 이 PC의 local.js·.gitignore로(P003)(URL의 설치 경로만 허용, 같은 기반 경로의 세 리소스만), 정규화 표지를 위조한 입력은 거부한다.
- `.opal` 옆에 PACE 메모리 명령이 먼저 만든 `.pace/memory`만 있으면 **회수**한다(2026-11-17 실사용: 다른 PC에서 OPAL 프로젝트에 `pace memory`를 써서 생김). `.opal/memory`에 먼저 합친 뒤 평소대로 옮긴다: 없는 파일은 옮기고, 같은 내용·`INDEX.md`는 버리고(목차는 파일 목록에서 다시 만듦), `status.md`는 마지막 커밋 시각이 더 최신인 쪽(같으면 `.pace`). 메모리 밖 항목·`.md`가 아닌 항목·커밋 안 한 변경·추적 안 되는 파일·숨김 표지·같은 이름의 다른 내용이면 어느 쪽이 정본인지 사람이 정하도록 멈춘다. 실패하면 영향 파일 바이트를 저장해 둔 것으로 양쪽을 되돌리고 인덱스도 `git reset`한다.
- 참조 보고는 `파일:줄`만 낸다 — 비밀 탐지가 모든 표현을 잡지 못해 본문을 출력하면 비밀이 샌다.

## 함정

| 함정 | 증상 | 대응 |
|---|---|---|
| `git status`만 믿기 | `status.showUntrackedFiles=no`·`assume-unchanged`·`skip-worktree`면 `.opal`의 미커밋 변경을 놓침 | `--untracked-files=all`, `ls-files -v`의 소문자·`S` 표지는 거부 |
| 등록부 첫 항목만 검사 | 같은 경로에 정상·충돌 항목이 있으면 정렬 순서에 따라 통과 | 같은 경로 항목 전부 검사 |
| 정규화 표지 위조 | URL을 정규화 표지 문자열로 바꾼 진입점이 OPAL 원문과 같다고 판정 | 정규화 전 입력에 표지가 있으면 거부 |
| 복구 순서 | 훅 복원 실패 뒤 백업을 지우면 원본을 잃음 | 훅 복원이 성공한 뒤에만 이번 백업 삭제, 백업은 `wx`로 배타 생성 |
| 소스 문자열의 NUL | diff가 binary로 표시돼 검토 불가 | 구분자는 `\0` 대신 보이는 문자 |
| 시험 표본의 한계 | PACE 도구로 만든 `.pace`를 `.opal`로 옮긴 표본은 OPAL 원본이 아니다 | 실제 OPAL 표본이 생기면 e2e 표본 교체 |
| 회수 실패 복원을 `git checkout`으로 | `core.autocrlf=true`에서 CRLF로 다시 써져 원본과 바이트가 달라지고, 다시 만든 목차가 `.opal`에 남음 | 적용 전 바이트를 저장해 그대로 되쓰고(없던 파일은 지움), 스테이징은 `git reset -q HEAD -- .opal/memory .pace/memory` |
| 전체 검사 중 프로세스 종료 | 다른 작업자가 `scripts/test.ts` 명령줄의 node를 모두 종료 | 시작 시각·끊김 여부를 증거에 적고 끊기면 다시 |

## 남은 것

- 실제 OPAL 저장소 가져오기는 2026-11-17 관측했다(실데이터 시험 1곳 통과, 다른 1곳은 `.pace/memory` 회수로 해결). 표본 수가 적어 모든 OPAL 산출물 형식을 대표하지는 않는다.
- 검사와 쓰기 사이의 동시 변경(TOCTOU)은 지원 조건 밖 — README에 명시.

## 변경 기반 검사 추가 뒤 근거 대조 (2026-11-19)

P004 T04의 근거 변경을 대조했다. cli.ts 변경은 test changed 도움말이며 기존 부트·브레인·프로젝트 명령 분기는 그대로다. harness.ts는 정의서 목록 export, changed 전용 검증 commit 인자 및 셸의 구조화된 실행 상태를 추가했다. 인자를 생략한 기존 all/finish의 main 기준과 ok/output 계약은 유지하며, 설치·프로젝트 생명주기·지표·사건·부트 전달은 변경하지 않았다. README의 OPAL 채택 경로도 유지했다. 따라서 위 기존 주장과 실측의 역사적 한계를 유지한다. 원래 시험 본문과 최종995건의 범위/판정 보존은 T04 TASK-CLOSE 및 t03-regression-comparison에 연결되어 있다.

변경 기반 검사는 별도 경계다. 현재 staged/unstaged/untracked 작업본만 대상으로, 기준 commit과 같은 map의 명시 checks를 먼저 실행한다. 숨김 index/sparse·삭제·미분류·불확실성은 실제 전체 검사로 전환하고, 시작 후 실제 실패1·예외 확인 불가3은 성공으로 숨기지 않는다. 커밋된 브랜치 차이는 빠른 범위에 포함하지 않으며 finish 전체 검사를 유지한다. 자세한 근거는 [[변경-기반-검사와-실행-선언-신뢰-경계]]다. Windows 관측을 실제 설치기·POSIX·다른 프로젝트 일반 성능 검증으로 확대하지 않는다.
