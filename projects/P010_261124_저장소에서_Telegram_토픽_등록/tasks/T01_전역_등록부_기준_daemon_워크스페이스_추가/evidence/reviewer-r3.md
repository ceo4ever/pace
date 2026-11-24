# P010 T01 구현 독립 재대조 — 1단계

## 첫 판단
- **독립 목표 대조:** 이 코드 diff는 상위 목적 세 가지를 코드로 구현한다. 설정은 인스턴스 포트 소유자만 쓰고, 승인한 등록 ID·경로·파일 신원만 받으며, 이동한 옛 경로는 차단한다.
- **목표 달성: 달성**(코드와 diff 안의 시험 기준). 아래 한계에 적은 항목은 미확인이다.

## 근거
1. **포트 소유자만 설정을 쓴다.**
   - `workspace add`는 `acquireInstance`로 포트를 직접 잡았을 때만 설정을 직접 쓴다.
   - 포트가 사용 중이면 인증된 Gateway의 `workspace_add`로만 요청한다. 실행 중인 소유자의 Gateway를 확인하지 못하면 거부한다.
   - `install` 마법사의 기기·Telegram·워크스페이스 쓰기와 `telegram reset-offset`도 `acquireInstance`로 감쌌다.
   - Telegram `/new`는 `daemon.tx`를 거치는 `registerLegacyWorkspace`로 바꿨다.
   - 시험이 포트 소유 중 직접 쓰기 거부, 병렬 add 직렬화, 저장 실패를 성공으로 보고하지 않는 것, Gateway 무토큰·Origin 거부를 확인한다.
2. **승인한 신원만 수락한다.**
   - `registeredWorkspaceRoot`는 활성 등록, 등록부 경로 일치, `AGENT.md`의 등록 ID, 전후 디렉터리 `dev`/`ino`를 모두 확인한다.
   - `approvedWorkspaceRoot`는 설정에 승인 때 고정한 `registryIdentity`까지 대조한다.
   - 요청마다 접수(`resolveTarget`), 실행 직전(`checkIdentity`), Telegram 파일 워커 조회·`/bind`가 이를 다시 확인한다.
   - 접수 뒤 신원이 바뀐 작업은 `target_changed`로 거부한다.
3. **이동한 옛 경로를 차단한다.**
   - 등록부 경로가 바뀌면 `candidate.path !== path`로 거부한다.
   - 같은 경로에 복제한 디렉터리는 inode가 달라 거부한다. 재기동 시험이 이 경우를 확인한다.
   - 이동 시험은 옛 디렉터리가 남은 상태에서 신규 접수, `/backlog`, 대기 중이던 작업을 모두 거부한다. 옛 경로의 파일은 읽히지 않았음을 `prompts`로 확인한다.
   - 같은 ID로 다시 `add`하면 기존 토픽이 새 경로로 이어지고 `createForumTopic`은 0회다.
   - 다른 ID 결속과 문자열 결속(옛 형식)은 차단한다.
4. **가져온 기존 시험은 약해지지 않았다.**
   - `telegram-flow` 시험은 host 스텁 시그니처만 바꿨다.
   - S-9g는 실패 주입 지점을 host에서 `daemon.addWorkspace`로 옮겼다. 같은 "반영하지 못했다" 단언이 남아 있고, 주입 대상은 실제 코어 경로로 더 깊어졌다.
   - 마법사 시험은 추가만 있다.

## 지적
- **should_fix** — `registryIdentity`는 선택값이다(`config.ts`의 `parseConfig`). 손으로 쓴 설정이 `registryId`만 있으면 같은 경로에 복제한 디렉터리를 `AGENT.md`가 같다는 이유로 받는다. CLI가 만든 설정에는 항상 identity가 있으므로 실제 위험은 낮다. 그래도 `registryId`가 있으면 identity를 필수로 하거나, 없을 때 기동 로그로 경고하고 이 경우를 시험하는 편이 안전하다.
- **should_fix** — `install`은 daemon 실행 중이면 이제 기기·Telegram·워크스페이스 쓰기를 거부한다. 그런데 `docs/DAEMON.md` 본문의 "이미 실행 중이고 설정이 바뀌었으면 `stop` 뒤 `start` 재시작을 안내" 문장이 그대로다. 새 거부 동작과 어긋난다.
- **should_fix** — 새 시험은 busy 상태에서 기기 이름 경로만 확인한다. Telegram 시크릿·워크스페이스 쓰기의 `withStoppedDaemon`(busy 거부, 확인 중 변경 감지)과 `reset-offset`의 busy 거부는 시험이 없다.
- **note** — `/new` 경로의 legacy 등록(등록 ID 없음)은 의도적으로 기존 방식으로 남겼다. 이 경로는 전역 등록부 승인을 거치지 않는다. 문서에 그렇게 적혀 있어 목표와 모순은 아니다.
- **note** — `workspaceProblem`이 요청마다 동기 파일 읽기를 한다. 개인 비서 규모에서는 허용 범위지만 부하가 커지면 캐시를 고려한다.
- **note** — 사용자 지정 워크트리(`worktrees`)는 main 외에 등록 신원을 따로 검증하지 않는다. 기존 `allowedRoots` 신원 검사에만 의존하며 이전 동작과 같다. 문서에는 "다시 지정"이라고 안내돼 있다.

## 다른 길과 빠진 것
- **다른 길:** 모든 쓰기를 항상 Gateway로 일원화하는 방법이 있다. 그러면 정지 중 설정 기록이 불가능해지므로, 정지 중에는 포트를 직접 잡고 실행 중에는 Gateway를 쓰는 현재 방식이 합리적이다.
- **빠진 것:** 위 should_fix 항목이다.
- **결정 추적:** 이름 재사용, `--yes`·`[y/N]` 승인, 토픽 결속 상태 표시, 이동 시 재승인은 모두 문서·CLI·시험까지 이어진다.

## 한계(미확인)
- diff에 나오지 않은 `updateConfigFile`·`writeTelegramSecret` 호출자는 확인하지 못했다. 특히 `telegram init`과 `uninstall`의 쓰기가 포트 소유 안에서만 일어나는지는 미확인이다.
- 시험을 직접 실행하지 않았다. diff의 시험 코드를 정적으로만 읽었다.
- `readAgentFile`의 심볼릭 링크 처리와 Windows 경로 동작은 보지 못했다.

## 올릴 단계
올릴 단계는 없다. 이 diff의 구현·시험 수준에서 해결할 항목뿐이고 목표·전략·계획 수정은 필요 없다. 합의된 목적·범위 변경은 없으므로 사용자에게 물을 일도 없다.

## 읽은 범위·노출
- 파일을 읽거나 고치지 않았고 도구도 호출하지 않았다. 산출물 diff 전문만 근거로 썼다.
- 호스트가 자동 첨부한 CLAUDE.md/AGENTS.md, git status, 사용자 이메일과 부트 훅 문구는 맥락에 노출됐지만 판단에는 쓰지 않았다.
- TASK·PM 판정·작성자 자체 판정은 받지도 읽지도 않았다.
- 실제 사용자 홈과 외부 서비스에는 접근하지 않았다. 읽기 전용이라는 사실이 작업 문서 접근 차단이나 완전 격리를 뜻하지는 않는다.
- 검토 주체는 이 호출의 단일 검토자이고, 2단계는 호출자가 별도로 전달해야 한다. 이 호출로 2단계가 실행됐다고 주장하지 않는다.

pass
