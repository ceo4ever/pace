# P015 Git 독립 릴리즈 설치 — 마감

- 프로젝트 [PROJECT.md](PROJECT.md) · 2026-11-27

## 목표 달성 판정

상위 목적에 부합하고 완료 기준의 범위에서 달성했다. 실제로 분기된 옛 캐시를 둔 채 공개 v0.1.5를 임시 사용자 홈에 설치·업데이트했다. Git 실행 없이 두 번 모두 완료했고 이전 캐시의 상태와 파일을 보존했다. 두 버전 교체 시험에서 사용자 프로필·메모리·별도 설정도 보존했다. 실제 Windows PowerShell 5.1 동작과 공개 후의 두 부트스트랩 다운로드는 관측 범위 밖이다. [실행 증거](evidence/install-verification.md) · [독립 목표 대조 1단계](evidence/review-records/R1.json) · [계약과 보안 재검토](evidence/review-records/R2.json)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 충족 | 공개 최신 릴리즈 v0.1.5, 실제 분기 저장소와 금지 Git 표식 대조. |
| P-2 | 충족 | 기존 설치 엔진으로 모의 1.2.3 → 2.3.4 교체, 사용자 데이터·설정·옛 캐시 보존. |
| P-3 | 충족 | HTTP·압축·릴리즈 검증 거부, 설치 엔진 실패, 결과 출력과 정리 대조. 압축 경로·링크·중복·부모와 응답 크기 시험은 각 실패 원인을 검사한다. |
| P-4 | 충족 | 로컬·명시 ref·공개 GitHub 재지정, BOM·ASCII, macOS PowerShell 7.7 격리 실행 및 Windows 5.1 미실행 한계 기록. |
| P-5 | 마감 관문과 독립 증거 | 전체 검사는 `pace project finish P015`의 검사 기록에서 확인한다. 독립 시험 및 보안 검토를 아래에 연결했다. |

## 태스크 결과

착수 때 정한 범위에 따라 프로젝트 단위로 수행했다. 별도 테스터의 최종 판정은 blocking 0건이며 변이 11개를 검출했다. [설치 검사](evidence/install-verification.md) · [독립 시험](evidence/independent-tester.md) · [수정 확인](evidence/tester-recheck.md)

## 보안

공식 HTTPS 호스트, 리다이렉트, 압축 크기·종료 블록·경로, 설치 전 사용자 설정 보존 경계를 검토했다. 별도 읽기 전용 재검토 판정은 blocking 0건이다. 준비 스크립트는 현재 공개 v0.1.5에 없어서 공식 `main` 입구가 이를 제공한다. 같은 ref로 설치해도 입구의 준비 코드가 달라질 수 있다. [독립 보안 재검토](evidence/review-records/R2.json)

선언된 기계 보안 검사 `node scripts/secret-scan.ts`를 통과했다. 마감 관문이 설치 변경과 프로젝트 증거를 다시 검사한다.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `scripts/install.sh`, `scripts/install.ps1`, `scripts/get.ps1`, `scripts/install-release.mjs` | 반영 | 공개 릴리즈 선택·검사·정리와 기존 설치 엔진 호출. |
| `test/install-script.test.ts`, `test/install-windows-wrapper.test.ts`, `test/fixtures/install-release.ts` | 반영 | 두 버전 교체와 Git·기존 캐시 독립, 압축·다운로드 실패 및 그 실패 원인 대조. |
| `README.md`, `docs/SETUP.md` | 반영 | 원격·로컬 설치, 버전 및 저장소 재지정, 옛 `PACE_REPO` 캐시 처리. |
| 브레인(`.pace/brain/`) | 반영 | [설치·실행 함정](../../.pace/brain/pages/concept/install-and-launch-pitfalls.md#분기된-설치-캐시에서-벗어나는-원격-설치-2026-11-27)에 캐시 교체 결정과 근거를 남겼다. |

## 남은 일

Windows PowerShell 5.1 실기와 사용자 PATH는 프로젝트 메모리의 `git-독립-릴리즈-설치-windows-실측`에 남겼다.

## 회고

분기 캐시가 생긴 실제 상황과 아카이브 오류의 실패 원인을 각각 검사했다. 검토에서 찾은 이전 환경 변수와 변이 시험의 검출력 문제를 보완했다. Claude 직접 교차 보안 검토는 주간 사용량 한도로 실행을 완료하지 못해 별도 Codex 세션에서 진행했다. 독립 실행 시험은 Orca의 별도 Claude 세션에서 수행했다.

| 구분 | 입력 | 요약 |
|---|---|---|
| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 독립 검토와 시험 결과를 연결했다. 역할 정의 변경은 없으며 집계 범위와 활동 근거의 한계를 기록했다. |

## 지표

[지표 집계](METRICS.md)

별도 세션에서 독립 목표 재검토와 실행 시험을 관측했다. 프로젝트 구간과 역할별 집계가 아직 닫히지 않아 다른 프로젝트와 부담을 비교하지 않는다.

## 배포

해당 없음. 공개 입구의 반영은 main 병합과 배포 승인 뒤 이루어진다.
