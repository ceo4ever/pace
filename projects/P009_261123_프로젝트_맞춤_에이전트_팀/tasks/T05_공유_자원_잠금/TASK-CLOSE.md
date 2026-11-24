# T05 공유 자원 잠금 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

P-3의 T05 몫인 참여 호출 사이의 공유·배타와 안전 회수를 달성했다. repo는 Git common dir, machine은 같은 PACE_HOME에서 상태를 공유한다. 래퍼가 획득 식별과 자동 갱신을 유지하고, 자식 그룹을 영속 기록한 뒤 IPC START로 명령을 실행한다. 래퍼/그룹 종료와 자원 미사용이 모두 확인되지 않으면 다음 실행을 보류한다. 정상 해제도 그룹 부재를 생략하지 않는다.

실제 두 worktree와 별도 저장소의 source CLI에서 두 scope 각각 순차 실행·동시 경쟁·자동 갱신을 관측했다. 실제 프로세스 시험에서는 래퍼 강제 종료·손자/신호 무시 자식 생존 때 회수를 거부하고, 그룹 종료와 free 뒤 다음 CLI가 회수·실행·감사까지 성공했다. 독립 최종 [reviewer 첫 판단](evidence/impl-review-final2-stage1.json)·[tester 첫 보완](evidence/tester-final2-stage1.json), [reviewer 계약 대조](evidence/review-stage2.json)·[tester 계약 대조](evidence/tester-stage2.json)와 [reviewer 보완](evidence/review-accept-stage2.json)·[tester 보완](evidence/tester-accept-stage2.json)는 모두 pass/blocking0다. 최신 검사와 남은 should_fix 처리까지 회수한 PM은 T-5까지 달성으로 판단한다. 형식 check가 이 의미 판정을 대신하지 않는다.

실제 Studio MCP 확인기·직렬화는 T08 몫이며 임시 자원의 증명을 확대하지 않는다. 참여하지 않는 직접 도구 호출·setsid/detach 이탈을 차단하지 않는다. Windows의 명령 그룹 전체 종료 확인은 지원하지 않아 실행을 보류하며 실기는 미확인이다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | resources.md version1/동시1/scope/argv·예약명·기존 list/sync 호환, repo worktree 공유·다른 repo 분리, PACE_HOME의 scope 등록·정의 지문 불일치 보류. [관련 시험](evidence/focused-current.txt) |
| T-2 | 통과 | PID/OS 시작 식별·획득 UUID·START 전 그룹 기록·자기 식별 캐시 갱신, 구 획득 ID의 늦은 갱신/해제 무효. [실제 두 범위](evidence/actual-worktrees-final2.json)와 [직접 대조](evidence/proof-pass.txt) |
| T-3 | 통과 | 생존/종료/모름×free/busy/모름 행렬, pre-start도 자원 확인 유지, manual/확인기 없음의 근거 있는 수동 확인, 실제 SIGKILL 뒤 그룹 생존 보류 및 종료 후 CLI reclaim 성공 |
| T-4 | 통과 | 정상 자식 종료+손자 생존, SIGHUP 무시 자식, START 재시도 중 SIGTERM, 손상/PGID0·1/링크/hardlink·감사 실패·guard 중단 보류, 감사 주체/근거와 외부 무신호 원칙 |
| T-5 | 통과 | 실제 순차·동시 경쟁, 관련19/전체1111 실패0·타입/비밀 검사, 독립 두 단계와 보완, TEAM·SECURITY·정의서·README·coordinator 규칙·test-map 반영 |

## 단위 테스트

