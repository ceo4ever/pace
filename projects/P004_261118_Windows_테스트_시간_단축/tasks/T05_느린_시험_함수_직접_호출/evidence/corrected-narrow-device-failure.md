# 수정 진단기의 최초 장치 검증 실패

승인된 좁은1회는 `dashboard-trace-2026-11-18T20-28-45-689Z`다. 실제 전체 실행 사본 SHA/argv에서 대상8개에만 file URL --import가 붙었고 각 자식의 LOCK_TRACE_READY가 PID·URL·실제preload SHA와 일치했다. 앞선6자식 블록은 더 이상 수정되지 않았다.

그러나8개 모두 `TypeError: realpathSync.native is not a function`으로 실패했다. preload가 fs.realpathSync를 일반 wrapper로 교체한 뒤 syncBuiltinESMExports를 호출하면서 원래 함수 객체의 native 속성을 보존하지 않았다. 실제 source/src/core/paths.ts:38이 그 속성을 사용해 dashboard.ts:9 진입 직후 실패했고 lock/data 단계 이벤트는0건이다. 이는 원래 stale-lock 실패 재현이 아니라 진단기 API 훼손 오류다.

실제 로드 marker 경로는 관측됐으나 장치의 동작 타당성은 입증되지 않았다. 조건부 승인된 Git 문맥 전체 진단은 시작하지 않았다. 실제 제품/시험은 변경하지 않았고 추가 좁은 반복도 하지 않았다. 원문/실행preload/manifest를 보존한다.

수정안은 lock/data 단계에 필요 없는 realpathSync 관측을 목록에서 제거해 원래 realpathSync/native 객체를 그대로 둔다. 이 수정안은 아직 실행하지 않았다. 후속 좁은1회 승인은 main에 요청하며 기존guard를 임의로 없애거나 같은 증거를 덮어쓰지 않는다.
