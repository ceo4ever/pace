# T03 기동과 자동 시작 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

사용자가 선택한 Windows 로그인 자동 시작의 정확한 Run/설치본 런처 등록과 현재 정상 기동, 정식 CLI 정지/재기동·단일 인스턴스 및 전체 검사 병행 자원 관측을 확보했다. 실제 재로그온 자동 기동·콘솔 비표시는 미실측이다. 캡틴이 2026-11-21 현재 로그아웃이 어려워 실제 시험을 병합 후로 이관했고 PROJECT P-3·TASK T-4/S-5a·BR03/BACKLOG를 같은 계약으로 수정했다. 승인 자체를 실제 시험 통과로 대체하지 않는다.

계약 변경 독립 재검토와 실행 증거의 사후 tester/reviewer 최종 판정 모두 pass blocking 0으로 합의된 병합 전 T-1~T-4·S-6 및 목표 달성을 확인했다. 상위 목적은 자리에 없을 때 운영 daemon에 일을 맡기는 것이며 현재 등록/기동 준비와 병합 후 인수, 실제 작업을 맡기는 T04를 구분한다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-2, `evidence/lifecycle-observations.json`: 설치/기동 exit0·running, stop exit0·status exit3/stopped·lock/포트 해제 및 재기동 새 boot |
| T-2 | 통과 | S-3, `evidence/lifecycle-observations.json`: 중복 start exit0·기존 PID/boot 유지, 직접 run exit2·소유자 유지 |
| T-3 | 통과 | S-4, `evidence/memory-samples.json`, `evidence/memory-summary.json`, `evidence/system-memory-events.json`, `evidence/repository-check-result.json`: 같은 daemon 유지·관측값/구간/간격·전체검사 exit0·관측 OOM/중단 없음 |
| T-4 | 통과 | S-5a, `evidence/pre-relogon-final-state.json` 및 `evidence/coordinator-readonly-proof.json`: 현재 Run 전체 문자열 대소문자 포함 일치·설치본 런처·현재 running. PROJECT 사용자 결정·BR03/BACKLOG 비고·프로젝트 후속 todo와 `evidence/relogon-checklist.md`, `evidence/human-relogon-baseline.json` 에 실제 재로그온/콘솔 미실측을 병합 후 인수로 보존 |

## 단위 테스트

`npm run check`: 임시 PACE_HOME에서 실제 daemon 및 이 worktree 세션과 병행한 한 회. exit0, tests 1,000 · pass 991 · fail0 · skipped9 · cancelled0. 원문 `evidence/repository-check.log`, 원문 SHA-256·집계·skip 사유 `evidence/repository-check-result.json`. Windows/POSIX·sh·루트 교체 제약의 기존 skip9를 실기 통과로 주장하지 않는다. 성공한 전체 검사나 T02 메시지 실측을 반복하지 않았다.

비밀 검사와 알려진 값 검사는 사후 판정 자료 및 최종 마감 변경 범위까지 회수한다. 현 범위의 exit0는 `evidence/security-check-result.json`, `evidence/security-check.log`, `evidence/repository-sensitive-records-scan.json` 에 있다.

## E2E

실제 설치 CLI install --yes --start로 사용자 Run 및 UTF-16LE 숨김 VBS를 등록했다. 정식 start/status/stop/재기동·중복 run 시험 후 승인대로 자동 등록+정상 기동을 유지한다. config·시크릿·허용자·workspace 원문을 바꾸지 않았다. 원래 JSON의 devicePreserved=true는 고정값이었고 직접 runtime 측정값이 아니므로 해당 필드만 근거로 사용하지 않는다. main의 보완 관측은 T02/T03/현재 config SHA 동일·명시 device 없음·설치본 hostname 기본값과 현재 runtime status 일치다. 역사적 hostname 변경을 직접 추적하지 않은 한계를 유지한다. 근거 `evidence/coordinator-readonly-proof.json`, `evidence/measurement-scope-corrections.md`.

원래 registryOwnedExact/runValueExact는 trim·대소문자 무시 ownsRunValue의 소유 일치였다. 현재 값의 대소문자 포함 전체 문자열 일치는 별도 main 읽기 보완으로 확인했다. 원래 JSON은 덮어쓰지 않는다. 로그 검사는 CLI 마지막 1,000줄의 토큰 원문 일치 부재만 확인했고 운영 로그의 chat/user ID·전체 이력은 별도로 검사하지 않았다. 기동/중복 알림 발생·건수는 직접 관측하지 않고 소스 분기로 추론한 한계를 명시했다. 이 내용과 초기 준비 확인 실패/회복은 `evidence/execution-notes.md` 및 보완 노트에 연결했다.

