# tester 차수별 판정 (호스트 새 맥락 서브에이전트 · anthropic · 같은 세션 연속)

PM이 반환 원문의 판정·지적을 옮긴 기록. 1단계는 [tester-stage1.md](tester-stage1.md).

- 2단계(1차): fail — T-1 fail(S-1이 조건 문구 미단언: 환경 행 한도화·1/4 항상·`전체`·링크 갱신 삭제·남김 줄 삭제 변이가 통과), T-2 fail(S-2 모순 문장 삽입 통과, S-8 사례 B 이름 없음), T-3 pass, T-4 pass(변이 2종 실패 확인, docs 심볼릭 링크 should_fix), T-5 fail(3000자·16384 표기 변형 미검출, S-6 미확인), T-6 fail(남김 줄 미단언). signal: 동시 실행 부하에서 `changed check timeout and parent OS termination …` 실패 1건 — 단독 재실행 필요.
- 2차: fail — T-1·T-3·T-4·T-5·T-6 pass, T-2 새 결함(§5-2 "완료로 적지 않음" 미단언). 모순 문장 일반은 문구 검사 한계 — S-5·S-8로 맡기는 처리 충분(단 reviewer blocking 0 필요). `16 KiB`·`3천 자` 표기는 낮은 가능성으로 검출력 부족 아님.
- 3차: 기준 T-1~T-6 모두 pass, 새 결함 없음. 남은 것 S-6 미확인(PM 단독 실행 결과로 마감에서 확인). 변이 3종(완료로 적고·§5 문구 삭제·issue→메모) 실패 확인.
