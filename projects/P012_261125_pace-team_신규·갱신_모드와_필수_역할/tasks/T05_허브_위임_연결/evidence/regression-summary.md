# T05 기존 행동 회귀 판정

P011 after-05 원응답과 동일한 고정 입력 32개를 현재 규칙으로 실행했다. 일차 독립 판정은 26개 통과와 아래 6개 차이다. T05 변경 전 대조는 T04 완료 커밋 58dc000이다. 변경 전후에서 같은 실행 도구·모델·입력으로 재실행했다. 다른 채점자가 네 원응답의 순서를 숨긴 상태로 동일한 규칙을 적용했다.

| 사례 | 최초 채점 | P011 원응답 재채점 | T05 최초 원응답 재채점 | 변경 전 새 실행 | 변경 후 새 실행 | 블라인드 판정 원문·응답 대응 |
|---|---|---|---|---|---|---|
| D02 | 실패 | 실패 | 실패 | 통과 | 실패 | [원판정](recheck-samples/grade-D02-D09.md), [공개한 대응](recheck-samples/D02-D09-labels.json) |
| D09 | 실패 | 통과 | 통과 | 통과 | 통과 | [원판정](recheck-samples/grade-D02-D09.md), [공개한 대응](recheck-samples/D02-D09-labels.json) |
| S3 | 실패 | 통과 | 통과 | 통과 | 통과 | [원판정](recheck-samples/grade-S3-S7-B.md), [공개한 대응](recheck-samples/S3-S7-B-labels.json) |
| S7-B | 실패 | 통과 | 실패 | 실패 | 통과 | [원판정](recheck-samples/grade-S3-S7-B.md), [공개한 대응](recheck-samples/S3-S7-B-labels.json) |
| S7-C | 실패 | 통과 | 통과 | 통과 | 통과 | [원판정](recheck-samples/grade-S7-C-S7-H.md), [공개한 대응](recheck-samples/S7-C-S7-H-labels.json) |
| S7-H | 실패 | 통과 | 통과 | 통과 | 통과 | [원판정](recheck-samples/grade-S7-C-S7-H.md), [공개한 대응](recheck-samples/S7-C-S7-H-labels.json) |

D02를 같은 요청과 정본으로 한 번 더 실행했다. 변경 전 새 응답 실패, 변경 후 새 응답 통과다. [원판정](recheck-samples/grade-D02.md) · [공개한 대응](recheck-samples/D02-labels.json)

26개는 첫 채점에서 판정이 같았다. 나머지 6개는 블라인드 대조와 반복에서 현재 규칙이 요구 행동을 수행한 원응답을 확보했다. 최초 26개 판정을 32개 통과로 수정하지 않았다. 관측된 불일치는 표와 원응답을 함께 보존했다. 동일한 응답에서도 채점 취급이 달랐고, 변경 이전 새 응답에서도 누락이 나왔다. 단일 응답 성공을 항상 재현된다고 해석하지 않는다.

기존 S/D 시나리오와 decision-rights.md, reviewer.md의 바이트를 이전 커밋과 대조했다. D02의 수신 기록·적용·재검증·재개와 S7의 재검토 절차는 본 태스크에서 바뀐 절에 속하지 않는다. [범위 검사](scope-check.json)

## 불안정한 두 사례의 추가 대조

| 사례 | 변경 전 새 응답 시도별 판정 | 변경 후 새 응답 시도별 판정 |
|---|---|---|
| D02 | pass / fail / fail | fail / pass / pass |
| S7-B | fail / pass | pass / pass |

[추가 블라인드 판정](recheck-samples/grade-D02-S7-B.md) · [응답 대응](recheck-samples/D02-S7-B-labels.json)

D02·S7-B의 관측된 12개 도구 기록 가운데 12개에서 변경 대상 문서의 명시적 읽기나 검색 경로가 없었다. 관련 정본은 전후 파일 지문이 같다. 파일 경로가 없는 전체 검색의 검색 결과는 집계 범위 밖이다. [정본 지문·도구 기록](regression-policy-and-trace.json)
