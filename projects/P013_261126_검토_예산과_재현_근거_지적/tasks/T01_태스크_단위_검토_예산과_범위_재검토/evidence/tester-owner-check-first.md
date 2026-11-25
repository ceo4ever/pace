판정 **fail**. 옛 증거 원장의 `goal` 판정과 `kind`가 없는 고아 기록은 구현 후 예산에 귀속됩니다. 다만 옛 증거 원장에 `kind: "task"`로 남은 행은 여전히 사전 예산을 차감합니다.

- **[blocking] `src/agent/review-budget.ts`의 `recordedStage`가 원장 위치보다 `kind: "task"`를 우선합니다.** 옛 CLI는 `evidence/TASK.md`에 `--kind task`를 허용했고, 고아 복구에도 당시 호출의 `kind`를 사용했습니다. 따라서 증거 원장에 이미 `task`로 기록된 유효 판정 두 건이 있으면, 루트 `TASK.md`의 첫 사전 검토가 종료 16으로 차단됩니다. 사전 단계는 루트 원장의 루트 `TASK.md`에만 부여해야 합니다.

추가된 테스트는 `goal` 판정 두 건과 `kind` 없는 중단 기록의 분리를 확인합니다. 위의 옛 `task` 행은 테스트에 포함되어 있지 않습니다. 제공된 diff만 정적으로 검토했습니다.