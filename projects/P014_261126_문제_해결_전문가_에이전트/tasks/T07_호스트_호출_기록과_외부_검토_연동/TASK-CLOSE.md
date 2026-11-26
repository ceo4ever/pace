# T07 호스트 호출 기록과 외부 검토 연동 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

Claude 팀 호출의 시작·종료·결과와 PM 수동 기록을 호출 시도당 한 행으로 연결했다. 독립 검토를 넘긴 뒤 실제 Claude 자식을 부르고 판정 참조를 같은 행에 추가했다. Codex 네이티브 시작 한 건은 자동 수집이 확인되지 않아 PM이 관측값만 기록했다. T03의 공통 장치와 함께 P-7을 충족하며 P014 실제 문제 해결자 원본에 대한 대조는 프로젝트 마감에 남겼다. [Claude 실측](evidence/claude-live.json) [Codex 실측](evidence/codex-live.json) [요건 대조](evidence/requirements.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1·S-2. 등록 역할의 요청·자식 실제 모델과 effort·Agent 결과의 시간과 토큰 출처를 관측했다. 격리 설치·재설치·제거에서 사용자 훅은 유지됐고 입력·잠금·쓰기 오류도 호스트 종료 0이었다. [독립 tester](evidence/tester-stage2.json) [Claude 실측](evidence/claude-live.json) |
| T-2 | 통과 | S-2·S-3·S-4. 역순·중복·PM 수동 보강과 범위 변경에서 최초 시각·귀속을 유지했다. 별개 자식과 다음 턴은 별개 시도였다. Codex 시작 1건에 수동 쓰기 2회가 같은 행으로 수렴했다. [독립 tester](evidence/tester-stage2.json) [Codex 실측](evidence/codex-live.json) |
| T-3 | 통과 | S-5. 실제 Claude 호출을 `review-hand`와 `review-record --call-id` 사이에 두었다. 같은 판정 재시도와 경쟁 검토를 검사했다. 검토 원장의 usage는 null, duration은 생략됐으며 현장 측정은 호출 행에 남았다. [Claude 실측](evidence/claude-live.json) [독립 tester](evidence/tester-stage2.json) |
| T-4 | 통과 | S-2·S-6. TS-06 v1을 역할 요건 정본에 등록하고 픽스처 역할의 다섯 항목과 판정 참조를 대조했다. [요건 대조](evidence/requirements.md) |

## 단위 테스트

- 최신 독립 집중 검사 56개 통과, 실패·건너뜀 0개. 추가 격리 CLI 재현 2건 통과. 설치 훅 수명주기와 식별자 보호, 자동·수동 양방향, 원장 잠금, 참조 부분 실패와 복구를 검사했다. [독립 tester](evidence/tester-stage2.json)
- 전체 선언 검사와 보안 스캔 결과는 [전체 검사 요약](evidence/full-check.txt)에 남겼다.

## E2E

- 실제 Claude 호출 1회에서 부모 medium과 별개인 자식 `claude-opus-5-5/low`, 14608ms, 마지막 모델 요청 입력 2·출력 954·호스트 총 토큰 9465를 확인했다. 별도 호출 0건인 판정 두 명령을 통과하고 같은 판정 재시도와 PM 쓰기 후에도 판정 1개·시도 1행이었다. 원문 호스트 식별자는 공개 근거에 남기지 않았다. [Claude 실측](evidence/claude-live.json)
- 실제 Codex 네이티브 시작 1건을 호스트 이벤트로 확인했다. 자동 0행에서 PM 수동 기록을 재적용해 한 행을 얻었다. 종료·요청 설정·실제 설정·시간·토큰의 미보고는 `unknown`·`null`로 기록했다. [Codex 실측](evidence/codex-live.json)

## 리뷰

- 사전 Claude 교차 검토 pass, blocking 0. [사전 기록](review-records/R1.json) [지적 처리](evidence/pre-review-1-disposition.md)
- 독립 reviewer Claude·tester Codex의 1단계에서 후속 훅의 경로 변경과 판정 참조 쓰기 실패의 경쟁 조건을 재현했다. 최초 범위의 보관과 판정의 선점으로 수정했다. [교차 reviewer](evidence/reviewer-stage1.json) [독립 tester](evidence/tester-stage1.json) [대응](evidence/independent-stage1-disposition.md)
- 수정 후보 `cd723bca0c3c44a82f2324d798e730eda3187284a6a6642f3a6e1b2cc20f4d0f`의 2단계 교차 reviewer pass, blocking 0이며 별도 tester도 pass다. reviewer의 `usage` 범위 설명을 운영 문서에 명시했다. [후보](evidence/implementation.patch) [교차 검토](evidence/review-records/R1.json) [독립 재검증](evidence/tester-stage2.json)

## 남긴 것

- Claude Agent 응답의 `usage`와 `totalTokens`는 자식의 마지막 모델 요청을 다룬다. 여러 요청에 걸친 전체 토큰은 미확인이다. 백그라운드 등으로 결과를 받지 못하면 완료 상태와 수치는 수신한 범위까지만 기록한다. [호스트 훅 명세](https://code.claude.com/docs/en/hooks)
- 턴 ID를 내보내지 않는 호스트는 같은 세션과 자식 ID 재사용을 구분할 수 없다. 한 이벤트에만 턴 ID가 빠지는 구판 혼용에서는 연결이 나뉠 수 있다. 로컬 귀속 기록을 쓰는 도중 강제 종료돼 파일을 해석할 수 없으면 추측하여 다른 곳에 기록하지 않는다. [교차 검토](evidence/review-records/R1.json)
- T06의 실제 역할 및 지정 모델·effort를 이용한 시도는 프로젝트 마감의 TS-06 최종 대조에 사용한다. [요건 대조](evidence/requirements.md)
