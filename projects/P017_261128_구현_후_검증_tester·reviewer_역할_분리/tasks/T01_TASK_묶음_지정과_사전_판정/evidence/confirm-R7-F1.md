# T01 R7 지적 한정 확인 근거

- 직전: owner 허용 전체 재검토 R7 fail — F1(TASK.md:50, T-6: (나) 판독 불가 응답과 입력 동일성 미단언), F2(TASK.md:51, T-7: 인덱스 후보 누락·`.pace/` 예외가 T03 `.pace/team` 변경을 가림).
- 허브 결정(main 판단, B, 2026-11-28 msg_92aea4c44bc8): 두 제안 반영 뒤 한정 확인. F1은 같은 절 반복이라 S-7 기대 결과에 "판독 가능한 findings 배열", "입력 차이는 선언 줄뿐" 두 구절만 넣는다.
- 수정: TASK.md:50 S-7 (나) 두 구절. TASK.md:51 S-8 비교 후보 = `main...HEAD` 커밋 변경 ∪ `--cached` 인덱스 변경, 예외 `.pace/` → `.pace/memory/**`. TASK.md:38 T-7 예외도 같은 `.pace/memory/**`로 맞춘다(S-8과 같은 기준).
- 원자료 근거: `evidence/behavior-summary.md` — (나) 2회 모두 findings 배열 판독 가능, 세 입력의 차이는 선언 줄과 (다) T-3·S-3뿐((가)·(나)는 선언 줄뿐).
