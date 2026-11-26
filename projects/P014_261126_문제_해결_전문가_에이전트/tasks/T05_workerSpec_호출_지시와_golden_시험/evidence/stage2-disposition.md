# T05 2단계 검토 대응

초기 교차 reviewer는 선언 검사·보안 스캔 증거를 받기 전 T-4를 미확인으로 기록했다. 별도 tester는 4개 독립 집중 검사에서 T-1~T-3과 변경 경계를 확인했으나 역할 지정 golden과 선언 검사·보안은 범위 밖으로 남겼다. [첫 교차 판정](reviewer-stage2-initial.json) [첫 tester](tester-stage2-initial.json)

- 실제 `verify`의 증거 fixture는 v1 응답을 v2로 올리지만 그 경로가 새 시험에서 드러나지 않았다. 알려진 T-1·T-2를 가진 TASK와 `version:2`의 관측·영향·기준을 명시적으로 입력하는 것으로 바꿨다. `outside_question`, `minor_impact`, `missing_evidence`, 실제 blocking이 선택값 유무에 따라 바뀌지 않는지 검사한다. 구판 v1과 해석 불가 선택값은 별도 대조한다.
- 새 role 경로와 미지정 golden, 선언 검사와 스캔 결과를 최신 확인에 제공한다. 선택값을 요청하는 reviewer·tester의 운영 안내는 BR04 문서와 현장 eval에 인계한다.
