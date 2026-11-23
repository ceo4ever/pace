# BR09 반복 실패 진단 (2026-11-24, PM 판단 — 캡틴 위임)

- 원장: R1 fail(blocking 4) → R2 fail(2, 자동 재검토) → R3 fail(1, 자동 재검토) → diagnose.
- 반복 영역: 세 번 모두 "캡틴 원문 → 해석 → 확인 → 위임" 연결. R1 해석 분리만으로 오해 방지 불가 → R2 confirm이 승인/정정/거절을 구분 안 함·위임이 근거를 가리키지 않음 → R3 요청이 원문·제안 해석을 고정하지 않음·basis 필수 아님·답에 다른 해석을 끼워 승인 재사용 가능.
- 원인 층: **design** — 사슬을 산문 규칙으로만 적고 종류별 필수 칸(검사가 실제로 강제하는 것)에 넣지 않았다. 산문을 덧붙일 때마다 칸에 없는 빈틈이 새로 드러났다.
- 조치(그 층에서): 사슬을 스키마로 강제 — `decision_request.of`(원문 ID)·`proposal`(확인받을 해석 그대로), `captain_input.confirm`(요청 ID + approved|corrected|rejected), `delegate.basis` 필수(근거 ID 또는 none). 승인되는 해석은 요청의 proposal 그 자체이고, 답의 interpretation이 proposal과 다르면 거부. 거부 사례를 완료 기준 시험에 열거("Play 4번" 사례 포함). 도달 집계는 요청 단위 + `delivery` 기록으로 강제(R3 should_fix).
- 보고: 캡틴 사후 보고(캡틴 기준 2026-11-23 — 근본 조치 뒤 재검증, 사후 보고).
