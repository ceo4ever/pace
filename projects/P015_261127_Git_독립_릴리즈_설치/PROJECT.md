# P015 Git 독립 릴리즈 설치

- 팀 측정: v1

- 상태: 완료
- 규모: 작은 프로젝트(태스크 없음)
- 출처: 대화 2026-11-27 — Windows 설치 캐시 main ahead 1/behind 15의 ff-only 실패 뒤 릴리즈 한 버전만 설치하도록 개선 요청
- 브랜치: `project/P015` · worktree: `../pace.wt/P015/`
- 작업자: codex
- 작업자 역할: pace-project-lead
- 시작: 2026-11-27

## 목적

사용자가 설치용 Git 저장소의 분기·커밋을 정리하지 않고 PACE 릴리즈 한 버전을 설치·업데이트하게 한다. 공식 배포 아카이브를 임시로 받아 기존 설치 엔진의 프로그램 교체·설정 보존을 사용한다. 개발 저장소 직접 설치는 유지한다.

## 재료

- scripts/install.ps1:60-66 및 scripts/install.sh: 영구 설치 캐시의 fetch/checkout/pull --ff-only가 업데이트를 막는다.
- scripts/get.ps1: ASCII 입구가 BOM 있는 install.ps1을 임시 파일로 실행한다.
- src/setup/install.ts:390-425: 기존 app 교체·복원과 사용자 설정 보존.
- README.md, docs/SETUP.md, docs/SECURITY.md, docs/TESTING.md.
- test/install-script.test.ts, test/install-windows-wrapper.test.ts.
- 브레인: .pace/brain/pages/concept/install-and-launch-pitfalls.md.
- 2026-11-27 gh api repos/ceo4ever/pace/releases/latest 확인: 정식 공개 v0.1.5, 별도 assets 없음. 릴리즈 태그의 GitHub 소스 아카이브 사용 가능.
- 사용자 PC는 설치 캐시 main ahead1/behind15이고 작업 파일 변경 없음. fin-link 프로젝트와 별개다.

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 원격 기본 설치는 최신 공개 정식 릴리즈 한 버전이며 Git 및 기존 설치용 저장소 상태에 의존하지 않는다 | 모의 릴리즈·아카이브와 격리 설치, Git 실행 금지, 분기된 옛 캐시 sentinel 보존·버전 대조 |
| P-2 | 신규·업데이트가 기존 설치 엔진을 사용하고 사용자 프로필·메모리·별도 설정 및 이전 Git 캐시를 보존한다 | 임시 HOME/PACE_HOME에서 두 버전 전환·사용자 sentinel·옛 캐시 바이트 대조 |
| P-3 | 조회·다운로드·아카이브 오류는 설치 전에 중단하고 기존 설치를 보존한다. 성공 한 줄·실패 상세 원인을 출력한다 | 실패 응답·손상 및 경로 이탈 압축·설치 실패 시험과 임시 자원 정리 |
| P-4 | POSIX·Windows 입구와 로컬 소스 설치·명시 ref/소스 override 계약을 유지 또는 명확히 안내하고 BOM/ASCII를 보존한다 | 기존·신규 회귀, BOM·ASCII, 문서 대조. Windows PS5.1 실측 가능 여부·미실행 한계 명시 |
| P-5 | 전체 검사·보안 검사·새 맥락 독립 검토를 통과하고 증거를 남긴다 | finish, evidence, 독립 tester/reviewer 판정 |

## 설계

영구 clone을 reset/rebase하는 방식은 로컬 커밋을 다루고 Git 오류가 반복되므로 채택하지 않는다. 공식 릴리즈 태그를 선택하고 아카이브를 고유 임시 경로로 받아 설치 뒤 정리한다. 옛 LOCALAPPDATA/pace 및 ~/.local/share/pace는 삭제하거나 수정하지 않는다. 여러 릴리즈의 영구 캐시는 만들지 않는다.

명시 --repo/-Repo는 지정한 소스를 설치하며 Git 동기화하지 않는다. PACE_REF/명시 ref 설치와 소스 override의 지원·오류를 숨기지 않는다. 공식 GitHub HTTPS가 기본이며 모의 I/O는 시험에서만 쓴다. 런타임 라이브러리 의존성은 추가하지 않는다. 압축 형식·플랫폼 공용 처리 범위는 구현자가 안전성과 검증 비용을 대조해 정하고 기록한다.

보안 영향: scripts/install.* 및 필요시 새 설치 보조 모듈은 외부 코드 다운로드·압축 해제·사용자 홈 프로그램 교체 경로다. 경로 이탈·링크·안전한 임시 경로·다운로드 실패 때 기존 설치 보존을 우선 검토한다. 삭제는 이 실행이 만든 임시 자원에 한정하고 setup의 설정 관리·백업을 우회하지 않는다. 실제 홈 설치·daemon 조작·push·릴리즈 게시는 하지 않는다.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| scripts/install.sh, scripts/install.ps1, 필요시 scripts/get.ps1·새 설치 보조 모듈 | 릴리즈 다운로드·임시 설치·실패 진단 |
| test/install-script.test.ts, test/install-windows-wrapper.test.ts, 필요시 새 설치 시험 | 분기 캐시와 무관한 업데이트·신규 설치·실패 안전성 |
| README.md, docs/SETUP.md | 배포 방식·버전 선택·옛 캐시 보존 안내 |
| .pace/brain/ | 선택 이유·검증 한계 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-27 | 사용자 개선 요청으로 착수. 하나의 설치 흐름을 한 번에 검증하는 태스크 없는 프로젝트다. main의 이전 조사·이슈 삭제 미커밋과 분리하기 위해 worktree를 쓴다. |
| 2026-11-27 | 호스트 기능: pace project start가 띄운 Orca 작업자가 worktree를 소유하고 독립 tester/reviewer를 배정한다. 허브는 증거를 확인한다. 실제 설치는 main에서만, worktree 검증은 임시 HOME/PACE_HOME으로만 한다. |
| 2026-11-27 15:33 | (자체 판단) 착수 문서의 태스크 없는 범위를 적용. 두 플랫폼에서 Node 표준 기능으로 공식 tar.gz를 검사·임시 해제하고 기존 설치 엔진을 실행한다. |
| 2026-11-27 15:45 | (자체 판단) 옛 PACE_REPO는 캐시 위치였으므로 상속해도 쓰지 않는다. --repo/-Repo와 개발 체크아웃이 로컬 소스를 명시하고, 명시 원격 ref와 공개 GitHub URL 예외는 P-4에 따라 문서화한다. |
