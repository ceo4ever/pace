# T06 문제 해결 구성원 정의·지침·실제 적용 관문·eval 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

`pace-troubleshooter`가 반복 실패의 원인과 해결안·검증 계획을 호출 PM에게 제공한다. 실제 새 Claude와 Codex 호출이 지정한 모델과 effort를 보고했고, 독립 능력 평가에서 양쪽 xhigh가 두 실패 사례를 모두 통과했다. 같은 제공자의 high도 2/2였다. 기본 effort를 유지한다. 조기 신호 및 상위 근본 검토의 실제 PM 연결은 프로젝트 마감에서 대조한다. [실제 적용](evidence/runtime-gate.json) [능력 평가](evidence/eval-results.md) [필수 요건 대조](evidence/requirements.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1. 조건부 reviewer/xhigh 원본과 두 생성물, 공통·보충 문단, 검증 표지 두 개, 결정·반환 경계를 확인했다. 팀 6개에서 sync 차이 0. [팀 목록](evidence/team-list.md) [동기화](evidence/team-sync.json) [템플릿 대조](evidence/team-contract.json) |
| T-2 | 통과 | S-2·S-3. 두 수단과 두 호스트를 조사하고 PACE 직접 p를 기본으로 정했다. 최종 원본 Claude `claude-fable-5-2/high`, Codex `gpt-6.2-astra/medium`을 실제 대조했다. 이용할 수 없는 모델의 거부와 시간 초과를 분리했고 보류 시 대체 호출은 0이었다. [수단 비교](evidence/route-probes.md) [관측 절차](evidence/runtime-observation.md) [모델 거부](evidence/model-availability.json) |
| T-3 | 통과 | S-4. 해결 전 실패 증거 두 건에서 새 읽기 전용 호출 8건, 같은 역할과 제공자별 high 비교. 모델·등급을 가린 독립 평가에서 각 xhigh 2/2, 각 high 2/2. 원응답·원인과 재발 관측의 구체 판정·시간·토큰을 보존했다. [고정 기준](evidence/eval-rubric.md) [결과](evidence/eval-results.md) |
| T-4 | 통과 | S-1·S-5. TS-07~TS-15 v1 아홉 건이 등록·충족이다. 구판 호환·운영 위치·모델 해결 순서·effort 기본값·선택 이유를 문서화했다. 선언 검사에서 실패 0. [대조표](evidence/requirements.md) [전체 검사](evidence/full-check.txt) |

## 단위 테스트

- 전체 선언 검사 **1521개 중 1504개 통과, 실패 0개, 건너뜀 17개, 종료 0**. 임시 `PACE_HOME`·`TMPDIR`, 브라우저 E2E 스킵, 동시 실행 6이었다. [요약](evidence/full-check.txt)
- 원본과 저장소 템플릿의 두 실행 전 대조 문단·검증 표지, 생성물 지문·두 매핑을 별도 실행으로 대조했다. 조건부 표지와 기존 생성물의 무변경을 확인했다. `node scripts/secret-scan.ts`, `git diff --check`를 통과했다. [원본 대조](evidence/verification-reproducers.md) [결과](evidence/team-contract.json)
- 브레인 lint 오류 0. 시작 시 이미 있는 소스 최신화 경고는 T06의 편집 대상 밖이다.

## E2E

- 실제 역할의 원본과 받은 본문의 지문을 확인했다. Claude 보고 모델과 동일 세션의 Stop effort, Codex 실행 머리글의 보고값을 요청과 대조했다. Claude p의 자동 시도에서 미확인으로 들어온 effort는 같은 ID·시각으로 보강했다. 두 호스트 모두 한 행을 유지했다. [관측 절차](evidence/runtime-observation.md) [호스트 결과](evidence/runtime-gate.json)
- 합성 미지원 모델이 실제 Codex 호스트에서 거부됐고, 지정 모델의 극단적인 시간 제한에서는 `timeout`이 나왔다. 두 호출 모두 실제 모델은 미확인이며 거부 결과에서 대체 호출을 열지 않았다. [거부 결과](evidence/model-availability.json)
- 과거 실패 두 건의 원문과 응답 8건에서 원인 층, 실패를 제거하는 조치, 해소와 재발 검출을 독립적으로 확인했다. 과거 운영 작업을 재실행하지 않았으며 Git 기록과 도구 관측 대상은 격리 사본에서 확인했다. [당시 입력 지문](evidence/eval-inputs.json) [격리와 접근](evidence/eval-input-isolation.json) [응답과 평가](evidence/eval-results.md)

## 리뷰

- 사전 Claude 교차 검토 pass, blocking 0. 격리 자료 접근 관측, 템플릿 검사, 모델 거부·시간 초과 구별을 보강했다. [사전 검토](review-records/R1.json) [대응](evidence/pre-review-1-disposition.md)
- 1단계에서 교차 reviewer와 별도 tester가 목표 적합성을 확인했다. 정본 능력 평가 결과를 사본에서 제외했으므로 당시 목표 달성은 미확인이었다. 노력값 원장 보강과 실제 검증 절차를 보완하고 2단계에 최종 성적과 원문을 제공했다. [reviewer](evidence/reviewer-stage1.json) [tester](evidence/tester-stage1.json) [대응](evidence/independent-stage1-disposition.md)
- 2단계의 정식 Claude 교차 판정은 pass, blocking 0이었다. 모델 거부의 같은 실행 연결을 지적해 한정 확인에서는 처음에 blocking 1이 남았다. 시도 ID·시각, 로컬 호스트 세션, 양쪽 스트림과 종료값을 대조해 최종 확인 pass를 받았다. [정식 교차 리뷰](evidence/review-records/R1.json) [대응](evidence/independent-stage2-disposition.md) [최종 교차 재확인](evidence/reviewer-recheck-final.json)
- 첫 두 집중 전환 전 tester 호출에서 시간 초과가 있었고, 별도 한정 tester가 두 명령을 통과한 뒤 성공 시도의 증거 연결을 fail로 판정했다. 각 시도의 원장·응답 지문을 보강한 최신 재검증은 T-1~T-4 최종 pass다. 전체 검사 뒤의 집중 지역 검사 30개도 통과했다. 구현 후보 최종 SHA-256 `75f15b443b08c1d2ffc9272460301eb774520fd949fb85d0323af7d3160a3144`. [시도별 증거](evidence/runtime-receipts.json) [한정 tester 첫 판정](evidence/tester-stage2-initial-fail.json) [최종 tester](evidence/tester-stage2.json) [집중 검사](evidence/focused-check.txt) [최종 패치](evidence/implementation-final.patch)

## 남긴 것

- Claude native는 자식 모델·effort를 관측했다. 현재 Codex native는 named spawn 수락까지만 확인했다. 두 호스트의 기본 수단으로 실제값을 관측한 PACE 직접 p를 사용한다. [수단 실측](evidence/route-probes.md)
- Claude 직접 p에서 종료 훅의 값은 같은 세션을 대조하고 해당 호출 행을 보강해야 한다. Codex의 오류 미리보기에서 모델 거부 원문이 잘리는 경우에는 보호된 동일 실행의 호스트 응답을 관측한다. [운영 절차](evidence/runtime-observation.md)
- 2건 표본에서 고정 요건의 성적은 동률이다. 같은 권고를 준 독립 판정자의 음성 대조는 통과했다. 실제 도입으로 반복 횟수가 주는지는 이후 프로젝트 관측이 필요하다. [능력 평가](evidence/eval-results.md)
- 프로젝트 범위의 실제 호출 행과 조기·상위 근본 검토 인계 및 호출은 T04와 PROJECT-CLOSE로 잇는다.
