---
type: concept
title: 백로그 대시보드 자동 갱신과 Git 경계
summary: 대시보드 최초 생성과 Git 자료 갱신의 경계를 유지하고 프로젝트 상태·인덱스 자료를 안전하게 보존한다
tags: []
sources: [code:src/project/dashboard.ts, code:src/project/dashboard-init.ts, code:src/cli.ts, code:src/project/harness.ts, test:test/dashboard-init.test.ts, test:test/backlog-dashboard.test.ts, test:test/project-harness.test.ts, doc:skills/pace-project-init/SKILL.md, doc:docs/README.md, code:src/dashboard/backlog/core.js, code:src/dashboard/backlog/app.js, doc:templates/backlog/BACKLOG.md, doc:skills/pace-project-init/references/backlog-format.md, code:src/project/dashboard-layout.ts]
related: [작업-하네스-흐름]
created: 2026-11-07
updated: 2026-11-17
status: active
---

## 최초 생성과 갱신의 경계

opi 완료 시 `pace backlog init`이 실행한 PACE 패키지의 `src/dashboard/backlog/` 공용 화면을 참조하는 진입 HTML과 대상 자료 snapshot을 만든다. 완성된 기존 대시보드는 보존하며 부분 init 복구·전환은 남은 UI가 생성한 공용 진입점이고 기존 snapshot이 유효한 경우에만 처리한다. 다르면 자료를 보존하고 충돌을 보고한다. `refresh`는 완성 대시보드의 자료만 갱신한다. 저장소가 없으면 refresh는 Git을 만들지 않고 안내 후 건너뛴다. 부분 설치나 불완전 Git 목록 조회는 snapshot과 사용자 파일을 보존하고 실패를 보고한다.

완성된 dashboard의 자동 갱신은 backlog new·brief와 project new·start·task·done·finish·실제 merge 성공 후 수행한다. 원본 문서를 직접 편집한 에이전트는 커밋 전에 `pace backlog refresh`를 실행하며 저장소 개발용 기존 생성 스크립트도 호환된다. 대시보드가 없으면 `init`만 최초 생성 책임을 갖고 `refresh`는 생성하지 않는다.

## Git 저장소 경계와 경로 보존

현재 경로부터 상위 저장소를 찾아 실제 root에서 수집한다. Git `--show-toplevel` 출력에서는 레코드 마지막 줄바꿈 하나만 제거하고 경로 문자열은 trim하지 않는다. `openRepo`도 root·git-dir·common-dir 경로 출력에 같은 원칙을 쓴다. POSIX에서는 이웃 repo와 이름이 끝 공백인 repo를 함께 두고 요청 repo만 변경되는지 검사한다. Windows에서는 Git이 다른 경로로 해석할 수 있는 끝 공백·마침표 경로를 작업 전에 거부한다. 기존 worktree 안에서는 중첩 저장소를 만들지 않고 기존 `.gitignore`, `.git/info/exclude` 정책을 따른다.

상위 저장소가 없는 경우 `init`에서만 HOME 또는 파일시스템 루트 자체가 아닌 현재 폴더에 `git init`한 뒤 같은 Git 수집기를 사용한다. 자동 add/commit/remote/push는 하지 않는다. Git 실행 불가, 손상된 `.git`, Git 환경 지정, 권한 또는 조회 오류는 저장소 없음과 구분해 실패하며 init하지 않는다. `git init` 뒤 대시보드 생성이 실패하면 `.git`을 보존하고 실제 경로와 재시도 명령을 보고한다. 성공 출력은 실제 저장소의 절대 dashboard 경로를 표시한다. `new/brief`는 Git 전용이며 첫 commit과 main 체크아웃 조건이 필요하다. 조건이 없는 신규 폴더에서는 dashboard까지만 완료하고 하네스 미실행 사유와 선행조건을 보고하며 자동 commit이나 브랜치 변경은 하지 않는다.

## 전체 상태 전환

BL 출처 프로젝트는 start 준비 성공 뒤 BACKLOG.md 전체 상태를 진행으로 기록한다. worktree finish는 진행을 유지하고 실제 merge 성공 시 완료하며 main 직접 프로젝트는 finish 검사 성공 뒤 완료한다. 전체 백로그가 보류면 자동 전환을 거부하며 개별 보류 BR은 그대로 둔다. BR과 현황 표는 태스크 done의 책임이다. 전체 상태 변경 후 인덱스를 바탕으로 대시보드를 생성한다.

## 수집 실패와 보안 경계

