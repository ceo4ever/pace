# owner 결정 — T02 사전 검토 waiver (2026-11-28, A-3)

- 질문 요지(허브 → owner): R5(owner 회차 전체 재검토) blocking 5 중 F2는 review-hand 쪽 모드를 첫 검토·재검토로 줄이는 삭제, F5는 S-7 신호 행 삭제·T-7을 기존 회귀 시험과 tester 원자료 대조로, F1은 유효 not_applicable·비차단 defect 혼합 pass 사례 한 줄(기존 사례 교체 우선), F3은 첨부를 안전 파일 판독(링크 거부) 한 구절, F4는 반영하지 않고 TASK-CLOSE 한계. TASK 글자 수 7145 이하. 그 뒤 waiver(by user)를 고친 TASK 해시에 묶어 구현. 구현 후 tester·reviewer 검증은 그대로.
- owner 원문 선택: "고치고 예외로 구현 (Recommended)"

## R5 원문 (review-records/R5.json)

F1 [blocking detection TASK.md:53] 판정기가 이유가 있는 not_applicable 또는 같은 항목의 유효한 비차단 지적을 단 defect를 무조건 unknown으로 처리해도, 정상 입력을 none으로만 구성한 S-2와 blocking defect를 쓰는 S-3이 통과할 수 있다. 재현: 유효한 none·not_applicable·비차단 defect를 섞은 12항목 원문에서 pass를 단언한다. 짝이 다른 항목의 지적만 남긴 원문에서는 해당 defect가 미확인이어서 unknown인지 단언한다. / F2 [blocking scope TASK.md:55] S-4는 review-hand 고정본에서 진단 유무별 수정 확인 프롬프트를 관측하도록 적었으나 현행 review-hand는 수정 확인을 verify로 넘긴다. S-5의 owner 같은 해시 진행도 동일한 경계에 걸린다. 이대로는 관측할 고정본이 없거나 시험을 맞추기 위해 기존 배정 흐름을 바꾸게 된다. 재현: src/agent/review-hand.ts:175-178 및 :121-127과 test/agent-review-hand.test.ts:423-429를 대조한다. review-hand에서는 고정본 없이 verify로 안내하는지, verify에서는 진단 유무별 실제 프롬프트와 owner 같은 해시 진행을 각각 확인하도록 시험표를 정리한다. / F3 [blocking scope TASK.md:67] 새 TASK 첨부를 경로 검증 없는 파일 읽기로 구현하면 루트 TASK.md가 링크인 경우 검토 범위 밖 본문이 프롬프트에 들어갈 수 있다. 정상 TASK를 쓰는 S-4는 이 구현에서도 통과한다. 재현: null / F4 [blocking detection TASK.md:56] 헝크 머리만 검사하는 구현은 문서 앞에 비공백 설명이 붙은 패치를 받아들인다. 첫 줄만 맞고 헝크가 없는 입력과 헝크가 없는 일반 문서는 여전히 거부하므로 현재 S-5가 통과할 수 있다. 재현: 유효한 패치 앞에 비공백 설명을 붙인 입력과 공백 줄만 붙인 입력을 각각 verify·review-hand에 준다. 앞 입력은 실행기·호출 행·고정본·예산 변화 없이 거부하고, 뒤 입력은 진행하는지 대조한다. / F5 [blocking detection TASK.md:58] 같은 위치만 지정한 두 회차는 recurring_area를 확인할 수 있어도 superficial_fix에 필요한 같은 대상·같은 유효 등급·해당 파일의 패치 변경을 보장하지 못한다. 반대로 위치 반복만으로 superficial_fix까지 항상 내는 구현도 현재 기대값으로는 배제할 수 없다. 재현: src/agent/review-signals.ts:75-93에 맞춰 같은 패치 대상에서 지적 파일의 변경과 유효 등급 일치가 있는 두 회차에 두 신호를 각각 단언한다. 유효 등급이나 지적 파일의 패치 변경 조건만 제거한 대조에서는 recurring_area만 남는지 확인한다. 두 recurrence 값은 판정 원문에서 각각 보존되는지 확인한다.

## 반영 내역

- F1: 반영: S-2 정상 사례를 none·유효 not_applicable·비차단 defect 혼합으로 교체(기존 사례 교체).
- F2: 반영(삭제 방향): S-4의 review-hand 모드를 첫 검토·재검토로 줄이고, S-5 owner 회차 같은 H는 verify만.
- F3: 반영: 접근에 루트 TASK.md를 reviewInput(링크 거부 일반 파일)으로 읽어 붙인다는 한 구절.
- F4: 반영하지 않음: TASK-CLOSE 한계(앞에 비공백 설명이 붙은 패치는 시험하지 않음).
- F5: 반영(삭제 방향): S-7 신호 행 삭제, T-7은 기존 회귀 시험(test/review-signals.test.ts)과 tester 원자료 대조.

- 고친 TASK 7051자(직전 7145자).

## owner A-1 뒤 TASK 변경 (2026-11-28)

- 근거: owner 결정 A-1(2026-11-28, 허브가 질문, owner 원문 선택 "기록해서 보고로 (Recommended)") — 백로그 BL261127_01 결정 기록 `owner-decision-2026-11-28-replay-report.md`. 지시: "T-8 과 TASK S-7 도 같은 뜻으로 줄임".
- 바꾼 것(교체만): 증명 범위 판정 주체 줄의 "설치 전 관문은 tester가 … 판정"을 "재생은 … 관측값 기록"으로, T-8을 통과선 없는 재생 보고로, S-7 기대 결과를 관측값 기록 확인으로, 접근 절의 실패 시 재시도 문장 삭제.
- 게이트 예외 해시를 이 TASK(`444106e3a6b19125…`)로 옮긴다. 예외 사유(R5 owner A-3)와 구현 범위는 그대로다.
- owner 사후 인정(2026-11-28, 허브가 질문, owner 원문 선택 "인정 (Recommended)"): 게이트 예외 해시를 A-1 교체본 TASK로 옮긴 것을 인정. 앞으로 by user 기록의 해시·내용 변경은 바꾸기 전에 허브에 묻는다.