첫 설치는 실제 등록/기동 뒤 제어 스크립트의 즉시 소유자 확인이 실패했다. 상세 predicate 미보존이며 포트 선행 준비 경합은 소스에 근거한 추정이다. 실제 포트·설치본 명령·시작 시각으로 이번 호출 프로세스를 검증해 인계하고 제한 readiness polling·즉시 소유 정지 fallback을 보완했다. 실패를 숨기거나 제품 결함으로 단정하지 않는다. 근거 `evidence/initial-owner-verification-gap.json`, `evidence/execution-failure.json`.

검사 전~종료 후 152샘플, 가용 물리 메모리 관측 최저 12,530,608KiB(약11.95GiB), daemon working set 최대97,116,160bytes(약92.62MiB). 실제 간격658~5,864ms·조회오류0·중첩누락0·동일 인스턴스 유지, 출력 OOM신호0 및 해당 구간 리소스고갈 이벤트 조회0. OS 샘플 사이 순간 최저·전체 시스템 OOM 부재·실제 모델 작업2개 부하는 증명하지 않는다.

실제 재로그온이나 콘솔 상태는 수행하지 않았다. 병합 후 최신 별도 기준점을 확보하고 같은 사용자 로그인·수동 start 없는 새 boot·등록/설치본/설정 일치 및 사람의 콘솔 관측으로 인수한다. T03 역사 기준점을 덮지 않는다. 프로젝트 todo `.pace/memory/로그온-자동-기동-병합-후-실측.md` 는 그 실제 관측 전까지 열린 상태다.

## 리뷰

사전 이력: 최초 timeout6 미판정(원문 미제공 출처만 기록) → 새 독립 anthropic 세션 최초 fail blocking1(임의 메모리 게이트) → 같은 세션 수정 pass blocking0 → 사용자 병합 후 실측 이관 계약 변경 같은 세션 pass blocking0. PRE-REVIEW.json의 원문·TASK 스냅샷·현재 해시·continuity를 따른다. 보고 모델은 claude-opus-5-5, low는 CLI 요청 effort로 구분한다.

실행 증거 사후 2단계: tester pass blocking 0 should_fix 4 · reviewer fail blocking 1 should_fix 3(device 보존 측정 근거). 원문 `evidence/post-tester-phase1.md`, `evidence/post-tester-phase2.md`, `evidence/post-reviewer-phase1.md`, `evidence/post-reviewer-phase2.md`.

동일 세션 최종: tester pass blocking 0 · reviewer pass blocking 0 — main의 읽기 전용 device/config 및 Run 전체 문자열 보완으로 F1·F3을 해소했다. 원문 `evidence/post-tester-final.md`, `evidence/post-reviewer-final.md`. 실제 관측 첫 판단 후 각각 같은 세션에서 계약/소스와 보완을 대조했고 작성자·사전 검토와는 분리된 anthropic 두 세션이다. 보고 모델은 claude-opus-5-5, low는 CLI 요청 effort다. 명령을 검토자가 실행하지 않았으며 main이 전체 로그 SHA/집계·152개 샘플 재계산·감사 다섯 소스 원문 SHA·현재 TASK 사전 pass 해시를 확인했다. 처리·잔여 한계는 `evidence/measurement-scope-corrections.md` 에 있다.

제품 코드는 변경하지 않았다. 소스 감사 사본·원문/LF 해시는 `evidence/execution-source-hashes.json` 및 준비한 인수 확인 소스 해시에 연결한다. 감사 사본의 import는 원래 로컬 파일명을 유지하므로 배포용 실행 도구로 제시하지 않는다.

교본: 해당 없음(제품 코드 변경 없음, 일회성 관측/감사 소스).

## 남긴 것

병합 후 실제 재로그온/콘솔 인수는 열린 todo로 추적하며 BACKLOG BR03 비고에도 미완을 표시했다. 후속 T04나 병합에서 기동/설정이 바뀌면 최신 인수 기준점을 별도 파일로 확보해야 한다. 준비한 T03 당시 after-relogon 스크립트를 옛 기준점 그대로 재사용해 자동 기동 성공을 판단하지 않는다.

T04는 승인된 별도 workspace의 실제 읽기·쓰기 승인/거절/만료·재시작 무효화·중단 작업 needs_review와 필요시 동시 모델 작업을 검증한다. 자동 시작 등록+정상 기동이 현재 승인된 운영 상태다. 토큰·그룹/사용자 ID 원문·기기 원문을 저장소 증거로 내보내지 않으며 기존 사용자 입력 .env를 임의 삭제하지 않는다.
