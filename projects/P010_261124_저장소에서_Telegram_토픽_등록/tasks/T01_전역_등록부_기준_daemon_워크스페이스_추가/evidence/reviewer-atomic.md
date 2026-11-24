## 1단계 독립 목표 대조 결과

### 첫 판단
- **독립 목표 대조:** 이 시험의 목표는 "유효한 승인 요청이 읽기 단계를 끝낸 뒤 원자적 교체에서만 실패했을 때, 성공을 오보고하지 않고 설정·메모리·Telegram 상태가 그대로이며 같은 요청 재실행으로 복구되는가"를 확인하는 것입니다. 이는 상위 목적과 맞습니다.
- **목표 달성:** **달성**. 다만 Telegram 상태 부분은 형식만 갖췄습니다. 아래 should_fix 1번을 보세요.
- **올릴 단계:** 지금은 올릴 단계가 없습니다. 2단계 작업 문서 대조로 넘겨도 됩니다.

### 근거
- **실제 경로를 통과합니다.**
  - `src/daemon/gateway.ts:233`에서 `workspace_add`를 처리합니다.
  - `src/daemon/index.ts:79`의 `workspaceAdd`가 이어서 호출됩니다.
  - 그다음 `registerWorkspace`가 `persistRegisteredWorkspace`(`src/daemon/workspace.ts:132`)를 부릅니다.
  - 이 함수는 `registeredWorkspaceRoot`, `readRawConfigFile`, `parseConfig`, `matchingEntry` 순서로 읽기와 검증 단계를 거칩니다.
  - 끝으로 `updateConfigFile`이 `writeFileAtomic`을 호출합니다(`src/core/fsutil.ts:6`).
  - 실제 loopback Gateway와 토큰 인증 소켓을 쓰므로 Gateway 요청 쪽은 우회가 없습니다.
- **실패 지점이 정확합니다.**
  - 주입은 `destination === configFile(home)`일 때의 `renameSync`에만 걸립니다.
  - 임시 파일은 이미 완전히 쓰인 뒤입니다. 훅이 그 임시 파일을 읽어 `three` 항목과 `registryId`를 확인합니다(`attemptedIds`).
  - 따라서 "읽기 단계 완료 → 유효한 임시 설정 → 교체 실패"가 성립합니다.
  - `deepEqual(attemptedIds, [id, id])`로 주입이 실제로 두 번 발동했는지도 검증하므로, 주입이 헛돌면 시험이 실패합니다.
- **두 요청에 EIO가 들어갑니다.**
  - Gateway 직접 요청과 CLI(in-process, Gateway 경유) 요청 둘 다 해당합니다.
  - 오보고 검출은 `ack.result.ok === false`, `failedCli.code === 2`, 출력에 `/반영 완료|결속 완료/` 없음으로 합니다.
  - 응답에 `three` 경로가 새지 않는지도 봅니다.
- **상태 불변을 확인합니다.**
  - `config.json` 바이트가 같습니다.
  - 메모리에서는 `/use three`가 거부되고 대화의 워크스페이스가 `two`로 유지됩니다.
  - `telegram state` 바이트도 같습니다.
- **재실행으로 복구됩니다.**
  - 같은 `pending` 객체를 다시 보내면 `{ok:true, bound:false}`가 나오고 설정에 `registryId`가 기록됩니다.
  - CLI 재실행도 성공합니다.
- **격리와 복구는 대체로 안전합니다.**
  - `tempDir` home을 쓰고, 포트 소유 인스턴스를 띄운 뒤 `requestStop`으로 정리합니다.
  - 주입은 `try/finally`에서 `fs.renameSync`를 되돌리고 `syncBuiltinESMExports()`를 다시 부릅니다. 단언이 실패해도 복구됩니다.
  - `fsutil.ts`가 named import(`renameSync`)를 쓰지만, ESM 라이브 바인딩이 `syncBuiltinESMExports`로 갱신되므로 주입은 유효합니다. 주입이 실제로 발동하는지는 `attemptedIds` 단언이 보증합니다.
  - 주입이 config 경로에만 걸려서 status 파일이나 다른 쓰기에는 영향이 없습니다.

### 지적

