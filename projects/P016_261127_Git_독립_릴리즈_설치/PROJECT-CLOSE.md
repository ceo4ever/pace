# P016 Git 독립 릴리즈 설치 — 통합 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-27

## 목표 달성 판정

기존 설치 개선의 사용자 목표와 먼저 공개된 원격 팀 통합을 함께 보존한다. 새 기능을 더하지 않고 번호 충돌을 해소했으며, 실행 당시 P015 검증 자료는 historical/에 그대로 남긴다. Windows PowerShell 5.1 실기 미확인이라는 원래 한계는 유지한다. [이관 설명](MIGRATION.md) · [독립 통합 확인](evidence/integration-review.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | evidence/integration-verification.txt — 두 원본 조상, 설치 코드 9개 및 원격 변경의 blob·mode·정규화 diff 대조 |
| P-2 | 통과 | evidence/historical-sha256.json, evidence/verify-integration.py — 원본 자료 18개·실제 파일 집합·고유 번호와 이름 |
| P-3 | 통과 | 독립 판정 blocking 0·should_fix 0, 최종 전체 검사·보안 검사는 finish 관문 기록 |

## 태스크 결과

별도 태스크 없는 통합 작업이다. 과거 설치 실행의 검토·시험·보안 결과는 [원본 마감](historical/PROJECT-CLOSE.md)과 [실행 증거](historical/evidence/install-verification.md)에 있다. 현재 통합은 [독립 수정 확인](evidence/integration-review.md)과 원본 보존 검증으로 구별했다. 선언된 전체 검사와 보안 검사 결과는 finish 영수증으로 확인한다.

## 보안

설치 코드·시험·설치 문서는 원래 승인 대상과 같은 Git blob·모드이며 외부 코드 다운로드 기능을 추가하지 않았다. 원격 팀 소스·문서·완료 자료도 그대로다. 독립 확인에서 보존·계보·새 증거 스크립트에 blocking 0, should_fix 0이었다. 선언된 node scripts/secret-scan.ts와 전체 검사는 finish가 수행한다. 원본 검증의 ID·트리 영수증을 바꾸지 않았다. 사용자 홈 실제 설치·강제 푸시·원격 덮어쓰기를 하지 않는다.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| projects/P016_261127_Git_독립_릴리즈_설치/ | 반영 | 현재 등록과 바이트 보존 historical/ 및 이관·검증 근거 |
| projects/METRICS.md, backlogs/dashboard/data.js | 반영 | 파일 목록에서 재생성, 기존 팀 P015 지표 스냅숏은 보존 |
| .pace/memory/status.md | 반영 | 양쪽 작업과 번호 이관·공개 반영 상태 |
| 브레인(`.pace/brain/`) | 반영 | 작업-하네스-실측-함정의 번호 충돌·증거 보존·CRLF blob 대조 절. 원래 설치 선택 이유는 기존 페이지와 historical/에 보존 |

## 남은 일

Windows PowerShell 5.1 실제 검증은 git-독립-릴리즈-설치-windows-실측 메모리를 유지한다. 공개 반영은 추가 통합 커밋을 포함한 푸시 대상 확인 뒤 일반 푸시로 진행한다.

## 회고

다른 clone이 같은 번호를 먼저 공개한 상황에서 기능 코드를 다시 쓰지 않았다. 실행 당시의 검증 ID를 치환하는 대신 원본 증거를 보존하고 현재 등록을 분리했다. 합쳐진 Git 이력의 P015 수치를 재집계하면 서로 다른 실행이 섞일 수 있어 과거 스냅숏과 현재 통합 지표를 구별한다.

## 지표

[지표 집계](METRICS.md)

P016은 통합·이관 작업만을 나타낸다. 과거 설치 프로젝트의 실행 시간·역할별 토큰·검토 수치는 [원본 지표](historical/METRICS.md)에 보존하며 P016 값으로 옮겨 계산하지 않는다.

## 배포

아직 공개 반영 전이다. 원래 커밋 7개와 원격의 기존 변경을 보존한 추가 통합·마감 커밋을 준비했다. GitHub main 일반 푸시를 수행하기 전 최종 대상을 사용자에게 제시한다.
