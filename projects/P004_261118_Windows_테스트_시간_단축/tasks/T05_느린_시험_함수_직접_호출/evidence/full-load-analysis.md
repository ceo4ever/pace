# 승인된 전체 부하 진단1회 결과

별도 소유 사본에서 실제 `npm run check`와 Windows 기본 동시성4를 실행했다. launch/result와 원문 full-load.log를 보존했고 추가 전체 진단은 실행하지 않았다. 이 실행은 계측 진단이며 최종 시간 세트에 포함하지 않는다.

결과는 종료1,736733.8537ms,995건 중984통과·실패2·취소0·기존skip9다. 도구 자체가 원문/결과 기록을 완료한 종료0은 검사 통과가 아니며 실제 검사 status는1이다.

대상 `simultaneous stale-lock recovery serializes writers without leaving generated files`는 통과했다. 관측한8개 자식은 모두code0/signal null/stderr 빈값이다. 원래 stale-lock 실패는 재현되지 않았고 원인은 여전히 미확정이다.

다른 실패는 다음과 같다.

- `test/backlog-dashboard.test.ts:262`의 `concurrent refreshes publish complete parseable snapshots and leave no temporary files`: 274행 기대값 `[0,0,0,0,0,0]` 대비 실제6개 모두1. 이 시험은 승인 계측 대상이 아니어서 원래 stdio ignore를 유지했고 자식 오류는 알 수 없다. 해당 소스나 단언을 바꾸지 않았다.
- `test/playbook-maker.test.ts:15`의 원래 중첩 시험 래퍼: nested status1, signal null, error none. 내부181건 중 `healer-e2e.test.mjs:206`의 S-11 브라우저 흐름이 `orca viewport 실패`로 실패했다(orca helper42행→tabOn149행→webScenario164행→시험220행). 원인은 미확정이다. 원래 T03의 healer popup 실패와 동일 원인이라고 주장하지 않는다.

사본과 당시 현재 실행 파일607개는 대시보드 대상1건의 stdio 수집/관측 코드 외 동일했다. 사본의 전후607개 SHA도 모두 같다. 실제 제품/시험은 추가 수정하지 않았다. preload는 대상8자식에게만 --import로 전달했다. 다른 runner/단언/skip은 보존했다.

원래 tracked 파일을 사본에 복사했고 node_modules는 개발 의존성 junction으로 사용했다. 사본에는 원래 .git 메타데이터가 없고 시험별 Git fixture는 각 시험이 만든다. 이는 원래 worktree와 같은 저장소 메타데이터 조건을 보장하지 않는다. 계측/출력 수집은 일정에 영향을 줄 수 있고 호스트 부하를 동결하지 않았다. 현재 증거로 별도 두 실패의 원인을 실제 제품 결함이라고 확정할 수 없다.

원래 비계측 실패2세트·좁은5회/20회 비재현 원문은 그대로 보존했다. 새 비계측3회·제품수정·T05마감·finish는 실행하지 않았다. 다음 진단 범위는 main 판단에 맡긴다.