Git 파일 열거가 경고를 stderr에 내면서 exit 0이어도 목록이 불완전할 수 있으므로 갱신을 실패시키고 기존 snapshot을 유지한다. 열거한 자료의 lstat은 ENOENT 경합만 건너뛰고 다른 오류는 실패시킨다. 대상 저장소 스크립트를 실행하지 않는다. Git 작업본 갱신은 `.gitignore`와 `.git/info/exclude`에 의해 무시되는 자료를 제외한다. 자동 커밋 대상 자료는 Git 인덱스의 경로·모드·크기·본문을 일괄 읽어 미스테이지 초안이 이력에 들어가지 않게 하며, 일반 조회 갱신은 작업본을 읽는다. 생성 파일 충돌은 rebase 중 다시 만들 수 있지만 사용자 문서 충돌은 멈춘다. 준비 실패 전에 dashboard 자료를 쓰지 않는다. 숨김·민감 이름·symlink·허용되지 않는 확장자와 크기 제한도 적용한다.

## 안전·운영 한계

생성은 잠금 안에서 임시 파일과 rename으로 발행한다. 재생성 가능한 data.js는 finish 청결 검사에서 예외이며 태스크 커밋에도 포함한다. 하드링크 미지원 파일시스템에서는 원 명령은 성공하더라도 대시보드 갱신이 경고로 실패할 수 있고 충돌 재생성이 막힐 수 있다. Windows와 PID 네임스페이스 공유 환경은 실측하지 않았다. 복구 잠금 소유자가 종료된 경우 다른 PACE 프로세스가 없음을 확인하고 경고에 표시된 잠금 경로를 수동으로 확인·제거한 뒤 `pace backlog refresh`를 실행한다.

## 결정 이력

초기 검토 중에는 비Git 일반 폴더를 자체 수집하는 안이 잠시 승인됐고 관련 파서·테스트가 만들어졌다. 독립 검토에서 상위 Git 탐지, Git ignore 호환성, refresh 범위 문제가 발견됐으며, 최종 사용자 결정은 비Git 전용 수집기를 제거하고 저장소가 없을 때 `git init`하는 방식으로 대체했다. 독립 재검증은 경로 trim, Git 목록 경고, init 후 오류 안내, HOME/root 초기화 경계, 절대경로 안내를 추가 보완으로 지적했고 이 경계를 반례 검사했다. 현재 `docs/README.md`와 `pace-project-init` 지침은 새 Git 저장소의 unborn 상태에서 dashboard 생성/조회와 backlog new/brief·project harness 선행조건을 구분한다.

## 테스트 fixture

대시보드 테스트는 특정 과거 백로그 이력·BR 수에 결합하지 않고 독립 합성 fixture를 쓴다. T번호 미끼·PROJECT 상태 우선·목표 절 검출은 단독 사례와 변이로 유지한다. 저장소 밖 init, 끝 공백 경로, 열거 경고·읽기 실패, init 후 실패, HOME/root 경계는 `test/dashboard-init.test.ts`·`test/backlog-dashboard.test.ts`가 다룬다.

## 백로그별 프로젝트 위치와 보관 조회

프로젝트를 보관 폴더로 옮겨도 백로그와 구현 이력의 연결은 유지한다. BACKLOG.md의 `- 프로젝트 기준 경로: projects/`를 저장소 루트 기준의 단일 설정으로 삼고, 보관 프로젝트는 해당 값을 `projects/backup/`으로 바꾼다. 생략하면 기존 projects/ 경로를 사용한다. 카드 프로젝트 ID·연결 프로젝트·단계별 태스크와 자료 조회가 같은 설정을 사용한다. 저장소 밖이나 숨김 경로는 거부한다.

백로그 자체가 backlogs/backup/BL…/BACKLOG.md로 이동해도 목록과 ID를 유지하며, 이동 전 상대 링크는 조회할 때 실제 자료 경로로 대응시킨다. 원본 프로젝트/태스크 문서를 일괄 재작성하지 않는다. 보관된 백로그의 sources/도 기존 수집 제외 정책을 유지한다. UI 사본과 배포 템플릿을 함께 갱신하고 자료를 다시 생성해야 실제 페이지에 반영된다.

## 공통 설치본과 프로젝트별 자료

화면·스타일·레이아웃은 src/dashboard/backlog에 한 번만 배포한다. 진입 HTML은 설치 CLI의 공통 자산을 file URL로 참조하고, 개발 CLI로 생성하면 해당 checkout을 참조한다. 프로젝트에는 backlogs/README.html과 backlogs/dashboard/data.js만 생성하며 공통 JS/CSS를 복제하지 않는다. 공용 코드 업데이트는 모든 공용 참조 화면에 새로고침 시 반영되지만 자료는 각 HTML 옆 data.js에서 읽어 분리한다. 데이터 경로를 유지한 이유는 기존 인덱스·자동 커밋·상태 갱신 정책을 바꾸지 않기 위해서다.

로컬 HTML을 서버 없이 직접 열기 때문에 진입 HTML의 참조는 설치 PC에 종속된다. 다른 PC나 설치 위치에서는 opi/init으로 연결을 갱신한다. refresh는 자료 갱신만 담당한다. 공용 참조가 아닌 기존 화면은 바이트를 보존해 전환하지 않았음을 알린다. 참조 갱신은 Git 변경을 만들며 사용자 커밋 이후 하네스를 진행한다. 자동 add/commit이나 초안 보호 우회는 하지 않는다.
