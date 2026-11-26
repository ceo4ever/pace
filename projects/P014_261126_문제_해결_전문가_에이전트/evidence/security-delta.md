# P014 S1 롤백 경계 독립 재대조 결과

**결론: blocking 0건, should_fix 0건, note 5건입니다. S1은 해소됐다고 판정합니다.**

이번에는 제공된 파일 6개만 읽었습니다. 설치, 시험 실행, 코드 수정, 외부 실행은 하지 않았습니다. 시험 통과 여부는 `rollback-verification.txt`에 적힌 기록(2개 중 2개 통과)을 근거로 했고, 제가 다시 돌려 보지는 않았습니다.

## 네 가지 검토 항목

**1. 가드가 없는 구판 명령도 정확히 찾아 설치·제거하는가 → 그렇습니다**
- `claudeCallHookCommand(ctx, false)`는 `${node?}${quotedPath} agent call-hook --host claude` 뒤에 `" # pace-managed-agent-call-v1"`을 붙입니다.
  - 수정 전 문자열(`project-product.patch:2312`)과 바이트 단위로 같습니다.
- 설치 쪽은 `rollback-install.patch:17`, 제거 쪽은 `:8`입니다. 둘 다 `isClaudeCallHookCommand`로 가드판과 구판을 함께 인식합니다.
  - 그래서 설치하면 구판이 가드판으로 바뀌고, 제거하면 구판도 지워집니다.
- 시험 `rollback-test.patch:7-17`이 이 흐름을 확인합니다.
  - 구판을 넣고 설치하면 `installed`와 같아집니다.
  - 그 상태에서 제거하면 `original`로 돌아갑니다.
  - 구판을 다시 넣고 제거해도 `original`로 돌아갑니다.

**2. 지원하지 않는 이전 실행기의 종료 코드 2가 호스트로 새지 않는가 → 새지 않습니다**
- `cmd >/dev/null 2>&1 || true`는 이전 실행기의 `UsageError`(종료 2)를 0으로 바꿉니다.
  - 실행 파일이나 `node`가 없을 때 나는 127, 시그널로 끝날 때도 0이 됩니다.
  - 리다이렉션이 먼저 적용되므로 셸의 "not found" 메시지도 호스트로 나가지 않습니다.
- 시험 `rollback-test.patch:21-36`이 이를 확인합니다.
  - stderr에 쓰고 `exit 2` 하는 가짜 이전 실행기를 둡니다.
  - 가드 없는 명령은 2로 끝나고, 가드 있는 명령은 0으로 끝나며 stderr가 비어 있습니다.
- 출력을 버려도 잃는 것은 없습니다. Claude `call-hook` 경로는 원래 stdout·stderr에 아무것도 쓰지 않고 항상 0을 돌려줍니다(`project-product.patch:685-702`). 기존 시험도 출력이 비어 있는지 확인합니다(`:3026-3027`).

**3. 사용자 훅을 우리 것으로 인식하는 범위가 넓어지지 않았는가 → 넓어지지 않았습니다**
- 일치 조건은 여전히 `===`이고, 정확한 문자열 두 개만 받습니다.
- prefix·정규식·관리 표지 suffix로 맞추는 방식은 쓰지 않습니다.
- 두 문자열 모두 `# pace-managed-agent-call-v1`을 포함하므로 사용자 명령과 겹칠 수 없습니다.
- 기존 시험의 `user-start`·`user-post` 보존 확인도 그대로 통과했습니다.

**4. POSIX 경로 값이 그대로인가 → 그대로입니다**
- `path`와 `quotedPath`를 만드는 줄(`rollback-install.patch:28-29`)은 바뀌지 않은 문맥 줄입니다. 바뀐 것은 명령 끝부분뿐입니다.
- `'\''` 인용 처리도 유지됩니다. 시험 fixture의 홈 경로 `team's fixture`로 확인됩니다.

## note

- **N1. 이전 버전의 제거기는 가드판 훅을 남깁니다.** 이전 `uninstall`은 부트 훅만 지웁니다. 남은 훅은 서브에이전트 이벤트마다 실행되지만 항상 0으로 끝나므로 해는 없습니다. 다만 고아 훅으로 계속 남습니다. `t04-docs.patch`에는 롤백이나 훅 정리 안내가 없습니다. 운영 문서에 수동 정리 방법을 한 줄 적을 것을 권합니다.
- **N2. 새 시험이 실행 파일에 쓰기 전에 링크인지 확인하지 않습니다.** `rollback-test.patch:29`는 `~/.pace/bin/pace`에 바로 `writeFileSync`로 씁니다. 설치기가 이 파일을 링크로 만든다면 링크가 가리키는 대상이 덮어써집니다. 이 자료에는 `install.ts`의 `paceBin` 생성 코드가 없어 확인하지 못했습니다. 홈이 임시 폴더이므로 위험은 낮습니다. 그래도 쓰기 전에 `lstat`으로 확인하거나 `unlinkSync`로 먼저 지우는 편이 안전합니다.
- **N3. Windows 형태는 시험되지 않았습니다.** 새 시험은 `skip: win32`입니다. `node '<path>' … >/dev/null 2>&1 || true`는 Git Bash에서도 성립하는 문법이고 POSIX와 같은 코드로 만들어지지만, 실제로 실행해 확인하지는 않았습니다.
- **N4. 구판은 같은 경로일 때만 인식합니다.** `paceBin`이나 `appDir`이 이전 설치 때와 다르면 그 구판 명령은 정리되지 않습니다. 수정 전과 같은 한계이고 범위가 넓어진 것은 아닙니다. 기록용으로만 적습니다.
- **N5. S2 마스킹은 이 자료로 확인할 수 없습니다.** `h01-handoff-chain.json`이 자료에 없습니다. 제공된 파일 전체에서 `~/.agents` 경로를 검색했고, 초기 검토 문서 안의 인용과 합성 예시 말고는 나오지 않았습니다. finish 전에 그 증거 파일과 secret-scan을 다시 확인해야 합니다. secret-scan은 이번에도 실행하지 못했습니다.

## 확인한 근거
- `rollback-install.patch`: 전체 변경을 줄 단위로 읽었습니다.
- `rollback-test.patch`: 전체를 읽었습니다.
- `project-product.patch`: 원래 훅 코드(`:2277-2317`), `call-hook` 출력 경로(`:685-705`), 기존 설치 시험(`:3386-3413`)을 대조했습니다.
- `rollback-verification.txt`: 2개 중 2개 통과라는 기록입니다.
- `initial-security-review.md`: S1·S2의 원래 지적과 대조했습니다.

**조치:** 코드 변경 없이 닫아도 됩니다. N1의 문서 한 줄과 N2의 시험 보강은 선택 사항입니다. N5는 finish 전 확인 항목으로 남깁니다.
