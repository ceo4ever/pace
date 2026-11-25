# T04 최종 후보 독립 채점

파일은 바꾸지 않았습니다. 셸 도구가 없어 SHA는 다시 계산하지 못했고, 문서에 기록된 값끼리 대조했습니다. T-1~T-4는 관측 범위 안에서 충족입니다. T-5는 전체 검사가 끝나지 않아 최종 판정을 보류합니다.

## 먼저 알려야 할 불일치

- **`impl-diff-final.patch`는 다른 역할 원본을 담고 있습니다.** 본문이 50줄이고, 생성물의 `pace-team-source-sha256`이 `7463d57d…`입니다. 지시하신 `impl-diff.patch`는 52줄이고 SHA가 `a43bf47f…`입니다.
- 적재 보고서, 요건 대조표, 무결성 기록, 양성·음성 평가 모두 `a43bf47f…`입니다. 그래서 `impl-diff.patch`를 현재 후보로 보고 채점했습니다.
- `impl-diff-final.patch`가 남은 구판인지, 제출본인지 확인이 필요합니다. 제출본이라면 T-3과 T-4는 다른 원본을 증명한 것이 됩니다.
- 구판의 HANDOFF 줄은 `HANDOFF: 허브 PM | 검토 또는 결정 요청 | …` 형식입니다. 패치된 시험이 보는 `` `HANDOFF: X | 요청 | 근거` `` 형식과 달라 그 시험의 수신자 검사를 통과하지 못했을 가능성이 있습니다.

## SHA 대조

| 대상 | 값 | 비고 |
|---|---|---|
| 적재 보고서 Claude·Codex 두 행 | `a43bf47f…` | 서로 같음 |
| `requirements-trace.md`, `archive-integrity.txt` 2~4행 | `a43bf47f…` | 팀 원본·양성 주입본·음성 주입본 |
| `impl-diff.patch` 생성물 2개 헤더 | `a43bf47f…` | |
| `eval/positive/role.md`, `eval/negative/role.md` | 직접 읽어 `impl-diff.patch`의 역할 본문과 줄 단위로 같음을 확인 | 바이트 해시는 미계산 |

보고서 자체의 한계도 있습니다. `session_self_hash_observed`는 false이고, 호출 중 바꿨다가 되돌린 원본은 검출하지 못합니다. 두 호스트의 effort는 모두 `unconfirmed`입니다.

## 응답에서 직접 확인한 항목

| 항목 | 결과 |
|---|---|
| `pre-review.ts:112` 오류 | 확인. 역사 소스의 111행은 `record.waiver` 처리, 121행은 `waiverIssues` 정의이고, `by !== 'user'` 검사는 124행입니다. 응답 #8의 `:124`가 맞습니다. |
| `--to captain` 오류 | 응답 #2가 "낡음, 지금은 `--to owner`"로 지적했습니다. 백로그 19행의 `coordinator\|captain` 문구가 근거 오류라는 점은 맞습니다. `coordinator.md:27`·`P009 :94`는 이 폴더에 원본이 없어 재확인하지 못했습니다. |
| 교차 백로그 발견 | 확인. BL04 문서 어디에도 BL05 참조가 없고, 선행 칸은 BR01·BR02가 `—`입니다. 응답이 인용한 BL04 BR01의 15행(reviewer 영향 분류)과 16행(미확인은 PM 수용 불가)은 원문과 일치합니다. 응답의 "BL04:32-34 모두 —"은 BR03 선행이 `BR01·BR02`라서 약간 부정확하지만, 결론에는 영향이 없습니다. |
| 비교·분할 | 응답 3절에 BR01의 문서 7곳 이상, 완료 기준 9개, `harness.ts` 민감 경로와 golden 시험이 있고, BR01/BR02로 나누자는 제안이 있습니다. |
| 균일 입력 분할 부재 | 음성 응답은 세 BR을 문서 1개·민감 0·기준 2개로 비교해 "분량이 같다"고 했습니다. 3개 유지를 권했고 분할 제안은 없습니다. "합치는 쪽이 더 효율적"이라는 언급은 있지만 owner 지시를 이유로 유지하라고 했습니다. |

## T-1~T-5 판정

