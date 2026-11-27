# 릴리즈 설치 검증

2026-11-27, macOS arm64, Node 24.22.3. 검증마다 임시 사용자 홈과 별도 `PACE_HOME`을 사용했다.

| 검사 | 관측 |
|---|---|
| `node --test test/install-script.test.ts test/install-windows-wrapper.test.ts` | 종료 0, 통과 10, Windows 실기 4 미실행. 모의 릴리즈 1.2.3 → 2.3.4 교체, 명시 ref·GitHub 저장소 경로와 Git 호출 금지, 프로필·메모리·사용자 설정·구 캐시 바이트 보존을 대조했다. 조회 503, 아카이브 404, 비공식 리다이렉트, 손상 아카이브, 상위 경로 이탈, 링크, 버전 불일치, 설치 엔진 거부 시 기존 앱과 임시 폴더를 대조했다. |
| 공개 릴리즈와 실제 분기 캐시 | 로컬 `main`과 `origin/main`이 각각 1커밋 앞선 실제 임시 저장소(`git status --porcelain=v2 --branch`의 `branch.ab +1 -1`)를 기본 구 캐시 위치와 `PACE_REPO`에 지정했다. `bash -s < scripts/install.sh`로 공개 v0.1.5 신규·업데이트를 실행했다. 종료 0, 설치 앱 `--version`은 `0.1.5`, Git 실행 표식 없음, 전후 브랜치 상태와 로컬 파일 동일, 설치 임시 폴더 비어 있음. 아직 공개되지 않은 준비 스크립트 다운로드만 작업본 복사로 대체했다. 릴리즈 조회와 아카이브 다운로드는 실제 GitHub 응답을 사용했다. |
| PowerShell 7.7.0, macOS | `get.ps1`을 `Invoke-Expression`으로 평가하고 자식 PowerShell에서 작업본 `install.ps1`을 실행했다. 공개 v0.1.5 신규·업데이트, 설치 프로그램 버전, 자식 종료 후 부모 셸 생존, 한글과 공백이 있는 임시 경로, 설치용 `pace-*` 폴더 정리를 확인했다. 종료 0. 공개되지 않은 입구·도구 다운로드는 작업본 복사로 대체했고 Windows 사용자 PATH 조회만 격리했다. |
| 형식 | `bash -n scripts/install.sh` 종료 0. `install.ps1` 선두 바이트 `efbbbf`와 `get.ps1` ASCII를 확인했다. |

Windows PowerShell 5.1의 실제 레지스트리, Windows Git Bash, Windows 파일시스템에서의 래퍼 실행은 이 호스트에서 관측하지 못했다. Windows 전용 검사는 해당 환경에서 실행되도록 남겼다.
