# 최종 지적 처리

최종 reviewer는 anthropic Claude Opus 5.5이며 구현 전 reviewer와 별개로 열린 구현 후 맥락의 연속 검토다. 중간 검토와 최종 두 단계를 수행했으므로 최종 단계만 새 맥락인 것처럼 표시하지 않는다. tester는 별도의 새 openai Codex 맥락이며 원본 전체 로그 대조와 runner 8건 실제 실행을 수행했다. 원문 네 개와 출처/SHA/민감 점검은 `final-review-provenance.json`에 연결한다.

- SF-1 반영: `verify-candidate-source-delta.mjs`와 `candidate-source-delta.json`이 실패8의 원래 `runner-source-used.ts`, `runner-tests-used.ts`를 당시 환경 SHA에 묶고, 현재 두 파일을 새 기본4 환경 SHA에 묶는다. 각각 4008byte/원점 offset174, 13465byte/offset694의 ASCII 8→4 한 자리뿐이다. 다른94개 시험 SHA·helper·측정5도구 동일, launch의 새 test SHA 연결도 단언한다. 전체 재측정은 필요하지 않으며 수행하지 않았다. main이 독립 바이트 대조로 같은 차이를 확인했다.
- nit1 반영: 기본4 및 profile `source-boundary.json`의 '수집 후 추가'라는 고정 한계 문구는 앞선 실패8 당시의 역사 설명이다. 원본 JSON을 수정하지 않았다. 새4는 시작 상태부터 검증기가 존재하며 시작/종료 대조가 통과했다. TASK-CLOSE에 정정과 시작/종료 스냅샷 한계를 명시했다.
- nit2 반영: `assess-selected.ts`는 이번 승인된 8 제외/4 채택 결정 전용 검증기다. 후보값을 일반화하는 제품 기능이 아니며 4·8을 단언하는 것은 이 증거 사슬의 범위를 고정한다. 재사용 일반화를 하지 않은 이유를 TASK-CLOSE에 남겼다.

S-7은 TASK-CLOSE의 T-3 대조, 도입 이유 확인 범위·정의서·브레인·후속 P-6 최종3회 계획에 연결했다. 현행 기본값4와 TASK 재료의 당시 기본8을 시점으로 구별한다. 초기 보조 소스 대조기의 LF/CRLF 오류와 최초 종료1, 수정 비교 방식 및 한계를 보존한다. 8 실패 원인을 고쳤다거나 장래 재발하지 않는다는 판정을 하지 않는다.

main은 이 기록을 연결하면 T03 check/done/커밋 후 T04 진행하도록 전달했다. reviewer 원문은 코드 pass B0/SF0이며 증거 연결 SF1은 위 산출물로 처리했다. PM은 tester의 S-7 마감 보류 조건까지 기록으로 충족했는지 대조한 후 check를 실행한다.