| # | 실행 | 선택(입력·증거) | 충족 | 검출력 | 약화·한계 | 판정 |
|---|---|---|---|---|---|---|
| T-1 | 합의·BR04와 등록표·적용표 대조 | BP-01~12 × BR04 항목(맡는 일 7, 금지, 입력·반환, 위치·종류 고정/권고, 결정 경계) | 누락 0. 12개 모두 정본 행·버전 1·구분이 있고, 문제 해결자는 미등록입니다. owner 결정 A는 `owner-scope.md`에 있고, `team-classification.json`에서 required는 기획자 1개뿐입니다. | `evals/scenarios.md` R01~R08이 누락·약화·미등록 오탐을 구분하게 설계됨 | 합의 원문 `BACKLOG.md:66`·`:40`은 이 폴더에 없어 대조표의 인용을 재확인하지 못했습니다. R01~R08의 실행 결과는 증거에 없습니다. | **pass** |
| T-2 | 역할 본문과 `required-roles.json` 확인 | `impl-diff.patch` | BP-01~12 전부 본문에 있습니다. BP-08에는 종료 백로그 편집·공유 목차 금지도 있습니다. 표지는 hub/false이고, 수신자는 허브 PM입니다. 시험은 `boundary-retest.txt`에서 1/1입니다. | 패치된 시험이 허브 역할의 수신자를 강제함 | stage1에서 의심한 "BP-08 종료 백로그 누락"은 `impl-diff.patch` 기준 해소됐습니다. BP-11의 "업무량으로 확정" 근거는 역할 본문이 아니라 `team-refresh-assessment.md`에 있습니다. | **pass** |
| T-3 | sync `--check`와 verify | 5명, 차이 0, 적재 2/2 | `{"members":5,"differences":[],"ok":true}`. verify는 pass이고 두 행의 해시가 원본과 같습니다. | 해시·매핑 불일치 검출 | verify는 키워드 일치만 보며 의미·진실성 검증이 아닙니다. effort는 미확인입니다. SHA는 다시 계산하지 못했습니다. 위의 `impl-diff-final.patch` 불일치가 남아 있습니다. | **pass** (불일치 확인 조건부) |
| T-4 | 양성·음성 독립 실행 | `.git` 없는 사본, 근거 열 제외 발췌, 프롬프트·원응답·`snapshot.json`·아카이브 SHA 보존 | 위 직접 확인 표대로 양성의 4개 요소가 모두 나오고 음성은 분할이 없습니다. 아카이브 SHA `771da4ec…`은 `snapshot.json`과 `archive-integrity.txt` 1행이 일치합니다. | 같은 역할·SHA로 입력만 달라 분할이 갈립니다. | 각 1회 실행이라 재현성은 모릅니다. 역할 본문의 "문서와 민감 코드는 섞지 않는다"가 양성에서 분할을 유도하는 단서입니다. 음성 입력은 합성이고 형식 결함이 있어 응답이 이를 따로 지적했습니다. `response.provenance.json`에는 프롬프트 해시와 시각이 없습니다. | **pass** (관측 범위 안) |
| T-5 | 운영 문서 ID 검색, 전체 검사, 후속 todo | `requirements-search.txt`, `full-test-summary.txt`, `real-use-todo.md` | 검색 결과는 정본(`required-roles.md`), 역할 원본(적용 사례), 시험 예문(`evals/scenarios.md`)뿐이고, `skills/pace-project-dev`·`pace-intent`·`docs/TEAM.md`에는 재정의가 없습니다. 메모리 todo도 있습니다. | ID 패턴 검색 | 검색은 `BP-/TS-` 패턴만 잡아 ID 없는 본문 중복은 못 잡습니다. 대신 `team-refresh-assessment.md`가 다른 설명이 각 정본을 가리킨다고 확인했습니다. **전체 검사는 `full-test-summary.txt`가 "still in progress"입니다.** `boundary-retest.txt`는 단일 시험 1건뿐이라 전체 통과의 근거가 될 수 없습니다. | 검색·todo: **pass** / 전체 검사: **보류** |

## 종합

- **목표 일치:** 허브 전용 maker 등록, 역할 적용, 적재, 업무 2~4의 행동 차이까지 관측 범위 안에서 일치합니다.
- **달성 선언은 보류합니다.** 이유는 두 가지입니다.
  1. T-5의 전체 검사 최종 출력이 아직 없습니다. 도착하면 별도로 확인해야 하고, 그 전에는 통과로 쓰지 않았습니다.
  2. `impl-diff-final.patch`가 `a43bf47f…`와 다른 원본이므로 어느 쪽이 제출본인지 정리해야 합니다.
