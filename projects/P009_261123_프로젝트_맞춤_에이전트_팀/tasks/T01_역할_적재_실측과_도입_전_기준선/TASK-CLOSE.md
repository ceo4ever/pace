# T01 역할 적재 실측과 도입 전 기준선 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

상위 목적과 맞음: 역할 원문에 적은 설정과 실제 실행을 구별하고, 역할 지정 자동화 및 팀 도입을 비교할 근거를 역할 적용 전에 보존했다. Claude native·prompt 및 Codex prompt는 역할 적재 뒤 3턴의 QA 업무·역할 밖 인계를 유지했고, Codex native 원본만 둔 최상위 작업자는 대조군처럼 역할을 적재하지 않았다. 이를 근거로 T03의 공통 경로는 prompt 적재와 명시적 model·effort 인자 전달로 정했다. 도구 지시는 권한 차단을 보장하지 않으며 Bash 파일 읽기 행동 지시 위반도 공개한다.

계약 목표 달성: 달성. 독립 tester와 reviewer의 최종 2단계가 모두 blocking0·달성으로 판정했다. [첫 코드 판단](evidence/impl-review-stage1-final.json), [tester 첫 판단](evidence/tester-stage1.json)과 각 2단계 결과를 보존한다. 실제 권한 전부의 집행·생산성 인과 효과는 이 관측으로 확인하지 못했다. Claude 전체 도구 목록은 자기 보고, 실제 호출은 Bash이며 원시 요청 목록은 미확보다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 [호스트 실측](evidence/host-loading.md), observations 5개, [모델 메타](evidence/host-model-metadata.json), receipt·임시 원본. Claude 실제 effort medium으로 정의 high와 다름. Studio MCP는 호출 단위 임시 설정·연결과 도구 이름만 확인, Studio 도구 실행 없음 |
| T-2 | 통과 | S-2 CLI→기록→재읽기, 잘못된 조합 거부·기존 stats 회귀·두 answer 대기 수명, test/project-log.test.ts의 추가 3건과 metrics 포함 21건 |
| T-3 | 통과 | S-3 [Roblox 최종 원장](evidence/baseline-roblox.json), [ai-sql-client 원장](evidence/baseline-ai-sql-client.json), 4,285자 내부 검토 문서·출처 해시·독립 2단계 검토. P002 병합 완료를 재확인해 T01~T03·merge까지 확장, 중간 원장 별도 보존 |
| T-4 | 통과 | S-4 [집계 정의](evidence/counting.md), workerSpec·coordinator 예시의 수신자·두 answer·연결 표·실제 경로 규약. captain10/coordinator4/unknown2, 정상 배정·승인과 보정 구별 |

## 단위 테스트

- RED: 수신자 보존/거부 시험 2건이 구현 전에 실패함을 확인한 뒤 구현했고, 수신자 구현이 없는 d761d04 사본에 현재 시험만 복사해 2/2 실패를 재현했다. [RED 결과](evidence/unit-red.txt).
- `node --test test/project-log.test.ts test/project-metrics.test.ts`: 21/21 통과. tester도 직접 재실행했다.
- `PACE_SKIP_BROWSER_E2E=0 npm run check`: tests 1,035 / pass 1,018 / skip 17 / fail 0, 종료 0. [전체 원문](evidence/check-after-prerequisite-pass.txt). 타입 검사와 브라우저 포함 전체 회귀다.
- 전체 검사 중 발견한 기존 S-11 raster 차이는 승인된 별도 선행 커밋에서 viewport 재설정 시험만 수정했다. 캡처 해시가 바뀌면 이전 승인을 거부하는 음성 시험은 유지·추가했고 생산 healer 승인 로직은 변경하지 않았다. 실패 원문도 보존했다. Telegram S-4b·S-9g는 main의 별도 수정으로 통합했다.

## E2E

- S-1: 별도 임시 저장소의 Orca 작업자 5개(Claude native/prompt, Codex native/prompt/control), 각 3턴 완료·종료 보고 회수. native 미적재와 행동 지시 위반도 성공으로 숨기지 않았다. 시작 실패는 dispatch 전 경로 별칭 문제였고 정규 경로·동일 retry 요청으로 복구한 영수증을 보존했다.
- S-3: 대상 저장소를 읽기만 하고 P009 evidence에 문서·원장을 기록했다. ai-sql-client 문서 게이트는 문서/출처 해시·5절·인용 10건·발췌 11건을 검사해 통과했다. Roblox는 원본 85개 사건과 질문별 근거를 대조했다.
- S-4: captain 전달 1/coordinator 원질문 1/생략 1의 합성 표본에서 개입 1·코디네이터 1·미확인 1, 기존 질문 사건 합 3을 구별했다.
- S-5: 위 전체 검사와 독립 tester/reviewer 기록을 연결한다. 실사용 저장소의 팀 도입 자체는 T08에서 검증한다.

## 리뷰

