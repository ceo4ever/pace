# T02 Telegram 연결 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

실제 포럼 그룹에서 승인된 허용자 한 명의 새 명령에 응답하고, 같은 사람을 승인된 메모리 사본에서 임시 제외했을 때 거절 카운터 증가와 응답·작업 부재를 관측했다. 정상 허용 사본으로 재기동한 뒤 응답을 재확인하고 정지했다. BR02·P-2와 정합하며 연결 목표를 달성했다. 전체 검사 종료와 B1·B2 보완 뒤 같은 독립 tester·reviewer가 S-6 포함 최종 pass blocking 0, T-1~T-3·복원·T02 목표 달성을 확인했다. 상시 기동과 실제 체인 작업·쓰기는 T03·T04다.

독립 첫 관측 판단·계약 대조는 `evidence/post-tester-phase1.md`, `evidence/post-tester-phase2.md`, `evidence/post-reviewer-phase1.md`, `evidence/post-reviewer-phase2.md` 에 보존했다. reviewer pass blocking 0, tester fail 보류(전체 검사·로컬 검사 생성 소스 미감사)였으며 실제 소스·한계·처리 기록을 추가했다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1·S-2, `evidence/operational-setup.json`: 승인 봇·포럼·실제 멤버십·webhook 부재, ACL 확인, CLI stdin 시크릿, 허용자 한 명·설정/운영 device 보존 |
| T-2 | 통과 | S-3·S-4r, `evidence/live-allow-initial.json`, `evidence/live-deny.json`, `evidence/live-allow-restored.json`: 준비 후 새 요청 각 1건, 응답 1→0→1·거절 0→1→0·작업 0·혼선 0 |
| T-3 | 통과 | S-5, `evidence/secret-observations.json`, `evidence/repository-sensitive-records-scan.json`: API params/성공 응답·상태·로그·CLI·셸·저장소 기록에서 토큰/그룹/등록 사용자 ID 원문 일치 0. 의도된 입력/시크릿 제외와 API/관측 범위 한계는 명시 |

## 단위 테스트

태스크 선언 전체 검사 `npm run check`: exit 0, tests 1,000 · pass 991 · fail 0 · skipped 9 · cancelled 0. 임시 PACE_HOME에서 한 회 실행했고 전체 경과 882,644ms다. 원문 `evidence/repository-check.log`, 집계·원문 SHA-256·skip 목록 `evidence/repository-check-result.json`. T01의 성공한 격리 실행기 시험은 재사용했고 실제 Telegram 세 단계는 반복하지 않았다. skip 9건은 Windows/POSIX·sh 실행·루트 교체 훅 제약이며 해당 영역의 실기 통과로 간주하지 않는다.

비밀 검사 `node scripts/secret-scan.ts`: exit 0, 최종 판정·마감 기록까지 포함한 원문과 대상 파일 수는 `evidence/security-check.log`, `evidence/security-check-result.json` 에 보존했다. 실제 입력값 일치 검사는 `evidence/repository-sensitive-records-scan.json` 의 마지막 범위를 따른다. 앞선 두 번의 코드 표현식 오탐 실패와 감사 사본의 공백만 정리한 처리, 실행 원본/감사본 해시 차이를 `evidence/post-review-resolution.md` 에 남겼다. 제품 검사·제외 규칙은 바꾸지 않았다.

## E2E

`evidence/live-observations.md` 에 실제 설정·허용/거절/복원·정지·비밀 검사를 연결했다. 첫 허용과 거절의 정지/단일 인스턴스 포트 해제는 `evidence/allow-initial-stop.json`, `evidence/deny-stop.json` 에, 최종 정지·운영 config 해시 및 device 보존·허용자 복원은 `evidence/final-runtime-restoration.json` 에 있다.

승인된 .env는 캡틴 소유 입력으로 유지했고, runtime config 사본의 임시 제외와 pace-pc 표시만 사용해 운영 허용 목록·device 파일은 시험 중에도 불변이었다. 기동의 메뉴 갱신·연결/재기동 알림과 사용자 명령/응답은 승인 범위에서 발생했다. 상시 기동·Windows 등록·workspace 등록은 하지 않았다.

