# T03 Windows 병렬 실행 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

Windows 기본 파일 동시성을 4로 선택했다. 4·8 각 두 회의 실제 전체 비교, 기본8 첫 전체 실패의 원문 보존과 중단, 승인된 안정성 우선 선택 및 새 기본4 전체 연속 다섯 회를 구별했다. 새 다섯 회는 모두 970건·961통과·실패/취소0·기존 skip9이고 중앙값 680.918초(범위680.448~685.689초)다. 기존 범위·skip 사유와 실행 소스 경계 대조가 통과했다. 독립 tester의 실행·원본 검증과 anthropic reviewer의 코드 검토는 통과했고, 증거 연결 SF-1은 바이트 대조 산출물로 보완했다. T03의 P-3 관측 목표를 달성했으며 P-6 최종 세 회는 후속 변경 뒤 남아 있다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1/S-2 플랫폼·override·실제 겹침·이름 필터·오류/신호 전달. `evidence/candidate4-focused.tap` 및 `evidence/post-tester-final-stage2.md` |
| T-2 | 통과 | S-4 비교 및 S-5 새5회 종료0·실패/취소0·범위/skip 동일. `evidence/comparison-2026-11-18T13-42-41-253Z/comparison.json` 및 `evidence/stability-selection-decision.json` 및 `evidence/t03-c4-default-2026-11-18T15-24-37-446Z/selected-assessment.json` |
| T-3 | 통과 | S-3 원본 검사/byte 보존, S-6 보조 식별자·병목, S-7 도입 이력·실제 선택·한계·정의서/브레인 및 아래 최종3회 인계. `evidence/final-measurement-analysis.md` 및 `evidence/profile-reconciliation.json` 및 `../../../../docs/README.md` 및 `../../../../.pace/brain/pages/concept/windows-시험-병렬-실행과-안정성-선택.md` |

## 단위 테스트

runner 집중8건이 PM과 새 독립 tester 실행에서 통과했다. 기존 오류·자식 신호·전달 계약을 유지하고, Windows 기본4/비Windows Node 기본값, 분리형 옵션/추가 파일/구분자/중복·잘못된 override를 검증했다. S-2는 실제 npm check 경계의 타입 검사용 sentinel을 지나 두 worker 진입/통과 구간과 PID를 확인한다. 동시성1은 겹침 검출로 실패하고 2는 통과하며 제외 sentinel 미실행과 실패 sentinel 비정상 종료를 확인했다. 실제 프로젝트 타입 검사는 각 전체 실행 및 별도 profile에서 수행했다.

측정 self-test16항목은 누락·변조·불완전 로그·잘못된 시간·전부 skip·reporter 상속을 검출했다. 프로젝트 바깥으로 나가는 evidence 경로와 잘못된 비교 옵션도 거부했다. strict tsc 도구 검사와 프로젝트 타입 검사가 통과했다. 프로젝트 evidence에만 Git text 변환 해제를 적용했고 독립 tester도 Git 속성·동일 blob hash를 확인했다. 일반 소스/다른 프로젝트의 속성을 바꾸지 않았다.

## E2E