- 현재 `node --test test/team-lock.test.ts`:19/19 통과. [현재 이름의 실제 실행 원문](evidence/focused-current.txt). 최초 reserved resources.md 오인 RED, opaque ID 필드의 코드/비밀 패턴 충돌 RED, status 경합으로 heartbeat 관측을 놓친 RED도 보존했다. heartbeat는 guard 경합 뒤 짧게 재시도하고 시험 관측은 원자 상태 파일을 읽어 소유자를 불필요하게 방해하지 않는다.
- 최종 `PACE_SKIP_BROWSER_E2E=1 npm run check`: 타입 검사 포함 tests1111/pass1094/skip17/fail0. [전체 원문](evidence/check.txt)과 [마감 후 비밀 검사](evidence/secret-scan-accept.txt). runtime source는 최종 첫 판단 뒤 동일하며 [연결 기록](evidence/source-review-binding.json)에 시험/문서 보완만 구분했다. 브라우저 동작 변경이 없어 Orca 전체 검사에서 기존 규칙대로 브라우저 E2E를 제외했다. 신호/회수 보강 전의 이전 전체 원문들도 별도 보존했다.
- [실측 proof](evidence/check-actual-proof.mjs):1/1, 모델 호출0. source7 SHA·실제 cwd/argv/JSONL·Git 공통 폴더·machine 경로·heartbeat·경쟁·감사·원 소유자/그룹 종료를 대조한다. T05 checkout에 묶이며 이후 cli 등이 바뀌면 해당 checkout에서 실행해야 한다. 임시 fixture가 사라지면 live 재감사를 주장할 수 없다.
- 마지막 회수 성공 단언을 넣고19건을 실행한 뒤 시험 표시 이름만 바꾼 순서 때문에 `reclaim-success-tests.txt`에는 옛 이름이 남았다. reviewer는 이름만으로 구 실행본이라고 판단했고 그 원문은 수정하지 않았다. 이후 현재 이름으로19건을 실제 재실행한 위 focused-current와 최신 전체로 혼선을 해소했다. 같은 첫 tester도 현재 SIGKILL 시험을 직접 실행해 회수 성공을 확인했다.

## E2E

- [최종 actual-worktrees-final2](evidence/actual-worktrees-final2.json)는 source CLI로 repo의 두 worktree, machine의 서로 다른 저장소에서 관측했다. 두 범위 모두 두 번째 순차 요청은 busy/owner alive/ownerCheck same-start, 첫 종료 뒤 다음 실행은 completed다. 동시에 시작한 두 CLI는 gate 해제 전 하나만 진입했고 거부 영수증에 승자의 lease가 담겼다. 순차 timeline과 금지 sentinel 부재도 대조했다.
- 최초 실측 actual-worktrees.json의 machine owner unknown/hold는 당시 세부 조회 사유가 없어 원인 미확정이며 busy 관측으로 세지 않았다. 다음 final 및 최종 final2를 구분해 보존했다. 외부 조회는 불가 사유를 공개하고 자기 갱신에는 캐시한 시작 식별을 써 일시 ps 실패가 작업 중단으로 이어지지 않게 했다. 메모리 이슈 `잠금-소유자-조회-미확정`으로 T08 재발 조건을 수집한다.
- 실제 SIGKILL 시험은 free 확인기를 의도적으로 써도 그룹이 살아 있으면 회수하지 않는다. 테스트가 만든 그 그룹만 종료한 뒤 다음 source CLI의 획득0·실제 recovered 파일·옛 획득 ID의 reclaim 감사를 확인했다. SIGHUP은 일반 자식 종료 때 해제하고 무시 자식이 남으면 active로 보존했다. START 재시도 중 실제 SIGTERM은 사용자 명령을 보내지 않고 잠금을 보존했다.
- 실제 자원 확인기는 신뢰한 선언 코드이며 exit0/free,1/busy,기타/실패 unknown이다. 출력/오류는 저장하지 않고 shell 없이 시간·출력 제한으로 실행한다. machine 확인기는 공통 절대 경로를 권장한다. 옛 작업 루트가 없거나 확인 방법이 다르면 자동 회수하지 않는다. 확인기 없는 최초 획득은 이전 참여 소유자가 없다는 기록만 보며 외부 직접 사용의 미사용 증명은 아니다.

## 리뷰