정지 전 조기 복원 기동 한 번은 acquireInstance exit 2로 차단돼 두 번째 poller를 만들지 않았다. 실패 JSON은 같은 파일명의 정상 결과로 덮어써져 원문을 별도 보존하지 못했다. 이를 사후 재구성하지 않고 코드 흐름·도구 실행·사건 기록으로 한계를 남겼다. 정지 status의 기대 코드 3을 처음에 잘못 실패로 본 로컬 검사도 기대를 수정해 조회만 재실행했고 메시지는 재전송하지 않았다.

## 리뷰

사전 검토: 독립 anthropic 1차 fail blocking 1(마법사 autostart) → 같은 세션 2차 pass blocking 0 → 캡틴 지정 .env·메모리 config 선택 변경분 같은 세션 pass blocking 0. 원문·스냅샷·현재 TASK 해시·continuity는 PRE-REVIEW.json 및 evidence의 pre-review 파일에 있다. v1은 기록 형식 버전이다.

사후 1차: tester fail 보류 B1·B2 · reviewer pass blocking 0(전체 검사 대기). 작성자·사전 검토와 분리된 두 anthropic Claude 세션(보고 모델 claude-opus-5-5)이며 실제 API·명령을 재실행하지 않았다. 같은 두 세션의 최종 확인을 요청할 예정이다. 실제 로컬 검사 생성 소스와 원문/결과 해시는 `evidence/local-check-source-provenance.json` 에 추가했고 should_fix 처리·잔여 한계는 `evidence/post-review-resolution.md` 에 연결했다.

보완 검토: 같은 두 세션이 B2 해소와 T-1~T-3·최종 복원을 통과로 판정했고 tester는 B1 전체 검사 원문만 기다렸다. 원문 `evidence/post-tester-supplement.md`, `evidence/post-reviewer-supplement.md`. 초기·불허 stop JSON 자체는 exit 0을 단언하지 않고 stopped·lock 부재·포트 해제를 확인한다. 최종 복원은 stopped·exit 0까지 단언한 기록이며 두 범위를 구분한다.

최종: tester pass blocking 0 · reviewer pass blocking 0 — 같은 각 세션이 B1·S-6까지 대조했고 목표 달성을 확인했다. 원문 `evidence/post-tester-final.md`, `evidence/post-reviewer-final.md`. main은 전체 로그 원문 SHA-256·최종 집계 및 ACL 결정 기록을 직접 확인했다. 검토자가 실제 명령·Telegram 시험을 재실행한 것은 아니다.

응답 thread/reply 필드를 별도 기록하지 않았고 무송신은 승인 그룹의 네 송신 메서드에 한정한다. 설치본 해시는 다섯 모듈 고정이며 모든 전이 import 고정은 아니다. 공개 봇 사용자명은 토큰·등록된 사람/그룹 ID와 구분해 감사 소스 무결성을 위해 유지했다. 실제 입력값 전체 기록 검사는 별도 수행했다.

교본: 해당 없음(제품 코드 변경 없음, 감사 사본은 일회성 검증 소스).

## 남긴 것

T03: 상시 기동·자동 시작 선택, resource 여유 및 단일 인스턴스·정지/재기동 정식 검증. T04: workspace·실제 체인 요청·쓰기 승인·필요한 다른 계정/다른 chat/비General 검증과 송신 전 메서드 집계·응답 연결 보강. Windows 짧은 경로와 PATH·인증·설치본 동일성도 앞 태스크 인계를 유지한다.

입력 .env·운영 시크릿과 승인된 메뉴/알림은 유지한다. 비밀 없는 임시 runtime 파일·포인터는 무단 삭제하지 않고 인계한다. TASK의 과거 시점 표현은 해시 보존을 위해 바꾸지 않았으며 실제 수행은 승인 반영 절·PROJECT의 후속 main 판단·이 마감 기록을 따른다. BR02/BACKLOG는 done으로 동기화한다.