- S-4 실제 전체 비교 순서는4→8→8→4다. 경과 시간은692.948/633.831/657.639/702.170초, 각970건·961통과·실패0·skip9다. 중앙값4=697.559초,8=645.735초로 초기5% 운영 규칙의 속도 후보는8이었다. 환경/실제 옵션 대조는 `evidence/comparison-2026-11-18T13-42-41-253Z/environment-and-invocation-audit.json`에 보존했다. 두 표본/5%는 통계 검정이 아니다.
- 기본8의 새 검증 첫 회는682.084초·종료1·970건 중960통과/실패1/skip9였고 나머지 네 회는 시작하지 않았다. 내부 healer popup의 done 대신 step-failed가 원문에 남으며 원인은 미확정이다. `evidence/t03-selected-2026-11-18T14-32-40-525Z/run-1.log` 및 `evidence/selection-failure-and-controls.json`을 보존한다. 후속 좁은 진단1건과 원래19파일181건의 정상 결과는 전체 실패를 무효화하지 않는다. 제품 동작/기존 단언/skip을 바꾸지 않았다.
- main 판단으로 TASK를 안정성 우선 절차로 보완하고 같은 사전 reviewer의 새 해시 재검토를 통과한 뒤, 기본값과 첫 unit 기대값만4로 바꿨다. TASK 재료의 '현재 기본8'은 당시 후보 상태이며 현행 기본값은4다. 결정 SHA와 현재 TASK 해시가 `evidence/candidate4-validation-launch.json`에 묶인다. 실패8 사본/당시 SHA와 새4 환경/현재 SHA의 두 literal 차이는 `evidence/candidate-source-delta.json` 및 `evidence/verify-candidate-source-delta.mjs`에서 재현할 수 있다.
- S-5 기본4의 새 원본 다섯 회는680.918/683.052/680.448/680.721/685.689초다. 각 실제 npm 줄은 override 없는 `> node scripts/test.ts`이며 종료0·970건·961통과·실패/취소0·skip9다. 원문과 회차별 부하 기록은 `evidence/t03-c4-default-2026-11-18T15-24-37-446Z/results.json` 및 같은 폴더의 run-N.log/run-N-host.json에 있다. 이전 비교/실패/진단을 새 다섯 회에 합산하거나 실패를 재시도 성공으로 교체하지 않았다.
- 각 원본에서 이름·판정/시간/총계를 재파싱했고 T02 대비 기존 이름1건의 의미 보존 변경과 새 통과2건 외 차이0 및 skip사유 동일이다. 시작·종료95개 시험 SHA/runner/helper/측정5도구/commit/관련Git상태/기본argv 대조는 `evidence/t03-c4-default-2026-11-18T15-24-37-446Z/source-boundary.json`에서 모두 통과했다. 이것은 시작·종료 스냅샷이며 연속 감시가 아니다.
- S-6 보조 profile은 타입 검사0.838초·시험671.871초·종료0이며95파일/970건,961통과·실패/취소0·skip9다. 실제 동시성4와 파일/entryFile/줄/열, root요약1개, 모든 시간/파일 인벤토리 완전성을 확인했다. 기본 다섯 회 각각의 이름·판정 차이0/총계 동일이고 원시 skip 사유도 T02와 같다. `evidence/t03-c4-profile-2026-11-18T16-21-51-780Z/profile-analysis.json` 및 `evidence/profile-reconciliation.json`에 있다.
- 보조 상위 파일은 하네스521.887초·playbook 래퍼190.956초·adopt-opal90.506초·Windows watchdog84.352초다. 단일 병목 관측이며 병렬 파일 시간 합계를 벽시계 원인 비중으로 해석하거나 중첩 비용을 다시 더하지 않는다. T02 기본 로그에 없는 파일 귀속/파일별 시간의 정확한 과거 대비 증감을 주장하지 않는다.
- 초기 추가 대조 도구는 Git LF blob과 작업본CRLF의 byte SHA를 직접 비교해 잘못 거부했다. `evidence/reconcile-profile-initial.mjs` 및 `evidence/reconcile-profile-initial.log` 및 `evidence/reconcile-profile-initial-result.json`을 보존했다. 수정본은 작업본 byte SHA가 측정 당시와 일치하는지 먼저 단언하고, T02 본문 비교에만 CRLF→LF를 적용한다. 변경 본문은 test-command 하나다. 이 도구 오류는 실제 전체 시험 실패가 아니다.

## 리뷰

- 사전1차: 별도 anthropic reviewer pass blocking0 should_fix5. `evidence/pre-review-1-stage2.md` 및 `evidence/pre-review-disposition.md`.
- 중간 구현 후: 사전 맥락과 별개의 anthropic reviewer pass blocking0 should_fix2, 이후 같은 맥락 비교 검토 pass blocking0 should_fix1. `evidence/mid-review-1-stage2.md` 및 `evidence/mid-review-2-selection.md`. 당시 통과는 최종 안정성 충족 판정이 아니었다.
- 안정성 선택 사전 재검토: 같은 사전 reviewer pass blocking0 should_fix3. 현재 해시와 원문은 PRE-REVIEW에 연결했고 처리 내역은 `evidence/pre-review-2-stability.md` 및 `evidence/pre-review-2-disposition.md`다.
- 최종 구현 후: 기존 별도 사후 anthropic Claude Opus5.5 reviewer의 연속 검토로 코드 pass blocking0 should_fix0, 증거연결 should_fix1·nit2. `evidence/post-review-final-stage1.md` 및 `evidence/post-review-final-stage2.md`. 전체 raw 원문을 직접 열람하지 않은 한계를 공개했다. SF1 및 nit처리는 `evidence/post-review-final-disposition.md`다.
- 최종 tester: 새 독립 openai Codex 맥락의 원본 검증 pass, runner 실제8건 통과·S1~6충족. `evidence/post-tester-final-stage1.md` 및 `evidence/post-tester-final-stage2.md`. T03 TASK-CLOSE의 S7 연결 보류는 본 문서 T3/남긴 것에서 충족했다. 원문 출처/SHA/민감 점검은 `evidence/final-review-provenance.json`에 보존했다.
- 교본: typescript·verification의 공유 가변 상태/과한 mock/구현을 베낀 검사/관측 실패를 성공으로 숨기는 패턴을 대조했다. 실제 npm 배리어 RED/GREEN·선택 제외 sentinel·실패 전달·원본 독립 재검증을 사용했다.

