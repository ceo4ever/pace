# T04 호출 절차 연결 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

반복 실패에서 지정 PM이 알맞은 기회에 문제 해결안을 받고 기존 결정·적용·독립 검증으로 잇는 절차를 확정했다. 실제 CLI 조기 신호에 워크트리 PM이, 구조 진단 뒤 상위 근본 검토에 허브 PM이 각각 지정 모델을 한 번 호출했고 같은 시도를 원장과 반환에 연결했다. 소진·권한·끝점은 고정 행동 평가와 CLI 도구 근거로 확인했다. 행동 평가의 최초 실패와 재검증을 모두 남겼다. [실제 발동](evidence/live-trigger-evidence.json) [행동 판정](evidence/eval-summary.md) [독립 1단계](evidence/stage1-disposition.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1. 워크트리 조기 1회, 소진 인계 뒤 허브의 공동 시도마다 1회, 합성 세 행과 같은 ID 재입력 +0행을 대조했다. 일반 산출물, B, 백로그 기회 및 전문 자문 뒤 기존 독립 확인은 W01~W07로 검증했다. [행동 평가](evidence/eval-disposition.json) [세 기회](evidence/joint-route-w05.json) |
| T-2 | 통과 | S-2. verify 및 외부 review-record의 상위 발동과 실행 전 차단을 관측했다. 허브의 원장 포함 입력, A-1·A-3·필수 조치 및 두 번째 실패의 대상·단위·회차별 blocking·원인/해결안·재현·세 선택·추천·대기는 W08~W12와 P013/T09 관문 시험으로 대조했다. [외부 발동](evidence/external-upper-replay.md) [행동 판정](evidence/eval-disposition.json) [P013 T09 마감](../../../P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/TASK-CLOSE.md) |
| T-3 | 통과 | S-3. 두 정상 verify 발동을 격리 fixture에서 관측했다. 실제 읽기 전용 Claude Fable-5-2/high는 각각 같은 실행의 Stop과 시도 한 행에 일치한다. 조기는 프로젝트 사건 ref와 진단 0행, 상위는 같은 ref·call ID와 root_review 슬롯 1이다. [조기](evidence/actual-early.json) [상위](evidence/actual-upper.json) [근본 검토 연결](evidence/root-evidence-fields.json) [허브 실행](evidence/upper-coordinator-receipt.md) |
| T-4 | 통과 | S-4. TS-16~22 v1 모두 등록하고 정본·반환·관측을 대조했다. 기존 S1~S9 및 D/H를 포함한 최종 제품 지문의 사본에서 기존 및 신규 53건이 독립 판정을 통과했다. D01은 단계별 증거를 더 명시한 질문에서 통과했으며, 최초 미통과와 제한 시간 재시도를 남겼다. H01은 기획자 반영과 교차 검토를 왕복했다. [요건](evidence/requirements.md) [최종 행동 판정](evidence/eval-exact-proof.json) [기획 인계](evidence/h01-handoff-result.md) |
| T-5 | 통과 | S-5. 검토 승인의 Markdown 5개 경로와 시작 지시 anchor, 비밀 검사 및 선언 전체·집중 검사를 대조했다. [범위](evidence/scope-proof.json) [검사](evidence/full-check.txt) [보안](evidence/security.txt) |

## 단위 테스트

- 선언 검사 `npm run check -- --test-concurrency=6`에서 1524개 중 1507개 통과, 실패 0개, 17개 건너뜀, 종료 0이었다. 최종 제품 diff와 패치 지문은 전체 검사 전후 같았다. 집중 검사는 140/140 통과다. [명령과 결과](evidence/full-check.txt)
- T05의 실제 workerSpec anchor와 선택 재발 표지의 기존 판정·예산·원장 보존을 대조했다. 비밀 검사와 diff 검사에 오류가 없었다. [정본 범위](evidence/scope-proof.json) [비밀 검사](evidence/security.txt)

## E2E

- 정상 진입점의 검토 판정은 합성 입력을 실제 source CLI로 처리했다. 전문가 반환 두 번은 지정 역할의 실제 새 세션이다. 작업 디렉터리는 공용 격리 fixture였고 서로의 인접 파일을 읽은 범위를 반환에 적었다. 호출 당시의 상위 입력과 두 반환을 보존했다. [조기 반환](evidence/actual-early-response.md) [상위 반환](evidence/actual-upper-response.md) [실행·한계](evidence/stage1-disposition.md)
- W05의 합성 원장으로 기회별 세 시도와 기록 중복을 시험했다. 외부 review-record의 종료 0 발동, 다음 review-hand의 종료 16과 같은 원장을 별도 fixture로 대조했다. 승인·배포·실제 해결안 적용은 권한을 평가하는 합성 계획이었다. [세 기회](evidence/joint-route-w05.json) [외부 경로](evidence/external-upper-replay.json)

## 리뷰

- 사전 교차 검토 R1은 남아야 할 증거와 호출 문턱을 보완하라고 지적했다. R2에서 보호 범위 및 다섯 문서의 구현 허가를 확인했다. [사전 R1 대응](evidence/pre-review-1-disposition.md) [사전 R2](PRE-REVIEW.json)
- 독립 1단계에서 실제 두 경로와 예산 차단을 확인하고, 공용 fixture의 읽기 범위와 나머지 운영 분기를 미확인으로 남겼다. 문서에서 기회별 ID와 기존 검토 자동 인계, 필요한 입력과 B의 오분류 복구를 명확히 했다. 초기 2단계 tester가 확인한 분석 본문 해시와 반환 파일 해시는 별도 키로 고쳤고 원본 JSON과 직접 외부 발동을 보존했다. 공식 R1은 정확한 최종 사본 및 전체 선언 검사 증거를 요청했고, R2는 선언 검사를 확인한 뒤 고정 평가 산출물이 완성될 때까지 T-4를 미확인으로 두었다. [공식 R1](evidence/pre-revalidation-review.json) [공식 R2](evidence/revalidation-before-final-artifact.json) [목표 1단계](evidence/stage1-disposition.md) [기계 대조](evidence/tester-stage2-mechanical.json)
- [최종 교차 reviewer](evidence/review-records/R3.json)와 [독립 tester](evidence/tester-final.json)와 [최종 증거 대조](evidence/tester-exact.json)는 같은 최종 산출물과 증거를 대조했다. R3는 목표 달성·기준 모두 present, blocking 0, should_fix 1, note 1의 pass다. D01의 보강 질문으로 인한 검출 범위와 S6의 프롬프트 출처를 명시했다. [지적 처리](evidence/eval-summary.md)

## 남긴 것

- 실제 운영에서 전문가 호출 전후의 반복 감소와 전문가 해법의 적용 효과는 후속 비교 대상이다. 합성 시험의 독립 확인을 운영 결과로 집계하지 않는다.
- BL261118_02의 인수에는 T05의 workerSpec과 이 태스크의 호출·인계·재검증 근거를 사용한다. 공용 fixture의 인접 읽기와 검증 분기는 각 기회에 필요한 읽기 범위를 먼저 준비하는 운영 조건으로 확인했다.
