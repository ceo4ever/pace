# T09 에이전트 소통 계약 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

원문/미확인 해석 혼동, 승인 재사용, 기록 없는 전달, 부분 결과의 완료 처리를 막는 참여 프로토콜을 구현했다. 원문 bytes와 출처는 로컬 content ID로, 승인·계획·수신 대조·결과·종결과 전송·실제 자원 사건은 구조 기록으로 연결한다. 지정 판정자와 증거를 검사하지만 사람의 신원/자연어 의미를 인증하거나 직접 도구 호출을 가로채지는 않는다.

독립 [최종 첫 판단 R5](evidence/impl-review-stage1-r5.json), [reviewer 계약 재대조](evidence/review-final-stage2.json), [tester 계약 재대조](evidence/tester-final-stage2.json)는 T09 계약의 목표 정합·달성, blocking0을 판정했다. tester가 앞서 계약 대조에서 낸 blocking4는 한도·교차 결과·집계/경고/CLI 확인 사슬과 최종 전체 검사 근거를 보완한 뒤 해소됐다. 형식 게이트가 의미 판정을 대신하지 않는다.

최종 문서/시험 보강을 포함한 [check-sealed](evidence/check-sealed.txt)는 1143건/1126통과/17skip/0실패·exit0이며 실행 전후 변경 없음이다([영수증](evidence/check-sealed-receipt.json), [실행 뒤 지문 재대조](evidence/sealed-source-verification.json)). PM은 독립 판정과 이 실행 근거를 합쳐 T09 계약 목표 달성으로 판단했다. 실제 두 호스트 업무·출처/의미 감사와 사람 도달의 진위는 T08의 미확인 사항으로 남긴다.

로컬 보존(B)은 별도 원문 Git 승인 전의 코디네이터 보수적 지시다. 기존 log 요약은 계속 보존하며 사용자가 원문 Git 보존이나 다른 clone 감사 한계를 승인했다고 해석하지 않았다([결정 범위](evidence/storage-decision-summary.md)).

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1/S-8: 긴 한글·CRLF bytes, 원장 무본문, 본문/머리/원장 한도·비밀·링크·중복 JSON·변조 거부. evidence/focused-sealed.txt, test/team-handoff.test.ts |
| T-2 | 통과 | S-2: input/contract 계획과 원문 일치, falsy policy/none/다른 승인·계획 변조 거부, 최신 정정·승인 중복·수신자 within/hold·현재 계약 대조. evidence/focused-sealed.txt |
| T-3 | 통과 | S-3: 수신자 결과·지정 판정자·최신 done/증거 지문·증명 범위만 close. 빈 done/다른 위임 결과·partial/blocked·비판정자·변조 거부. evidence/focused-sealed.txt |
| T-4 | 통과 | S-4/S-5: started 내구 기록 뒤 호출, 명시 실패/불명/최종 기록 실패와 재발송 차단, 실제 자원 적용 후 기록·hook 실패/pending/명령0·중복 없는 보완/guard 미회수. evidence/focused-sealed.txt |
| T-5 | 통과 | S-6/S-7: 공유 요청 중복 제거·신고 답/실제 사람 경로 성공/실패만/불명, coordinator/Orca 미승격, 종류·coordinator/agent별 정확값, partial/blocked 각각 실제 finish 경고. evidence/focused-sealed.txt |
| T-6 | 통과 | S-7/S-8: source CLI 승인 사슬·stats/finish·Git 미스테이징·다른 worktree/clone·옛 FIFO, 최종1143건/0실패·exit0·지문 불변. evidence/check-sealed.txt, evidence/check-sealed-receipt.json |

## 단위 테스트