- 사전 R1 fail/blocking1(래퍼만 보던 소유자), R2 fail/blocking1(정상 완료의 그룹 종료 누락), R3 pass/blocking0. [PRE-REVIEW.json](PRE-REVIEW.json)에 매 TASK 해시·실제 제공자·원문을 보존했다. [사전2단계](evidence/review-pre-stage2.json)도 pass/blocking0이며 상세 해석·처리는 [응답](evidence/pre-review-response.md)에 연결했다. 반복 원인은 계획의 종료 경로 누락이고 모든 경로에 같은 그룹 종료 조건을 적용해 보완했다. 기준·범위는 유지했다.
- 구현 R1/R2/R3 reviewer 모두 pass/blocking0. R1의 자기 갱신 외부 조회 위험·반복 감사 파일 증가·최초 unknown 구분, R2의 guard 경합·실제 동시 경쟁을 반영하고 새 실제 CLI 관측·시험·전체 검사로 다시 대조했다. tester도 동일 첫 세션의 각 보완 판단에서 실제 시험/proof를 실행했다. 작성 Codex/OpenAI와 검토 Claude/Anthropic는 다른 제공자다.
- 최종 reviewer2단계는 같은 Anthropic의 다른 새 맥락에 첫 원문을 전달했으며 동일 reviewer 재개나 새 블라인드로 주장하지 않는다. tester는 같은 첫 세션을 재개했다. 자동 맥락·직접 열람·실행 제한은 각 원문에 공개했다. /tmp 읽기 권한으로 최신 전체를 못 본 두 판정은 그대로 남기고 PM이 완료 원문을 저장소 evidence에 연결했다.
- 최종 SF 처리: 중단 guard 자동 회수·acquire/status의 일반 신호 지연은 보수적 수동 복구 설계를 유지하고 이유를 기록했다. SIGKILL/부분 I/O까지 소유자·그룹·자원과 경합을 확인해 별도 승인 후 보관/교체한다. busy 대기 큐는 BR05의 거부 허용과 JSON outcome 구별로 충족하므로 후속 idea `공유-잠금-가용성-보강`에 남긴다. 강제 삭제·강제 해제 API를 만들지 않았다.
- tester의 실제 회수 성공 요구와 신호 시험 부족은 위 실제 시험으로 반영했다. 최신 전체·비밀 검사와 현재 이름 원문은 최종 evidence에 연결했다. note의 신호 정보는 직접 bridge 관측이라는 한계를 TEAM에 공개했다. 정상 명령 코드는 전달되지만 명령 자체 신호 종료는 bridge1/signal=null일 수 있어 모든 하위 명령 신호를 수집한다고 주장하지 않는다. 비대화형 전제·old cwd 확인기·기기 이름 공간·수동 확인 자기 신고·상태 진단 한계도 공개했다.
- diff 생성 전 verify를 호출한 invalid_request는 모델 미실행으로 원문을 보존했고 이후 올바른 대상에서 원장을 시작했다. 비밀 검사는 코드 표현식을 두 번 오탐했다. 탐지 규칙/제외 목록은 유지하고 source 식별자를 명확히 바꿨다. 첫 원문 바이트는 gzip 사본, JSON은 알려진 비밀 아닌 코드 표현식의 표준 Unicode escape만 달라지며 파싱한 모든 값과 snapshot/result 해시 입력이 동일함을 [직렬화 근거](evidence/review-json-serialization.jsonl)·스크립트가 단언한다. 실제 자격증명을 인코딩해 숨기지 않았다.
- 교본: TypeScript/verification 색인은 React/Vite·AI 회귀 중심이라는 reviewer 지적을 받아 상세 입력/파일/프로세스 보안은 SECURITY와 주변 코드로, 타이밍은 e2e-testing Flaky Test Patterns의 조건 대기/별도 완료 경계로 대조했다. 임의 sleep을 성공 근거로 쓰지 않고 sentinel·그룹 상태·실제 명령/감사로 확인했다.

## 남긴 것

- T09: 실제 잠금 사건과 소통 봉투를 연결한다. 기록만으로 획득을 만들어내지 않으며 source의 audit(acquire/release/reclaim)와 획득 ID를 근거로 한다. 자기 갱신은 표시 상태만 쓰고 매번 감사하지 않는다.
- T06 지표·T07 팀 설계·T08 실제 Studio MCP/팀 도입은 남아 있다. P-3의 실제 Studio 직렬화는 T08에서 해당 확인기의 정확성과 함께 닫는다. Windows 실기·비참여 호출·setsid 이탈은 이번 근거로 증명하지 않는다.
- 동일 PACE_HOME·전역 자원 이름/scope 합의가 필요하다. 중단 guard/부분 I/O·정의 변경의 수동 복구와 원인 미확정 조회 재발을 위 issue/idea로 추적한다. 가용성을 위한 자동 회수·대기 큐는 별도 설계한다.
- 설치·push·배포·병합·실제 저장소 사용자 자원 삭제는 하지 않았다. 임시 시험이 만든 프로세스/파일만 관리했다. 사용자 원문·인증 파일·확인기 출력·명령 argv는 잠금 감사에 복제하지 않았다. 원본과 경로에 적용한 비밀 패턴 검사는 모든 민감 정보 탐지를 보장하지 않는다.
