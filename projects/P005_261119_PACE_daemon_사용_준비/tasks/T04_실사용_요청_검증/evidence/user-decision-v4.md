# T04 사전 검토 v4 사용자 결정 (2026-11-23)

- 상황: v3 11회 fail → [진단](diagnosis-v3.md)(설계 층: 실패 분기 열거 → "멈추고 보고" 규칙) → v4 전체 검토 R1 fail(blocking 2: 실행 중 쓰기의 일반 stop 유예, S-6 Telegram 단절 미검출 / should_fix 2: T-4 재실행 근거 S-12 연결, 증거 비밀 검증).
- 제시한 선택지: ① 고치고 범위 재검토 1회(추천 — pass면 S-0, 그래도 fail이면 남은 지적만 고쳐 waiver로 진행) ② 고치고 바로 진행(waiver) ③ 실사용 범위 축소(범위 변경).
- 캡틴 답(원문): "고치고 범위 재검토 1회 (추천)"

## 적용 (2026-11-23)

- R2(범위 재검토) fail: blocking 1(승인된 쓰기가 preparing일 때 일반 정지 유예), should_fix 1(로컬 비밀 대조 목록). 직전 blocking 1건(S-6 Telegram 단절)은 해소 확인.
- 위 결정의 "그래도 fail이면 남은 지적만 고쳐 waiver로 진행"에 따라 2건을 반영하고 waiver로 S-0에 들어간다(PM 판단으로 반영 범위 확정).
