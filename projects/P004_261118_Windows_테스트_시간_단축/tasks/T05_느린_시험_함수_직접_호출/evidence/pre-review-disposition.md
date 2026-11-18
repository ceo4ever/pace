# 사전 검토 반영

사전 두 단계 원문은 pre-review-stage1.md와 pre-review-stage2.md이며, anthropic 별도 맥락 pass blocking0/should_fix4다. TASK 해시는 PRE-REVIEW에 실제 reviewHash로 연결했다. 이전 질문의 placeholder와 단순 문자열 해시는 정식 해시가 아니며 사용하지 않는다.

- SF-1: summary valid와 새3회 상태0·범위·995/986/0/9·취소0·동일 환경·freeze 검증을 모두 필수로 한다. 도구 summary의 원값 중앙값이 일차 근거이고 원문에서 재계산해 교차 확인한다. 반올림 없이 새 중앙값×2 <= T01 중앙값으로 판정한다. 임계값 근접은 통계 신뢰 한계로 공개하며 별도 탈락 조건을 추가하지 않는다.
- SF-2: 기존 measure의 비정상 회차 뒤 break를 사용한다. 진행 중인 회차는 강제로 끊지 않고 종료를 기다린다. 실패 세트를 보존하고 main에 물으며 자동 재선택·부분 합산을 하지 않는다.
- SF-3: verify-final.mjs가 총계995/986/실패취소0/skip9를 명시 단언한다. 실제 T04 최종 원문으로 view/comparator smoke를 실행하고 기존 비교 JSON과 deepEqual을 확인한다. view의 원래 log 절대 경로와 결과 항목을 유지하고 환경 byte를 복사한다. 원본 회차·결과/환경/시험/원문 SHA·명시 출력 경로를 manifest에 기록한다. 세 회는 하나의 측정 환경 기록을 공유한다.
- SF-4: runtime-t05 이름이 없음을 capture 전에 확인하고 기존 T04 자료는 변경하지 않는다. HEAD와 Git 상태·실행607개 SHA의 시작/종료 및 도구 SHA를 기록한다. 기준 HEAD는46fdf68이다. PROJECT 표의 T04 커밋 칸은 측정 시 비어 있으므로 그 칸을 근거로 삼지 않고 launch.json의 실제 HEAD를 사용한다. 마감 시 실제 커밋과 표를 맞춘다. snapshot은 연속 감시나 node_modules/호스트 동결이 아니다.

finish 전체 검사는 별도 게이트다. 네 번째 측정이나 실패 대체 표본으로 사용하지 않는다. 전환0이면 바꾼 시험의 고장 주입은 해당 없음으로 기록하고 대표 CLI 시험은 기존 본문 SHA 보존으로 확인한다. 이 보완은 승인된 기준/경로를 바꾸지 않는 실행 상세다.
