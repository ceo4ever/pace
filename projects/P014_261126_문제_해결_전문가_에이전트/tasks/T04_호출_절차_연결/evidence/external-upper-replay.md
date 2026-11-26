# 외부 판정 제출의 상위 검토 발동

별도 임시 Git/PACE_HOME에 같은 합성 T-1·T-2 계약과 패치 두 개를 준비했다. 첫 패치에서 source CLI의 `review-hand`로 외부 입력을 고정하고 구조화 fail 원문을 `review-record`로 제출했다. 이후 `review-note --diagnosis --layer structure`를 썼다. 둘째 패치를 고정해 동일한 실패를 새 외부 예약에 다시 제출했다. 둘째 `review-record`가 종료 0, `source: external`, `followup.action: upper_review`와 슬롯 1을 반환했다. `after_diagnosis.id`와 발동 trigger는 일치한다. 바로 다음 `review-hand`는 실행 전 종료 16이고 원장의 SHA-256이 유지됐다.

외부 검토 원문은 고정 fixture이며 별도 제공자 실행을 주장하지 않는다. PM이 같은 분기를 인계하는지는 W08에서 평가했다. 공급자 실제 호출은 정상 verify에서 발동한 두 경로의 별도 증거다. [CLI 출력을 대조한 결과](external-upper-replay.json) [고정 합성 실패와 패치](actual-upper-input.md)
