# T03 팀 갱신 모드 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

신규 생성, 기존 PACE 원본 갱신, native 정의 이전·재구성의 진입을 실제 원본 판독 범위에 맞췄다. 세 모드에서 필수 역할을 점검했다. 갱신에서는 미채택 프로젝트의 반복 업무와 허브 쪽 백로그를 근거로 사용하고, 미수집 수치를 미확인으로 두는 동작을 관측했다. 원본과 생성물의 지문은 승인 전 유지됐고, 승인된 변경을 격리 팀에 반영한 뒤 동기화 차이는 0건이었다. [독립 목표 검토](evidence/review-records/R5.json) · [계약 대조](evidence/reviewer-recheck.md) · [독립 tester](evidence/tester-recheck.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 로드 결과와 모드·필수 역할 점검 U01~U04, description 선택 U05. [독립 채점](evidence/tester-recheck.md) |
| T-2 | 통과 | 미채택 P601과 팀 채택 P602, 백로그 반복 검토, 기존 원본의 행을 연결했다. [기록 작성과 검증](evidence/fixture-provenance.md) · [U06 원응답](evidence/eval-final/U06/response.md) |
| T-3 | 통과 | 세 비참여 상태, 별도 중복 근거와 결정 주체, 회고의 반복 제안 방지 및 승인 전 지문 일치. [U07 원응답](evidence/eval-release/U07/response.md) · [전후 지문](evidence/eval-release/U07/roles-after.json) |
| T-4 | 통과 | 실제 승인 사례에서 공통 계약과 점검 표지 유지, sync 무차이, 무단 문단·표지 변조 대조, 현 저장소 무차이. [명령](evidence/eval-sync-recheck/U08/commands.json) · [저장소 검사](evidence/eval/U08/repository-check.json) · [브레인](../../../../.pace/brain/pages/flow/저장소-팀-설계와-갱신-흐름.md) |

## 단위 테스트

Orca의 브라우저 E2E 제외 설정으로 전체 검사 1,373건 통과, 실패 0, 건너뜀 17. 갱신 관측 문구를 보완한 뒤 표적 스킬 구조 검사 9건 통과. [검사 증거](evidence/check-results.txt)

## E2E

U01~U05는 진입 모드·필수 점검·스킬 선택, U06~U07은 역할별 검토표와 증거·결정 경계, U08은 실제 승인 적용 절차다. 첫 기록 기반 응답에서 비참여 상태만으로 호출 수를 추정하는 문제가 드러났다. 관측값과 상태를 구분하고 근거 경로 형식을 명시한 뒤 U06·U07을 재실행했다. 독립 작성 입력의 사건 47행과 검토 9행, 팀 영수증 6개를 실제 판독기로 확인했다. [원래 U07 응답](evidence/eval/U07/response.md) · [최종 독립 채점](evidence/tester-recheck.md)

## 리뷰

- 사전 reviewer pass · blocking 0. 미채택·백로그의 기록, 회고로 처리한 지적, 승인 전 지문과 보존 문단을 검증으로 연결했다. [사전 검토](PRE-REVIEW.json)
- tester pass · reviewer blocking 0. 조건 미발생과 미수집 호출 집계의 구분을 보강했다. U04가 실제 기존 native 경로의 충돌·권한 보존을 검토했고 U08에서 경계 문단을 지우면 거부됐다. [tester](evidence/tester-recheck.md) · [reviewer](evidence/reviewer-recheck.md)
- 교본: 해당 없음(코드 변경 없음).

## 남긴 것

갱신 도입 시 최근 완료 프로젝트는 최대 다섯 건을 기본으로 하고 별도 관측 범위의 이유를 남긴다. 새 호출 집계는 BL261125_01 BR03을 기다린다. T04는 이 갱신 흐름으로 기획자 원본과 표지를 적용한다.
