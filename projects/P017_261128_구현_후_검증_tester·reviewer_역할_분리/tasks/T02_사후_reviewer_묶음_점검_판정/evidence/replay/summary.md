# T02 S-7 재생 요약 (2026-11-28, 구현 PM 정리 — 관측값 확인은 tester 몫)

입력 7개의 sha256 앞 16자리는 BR02 표와 모두 같다(각 `*.input.sha256`). 회차마다 새 임시 저장소·`PACE_HOME`, 같은 목적(`purpose.md`), `./bin/pace.ts agent verify --author-agent claude`(Codex).

## 1차 (attempt1, 1회차만)

다섯 입력(T01·T04·T05·T06·A)이 unknown이었다. 원문 JSON은 형식에 맞았으나 `category`에 점검 항목 ID(`RA-3` 등)를 적어 질문 연결을 판독할 수 없었다. 프롬프트의 "category는 위 하위 확인 ID 하나"가 항목 ID로 읽힌 문구 문제로 보고, 묶음 프롬프트에만 "category는 boundary, state, flow 중 하나 … 점검 항목 ID는 criterion에 쓴다"를 넣었다(재시도 1/2, 사전·백로그 프롬프트 바이트 불변 — S-6 통과).

## 2차 (attempt2, 2회차 모두)

| 입력 | 1회차 | 2회차 | 유효 blocking(범주/항목) |
|---|---|---|---|
| T01 | fail | fail | 경계 RA-1·RA-3 (+2회차 흐름 RC-4) |
| T04 | fail | fail | 경계 RA-3·RA-2, 상태 RB-2(1회차) |
| T05 | pass | pass | 흐름 RC-3 blocking이 근거 부족으로 should_fix(missing_evidence) |
| T06 | fail | fail | 상태 RB-2 소급 생성(두 회차), 경계 1건(1회차) / 2회차 기존 동작 403 지적은 other·note |
| P014 T04 | fail | fail | 흐름 RC-3/RC-4, 경계 RA-3(2회차) |
| 경계(A) 합성 | fail | fail | 경계 RA-2 권한 검사 빠진 원문 열람(`user_admin.py:188`/`:186`), 1회차는 경계 RA-3(`system-user.ts:503`)도 |
| 무해 diff | fail | fail | 흐름 RC-4 — IA 문서가 합의에 없는 PV-04 적용 전 확인 단계를 더한다(impact goal) |

## 관측값 기록 (owner A-1 2026-11-28 "기록해서 보고로" — 통과선 없음)

- unknown: 0/12.
- 경계(A): 합성 입력 2/2 경계 항목 유효 blocking(RA-2)·fail.
- 상태(B): T06 2/2 소급 변경 = 상태 항목 유효 blocking(RB-2)·fail.
- 흐름(C): **미검증**. T06 교착은 0/2, 무해 diff는 2/2 흐름 blocking이다(아래 원인).
- 도구 판정: 12회 중 pass 2회(T05 두 회차), 나머지 fail.

## 원인 (문제해결자 원자료 대조)

- 무해 diff의 흐름 blocking은 **거짓 양성**이다. 지적한 PV-04 적용 전 확인 단계는 기준 IA(`docs/ia/ia.md:78`)와 와이어프레임에 이미 있고 이 diff는 이름만 바꾼다. 패치만 받은 reviewer는 기존 문서를 볼 수 없다.
- T06 교착은 패치 밖 기존 `FOR UPDATE`(`user_admin.py` 166-179행)와의 잠금 순서에 의존한다. 패치만 주는 입력으로는 판정할 수 없다.
- 그래서 BR02 재생 입력에 해당 시점 base 트리를 더하고, BL261128_01 최종 설치 후보에서 한 번 돌려 owner에게 보고한다. 남은 문구 재시도 1회는 쓰지 않았다.