1. **should_fix — Telegram 상태 불변 검증이 사실상 공허합니다.**
   - 이 시험에는 Telegram 어댑터와 secret이 없습니다.
   - `topicBefore`는 `"11":"existing"` 하나이고, 새 워크스페이스 `three`와 관계가 없습니다.
   - `bound:false`는 `telegram`이 없어서 나오는 값입니다.
   - 설정 저장 전에 토픽 결속이나 승격을 먼저 기록하는 회귀(`promoteLegacy`가 `updateConfigFile`보다 앞서 실행되는 구조)가 생겨도, 이 시험은 그것을 잡지 못합니다.
   - 레거시 항목 승격이 걸린 경우(`persistRegisteredWorkspace`의 `promoteLegacy`)와 Telegram 어댑터가 있는 경우로 같은 주입을 한 번 더 돌려야 목표 문장이 실제로 증명됩니다.
2. **should_fix — 임시 파일 정리를 검증하지 않습니다.**
   - 교체 실패 뒤 `daemon/` 디렉터리에 `.xxxx.tmp`가 남지 않는지 확인하는 단언이 없습니다.
   - `writeFileAtomic`의 finally 정리가 이 시험이 노리는 복구 계약의 일부입니다.
3. **should_fix — 거부 응답을 구체적으로 보지 않습니다.**
   - Gateway 응답은 `ok === false`와 경로 비노출만 봅니다. 사유 문구, 그리고 EIO 원문 메시지나 `code`가 새지 않는지는 보지 않습니다.
   - `/use three`의 `unavailable` 응답 본문도 읽기만 하고 단언하지 않습니다. 결과는 대화 상태로만 확인합니다.
4. **note — 시험이 하나에 많이 묶여 있습니다.**
   - 인증 거부, 병렬 직렬화, stale 거부, EIO 주입, 재시도를 한 시험이 모두 다룹니다.
   - 앞 단계가 실패하면 EIO 시험이 가려집니다. 분리하면 진단이 쉬워집니다.
5. **note — 재실행 정의에 차이가 있습니다.**
   - Gateway 쪽 재실행은 동일 요청 객체입니다.
   - CLI 재실행은 새로 계획하고 승인하는 요청입니다. 두 경로 모두 성공하므로 목표에는 부합합니다.
6. **note — 레지스트리 상태 변동은 따로 검증하지 않습니다.**
   - `approveWorkspacePlan`이 이미 `registerWorkspace(…, false)`로 후보를 만든 뒤라서, 레지스트리가 실패 전후로 같은지는 확인하지 않습니다. 설정 쪽 단언으로 충분하다고 보면 접어도 됩니다.

### 다른 길
- 파일 시스템 모듈 전체를 교체하지 않고 `renameSync` 하나만 주입한 선택은 적절합니다. 좁게 주입해서 읽기 단계는 실제 코드가 수행하고, 실패만 정확히 만듭니다.
- 모듈 수준 의존 주입으로 하는 길도 있지만, 지금 소스를 고치지 않고 시험만으로 해결하는 쪽이 범위에 맞습니다.

### 빠진 것
- 위 should_fix 1~3번입니다.
- 교체는 실패하지만 이후 `fsync`나 `unlink` 같은 다른 오류가 나는 경로는 이 시험의 범위가 아닙니다.

### 읽은 범위와 노출
- **읽은 파일:**
  - 산출물 patch(프롬프트에 포함된 전문)
  - `src/daemon/workspace.ts`
  - `src/daemon/config.ts`(120~161행)
  - `src/daemon/gateway.ts`(215~264행)
  - `src/core/fsutil.ts`의 `writeFileAtomic`
  - `src/daemon/index.ts`(79~104행)
- **읽지 않은 것:** TASK, 테스트 표, 작성자의 마감·자체 판정, 지적 대응 문서.
- **노출된 맥락:**
  - 호스트가 자동으로 붙인 `CLAUDE.md`와 `AGENTS.md`
  - git 상태
  - 사용자 이메일(이 검토에는 사용하지 않았고 외부로 보내지도 않았습니다)
  - 부트 훅 메시지(자식 세션이라 부트는 생략됐습니다)
- **한계:**
  - 읽기 전용 도구만 썼고 시험을 실행하지 않았습니다. 정적 대조 결과입니다.
  - 읽기 전용이라는 사실이 작업 문서 접근 차단이나 완전한 격리를 뜻하지는 않습니다.
  - 2단계 작업 문서 검토는 호출자가 별도로 진행해야 합니다. 이 호출만으로는 두 단계가 실행됐다고 주장하지 않습니다.
  - 이 검토의 제공자와 독립성 수준은 단일 모델 호출이며 변경된 검토 주체는 없습니다.

pass
