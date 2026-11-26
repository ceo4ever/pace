# T08 작은 계획 경고와 검토 문서 축소 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

검토 안내를 줄이고 TASK 크기·다른 태스크 번호를 경고한다. Git 판정 후보와 기존 승인 경계를 실제 CLI로 보존했고 축소한 안내의 행동을 독립 응답으로 확인했다. [최종 변경](evidence/impl-diff.patch) [독립 tester](evidence/tester-sealed.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 실제 check·done·index에서 80/81줄, 다른 번호·주석·코드, 마감 부재·실패와 작업본/후보 차이를 확인했다. [CLI](evidence/cli-sealed.log) [분포](evidence/task-size-distribution.json) |
| T-2 | 통과 | 외부 시스템의 브레인 검색·기존 도구 확인을 TASK 선례 한 줄과 독립 검토 인계에 연결했다. |
| T-3 | 통과 | 판정 질문과 A-1/A-3·B1·허가 원칙을 남기고 도구 강제 규칙을 아래 위치에 연결했다. |
| T-4 | 통과 | 동일한 고정 19개 사례를 네 차수 실행했다. 최종 행동을 별도 tester가 필수·금지 조건에 대조했다. [기대표](evidence/scenarios-before-docs.md) [19개 채점](evidence/tester-behavior.md) [최종 판정](evidence/tester-sealed.md) |
| T-5 | 통과 | 집중·호환성·실제 독립 검증 및 전체 검사. [호환성](evidence/skill-sealed.log) [전체 검사](evidence/full-check.log) |

## 단위 테스트

- 두 실제 CLI 회귀와 사전 검토·스킬 문구 호환성 17건이 통과했다. 직전 커밋에는 경고가 없어 새 CLI 두 사례가 실패했다. [이전 검사](evidence/baseline-red.log) [최신 CLI](evidence/cli-sealed.log)
- 처음 차수의 전체 검사에서 옛 SHA 대조 명령 예제가 누락돼 사전 검토 호환성 한 건이 실패했다. 예제를 복원한 뒤 전체 검사를 재실행했다. 1,489건 중 1,472건 통과, 기존 제외 17건, 실패 0건이었다. 마지막 문서의 A-3 승인·명시적 재개 안내는 집중 3건과 최종 독립 tester로 확인했다. [A-3 검사](evidence/a3-lookup.log)
- `node scripts/secret-scan.ts`를 통과했다.

## E2E

- 19개 시나리오의 입력은 차수마다 동일하다. 각 응답은 별도 읽기 전용 Claude 맥락이다. 도구 목록·실제 Read/Grep/Glob 호출·원시 기록 지문, 노출된 파일의 바이트와 행 수, 모델 응답과 질문·대기 수를 기록했다. [설정과 차수](evidence/behavior/README.md)
- 첫 차수들에서 원인 조치와 진단의 순서, 옛 `ask_user`와 상위 검토의 구분, 일반 단계 승인 기록의 혼동을 확인해 고쳤다. 평가표는 문서 축소 전에 고정했다. 이후 시나리오 표의 빈 줄만 정리했다. [고정된 표](evidence/scenarios-before-docs.md)
- T08 경고는 실제 Git 후보에 있는 본문을 읽는다. 거부 반례는 허가가 필요한 작업본을 변경하고 단계의 index를 고정해 둘의 판정을 비교한다. [CLI](evidence/cli-sealed.log)

## 리뷰

- 사전 검토에서는 실제 Git 후보, 실패 때의 메시지, 길이 근거와 채점 사전 고정을 확인했다. [사전 기록](PRE-REVIEW.json) [두 번째 대조](evidence/pre-review-stage2.json)
- 구현 후 점검으로 일반 단계의 승인 기록, 무효 명령의 위치, 시나리오 표와 구현 위치를 바로잡았다. [최종 reviewer](evidence/reviewer-sealed.json) [최종 tester](evidence/tester-sealed.md)
- 교본은 TypeScript 검사와 검증의 실패 주입 원칙을 참고했다. 실제 이전 진입점, Git 후보·작업본 차이, 기존 오류 코드를 서로 대조했다.

### 강제 동작의 위치

| 규칙 | 정본 구현 |
|---|---|
| 전체·범위 재검토와 예산, 호출 예약·복구 | `src/agent/review-budget.ts`, `review-admission.ts`, `review-log.ts`, `review-recovery.ts` |
| 공동 시도·수정 확인·구조 진단·상위 검토·A-3 기록 | `src/agent/review-followup.ts`, `verify-cli.ts` |
| 단계별 질문·기준 관측·적용 등급·강등 | `src/agent/verify.ts`, `review-criteria.ts`, `structured-review.ts` |
| 허가 범위·작은 변경·실제 후보·계획 경고 | `src/project/review-permission.ts`, `pre-review.ts`, `harness.ts` |
| 외부 검토 고정 및 PRE-REVIEW 생성 | `src/agent/review-hand.ts`, `review-pre.ts` |

`reviewer.md`는 160줄에서 87줄로, 16,218자에서 4,534자로 줄었다. 끝 개행을 제외한 행 수와 UTF-8로 읽은 Unicode 코드포인트 수를 사용했다. [전후 대조](evidence/document-size.json)

## 남긴 것

- 줄 수는 계획 규모를 빠르게 살피는 경고다. 기준 중복과 충분한 증명의 의미는 독립 검토에서 판단한다. 열람량과 비용의 현장 변화는 프로젝트의 병합 뒤 관측과 함께 확인한다.