- PM의 `node --test test/team-handoff.test.ts test/team-lock.test.ts`: [최종 관련 시험](evidence/focused-sealed.txt) 51/51 통과, skip0. T05의 19개 기존 시험을 고치거나 건너뛰지 않았다.
- 독립 tester는 [최종 계약 재대조](evidence/tester-final-stage2.json)에서 당시 50/50을 직접 실행했다. 그 뒤 header 한도 검출력과 정규 CLI request-id 회귀 1건을 보강하여 PM 실행은51이다. 두 범위를 혼동하지 않는다.
- [첫 고정 전체 검사](evidence/check-final.txt)는 1142건/1125통과/17skip/0실패, exit0·signal없음·실행 중 변경 없음([영수증](evidence/check-final-receipt.json)). 이후 문서/시험만 보강했고 runtime module은 바뀌지 않았다.
- 최종 `PACE_SKIP_BROWSER_E2E=1 npm run check`는 `evidence/check-sealed.txt`와 `evidence/check-sealed-receipt.json`으로 1143건/1126통과/17skip/0실패·exit0을 별도 봉인했다. 실행 전후 변경/신규 코드·시험·문서26개 지문과 종료 코드를 기록한다. 저장소 전체나 악의적인 동시 변경까지 인증하는 증명은 아니다.
- [비밀 검사](evidence/secret-final.txt)는 기존 탐지기·예외를 그대로 사용했다. 마감 파일까지 포함한 [커밋 전 검사](evidence/secret-commit.txt)도 통과했다.

## E2E

| 시나리오 | 결과·관측 |
|---|---|
| S-1 원문 | source CLI 표준 입력의 긴 원문 bytes/지문이 같고 원장에는 marker가 없다. 한도는 유효 JSON의 공백 padding까지 포함해 크기 오류·행/파일 불변·오류 본문 미노출을 단언한다 |
| S-2 확인·대조 | 원문→제안→실제 합성 승인 원문→approved 위임→수신자 대조 사슬을 source CLI로 실행한다. 확인 전·다른 제안/판정 계획·falsy policy와 변경 중계는 거부한다 |
| S-3 결과·종결 | 최신 done, 실제 증거, 지정 주체·범위만 종결. 다른 위임/빈 증거·부분 결과·현재 hold는 완료가 되지 않는다 |
| S-4 전송 | 실제 source CLI와 fake Orca executable/API 계수기로 선기록 뒤 호출을 확인한다. sent0/failed1/unconfirmed2·기록 실패 호출0·성공 후 기록 실패·재시도 수명을 대조한다 |
| S-5 잠금 | acquire/release/reclaim 각각 실제 상태·applied/pending·원장 및 중복 보완, 미적용 intent 미승격. source CLI hook 실패는 sentinel0·active pre-start/no child·guard 보존이다. appliedAt은 intent 준비 기준 시각이며 실제 적용은 상태/applied 자료로 판정한다 |
| S-6 요청 | 한 요청의 log+중계는1, coordinator 답/Orca ack 미승격. 실패 뒤 사람 경로 성공은 요청1회 도달로 분류하고 미연결 과거 사건은 별도로 남긴다. 종류/에이전트 수를 정확값으로 단언한다 |
| S-7 하네스 | source CLI stats와 실제 finish, partial/blocked 경고, HEAD/index에 원문 없음, 원내 입력의 finish 보류·원본 보존. 공개 파일 오입력/복원도 실제 finish로 검증한다 |
| S-8 실패·호환 | symlink/hardlink/separate-git-dir·미지원/손상 metadata·본문 변조 거부, 다른 worktree의 공통 본문 접근, clone metadata-only와 준비 보류, 옛 사건 수/FIFO golden 유지 |

상세 실행 근거는 [관련51시험](evidence/focused-sealed.txt)과 그 단언을 담은 test/team-handoff.test.ts다. 추가로 [request-id 실제 CLI](evidence/cli-log-proof.json), [설치된 Orca 도움말](evidence/orca-send-help.txt), [설치본 formatter 합성 평가](evidence/orca-installed-format-proof.json)를 보존했다. 마지막 둘은 read-only 근거이며 실제 IPC/발송/캡틴 도달 증거가 아니다. 모든 시험 자료는 합성이고 실제 외부 메시지를 보내지 않았다.

## 리뷰

