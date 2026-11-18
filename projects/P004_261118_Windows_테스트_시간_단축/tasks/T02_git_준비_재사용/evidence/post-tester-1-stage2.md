# T02 독립 테스터 2단계

**전체 판정 fail. 코드 집중 검증 pass.** 독립 목표 대조는 맞음. 작업 문서를 읽고도 1단계의 목표 달성 미확인 판단을 유지합니다. 준비 비용 감소는 관측했고, BR02와 PROJECT P-2가 요구하는 전체 시험 판정 보존은 현재 회귀 관측에서 충족되지 않았습니다. P-6의 절반 목표는 후속 프로젝트 단계의 조건입니다. 기준을 보완할 층은 전체 검사 실행·검증입니다.

| 기준 | 판정 | 근거 |
|---|---|---|
| T-1 / S-1 | pass | 직접 실행한 실제 Git 시험은 첫 대상이 원본과 다른 경로이며 준비 1회임을 확인합니다. 작업 파일·config를 제자리에서 쓰고 Git으로 index와 HEAD를 바꿉니다. 새 commit object의 부재, 기존 object 직접 변조의 비전파, 새 복사본과 형제의 정상이 검출 조건입니다. 마지막 원본 digest도 비교합니다. 구현은 형태별 factory closure로 원본을 두고 cpSync로 독립 파일을 복사합니다. |
| T-2 / S-2·S-3 | pass | 직접 실행한 도우미 4건·agent-chain 27건·harness HOME 1건이 모두 성공했습니다. 콜백 실패와 최초 복사 실패 뒤 새 원본 준비, .git 파일 및 alternates 거부, 대상 경계와 비어 있지 않은 대상 보존을 확인합니다. 기준 커밋 대비 project-harness와 agent-chain의 기존 시험 선언 이후 내용을 줄바꿈만 정규화해 대조했고 동일합니다. 신규 시험 1건의 정확한 seed HOME 식별과 복사본별 global Git 문맥 확인은 실제 Git 명령입니다. 기존 project-harness 전체는 보존된 전체 로그에서 판정을 대조했습니다. test-map 신규 단위가 추가됐으며 기존 common 항목은 동일합니다. |
| T-3 / S-4 | pass | benchmark-fixture.ts는 같은 6개 Git 호출의 callback을 10회씩 직접/캐시 교대 실행합니다. 원본 JSON은 중앙값 332.905ms→24.697ms, cold 404.232ms, callback 60→6 Git 호출을 보존합니다. 별도 읽기 전용 HEAD 확인 1개는 시각에 포함되고 callback 카운터에는 제외됩니다. |
| T-3 / S-5 | fail | 같은 Windows·도구 버전에서 보존된 계측 없는 npm run check는 상태 코드 1입니다. 기준 3회 각각의 963건과 비교해 제거 0, 추가 5건 전부 pass, skip 9 동일, playbook-maker 래퍼 1건 pass→fail입니다. 968건 중 958 pass, 1 fail, 9 skip입니다. 중첩 181건 중 1건 실패지만 로그 끝부분만으로 내부 실패 이름·원인·변경 관련성을 확정할 수 없습니다. 외부 벽시계 1425.464초→1390.062초(35.403초 차이)는 이 실패한 단회 관측입니다. 종합 T-3 fail입니다. |

## 독립 실행 원문

Windows PowerShell 세션 전용 임시 루트에 TEMP·TMP·TMPDIR·PACE_HOME을 지정하고 상속된 시험 소유권·PACE_PROFILE·임시 보존 변수를 제거했습니다. GIT_OPTIONAL_LOCKS=0을 세션에만 설정했습니다. worktree에서 읽은 코드를 실행했고 테스트 쓰기는 임시 루트에 두었습니다.

```text
node --test --test-concurrency=1 --test-reporter=tap test/git-fixture.test.ts test/agent-chain.test.ts
exit 0, 31 tests, 31 pass, 0 fail, 0 skip, 54351.9039ms

node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern='원본 전용 HOME' test/project-harness.test.ts
exit 0, 1 test, 1 pass, 0 fail, 0 skip, 763.7284ms
```

원문은 같은 디렉터리의 fixture-agent.tap과 harness-home.tap에 있습니다.

## 차이와 한계

- TASK 접근에는 seed 초기화가 첫 대상의 HOME/bin을 쓴다고 적혀 있습니다. 구현은 seed 전용 세 번째 HOME/bin을 만들며 이를 검사합니다. 기존 대상별 HOME/bin과 scope 동작은 보존됐고, 더 독립적인 구현입니다. T-2 동작 판정은 pass로 두며 접근 문서에 실제 결정을 정합하게 반영할 차이로 기록합니다.
- 코드 집중 실행에서 재현 가능한 회귀는 관측되지 않았습니다. 독립 실행은 기존 project-harness의 HOME 사례와 변경 관련 파일로 한정했습니다. 전체 및 중첩 검사는 별도로 재실행하지 않았습니다. 로그가 보존하지 않은 내부 실패를 기지의 병렬 경합 이슈에 귀속하지 않습니다.
- 검증/실행 단계에서 실패 원문을 보존해 원인을 확인하고 같은 조건의 성공한 전체 Windows 검사와 inventory를 확보해야 계약을 다시 판정할 수 있습니다.
- 두 단계 모두 동일 제공자 내 별도 자식 세션입니다. 단계 1의 자동 노출 제한은 phase-1.md에 기록했습니다. 단계 2에서는 TASK·BR02·PROJECT를 읽었고 작성자 결론은 판정 근거로 사용하지 않았습니다.

교본 대조는 TypeScript 및 검증 색인의 공유 상태, 오류 상태 유출, 상태 격리를 중심으로 했습니다.