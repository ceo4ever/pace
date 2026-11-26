# 과거 반복 실패 두 사례의 능력 평가

Claude와 Codex에서 새 읽기 전용 세션 8개를 실행했다. 각 제공자의 xhigh는 두 사례 모두 고정한 여섯 항목을 충족했고, 같은 제공자의 high도 2/2였다. 독립 Anthropic 판정자에게 등급과 제공자를 가린 응답을 사례별로 따로 제공했다. 잠정 비교에서 effort를 더 올릴 근거가 없어서 owner 기본값을 유지한다. 두 사례의 결과는 품질 우월성이나 일반적인 비용 차이를 판정하기에 표본이 작다.

## 결과와 측정

| 사례 | 제공자·등급 | 실행 시간 | 관측 토큰 | 독립 판정 | 원응답 |
|---|---|---:|---:|---|---|
| A | claude · high | 74,024 ms | 입력 8 / 출력 7,386 | 6/6 | [응답](eval-answers/A-claude-high.md) |
| A | claude · xhigh | 141,188 ms | 입력 6 / 출력 13,377 | 6/6 | [응답](eval-answers/A-claude-xhigh.md) |
| A | codex · high | 77,357 ms | 총 32,393 | 6/6 | [응답](eval-answers/A-codex-high.md) |
| A | codex · xhigh | 68,444 ms | 총 16,453 | 6/6 | [응답](eval-answers/A-codex-xhigh.md) |
| B | claude · high | 94,231 ms | 입력 6 / 출력 9,617 | 6/6 | [응답](eval-answers/B-claude-high.md) |
| B | claude · xhigh | 165,326 ms | 입력 6 / 출력 16,137 | 6/6 | [응답](eval-answers/B-claude-xhigh.md) |
| B | codex · high | 78,312 ms | 총 38,917 | 6/6 | [응답](eval-answers/B-codex-high.md) |
| B | codex · xhigh | 65,169 ms | 총 12,260 | 6/6 | [응답](eval-answers/B-codex-xhigh.md) |

Claude `result.usage`의 입력·출력과 캐시 읽기·생성 값은 분리했다. Codex `tokens used`는 호스트 총량이다. 토큰 열은 같은 제공자 안에서만 직접 비교한다. 이 표본에서 Claude xhigh의 소요 시간과 출력은 high보다 컸고, Codex xhigh의 소요 시간과 총 토큰은 두 사례 모두 high보다 작았다. [측정 원본 필드](eval-measurements.json)

## 재현과 독립 판정

- 실패 당시 원문은 [사례 A](case-A.md)와 [사례 B](case-B.md)에 있다. [출처와 입력 지문](eval-inputs.json)은 R9/R10 및 R1/R2의 실제 fail, 최초 고정본의 SHA와 사후 정보 없는 후보 입력을 연결한다. [고정 평가 기준](eval-rubric.md)의 SHA도 평가 전에 기록했다.
- 각 실행은 빈 커밋 하나만 있는 새 Git 저장소의 동일한 정본 역할과 `case.md`를 사용했다. 보조 파일은 합성 PROJECT·TASK와 Claude 종료 관측 설정이다. 사후 자료의 표지 검색 0건, Git 기준 커밋의 트리 비어 있음, 관측한 도구 접근이 각 사본 안으로 한정됨을 확인했다. 호스트 읽기 정책 자체가 외부 파일에 대한 OS 수준 접근 금지를 입증하는 것은 아니다. [파일 목록과 도구 관측](eval-input-isolation.json)
- 원응답 본문의 임시 경로만 상대 경로로 바꿨다. 판정 입력에 그 경로와 호출 메타데이터를 넣지 않았다. 새 독립 판정의 근거 여섯 개와 채점 뒤 공개한 매핑을 남겼다. [사례 A 판정](eval-grade-A.json) [사례 B 판정](eval-grade-B.json)
- 사례 A에서 네 응답 모두 성공한 쓰기 결과와 지정 actor의 같은 시도 callback 증거를 분리하고 재발을 가를 대조를 제안했다. 사례 B에서는 네 응답이 모두 계약 회차 경계와 이전 unknown의 재사용을 연결했고, 변경 직후 전체 검토 및 정상 증거 이어가기 양쪽을 시험했다. 실제 운영이나 이전 프로젝트를 다시 실행하지 않았다.

별도 검출력 확인에서 당시 성공 화면을 근거 없이 지정 행위자의 승인으로 단정한 합성 답과 실제 답을 이름을 가려 비교했다. 판정자는 실제 답과 결함이 있는 답을 구별했다. 이 확인은 능력 표본 8건의 성적에 더하지 않았다. 표본 크기와 같은 제공자 계열 판정의 한계는 남는다. [음성 대조](eval-negative.json)