- 사전: [PRE-REVIEW.json](PRE-REVIEW.json)과 차수별 TASK 해시·원문을 보존했다. R1 fail/blocking1 → 반례 보완 R2 pass0 → 불변식 대응/답 주체 보완 R3 pass0, PROJECT/BR09/BR01 별도 계약 대조 pass0 뒤 구현했다.
- 구현 첫 판단: [R1](evidence/impl-review-stage1.json) fail1 → 쓰기 전 guard 오류 보완 [R2](evidence/impl-review-stage1-r2.json) pass0 → [R3](evidence/impl-review-stage1-r3.json)·[R4](evidence/impl-review-stage1-r4.json)·[R5](evidence/impl-review-stage1-r5.json) pass0. 도구 원장과 스냅샷을 덮어쓰지 않았다.
- tester: [첫 판단](evidence/tester-stage1.json)의 falsy policy blocking1을 고쳤다. [첫 보완](evidence/tester-revision-stage1.json), 판정 없이 종료된 [2단계 timeout](evidence/tester-stage2-timeout.json), [계약 fail/blocking4](evidence/tester-stage2-retry.json), [최종 pass/blocking0·should_fix2](evidence/tester-final-stage2.json)를 구분한다.
- reviewer: [첫 계약 대조](evidence/review-stage2.json)와 [최종 pass/blocking0·should_fix5](evidence/review-final-stage2.json). verify가 재개 session ID를 주지 않아 2단계는 같은 제공자의 새 맥락에 첫 원문을 전달했다. 같은 사람의 연속 판단이나 새 블라인드 검토라고 주장하지 않는다. tester는 같은 독립 Claude 세션을 재개했다. 자동 지침·파일명/과거 refs의 제한적 노출 및 실제 읽은 범위는 각 원문에 있다.
- should_fix: [처분 원장](evidence/impl-review-response.md). guard 일반 오류·falsy policy·중복 승인·계획 추가·미적용 intent·현재 결과/증거·coordinator 집계·공개 파일 기준선·실제 hook 실패·ref 무본문 안내를 반영했다. 시각 용어는 [문서 보정](evidence/doc-final-correction.json), header 검출력과 CLI 정규 회귀는 관련51/최종 봉인으로 보강했다. 신고 기반 출처의 진위, 긴 guard 경합/전체 replay·부분 stats/미확인 intent의 운영 비용은 한계/후속 후보로 남겼다. 실제 호스트 효과는 T08로 넘긴다.
- 최초 patch/review snapshot의 합성 비밀 부정시험 문자열은 실제 자격증명이 아니었다. [원본 bytes 보관·JSON 값 동일 확인](evidence/synthetic-fixture-json-serialization.json)과 gzip 원본을 보존했고 탐지기/예외를 바꾸지 않았다. 실제 비밀을 인코딩한 것이 아니다.
- 교본: pace-tech-handbook TypeScript와 verification의 새 맥락·통과/거부·실행/검출력 대조를 적용했다. 특수 기능은 다른 제공자의 readonly reviewer/별도 tester, 실제 OS/임시 Git CLI와 fake 전송이 필요했다. 실제 서비스 전송은 이 태스크에서 선택하지 않았다.

## 남긴 것

- T06: 기존 사건 수/FIFO와 요청 단위 집계를 혼용하지 않는다. BR01의 실패 시도 수 등 확장을 계약대로 붙인다. T09의 reported actor/ref는 진위 인증이 아니며 옛 식별자 없는 사건은 추정 연결하지 않는다.
- T08: 실제 두 호스트 업무와 live argv/ack·사람 출처/범위 감사, Studio 실제 확인기를 관측한다. 설치본 formatter/도움말·합성 fake 통과를 live 증거로 승격하지 않는다. 원문/상세 답은 계속 로컬만 보존한다.
- 긴 원장/guard 가용성·부분 stats/구조 영수증·미확인 intent 확인 절차는 메모리 `소통 원장 운영 보강`으로 남겼다. 구 설치본은 transitionId를 읽지 못할 수 있어 버전 일치가 필요하며 설치는 병합 뒤 main에서만 한다. 바이너리/필터/CRLF 공개 기준선은 보수적 hold가 남을 수 있다.
- 첫 전체/파일 단독의 dashboard-init 형제 스냅샷 실패는 [원문](evidence/check-first.txt)·[파일 실행](evidence/dashboard-init-focused.txt)에 남겼다. 후속 이름/파일 진단·전체·독립 실행은 통과했지만 원인은 미확인이다. 메모리 `대시보드 형제 보존 시험의 간헐 실패`를 유지하며 해당 생산 코드/시험을 바꾸지 않았다.
- [브레인 lint](evidence/brain-lint.txt): 오류0, 기존 stale-source 경고는 프로젝트 finish 전에 실제 주장 대조로 정리한다. 새 지식은 `.pace/brain/pages/concept/참여-소통-원장의-증명-경계.md`와 기존 flow 관련 링크로 남겼다. 다른 clone에 원문이 없다는 한계를 별도 사용자 승인으로 둔갑시키지 않는다.
