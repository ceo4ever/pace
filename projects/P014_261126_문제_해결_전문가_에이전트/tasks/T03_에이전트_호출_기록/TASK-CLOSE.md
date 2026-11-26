# T03 에이전트 호출 기록 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

PACE 직접 실행과 PM 입력이 호출 시도당 다섯 항목과 측정 출처를 보존한다. P014에서 실제 Claude 검토 두 시도가 이름별 호출 수, 알려진 시간·토큰, 미확인 총량으로 나타났다. 구판과 신판의 기존 팀·사건·검토 지표를 비교했다. 호스트 자동·외부 검토 적용은 T07이 인수하고 P-7 전체는 PROJECT-CLOSE에서 대조한다. [owner 결정](evidence/owner-call-ledger-location.md) [실제 stats](evidence/live-call-stats.json) [독립 목적 대조](evidence/reviewer-stage1.json) [독립 tester](evidence/tester-stage1.json)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1. 공통 JSONL v1에 다섯 값의 출처를 담는다. 수동 입력과 실제 p 결과를 같은 v1 타입과 ID에 다시 적용했다. 프로젝트와 백로그 위치 및 null과 0의 차이를 확인했다. [최종 후보](evidence/implementation.patch) |
| T-2 | 통과 | S-1·S-2. 중복·역순·병렬, 종료 소유 잠금 복구, 불완전 기록·충돌·링크, 다른 프로젝트 원장 출력과 같은 ID 시작 시각 변경을 시험했다. [tester 재검증](evidence/tester-stage2.json) |
| T-3 | 통과 | S-3·S-4. p·ACP·체인·verify 및 대체 실행, 실제 타임아웃·SIGTERM, 실행 후 로컬 사본 오류, skip·사전 거부·발급·예산 차단, 판정 ref와 원장 측정을 검증했다. [설정 출처](evidence/effort-provenance.md) [교차 검토](evidence/review-records/R2.json) |
| T-4 | 통과 | S-5. 범위별·실행기별 알려진 시간·토큰과 미확인 수, 구판 대표 태스크 stats·기존 검토/사건 지표·팀 채택과 미채택 경계, 두 체크아웃의 동일 ID 집계를 확인했다. [구판 재현](evidence/pre-design-host-and-size.md) [독립 비교](evidence/tester-stage2-initial.json) [실제 stats](evidence/live-call-stats.json) |

## 단위 테스트

- 전체 선언 검사 **1516개 중 1499개 통과, 실패 0개, 건너뜀 17개, 종료 0**. 임시 `TMPDIR`·`PACE_HOME`, `PACE_SKIP_BROWSER_E2E=1`, 동시 실행 6과 해당 테스트 프로세스의 Git 자동 유지보수 해제를 사용했다. 작업 단계에서 관측한 탐침·A-3 회귀 세 건을 보완하고 기존 테스트를 변경 없이 재검증했다. [최종 전체 검사 요약](evidence/full-check.txt) [초기 지적과 대응](evidence/implementation-review1-disposition.md)
- 최종 후보의 재검증 전 독립 실행은 106개 중 105개 통과, Windows 전용 한 건 건너뜀, 실패 0이었다. 추가 허가 범위 세 건을 독립 실행했고 모두 통과했다. 최종 수정의 독립 집중 시험 2/2 및 별도 재현 6/6 통과다. [독립 범위 검사](evidence/tester-stage2-initial.json) [최종 재검증](evidence/tester-stage2.json)
- `node scripts/secret-scan.ts`를 실행해 통과했다. TypeScript·verification 교본에서 입력 경계, 로컬 파일 안전, 상태·출처를 대조했다.

## E2E

- 임시 Git 프로젝트·백로그와 등록 실행기의 CLI 진입점을 사용했다. 두 프로젝트를 두고 서로 다른 검토 출력이 호출 원장을 덮을 수 없는지, 상대 경로와 절대 경로 양쪽을 검사했다. 자식과 테스트 프로필은 격리했다. [독립 재검증](evidence/tester-stage2.json)
- P014의 실제 Claude 교차 검토 두 호출이 시도당 한 행으로 남았다. 신판 `pace project stats P014 --json`은 기존 team·reviewLedger와 함께 `pace-reviewer`의 시간과 토큰을 표시했다. 구판 `bd77aa2`와 현행은 호출 절과 조회 시각 외 대표 태스크 팀 stats 결과가 일치했다. 부가 실측에서 호출 기록만으로는 미채택 프로젝트에 회고가 요구되지 않았고, 팀 채택 표시를 추가하면 기존 요구가 적용됐다. [실제 stats](evidence/live-call-stats.json) [구판과 현재 비교](evidence/tester-stage2-initial.json)

## 리뷰

- 사전 Claude 교차 pass, blocking 0과 구현 모드. 시험의 교차 입력 대조·실패 뒤 재시도·skip/발급·검토 집계 대조를 보강했다. [사전 기록](review-records/R1.json) [지적 대응](evidence/pre-review-1-disposition.md)
- 1단계의 reviewer는 Claude, tester는 Codex였다. 각 2단계에서 1단계 원문을 포함한 새 세션을 사용했다. tester는 작성자와 같은 제공자의 별도 세션이고 reviewer는 교차였다. 초기에 관측한 권한·시간·토큰·범위 문제를 보완했다. [독립 reviewer](evidence/reviewer-stage1.json) [독립 tester](evidence/tester-stage1.json)
- 초기 2단계 reviewer는 pass였으나 tester가 양방향 시작 시각 변경과 다른 프로젝트의 `--out` 덮어쓰기를 재현해 fail을 냈다. 두 문제를 수정하고 최신 패치 SHA-256 `dd4306006b101ac867987fe127068a31dac13f3262319e09fd2072098dba3848`로 양쪽의 재검증을 받았다. 최종 tester pass 및 교차 reviewer pass, blocking 0이다. [초기 2단계 tester](evidence/tester-stage2-initial.json) [최종 tester](evidence/tester-stage2.json) [최종 reviewer](evidence/review-records/R2.json)

## 남긴 것

- T07은 기존 키의 시작 시각과 태스크 귀속을 보존하며 새 호스트 관측을 같은 ID로 보강한다. 호스트 훅·수동 대체·외부 검토 연결과 픽스처 필수 역할 판정을 잇는다. T06은 보고된 모델·effort를 런타임 관문에 직접 대조한다. [설계 전 호스트 실측](evidence/pre-design-host-and-size.md)
- ACP 호스트 프로세스를 띄운 뒤 광고 조건을 확인하는 실패는 기존 실행기 `started` 계약에 따라 실패 시도에 포함한다. CLI와 실행기에서 실행 전 거절한 입력은 시도에서 제외한다. 최종 reviewer는 저장소 밖에도 PACE 관리 폴더와 이름이 같은 곳에는 `verify --out`을 거부한다고 남겼다.
- 강제 종료 전에 호스트의 완료나 회수 응답을 얻지 못하면 결과를 단정할 수 없다. 복구할 수 없는 잠금은 진단으로 남긴다. 분리 체크아웃에서 동일 ID의 내용이 상충하면 합계 대신 판독 보류를 표시한다.