## 남긴 것

8의 원래 실패 원인은 미확정이며4가 이를 고쳤다거나 재발하지 않는다고 주장하지 않는다. 당시 RPC 이유를 기록하는 기본 단언이 없어 향후 실패 시에도 원인 확정이 어려울 수 있다. BR03의 원인 수정은 승인된 제한 아래 수행하지 않았다는 범위를 유지한다. 실패8 전체 부하 진단이나 제품 동작 수정도 하지 않았다.

4/profile source-boundary 원본의 '수집 후 추가' 고정 문구는 실패8 당시 검증기 이력이다. 새4는 시작 전부터 검증기가 있었으며 환경 Git 시작 상태로 확인했다. 원본 JSON은 고치지 않고 이 정정을 남긴다. `assess-selected.ts`의4/8단언은 이번 승인 결정 전용 증거 검증기의 범위 고정이며 일반 선택기 기능이 아니다.

S-7: 직렬 도입 커밋은28192e5지만 구체 이유는 이력/브레인에서 확인하지 못했다. T02 공용TMP 간섭은 외부 동시성1에서도 관측됐으므로 직렬 도입 이유나 병렬화 원인으로 단정하지 않는다. `docs/README.md`는 실제Node24.22.3·Windows4·명시override와5회 관측을 반영했다. 기존 검사 명령과 사용법 계약이 같아 AGENTS 추가 변경은 필요하지 않았다. 브레인 `windows-시험-병렬-실행과-안정성-선택`에 실제 동시성 검출·후보 전환·실측 한계를 기록했다.

T01 기준1425.464초 대비 이번 중앙값680.918초는47.768%(누적52.232%감소)다. Git 준비·중첩 격리·runner 변경의 기여도를 분리하지 않으며 P-6 달성으로 확정하지 않는다. T04 제품 빠른 검사 뒤 T05에서 함수 전환 필요성을 실측으로 판단하고, 최종 전체3회를 같은PC/도구/원래 전체명령/격리 조건으로 별도 실행해 중앙값712.732초 이하·실패0·기존 범위/skip 보존을 확인한다. 최종 관측 실패/불명확 또는 목표 미달은 상위 판단으로 올린다.

수집 중 다른 시험/진단은 겹치지 않았고 실행 소스를 편집하지 않았다. 읽기 리뷰·절차 확인·증거 기록 부하와 호스트 기타 부하는 정량화하지 않았으며 조용한 호스트/통계 신뢰를 주장하지 않는다. 리뷰 원문/마감 추가 뒤 최종 보안 검사2052개 파일과 브레인 lint 오류/경고0, project check/done 통과를 확인했다.

스테이징 뒤 전체 diff 공백 검사는 byte 보존 raw 로그의 원래 CRLF/공백을 지적했다. 원문을 정리하지 않고 evidence를 제외한 소스/문서 검사 종료0을 확인했다. 추가 증거482개는 Git index blob과 작업본 byte가 모두 일치한다. `evidence/staged-byte-check.json`은 과거에 이미 커밋된13개 증거의 LF/CRLF 차이도 별도로 기록한다. 이 파일들은 이번 변경에 포함되지 않았으며 기존 blob을 다시 쓰지 않았다. 새 속성은 과거 Git 정규화를 소급 복구하지 않는다.
