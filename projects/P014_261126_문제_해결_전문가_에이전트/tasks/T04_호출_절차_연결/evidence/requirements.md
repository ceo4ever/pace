# BR04 문제 해결자 요건 대조

등록 정본의 TS-16~22는 BR04 소관의 고정 요건이며 버전은 모두 1이다. 기존 TS-01~15 및 기획자의 BP-01~12와 함께 프로젝트 마감에서 최종 대조한다. [합의 범위](../../../../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BR04_호출_절차_연결.md) [정본 등록](../../../../../skills/pace-team/references/required-roles.md#문제-해결자-요건)

| 요건 ID | BR04 등록 항목 | 등록 | 적용 위치 | 대조 근거 |
|---|---|---|---|---|
| TS-16 v1 | 조기 문턱과 호출 주체 | 등록 | 정본 reviewer의 호출 표와 T05 워크트리 시작 지시 | W01~W04, S7-A, [조기 호출](actual-early.json) |
| TS-17 v1 | 소진 인계, 공동 시도, 중복과 조기 기록 | 등록 | 정본 reviewer의 호출 표 및 호출과 증거 연결 | W05, S8, [세 기회와 원장](joint-route-w05.json), [조기 기록](actual-early.json) |
| TS-18 v1 | B 재현·원인 판별과 백로그 적용 | 등록 | 정본 coordinator의 문제 해결자 호출 및 결정과 근거 | W06~W07, H01~H06 |
| TS-19 v1 | 정상·외부 상위 인계와 근본 입력·원장 | 등록 | 정본 reviewer의 호출 표, coordinator의 상위 검토·call_ref | W08~W09, [실제 상위 입력](actual-upper-input.md), [근본 검토 근거](root-evidence-fields.json), 선행 외부 검토 시험 |
| TS-20 v1 | 상위 해결안의 A 분기와 두 번째 실패 종료 | 등록 | 정본 coordinator의 영향표와 agreement_required 보고 | W09~W12, [P013 T09 관문 시험](../../../../P013_261126_검토_예산과_재현_근거_지적/tasks/T09_수정_확인과_상위_근본_검토/TASK-CLOSE.md) |
| TS-21 v1 | reviewer·tester 선택 재발 표지 | 등록 | 정본 reviewer의 반환과 기존 자동 재검토, T05 선택 필드 판독 | W03, [T05 호환 시험](../../T05_workerSpec_호출_지시와_golden_시험/TASK-CLOSE.md) |
| TS-22 v1 | 실제 정상 진입점 호출 및 같은 ID | 등록 | 초기에 워크트리 PM, 상위에 허브 PM이 동일 활동의 원장과 반환 연결 | [발동 출력](live-trigger-evidence.json), [조기 행](actual-early.json), [상위 행](actual-upper.json), [허브 실행](upper-coordinator-receipt.md) |
