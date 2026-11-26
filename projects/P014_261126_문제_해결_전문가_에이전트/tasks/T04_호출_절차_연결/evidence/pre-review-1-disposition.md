# T04 사전 검토 첫 결과와 보완

첫 Claude 교차 검토 fail, blocking 1과 should_fix 5를 기록했다. [판정](../review-records/R1.json)

- 호출 행 스키마 밖의 caller·opportunity·반환 원문을 기존 `id`·`ref`와 프로젝트 사건/근본 검토 근거로 연결한다. 같은 기회 0개 중복과 서로 다른 기회 3행을 이 형식으로 검증한다.
- 예산 밖 일반 PM, B의 허브 및 백로그의 허브→기획자 적용 주체를 나눴다. 실제값 미확인·불일치는 관문 실패로 고정했다.
- 종료점 필수 보고와 원문 blocking 합계, `--upper-check`의 추천·이유를 시험에 명시했다. 임시 `PACE_HOME`과 소스 CLI·격리 설정 경계를 추가하고 테스트 표를 일곱 칸으로 맞췄다.