- 사전 검토: R1 blocking1 → R2 pass. 대상 저장소 변경 후 R3 blocking1 → R4 blocking1 → R5 pass. [PRE-REVIEW.json](PRE-REVIEW.json)에 각 TASK 해시·원문·다른 세션 연속성 한계를 보존했다.
- 구현 후 코드: 첫 fail blocking1(전달 질문 대기 미종료) → 두 answer 수명 반영 후 pass. 최종 코드 확인은 impl-review-stage1-complete.json pass(blocking0)이며 자동 경고·비교표 주석은 T06 인계다. [원장](evidence/REVIEW-LOG.jsonl).
- tester: 첫 독립 목표 판단 뒤 2단계 fail blocking1(노력 메타와 표 불일치) → 원시 메타 대조 후 별도 결과에 재판정. 이전 fail 원문은 그대로 보존했다.
- reviewer 2단계: 첫 결과 pass blocking0의 should_fix(실제 도구 근거·중복 구간·수신자 불확실성·전달 수명)를 보완했다. 최종 reviewer-stage2-settled.json은 pass blocking0·should_fix1(서술 잔재)·목표 달성. 해당 잔재의 11/1을 10/2로 정정했고 원본 해시도 PM이 직접 재대조했다.
- 특수 기능: 실제 Orca worker-start로 native 적재와 prompt를 비교했다. 독립 검토는 작성자 Codex와 다른 제공자 Claude를 사용했다. reviewer 2단계는 새 Claude 맥락에 1단계 원문을 전달한 대조이므로 같은 검토자의 연속 세션이라고 주장하지 않는다. tester는 첫 판단 이후 같은 Claude 세션을 재개했으며 테스트 Bash만 허용했다. 자동 부트·git 상태 노출 및 바깥 원본 읽기 제한은 각 원문에 기록했다.
- 교본: typescript·verification 색인 — 선택 필드의 경계 검증, 실행 전 거부·저장/읽기 왕복, 외부 환경 격리, 회귀와 음성 조건을 대조했다. 로그 경로·안전한 필드 whitelist·파일 잠금 경계는 보존했다.

## 남긴 것

- BR02 필드 목록: `.pace/team/<name>.md`의 name·role·stage·tier·resources·tools와 본문의 정체성/업무/하지 않는 일/인계/완료·도구 지침. 실제 tier는 BR02의 high/medium/low이며 실측 fixture의 standard를 스키마로 채택하지 않는다. 호스트 model·effort 매핑은 원본 본문 지시와 구별해 실행 설정으로 전달한다.
- BR03 적재 방식: 두 호스트 공통 prompt 원본 읽기 + 명시적 model/effort. Codex native custom subagent와 최상위 Orca worker 역할 선택을 구분한다. 호출마다 공유 `.claude/settings.json`을 교체하지 않는다. `--role` 생략은 기존 동작을 유지한다.
- T06: 사건 수와 요청/개입 수를 분리하고 비교표에 도입 전후 기록 방식 차이를 표시한다. FIFO 대기를 질문의 의미상 짝으로 재사용하지 않는다. 미응답/연결 누락 경고와 잘못된 to 행 전체 폐기 정책을 설명한다. 연결 파일은 CLI가 검증하지 않으므로 운영자가 실제 행을 대조한다.
- T08: Roblox는 기존 팀의 메시지 지정 자동화 비교, ai-sql-client는 개발 저장소 안의 문서 업무 비교다. 같은 P009 시작 위치·자료 범위·분량·게이트·Claude 독립 대조를 유지한다. 문서 주제와 세션 누적 맥락 차이를 공개하며, 역할 prompt 적용과 대상 저장소 native 현장 검증을 구분한다.
- 기준선: Roblox 캡틴 확인 질문10·미확인2(10~12 범위), 품질 blocking48(로그 요약31과 별도)·재검토18·gate실패7. 캡틴 손작업 3종의 총량은 null/미복원 구간 각1이다. ai-sql-client도 총 손작업은 미확인이며 다른 실측과 구간이 겹쳐 경과 시간 비교를 금지한다. T08에서 발생 시 `--to`·손작업 note를 기록해 추가 표본을 확보한다.
- 직접 CLI 실행은 Orca 부모 수명 변수를 격리해야 한다. 캡처의 실제 raster 배율과 viewport가 다를 수 있어 승인 해시를 느슨하게 만들지 말고 시험 환경을 먼저 고정한다. 두 이슈의 후속 범위는 프로젝트 메모리에 남겼다.

should_fix 처리: 최신 코드 검토의 미응답 경고와 비교표 주석은 BR06 범위인 T06 인계로 남긴다. by는 기록자이고 to는 수신자여서 일반 직접 CLI 호출을 허용하며, 기계적 중복 검증 없이 연결 근거를 사람이 대조하는 현재 계약을 유지한다. 별도 forward 사건 종류는 과거 종류 소비자와의 호환 범위를 늘리므로 기존 question/escalation과 합집합 대기를 유지했고, 이후 수신자별 지표에서 사건 수와 개입 수를 구분한다. 일반 escalation의 T01 경로는 예시이며 실제 T## 경로로 바꾼다. 스킬과 실행 파일 버전이 섞이면 새 옵션이 거부될 수 있어 재설치는 main에서 함께 수행한다.

최종 2단계: [tester](evidence/tester-stage2-settled.json) pass blocking0·should_fix0, [reviewer](evidence/reviewer-stage2-settled.json) pass blocking0·목표 달성. 1단계의 시험 미실행/부분 달성은 2단계에서 실제 시험 원문과 전체 관측 근거를 추가해 달성으로 판단한 것으로, 작성자 주장만으로 번복하지 않았다. 독립 검토자의 외부 원본 접근 제한은 [원본 해시 대조](evidence/baseline-original-hash-check.json)로 PM이 보완했으며 독립 직접 검증으로 바꾸어 쓰지 않는다.
