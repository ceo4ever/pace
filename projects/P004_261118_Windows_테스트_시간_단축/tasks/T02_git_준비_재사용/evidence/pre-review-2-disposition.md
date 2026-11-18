# 승인 선행 수정: 사전 2차 should_fix 처리

원문 `pre-review-2-nested.md`는 동일 anthropic reviewer의 pass(blocking 0·should_fix 4)다. 실제 검토 TASK 해시와 PRE-REVIEW 마지막 기록이 일치한 뒤 wrapper를 수정했다. 기존 Git 준비 사전/사후 기록은 그대로 보존한다.

1. SF-1: `diagnose-nested-isolation.ts`는 실제 wrapper와 같은 19개 파일·helper preload·기본 동시성·TAP argv에 진단용 trace preload만 추가한다. 실제로는 Node 24 test launcher 자체에서 preload trace가 실행되지 않았고 파일 worker 19개에서만 실행됐다. 모든 worker의 부모 PID가 runner이며 19개 tmpdir가 서로 다르고 runner에 전달한 공용 루트와도 다름을 확인했다. 각 worker 정리 후 잔존 0이다. 최초 진단은 runner에도 preload가 실행될 것이라는 잘못된 20개 기대 때문에 verified false였으며 자식 시험은 181건 모두 통과·종료 0이었다. 원문은 유지하고 별도 재검증에서 이 가정을 바로잡는다. 단일 파일 후보 성공을 파일별 격리 증명으로 쓰지 않는다.
2. SF-2: 기존 `.mjs` 전체에서 PACE_HOME/PROFILE의 직접 사용은 없었다. tmpdir는 여러 파일의 소유 fixture 생성·출력에 임시 절대 경로가 남지 않는 검사·guard 및 e2e의 임시 폴더 전후 비교에 사용된다. 이들을 변경/삭제하지 않고 각 파일 프로세스 루트로 분리한다. trace는 기존 helper exit listener 이후에 실행되어 정리 후 남은 루트와 exitCode를 기록한다. 실제 19개 실행에서 정리 실패·잔존이 있으면 통과하지 않는다.
3. SF-3: 실제 wrapper의 maxBuffer를 16 MiB로 명시했다(수정 전 정상 진단 TAP은 약 80 KiB 규모). 실패 메시지는 status/signal/error와 캡처 stdout/stderr 전체를 담으며 ENOBUFS는 `capture-limit-exceeded`로 구별한다. 이 한도를 넘은 출력까지 완전하다고 주장하지 않고 시험 실패로 처리한다. `diagnose-wrapper-errors.ts`는 실제 wrapper를 실패/ENOBUFS로 각각 실행해 시작·중간·말미·stderr·분류·상태를 검증한다. 증거 커밋 전 비밀 검사를 수행하고 실제 비밀이면 원문을 커밋하지 않으며, 합성 민감 형식이면 필요한 구조/판정을 유지한 가림 사본과 가림 내역을 남긴다.
4. SF-4: TASK의 마지막 승인 절이 앞선 T01 인계 재료의 시점 이후 결정임을 명시한다. 재료의 “T03에서 해결”은 승인 전 인계이고 최신 결정은 이번 선행 승인이다. T-2의 기존 검증 범위/판정 보존에 S-6~S-8을 연결하고 T-3의 S-5 전체 종료0도 유지하므로 별도 T-4는 추가하지 않는다(main이 허용한 처리). TASK 정본은 추가 변경하지 않는다. PROJECT 결정/사건과 마감 초안은 최신 승인 상태로 정합하게 갱신한다. T03은 동시성 4·8 비교/선택값 전체5회가 남는다.

기존 guard 및 19개 `.mjs` 소스는 수정하지 않았다. 기존 wrapper의 파일 목록·실제 실행 건수·pass/fail/skip 단언도 보존하며 spawn error 단언만 추가했다. 지원 외 제품 동작 변경은 없다.
