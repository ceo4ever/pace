# 설치

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

이 문서가 다루는 경로 중 `src/setup/`·`scripts/install.*`는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)의 민감 경로 표와 체크리스트를 본다.

## 설치

- 경로: `src/setup/`, `scripts/install.sh`, `scripts/install.ps1`·`install.cmd`·`get.ps1`, `scripts/install-release.mjs`
- 스택·형식: TypeScript·sh·PowerShell·Node.js

훅·대체 규칙·스킬 등록, `pace onboard`. 데이터는 `PACE_HOME`, 설치본·명령·`install.json`은 사용자 홈 `~/.pace`. 스킬은 `.pace-managed` 표지가 있는 것만, 훅·블록은 PACE 부트 명령·PACE 표지가 있는 것만 바꾸고 다른 사용자 훅·스킬은 그대로 둔다. 고친 설정 원본은 `~/.pace-install-backup-<시각>-<임의값>/`에 둔다. Antigravity IDE의 공식 전역 훅은 CLI와 공유하는 설정 경로에 있어 CLI에서도 로드될 수 있으며 CLI 지원 검증을 뜻하지 않음

### 원격 소스와 로컬 소스

`install.sh`와 `install.ps1`은 지정한 로컬 소스(`--repo`/`-Repo`) 또는 스크립트가 속한 체크아웃을 설치한다. 로컬 소스의 파일은 Git 명령으로 갱신하지 않는다. 로컬 소스가 없으면 두 입구가 공식 `main`의 공용 준비 스크립트를 임시 폴더에 받는다. 옛 캐시 위치인 `PACE_REPO`는 상속돼도 사용하지 않는다. Windows의 `get.ps1`은 ASCII로 유지하며, BOM이 붙은 `install.ps1`을 임시 파일로 받아 별도 `-File` 프로세스에 넘긴다. `PACE_INSTALL_URL`을 지정하면 `get.ps1`이 받는 입구 스크립트 주소만 바뀐다.

공용 준비 스크립트는 `releases/latest`에서 공개 정식 릴리즈의 태그를 확인하고 해당 태그의 `tar.gz`를 받는다. 원격 ref를 지정하면 릴리즈 조회를 건너뛰고 그 ref의 아카이브를 받는다. `PACE_REPO_URL`은 공개 GitHub HTTPS 저장소를 지원한다. 인증이 필요한 저장소나 다른 종류의 원격 저장소는 로컬에 준비해 `--repo`/`-Repo`를 사용한다. 공식 호스트 간 HTTPS 다운로드만 따르며, 아카이브의 크기·헤더·경로를 검사해 일반 파일과 폴더만 해제한다. 정식 릴리즈 태그와 패키지 버전이 일치해야 설치 엔진을 시작한다.

릴리즈 준비에 실패하면 사용자 홈의 설치본을 건드리기 전에 중단하며, 입구가 이번에 만든 임시 폴더를 정리한다. 예전 설치 캐시(`~/.local/share/pace`, Windows `%LOCALAPPDATA%\pace`)는 이 과정에서 사용하거나 갱신하지 않는다. 기존 설치 엔진이 프로그램을 교체하고 사용자의 데이터와 설정을 관리한다.

## Canvas 묶음 설치

`skills/pace-canvas-skills/`는 Canvas Studio 배포 폴더(2.0.1) 전체이며(본문·배포 식별자·해시는 봉인 — 폴더 이름만 PACE) 루트에 SKILL.md가 없다. 설치기는 복사 전에 `manifest.json`의 파일 목록·SHA-256이 폴더와 정확히 같은지 읽기만으로 대조하고(어긋나면 설치 전체를 멈춘다), 묶음을 `~/.pace/app/skills/pace-canvas-skills/`로 통째 교체해 낡은 파일을 남기지 않는다. 각 도구 스킬 폴더에는 `canvas-read`·`canvas-wireframe` 입구(SKILL.md + `.pace-managed`)만 설치하며 본문은 설치본 정본의 절대 경로를 가리킨다. PACE 관리 표지(`.pace-managed`)가 없는 같은 이름 입구는 보존된다. 비밀 검사는 묶음 JS 5개의 오탐을 경로+SHA-256 일치일 때만 제외한다.
